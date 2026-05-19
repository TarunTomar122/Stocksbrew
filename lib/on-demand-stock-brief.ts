import { adminFirestore } from "@/lib/firebase-admin";
import { LLM_BRIEF_SOURCE, type BriefSource, isLlmBriefSource } from "@/lib/brief-source";
import { getAiUniverse, getInstrument, getPriceUniverse } from "@/lib/firestore";
import type { Instrument } from "@/lib/types";

type Market = "US" | "IN";
type Dict = Record<string, unknown>;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const SYSTEM_PROMPT = `You write premium stock Radar briefs for paid users.
Use only the supplied price, technical, analyst, and scorecard facts.
Do not invent news. If fresh news is absent, say that directly and explain what the numbers imply.
Return exactly one JSON object with concise, specific language.`;

const SCHEMA_HINT = {
  headline: "Short headline, max 80 chars",
  today_brief: "1-2 sentence summary of what matters now",
  thesis: "Why this stock is worth tracking based on supplied facts",
  catalyst: "What to watch next, or 'No fresh catalyst found'",
  risk: "Main risk or caution from the supplied facts",
  overall_label: "bullish | bearish | mixed | neutral",
  overall_score: "number from 0 to 100",
  key_points: ["3 short evidence bullets"],
  visual_summary: {
    what_changed: "What changed or what is notable now",
    why_it_matters: "Why a paid user should care",
    what_to_watch: "Next thing to monitor",
  },
};

function marketFromInstrumentId(instrumentId: string): Market | null {
  const market = instrumentId.split("_", 1)[0];
  return market === "US" || market === "IN" ? market : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactIntelPro(doc: Dict | null): Dict {
  if (!doc) return {};
  const pillars = (doc.pillars as Dict) || {};
  const compactPillars: Dict = {};
  for (const key of ["valuation", "growth", "quality", "momentum"]) {
    const pillar = (pillars[key] as Dict) || {};
    compactPillars[key] = {
      score: toNumber(pillar.score),
      metrics: Array.isArray(pillar.metrics)
        ? (pillar.metrics as Dict[]).slice(0, 3).map((metric) => ({
            label: metric.label,
            value: metric.value,
            summary: metric.summary,
            signal: metric.signal,
          }))
        : [],
    };
  }
  return {
    overall: doc.overall,
    sector_label: doc.sector_label,
    industry_label: doc.industry_label,
    pillars: compactPillars,
    catalysts: Array.isArray(doc.catalysts)
      ? (doc.catalysts as Dict[]).filter(catalystIsCurrent).slice(0, 3)
      : [],
  };
}

function catalystIsCurrent(catalyst: Dict): boolean {
  const text = `${String(catalyst.title || "")} ${String(catalyst.event || "")} ${String(catalyst.window || "")}`.trim();
  if (!/earnings/i.test(text)) return true;
  const match = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/i);
  if (!match) return false;

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  };
  const month = monthMap[match[1].toLowerCase().replace(".", "")];
  const day = Number(match[2]);
  if (month === undefined || !Number.isFinite(day)) return false;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let eventDate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  if (eventDate < today) {
    const rolled = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day));
    const daysAway = (rolled.getTime() - today.getTime()) / 86_400_000;
    if (daysAway > 180) return false;
    eventDate = rolled;
  }
  const daysAway = (eventDate.getTime() - today.getTime()) / 86_400_000;
  return daysAway <= 180;
}

function compactLatestPrice(doc: Dict | null): Dict {
  const quote = ((doc || {}).quote as Dict) || {};
  return {
    currency: doc?.currency,
    current: toNumber(quote.current),
    day_change_pct: toNumber(quote.day_change_pct),
    day_change_abs: toNumber(quote.day_change_abs),
    previous_close: toNumber(quote.previous_close),
    volume: toNumber(quote.volume),
  };
}

function compactTechnicals(doc: Dict | null): Dict {
  if (!doc) return {};
  return {
    rsi_14: doc.rsi_14 || {},
    moving_averages: doc.moving_averages || {},
    distance: doc.distance || {},
  };
}

function parseJsonContent(content: string): Dict {
  let raw = content.trim();
  if (raw.startsWith("```")) {
    raw = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }
  try {
    return JSON.parse(raw) as Dict;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("OpenAI response did not contain JSON");
    return JSON.parse(raw.slice(start, end + 1)) as Dict;
  }
}

function fallbackBrief(
  instrument: Instrument,
  latestPrice: Dict | null,
  technicals: Dict | null,
  intelPro: Dict | null,
): Dict {
  const price = compactLatestPrice(latestPrice);
  const tech = compactTechnicals(technicals);
  const rsi = toNumber((tech.rsi_14 as Dict)?.value);
  const dayChange = toNumber(price.day_change_pct);
  const overall = ((intelPro || {}).overall as Dict) || {};
  const score = toNumber(overall.score);
  const moveText =
    dayChange !== null ? `${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(1)}% today` : "price move unavailable";
  const rsiText = rsi !== null ? `RSI ${rsi.toFixed(1)}` : "RSI unavailable";
  const scoreText = score !== null ? `score ${Math.round(score)}` : "score pending";
  const headline = `${instrument.ticker} tracking brief is building`;
  const todayBrief = `${instrument.ticker} was added to your Radar. Current setup: ${moveText}, ${rsiText}, ${scoreText}.`;
  return {
    headline,
    today_brief: todayBrief,
    thesis: "tikrr has enough price, technical, and scorecard data to monitor this stock while the personal AI brief is generated.",
    catalyst: "No fresh catalyst found yet.",
    risk: "Watch for large price moves, stretched RSI, and scorecard deterioration.",
    overall_label: "neutral",
    overall_score: score ?? 50,
    key_points: [moveText, rsiText, scoreText],
    visual_summary: {
      what_changed: todayBrief,
      why_it_matters: "This gives an immediate baseline so future moves, risks, and catalysts can be compared against it.",
      what_to_watch: "Refresh shortly for the generated personal brief if fresh AI coverage was missing.",
    },
  };
}

