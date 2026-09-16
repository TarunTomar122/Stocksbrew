// TypeSafe Jev lab: experiments against real stocksbrew data (read-only).
// Reads TYPESAFE_API_KEY from .env.local and LocalDB creds from .env.vps.local.
// Subcommands: probe | qa | news | atoms | scale

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
function readEnv(file) {
  const out = {};
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return out;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}
const envLocal = readEnv(".env.local");
const envVps = readEnv(".env.vps.local");
const API_KEY = envLocal.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY;
const LOCALDB = envVps.LOCALDB_URL;
const LOCALDB_TOKEN = envVps.LOCALDB_API_TOKEN;
if (!API_KEY) throw new Error("TYPESAFE_API_KEY missing");

const NS = "tm_news_runs/US__us_core_155";

async function localGet(docPath) {
  const res = await fetch(`${LOCALDB}/documents/${encodeURIComponent(docPath)}`, {
    headers: { Authorization: `Bearer ${LOCALDB_TOKEN}` },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.document?.data ?? null;
}

async function localQuery(collection, filters, limit) {
  const res = await fetch(`${LOCALDB}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOCALDB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ collection, filters: filters ?? [], limit: limit ?? 50 }),
  });
  const body = await res.json();
  return (body.documents ?? []).map((d) => ({ path: d.path, ...d.data }));
}

async function jev(state, questions, model = "jev-latest") {
  const started = Date.now();
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model, questions }),
  });
  const body = await res.json();
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`typesafe ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { answers: body.answers, usage: body.usage ?? {}, ms };
}

async function cmdProbe() {
  const r = await jev(
    "US equity AAPL trades at $332.23. Apple reported strong earnings growth; RSI is 63.",
    {
      is_mega_cap: { type: "noul", instructions: "Is Apple a mega-cap company?" },
      price_direction_today: {
        type: "choice",
        instructions: "Direction of today's move",
        criteria: { up: "Price rose today", down: "Price fell today", flat: "No meaningful move" },
      },
      momentum_strength: {
        type: "score",
        instructions: "How strong the stock's momentum looks",
        criteria: ["Weak", "Neutral", "Strong"],
      },
    },
  );
  console.log(JSON.stringify({ ms: r.ms, usage: r.usage, answers: r.answers }, null, 2));
}

// ── data helpers ─────────────────────────────────────────────────────────────
const TICKERS = ["NVDA", "MSFT", "AAPL", "WMT", "KO", "JPM", "DELL", "HPE", "MU", "PLTR"];

async function loadIntel() {
  const out = {};
  for (const ticker of TICKERS) {
    const doc = await localGet(`${NS}/stock_intelligence/US_${ticker}`);
    if (doc) out[ticker] = doc;
  }
  return out;
}

// ── Experiment A: brief QA gate with planted defects ─────────────────────────
function plantDefect(doc, kind) {
  const d = JSON.parse(JSON.stringify(doc));
  const directive = d.directive_v2 ?? {};
  const price = directive?.price_at_call ?? d.current_price ?? 100;
  if (kind === "wrong_company") {
    d.headline = String(d.headline ?? "").replace(/\b(Microsoft|Nvidia|Apple|Walmart)\b/gi, "Bumblebee Widgets");
    d.today_brief = String(d.today_brief ?? "").replace(/\b(Microsoft|Nvidia|Apple|Walmart)\b/gi, "Bumblebee Widgets");
  } else if (kind === "scale_mismatch") {
    if (directive.zones) {
      for (const key of Object.keys(directive.zones)) {
        if (typeof directive.zones[key] === "number") directive.zones[key] = directive.zones[key] * 0.01;
      }
    }
  } else if (kind === "foreign_driver") {
    const foreign = "Bumblebee Widgets secured a $400 million contract with the Department of Transportation.";
    d.visual_summary = d.visual_summary ?? {};
    d.visual_summary.what_changed = foreign;
  }
  return d;
}

const QA_QUESTIONS = {
  correct_company: {
    type: "noul",
    instructions: "Does the brief text talk about the company named in `company_name`, and only that company? A brief about a different or fictional company means false.",
  },
  prices_sane: {
    type: "noul",
    instructions: "Are the price levels (add/trim zones, targets) plausibly consistent with `current_price`? Levels that are 100x away from the current price, or a buy-below level above the trim level, mean false.",
  },
  evidence_supported: {
    type: "noul",
    instructions: "Do the headline and what_changed text appear to describe events that could genuinely apply to this company, rather than an unrelated fictional story?",
  },
  publish_decision: {
    type: "choice",
    instructions: "Should this research brief be published as-is?",
    criteria: {
      publish: "Internally consistent, about the right company, price levels sane",
      hold: "Has a defect: wrong company, price scale mismatch, or claims that do not apply",
    },
  },
};

async function cmdQa() {
  const intel = await loadIntel();
  const cases = [];
  for (const [ticker, doc] of Object.entries(intel)) {
    cases.push({ ticker, kind: "clean", doc });
    cases.push({ ticker, kind: "wrong_company", doc: plantDefect(doc, "wrong_company") });
    cases.push({ ticker, kind: "scale_mismatch", doc: plantDefect(doc, "scale_mismatch") });
    cases.push({ ticker, kind: "foreign_driver", doc: plantDefect(doc, "foreign_driver") });
  }
  const results = [];
  for (const c of cases) {
    const d = c.doc;
    const directive = d.directive_v2 ?? {};
    const state = {
      ticker: c.ticker,
      company_name: d.company_name ?? c.ticker,
      current_price: directive.price_at_call ?? d.current_price ?? null,
      headline: d.headline ?? "",
      thesis: d.thesis ?? "",
      what_changed: d.visual_summary?.what_changed ?? "",
      action_label: directive.action?.label ?? "",
      zones: directive.zones ?? {},
    };
    try {
      const r = await jev(state, QA_QUESTIONS);
      const a = r.answers;
      results.push({
        ticker: c.ticker,
        kind: c.kind,
        correct_company: a.correct_company?.noul,
        prices_sane: a.prices_sane?.noul,
        evidence_supported: a.evidence_supported?.noul,
        decision: a.publish_decision?.choice,
        confidence: a.publish_decision?.confidence,
        ms: r.ms,
        in_tokens: r.usage.input_tokens,
      });
    } catch (err) {
      results.push({ ticker: c.ticker, kind: c.kind, error: String(err).slice(0, 120) });
    }
  }
  const json = JSON.stringify(results, null, 2);
  fs.writeFileSync("explorations/jev/qa-results.json", json);
  // summary
  for (const kind of ["clean", "wrong_company", "scale_mismatch", "foreign_driver"]) {
    const rows = results.filter((r) => r.kind === kind && !r.error);
    const flagged = rows.filter((r) => r.decision === "hold");
    const cc = rows.map((r) => r.correct_company).filter((v) => v != null);
    const ps = rows.map((r) => r.prices_sane).filter((v) => v != null);
    console.log(
      kind.padEnd(15),
      `n=${rows.length}`,
      `held=${flagged.length}`,
      `avg correct_company=${cc.length ? (cc.reduce((s, v) => s + v, 0) / cc.length).toFixed(3) : "-"}`
        , `avg prices_sane=${ps.length ? (ps.reduce((s, v) => s + v, 0) / ps.length).toFixed(3) : "-"}`,
    );
  }
  const avgMs = results.filter((r) => r.ms).map((r) => r.ms);
  console.log("latency ms: avg", Math.round(avgMs.reduce((s, v) => s + v, 0) / avgMs.length), "max", Math.max(...avgMs));
}

// ── Experiment B: news triage vs the pipeline's own focus_ticker labels ──────
async function cmdNews(ticker = "NVDA") {
  const enrich = await localQuery(`${NS}/enrichments`, [{ field: "stock_tickers", op: "array_contains", value: ticker }], 40);
  const rows = enrich.map((d) => ({
    title: String(d.title ?? ""),
    summary: String(d.summary ?? "").slice(0, 700),
    focus_ticker: String(d.focus_ticker ?? "").toUpperCase(),
    signal_types: Array.isArray(d.signal_types) ? d.signal_types : [],
  }));

  let agree = 0, total = 0, latSum = 0, inSum = 0;
  for (const row of rows) {
    const state = { ticker, article_title: row.title, article_summary: row.summary };
    const questions = {
      about_ticker: { type: "noul", instructions: `Is this article primarily about ${ticker} the company, with the story centered on it? Articles about the sector, the market, or other companies that merely mention ${ticker} mean false.` },
      material_to_thesis: { type: "noul", instructions: "Could the events in this article materially change an investor's thesis on the company?" },
      worth_citing: { type: "score", instructions: "Would a serious investor brief cite this article as evidence about the company?", criteria: ["Not citable", "Minor mention", "Core evidence"] },
    };
    const r = await jev(state, questions);
    row.about = r.answers.about_ticker?.noul ?? 0;
    row.material = r.answers.material_to_thesis?.noul ?? 0;
    row.cite = r.answers.worth_citing?.score ?? 0;
    row.ms = r.ms;
    row.in = r.usage.input_tokens;
    latSum += r.ms;
    inSum += r.usage.input_tokens;
    const isFocus = row.focus_ticker === ticker;
    if ((row.about >= 0.5) === isFocus) agree += 1;
    total += 1;
  }

  const focusRows = rows.filter((r) => r.focus_ticker === ticker);
  const otherRows = rows.filter((r) => r.focus_ticker !== ticker);
  const mean = (arr, key) => (arr.length ? arr.reduce((s, r) => s + (r[key] ?? 0), 0) / arr.length : null);
  console.log(JSON.stringify({
    ticker,
    articles: rows.length,
    focus_ticker_agreement: total ? `${agree}/${total}` : null,
    about_mean: { focus: +(mean(focusRows, "about") ?? 0).toFixed(3), passing_mention: +(mean(otherRows, "about") ?? 0).toFixed(3) },
    material_mean: { focus: +(mean(focusRows, "material") ?? 0).toFixed(3), passing_mention: +(mean(otherRows, "material") ?? 0).toFixed(3) },
    avg_latency_ms: Math.round(latSum / Math.max(rows.length, 1)),
    avg_input_tokens: Math.round(inSum / Math.max(rows.length, 1)),
  }, null, 2));
  fs.writeFileSync(`explorations/jev/news-${ticker}-results.json`, JSON.stringify(rows, null, 2));
}

// ── Experiment C: directive atoms vs deterministic pillar scores ─────────────
async function cmdAtoms() {
  const results = [];
  for (const ticker of TICKERS) {
    const intel = await localGet(`tm_stock_intel_pro/US__us_core_155/stocks/US_${ticker}`);
    const summary = await localGet(`tm_latest_prices/${`US_${ticker}`}`);
    if (!intel || !summary) continue;
    const q = summary.quote ?? {};
    const f = summary.fundamentals ?? {};
    const state = {
      ticker,
      price: q.current,
      day_change_pct: q.day_change_pct,
      pe: f.pe_ttm,
      market_cap: f.market_cap,
      dividend_yield: f.dividend_yield,
      beta: f.beta,
      vs_52w_high_pct: f.week_52_high && q.current ? ((f.week_52_high - q.current) / f.week_52_high) * 100 : null,
      vs_52w_low_pct: f.week_52_low && q.current ? ((q.current - f.week_52_low) / f.week_52_low) * 100 : null,
    };
    const pillars = intel.pillars ?? {};
    const questions = {
      momentum_intact: { type: "noul", instructions: "Does the price data show momentum that is still healthy (trend intact, not stalling)?" },
      momentum_broken: { type: "noul", instructions: "Does the price data suggest momentum has cracked or reversed lower?" },
      valuation_stretched: { type: "noul", instructions: "Does the valuation look stretched or expensive relative to normal?" },
      growth_supported: { type: "noul", instructions: "Do the growth indicators look healthy?" },
      quality_strong: { type: "noul", instructions: "Does the company look financially high-quality?" },
      overbought: { type: "noul", instructions: "Does the stock look overextended after a hot run?" },
    };
    const r = await jev(state, questions);
    results.push({
      ticker,
      pillars: {
        momentum: pillars.momentum?.verdict, momentum_score: pillars.momentum?.score,
        valuation: pillars.valuation?.verdict, valuation_score: pillars.valuation?.score,
        growth: pillars.growth?.verdict, growth_score: pillars.growth?.score,
        quality: pillars.quality?.verdict, quality_score: pillars.quality?.score,
      },
      jev: r.answers,
      ms: r.ms,
      in: r.usage.input_tokens,
    });
  }
  let agree = 0, total = 0;
  for (const row of results) {
    const j = row.jev ?? {};
    const p = row.pillars ?? {};
    const msc = p.momentum_score;
    const mb = j.momentum_broken?.noul;
    const vsc = p.valuation_score;
    const vs = j.valuation_stretched?.noul;
    if (msc != null && mb != null) {
      total += 1;
      if ((mb > 0.5) === msc < 40) agree += 1;
    }
    console.log(
      row.ticker.padEnd(6),
      `mScore=${String(msc ?? "-").padStart(6)} broken=${mb == null ? "-" : mb.toFixed(2)}`,
      `vScore=${String(vsc ?? "-").padStart(6)} stretched=${vs == null ? "-" : vs.toFixed(2)}`,
      `ms=${row.ms}`,
    );
  }
  console.log(`momentum agreement: ${agree}/${total}`);
  fs.writeFileSync("explorations/jev/atoms-results.json", JSON.stringify(results, null, 2));
}

function pWeak(score) {
  return (typeof score === "number" && score < 40);
}

// ── Experiment D: question-count latency scaling ─────────────────────────────
async function cmdScale() {
  const state = "NVDA is a semiconductor company. Its stock trades at $218.20, down 0.07% today. Analyst target implies upside. Recent news covers data-center demand and supply constraints.";
  for (const n of [1, 4, 12]) {
    const questions = {};
    for (let i = 0; i < n; i++) {
      questions[`q${i}`] = { type: "noul", instructions: `Synthetic question ${i}: is the state informative?` };
    }
    const times = [];
    for (let run = 0; run < 3; run += 1) {
      const r = await jev(state, questions);
      times.push(r.ms);
    }
    console.log(`questions=${String(n).padStart(2)} ms:`, times.join(" "), "avg", Math.round(times.reduce((s, v) => s + v, 0) / 3));
  }
}

const [, , command, arg] = process.argv;
if (command === "probe") await cmdProbe();
else if (command === "qa") await cmdQa();
else if (command === "news") await cmdNews(arg ?? "NVDA");
else if (command === "atoms") await cmdAtoms();
else if (command === "scale") await cmdScale();
else throw new Error("usage: node explorations/jev-lab.mjs probe|qa|news|atoms|scale");
