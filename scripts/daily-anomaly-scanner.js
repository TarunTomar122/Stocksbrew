#!/usr/bin/env node
/**
 * Daily Anomaly Scanner for tikrr
 * 
 * Reads market_price_snapshots/US, finds top 5-8 stocks with biggest
 * absolute day_change_pct, enriches with news + stock intelligence,
 * and writes a JSON report to Firestore (tm_daily_anomalies/US).
 * 
 * Designed to run as a cron job ~5 min after US market open (9:35 AM ET).
 */

const admin = require("firebase-admin");
const path = require("path");

// ─── Init ─────────────────────────────────────────────────────────────────────
const saPath = path.resolve(__dirname, "..", "backend", "firebase-service-account.json");
const sa = require(saPath);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Config ───────────────────────────────────────────────────────────────────
const MARKET = "US";
const TOP_N = 8;
const MIN_ABS_CHANGE_PCT = 2.0; // ignore moves < 2%

async function main() {
  const now = new Date();
  console.log(`[anomaly-scanner] running at ${now.toISOString()}\n`);

  // 1. Read market snapshot
  const snapDoc = await db.collection("market_price_snapshots").doc(MARKET).get();
  if (!snapDoc.exists) {
    console.error("No market_price_snapshots/" + MARKET + " doc found");
    process.exit(1);
  }
  const allRows = snapDoc.data().rows || [];
  console.log(`Total snapshot rows: ${allRows.length}`);

  // 2. Filter and rank by absolute day_change_pct
  const candidates = allRows
    .filter(r => typeof r.price?.changePct === "number" && typeof r.price?.current === "number")
    .filter(r => Math.abs(r.price.changePct) >= MIN_ABS_CHANGE_PCT)
    .sort((a, b) => Math.abs(b.price.changePct) - Math.abs(a.price.changePct))
    .slice(0, TOP_N);

  console.log(`\nAnomalies (|change| >= ${MIN_ABS_CHANGE_PCT}%): ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log("No significant anomalies today. Skipping write.");
    process.exit(0);
  }

  // 3. Enrich each anomaly with stock intelligence + news
  const aiUniverseDoc = await db.collection("tm_config").doc("active_universes").get();
  const configData = aiUniverseDoc.exists ? aiUniverseDoc.data() : {};
  // AI universe for stock intelligence — fallback chain
  const aiUniverse = configData.US_ai_universe || configData.US_universe || "us_core_155";
  const priceUniverse = configData.US_universe || "us_core_155";

  const anomalies = [];

  for (const row of candidates) {
    const instrumentId = row.instrumentId;
    const ticker = row.symbol;
    const changePct = row.price.changePct;
    const direction = changePct > 0 ? "up" : "down";

    console.log(`  ${ticker}: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% ($${row.price.current.toFixed(2)})`);

    // Fetch stock intelligence (news + sentiment)
    let intel = null;
    try {
      const intelDoc = await db
        .collection("tm_news_runs")
        .doc(`${MARKET}__${aiUniverse}`)
        .collection("stock_intelligence")
        .doc(instrumentId)
        .get();
      if (intelDoc.exists) intel = intelDoc.data();
    } catch (e) {
      // ok, enrichment is optional
    }

    // Fetch stock intel pro (pillars, catalysts)
    let intelPro = null;
    try {
      const proDoc = await db
        .collection("tm_stock_intel_pro")
        .doc(`${MARKET}__${priceUniverse}`)
        .collection("stocks")
        .doc(instrumentId)
        .get();
      if (proDoc.exists) intelPro = proDoc.data();
    } catch (e) {
      // ok
    }

    // Fetch instrument info
    let instrument = null;
    try {
      const instDoc = await db.collection("tm_instruments").doc(instrumentId).get();
      if (instDoc.exists) instrument = instDoc.data();
    } catch (e) {
      // ok
    }

    anomalies.push({
      instrument_id: instrumentId,
      ticker,
      name: instrument?.name || row.name || ticker,
      sector: instrument?.sector || null,
      industry: instrument?.industry || null,
      logo_url: instrument?.logo_url || null,
      price: round(row.price.current),
      previous_close: round(row.price.previousClose),
      day_change_pct: round(changePct),
      day_change_abs: round(row.price.change),
      volume: row.price.volume || null,
      direction,
      // News/enrichment
      headline: intel?.headline || null,
      thesis: intel?.thesis || null,
      today_brief: intel?.today_brief || null,
      news_count: intel?.news_count || 0,
      source_count: intel?.source_count || 0,
      overall_score: intel?.overall_score ?? intelPro?.overall?.score ?? null,
      overall_label: intel?.overall_label || intelPro?.overall?.stance || null,
      catalyst: intel?.catalyst || null,
      risk: intel?.risk || null,
      key_points: intel?.key_points || [],
      visual_summary: intel?.visual_summary || null,
      // Intel Pro
      overall_verdict: intelPro?.overall?.verdict || null,
      catalysts: intelPro?.catalysts?.slice(0, 3) || [],
      // Comparative
      comparative_context: intel?.comparative_context || null,
    });
  }

  // 4. Build report
  const report = {
    market: MARKET,
    generated_at: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    anomaly_count: anomalies.length,
    threshold_pct: MIN_ABS_CHANGE_PCT,
    up_count: anomalies.filter(a => a.direction === "up").length,
    down_count: anomalies.filter(a => a.direction === "down").length,
    summary: buildSummary(anomalies),
    anomalies,
  };

  // 5. Write to Firestore
  const docId = `${MARKET}__${report.date}`;
  await db.collection("tm_daily_anomalies").doc(docId).set(report);
  console.log(`\n✅ Wrote tm_daily_anomalies/${docId} with ${anomalies.length} anomalies`);

  // Also write to a "latest" doc for easy frontend reads
  await db.collection("tm_daily_anomalies").doc(`${MARKET}__latest`).set(report);
  console.log(`✅ Wrote tm_daily_anomalies/${MARKET}__latest`);

  // 6. Print summary
  console.log(`\n📊 Summary: ${report.summary}`);
  anomalies.forEach(a => {
    const arrow = a.direction === "up" ? "📈" : "📉";
    console.log(`  ${arrow} ${a.ticker}: ${a.day_change_pct > 0 ? "+" : ""}${a.day_change_pct}% — ${a.headline || a.today_brief || "No headline"}`);
  });
}

function buildSummary(anomalies) {
  const ups = anomalies.filter(a => a.direction === "up");
  const downs = anomalies.filter(a => a.direction === "down");
  const parts = [];
  if (ups.length) {
    const top = ups[0];
    parts.push(`${ups.length} stocks surging (led by ${top.ticker} +${top.day_change_pct}%)`);
  }
  if (downs.length) {
    const bot = downs[0];
    parts.push(`${downs.length} stocks dropping (worst: ${bot.ticker} ${bot.day_change_pct}%)`);
  }
  return parts.join("; ");
}

function round(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