function normalizeBrief(raw: Dict, fallback: Dict): Dict {
  const visual = (raw.visual_summary as Dict) || {};
  const fallbackVisual = (fallback.visual_summary as Dict) || {};
  const keyPoints = Array.isArray(raw.key_points)
    ? raw.key_points.map((point) => String(point).trim()).filter(Boolean).slice(0, 4)
    : fallback.key_points;
  return {
    headline: String(raw.headline || fallback.headline).slice(0, 120),
    today_brief: String(raw.today_brief || raw.body || fallback.today_brief).slice(0, 700),
    thesis: String(raw.thesis || fallback.thesis).slice(0, 700),
    catalyst: String(raw.catalyst || fallback.catalyst).slice(0, 300),
    risk: String(raw.risk || fallback.risk).slice(0, 300),
    overall_label: ["bullish", "bearish", "mixed", "neutral"].includes(String(raw.overall_label).toLowerCase())
      ? String(raw.overall_label).toLowerCase()
      : fallback.overall_label,
    overall_score: toNumber(raw.overall_score) ?? fallback.overall_score,
    key_points: keyPoints,
    visual_summary: {
      what_changed: String(visual.what_changed || fallbackVisual.what_changed || "").slice(0, 450),
      why_it_matters: String(visual.why_it_matters || fallbackVisual.why_it_matters || "").slice(0, 450),
      what_to_watch: String(visual.what_to_watch || fallbackVisual.what_to_watch || "").slice(0, 450),
    },
  };
}

async function loadIntelPro(instrumentId: string, market: Market): Promise<Dict | null> {
  const [aiUniverse, priceUniverse] = await Promise.all([
    getAiUniverse(market),
    getPriceUniverse(market),
  ]);
  const universes = aiUniverse === priceUniverse ? [priceUniverse] : [priceUniverse, aiUniverse];
  for (const universe of universes) {
    const doc = await adminFirestore
      .collection("tm_stock_intel_pro")
      .doc(`${market}__${universe}`)
      .collection("stocks")
      .doc(instrumentId)
      .get();
    if (doc.exists) return doc.data() as Dict;
  }
  return null;
}

async function callOpenAi(payload: Dict): Promise<Dict | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.25,
      top_p: 0.9,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\nSchema hint:\n${JSON.stringify(SCHEMA_HINT)}`,
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI on-demand brief failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty on-demand brief");
  }
  return parseJsonContent(content);
}

export async function ensureOnDemandStockBrief(
  instrumentId: string,
): Promise<"exists" | "generated" | "fallback" | "skipped"> {
  const market = marketFromInstrumentId(instrumentId);
  if (!market) return "skipped";

  const universe = await getAiUniverse(market);
  const ref = adminFirestore
    .collection("tm_news_runs")
    .doc(`${market}__${universe}`)
    .collection("stock_intelligence")
    .doc(instrumentId);

  const existing = await ref.get();
  if (existing.exists) return "exists";

  const [instrument, latestSnap, technicalSnap, intelPro] = await Promise.all([
    getInstrument(instrumentId),
    adminFirestore.collection("tm_latest_prices").doc(instrumentId).get(),
    adminFirestore.collection("tm_stock_technicals_latest").doc(instrumentId).get(),
    loadIntelPro(instrumentId, market),
  ]);

  if (!instrument || !latestSnap.exists) return "skipped";

  const latestPrice = latestSnap.data() as Dict;
  const technicals = technicalSnap.exists ? (technicalSnap.data() as Dict) : null;
  const fallback = fallbackBrief(instrument, latestPrice, technicals, intelPro);
  const llmPayload = {
    task: "Create an on-demand first Radar brief for a paid user who just added this stock.",
    coverage_note: "No fresh stock-intelligence document exists for this ticker yet.",
    instrument: {
      instrument_id: instrument.instrument_id,
      ticker: instrument.ticker,
      name: instrument.name,
      sector: instrument.sector,
      industry: instrument.industry,
    },
    price: compactLatestPrice(latestPrice),
    technicals: compactTechnicals(technicals),
    scorecard: compactIntelPro(intelPro),
  };

  let source: BriefSource = "rules";
  let brief = fallback;
  try {
    const aiBrief = await callOpenAi(llmPayload);
    if (aiBrief) {
      brief = normalizeBrief(aiBrief, fallback);
      source = LLM_BRIEF_SOURCE;
    }
  } catch (err) {
    console.error("[on-demand-stock-brief] OpenAI generation failed:", err);
  }

  const llmGenerated = isLlmBriefSource(source);
  const now = new Date().toISOString();
  await ref.set(
    {
      instrument_id: instrumentId,
      ticker: instrument.ticker,
      market,
      universe_id: universe,
      generated_at: now,
      as_of: now,
      source,
      coverage_type: llmGenerated ? "on_demand_no_news" : "on_demand_fallback",
      news_count: 0,
      source_count: 0,
      ...brief,
      data_quality: {
        freshness_status: llmGenerated ? "fresh" : "pending",
        confidence_score: llmGenerated ? 65 : 45,
        evidence_count: 0,
        source_tier_mix: { price: 1, technicals: technicals ? 1 : 0, scorecard: intelPro ? 1 : 0 },
      },
    },
    { merge: true },
  );

  return llmGenerated ? "generated" : "fallback";
}
