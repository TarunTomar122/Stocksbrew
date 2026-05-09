#!/usr/bin/env node
/**
 * Weekly Market Report Generator for tikrr
 * 
 * Aggregates the week's daily anomaly data, market snapshots,
 * and sector flows to produce a weekly report.
 * 
 * Designed to run Saturday morning. The OpenClaw agent will
 * enrich this with web research and write the narrative.
 */

const admin = require("firebase-admin");
const path = require("path");

const saPath = path.resolve(__dirname, "..", "backend", "firebase-service-account.json");
const sa = require(saPath);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const MARKET = "US";

async function main() {
  const now = new Date();
  console.log(`[weekly-report] running at ${now.toISOString()}\n`);

  // 1. Collect this week's daily anomaly reports
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const anomalySnap = await db.collection("tm_daily_anomalies")
    .where("market", "==", MARKET)
    .get();

  const weekAnomalies = anomalySnap.docs
    .map(d => d.data())
    .filter(r => r.date && r.date >= weekAgo.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`Found ${weekAnomalies.length} daily anomaly reports this week`);

  // 2. Aggregate stats
  const tickerFrequency = {};  // how often each ticker appeared as anomaly
  const tickerMoves = {};      // latest move for each ticker
  let totalUp = 0, totalDown = 0;

  for (const report of weekAnomalies) {
    for (const a of report.anomalies || []) {
      const t = a.ticker;
      tickerFrequency[t] = (tickerFrequency[t] || 0) + 1;
      tickerMoves[t] = {
        latest_pct: a.day_change_pct,
        latest_price: a.price,
        latest_date: report.date,
        name: a.name,
        sector: a.sector,
        direction: a.direction,
      };
      if (a.direction === "up") totalUp++;
      else totalDown++;
    }
  }

  // 3. Get current market snapshot for context
  const snapDoc = await db.collection("market_price_snapshots").doc(MARKET).get();
  const allRows = snapDoc.exists ? snapDoc.data().rows || [] : [];

  // Sector performance
  const sectorBuckets = {};
  for (const row of allRows) {
    const pct = row.price?.changePct;
    const sid = row.sectorId;
    if (typeof pct !== "number" || !sid) continue;
    if (!sectorBuckets[sid]) sectorBuckets[sid] = [];
    sectorBuckets[sid].push(pct);
  }
  const sectorPerformance = Object.entries(sectorBuckets)
    .map(([sector, pcts]) => ({
      sector,
      avg_change: round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      stock_count: pcts.length,
    }))
    .sort((a, b) => b.avg_change - a.avg_change);

  // Top movers this week (by latest anomaly move)
  const repeatOffenders = Object.entries(tickerFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, count]) => ({
      ticker,
      anomaly_days: count,
      ...tickerMoves[ticker],
    }));

  // 4. Build the data report (agent will add narrative)
  const report = {
    market: MARKET,
    generated_at: now.toISOString(),
    week_ending: now.toISOString().slice(0, 10),
    days_covered: weekAnomalies.length,
    summary_stats: {
      total_anomaly_events: totalUp + totalDown,
      up_events: totalUp,
      down_events: totalDown,
      unique_tickers_affected: Object.keys(tickerFrequency).length,
    },
    repeat_offenders: repeatOffenders,
    sector_performance: sectorPerformance,
    daily_snapshots: weekAnomalies.map(r => ({
      date: r.date,
      anomaly_count: r.anomaly_count,
      summary: r.summary,
    })),
    // Agent fills these in after web research:
    narrative: null,
    key_themes: [],
    what_to_watch: [],
  };

  // 5. Write to Firestore
  const weekId = `US__${report.week_ending}`;
  await db.collection("tm_weekly_reports").doc(weekId).set(report);
  await db.collection("tm_weekly_reports").doc("US__latest").set({ ...report, _docId: weekId });
  console.log(`\n✅ Wrote tm_weekly_reports/${weekId}`);
  console.log(`✅ Also wrote tm_weekly_reports/US__latest`);
  console.log(`\nData summary:`);
  console.log(`  Days covered: ${report.days_covered}`);
  console.log(`  Total anomaly events: ${report.summary_stats.total_anomaly_events}`);
  console.log(`  Unique tickers: ${report.summary_stats.unique_tickers_affected}`);
  console.log(`\nRepeat offenders (appeared in anomalies multiple days):`);
  repeatOffenders.slice(0, 5).forEach(r => {
    console.log(`  ${r.ticker}: ${r.anomaly_days} days | latest: ${r.latest_pct > 0 ? "+" : ""}${r.latest_pct}% on ${r.latest_date}`);
  });
  console.log(`\nSector performance (today):`);
  sectorPerformance.slice(0, 5).forEach(s => {
    console.log(`  ${s.sector}: ${s.avg_change > 0 ? "+" : ""}${s.avg_change}%`);
  });
}

function round(n) { return Math.round(n * 100) / 100; }

main().then(() => process.exit(0)).catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
