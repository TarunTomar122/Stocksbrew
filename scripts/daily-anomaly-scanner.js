#!/usr/bin/env node
/**
 * Daily Anomaly Scanner for tikrr
 * 
 * Reads market_price_snapshots/US, finds top 5-8 stocks with biggest
 * absolute day_change_pct, enriches with news + stock intelligence,
 * and writes a JSON report to Firestore (tm_daily_anomalies/US).
 * 
 * If a stock has no existing intel, calls OpenAI to generate a brief
 * on the fly so every anomaly always has a headline.
 * 
 * Designed to run as a cron job ~5 min after market open (9:35 AM ET).
 */

const admin = require("firebase-admin");
const path = require("path");
const https = require("https");

// ─── Init ─────────────────────────────────────────────────────────────────────
const saPath = path.resolve(__dirname, "..", "backend", "firebase-service-account.json");
const sa = require(saPath);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Config ───────────────────────────────────────────────────────────────────
const MARKET = "US";
const TOP_N = 8;
const MIN_ABS_CHANGE_PCT = 2.0;

// LLM config - reads from env, falls back to OpenAI only when Cerebras is not configured.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
const HAS_CEREBRAS = Boolean((process.env.CEREBRAS_API_KEY || "").trim());
const HAS_OPENAI = Boolean((process.env.OPENAI_API_KEY || "").trim());
const USE_CEREBRAS = LLM_PROVIDER === "cerebras" || (!LLM_PROVIDER && HAS_CEREBRAS && !HAS_OPENAI);
const LLM_API_URL =
  process.env.LLM_API_URL ||
  process.env.MIMO_API_URL ||
  (USE_CEREBRAS ? process.env.CEREBRAS_API_URL || "https://api.cerebras.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");
const LLM_API_KEY =
  process.env.LLM_API_KEY ||
  (USE_CEREBRAS ? process.env.CEREBRAS_API_KEY : process.env.OPENAI_API_KEY) ||
  process.env.MIMO_API_KEY ||
  "";
const LLM_MODEL =
  process.env.LLM_MODEL ||
  process.env.MIMO_MODEL ||
  process.env.TRACE_MONEY_LLM_MODEL ||
  (USE_CEREBRAS ? process.env.CEREBRAS_MODEL || "gpt-oss-120b" : process.env.OPENAI_MODEL || "gpt-4o-mini");

// ─── LLM Enrichment ──────────────────────────────────────────────────────────

function llmAvailable() {
  return LLM_API_KEY.length > 0;
}

function callLLM(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const url = new URL(LLM_API_URL);
    const body = JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`LLM ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error("LLM returned empty content"));
            return;
          }
          // Parse JSON, tolerating markdown fences
          let clean = content.trim();
          if (clean.startsWith("```")) {
            const lines = clean.split("\n");
            if (lines[0].startsWith("```")) lines.shift();
            if (lines[lines.length - 1] === "```") lines.pop();
            clean = lines.join("\n").trim();
          }
          resolve(JSON.parse(clean));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error("LLM request timeout"));
    });
    req.write(body);
    req.end();
  });
}

const ANOMALY_BRIEF_SYSTEM = `You are a stock market analyst. Given a stock's price movement and context, generate a concise anomaly brief.

Return a JSON object with these fields:
- "headline": One-line headline explaining the move (max 80 chars). Be specific - mention the driver if you can reason about it.
- "today_brief": 2-3 sentence explanation of why this stock is moving. If you don't know the exact reason, reason about what typically drives this stock (sector trends, recent earnings, macro factors).
- "catalyst": The most likely catalyst or "Unknown" if unclear.
- "risk": Key risk to watch.
- "thesis": One sentence - bull or bear case.

Be honest. If you're speculating, say "likely" or "may be driven by". Don't fabricate news.`;

async function generateAnomalyBrief(anomaly) {
  const userContext = `Stock: ${anomaly.name} (${anomaly.ticker})
Sector: ${anomaly.sector || "Unknown"}
Industry: ${anomaly.industry || "Unknown"}
Current Price: $${anomaly.price}
Previous Close: $${anomaly.previous_close}
Day Change: ${anomaly.day_change_pct > 0 ? "+" : ""}${anomaly.day_change_pct}%
Direction: ${anomaly.direction}
${anomaly.volume ? `Volume: ${anomaly.volume.toLocaleString()}` : ""}
Date: ${new Date().toISOString().slice(0, 10)}`;

  try {
    const result = await callLLM(ANOMALY_BRIEF_SYSTEM, userContext);
    return result;
  } catch (e) {
    console.warn(`    ⚠ LLM enrichment failed for ${anomaly.ticker}: ${e.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  console.log(`[anomaly-scanner] running at ${now.toISOString()}\n`);

  if (!llmAvailable()) {
    console.warn("⚠ No LLM API key found (set LLM_API_KEY, CEREBRAS_API_KEY, OPENAI_API_KEY, or MIMO_API_KEY). LLM enrichment disabled.\n");
  } else {
    console.log(`LLM: ${LLM_MODEL} @ ${LLM_API_URL}\n`);
  }

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

    const hasHeadline = !!(intel?.headline);
    const hasBrief = !!(intel?.today_brief);

    // Build the anomaly object first
    const anomaly = {
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
      // Will be filled below
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
      overall_verdict: intelPro?.overall?.verdict || null,
      catalysts: intelPro?.catalysts?.slice(0, 3) || [],
      comparative_context: intel?.comparative_context || null,
      llm_enriched: false,
    };

    // If no headline exists, call LLM to generate one
    if (!hasHeadline && llmAvailable()) {
      console.log(`    → No intel found, calling LLM...`);
      const llmBrief = await generateAnomalyBrief(anomaly);
      if (llmBrief) {
        anomaly.headline = llmBrief.headline || anomaly.headline;
        anomaly.today_brief = llmBrief.today_brief || anomaly.today_brief;
        anomaly.catalyst = llmBrief.catalyst || anomaly.catalyst;
        anomaly.risk = llmBrief.risk || anomaly.risk;
        anomaly.thesis = llmBrief.thesis || anomaly.thesis;
        anomaly.llm_enriched = true;
        console.log(`    ✓ LLM: ${anomaly.headline}`);
      }
    }

    anomalies.push(anomaly);
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
    anomalies,
  };

  // 5. Write to Firestore
  const docId = `${MARKET}__${report.date}`;
  await db.collection("tm_daily_anomalies").doc(docId).set(report);
  console.log(`\n✅ Wrote tm_daily_anomalies/${docId} with ${anomalies.length} anomalies`);

  await db.collection("tm_daily_anomalies").doc(`${MARKET}__latest`).set(report);
  console.log(`✅ Wrote tm_daily_anomalies/${MARKET}__latest`);

  // 6. Print results
  console.log(`\n📊 ${anomalies.length} anomalies (${report.up_count} up, ${report.down_count} down)`);
  anomalies.forEach(a => {
    const arrow = a.direction === "up" ? "📈" : "📉";
    const src = a.llm_enriched ? " (LLM)" : "";
    console.log(`  ${arrow} ${a.ticker}: ${a.day_change_pct > 0 ? "+" : ""}${a.day_change_pct}% - ${a.headline || "No headline"}${src}`);
  });
}

function round(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
}

main().then(() => process.exit(0)).catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
