import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { getLatestPriceQuotes, getMarketMovers, getMarketSnapshot } from "@/lib/firestore";
import { INVESTMENT_THEMES } from "@/lib/investment-themes";
import { LLM_BRIEF_SOURCE, type BriefSource, isLlmBriefSource } from "@/lib/brief-source";
import { llmApiKey, llmApiUrl, llmHeaders, llmModel } from "@/lib/server-llm";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

type DirectiveV2Shape = {
  version?: string;
  stance?: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  execution?: string;
  horizon?: string;
  confidence?: "low" | "med" | "medium" | "high";
  action?: { label?: string; summary?: string };
  zones?: {
    accumulate_below?: number;
    breakout_above?: number;
    trim_above?: number;
    near_term_resistance?: number;
  };
  watch_out?: string;
  invalidation?: string;
  text?: string;
  rationale?: string;
  title?: string;
  detail?: string;
  priority?: "high" | "medium" | "low";
  trigger?: string;
  holding_status?: "known" | "unknown" | "watchlist";
};

export type WatchlistRow = {
  instrument_id: string;
  ticker: string;
  instrument_name?: string;
  logo_url?: string | null;
  position_type: "holding" | "watchlist";
  market: "US" | "IN" | "";
  sector_label: string;
  industry_label: string;
  instrument_sector?: string;
  currency: string;
  price: number | null;
  day_change_pct: number | null;
  day_change_abs: number | null;
  scores: {
    overall: number | null;
    verdict: string | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  alerts: Record<string, unknown>[];
  catalysts: Record<string, unknown>[];
  facts?: Record<string, unknown>;
  technicals?: Record<string, unknown>;
  news_velocity?: Record<string, unknown>;
  premium_signals?: Record<string, unknown>[];
  target_upside_pct?: number | null;
  top_metric_summaries?: string[];
  attention_score?: number;
  attention_reason?: string;
  attention_kind?: "move" | "risk" | "opportunity" | "news" | "calm";
  suggested_action?: string;
  action_tone?: "positive" | "negative" | "neutral";
  brief_tile: {
    micro: string;
    vibe: "up" | "down" | "wild";
    source: BriefSource;
  };
  ai_directive?: DirectiveV2Shape;
  ai_directive_text?: string;
  ai_directive_rationale?: string;
  coverage_status: "ready" | "score_pending";
  has_intel_pro: boolean;
  holding_status?: "known" | "unknown" | "watchlist";
  directive_v2?: DirectiveV2Shape;
  holding?: {
    quantity?: number | null;
    market_value?: number | null;
    average_cost?: number | null;
    computed_market_value?: number | null;
    portfolio_weight_pct?: number | null;
    cost_basis?: number | null;
    unrealized_gain_pct?: number | null;
    source?: string;
    updated_at?: string;
  };
};

type DirectiveZone = {
  text?: string;
  trigger_type?: "price_below" | "price_above" | "date" | "sentiment_flip" | "new_catalyst" | "none";
  trigger_value?: string;
};

export type WatchlistBrief = {
  narrative: string;
  tiles: Array<{
    ticker: string;
    micro: string;
    vibe: "up" | "down" | "wild";
  }>;
  movers: Array<{
    ticker: string;
    one_liner: string;
    vibe: "up" | "down" | "wild";
  }>;
  signals: Array<{
    tag: string;
    headline: string;
    body: string;
    detail: string;
    vibe: "positive" | "negative" | "neutral";
  }>;
  blind_spot_title: string;
  blind_spot_body: string;
  essential_events: Array<{
    sentence: string;
    event_type: string;
    scope: "market" | "sector" | "stock";
    direction: "up" | "down" | "mixed";
    confidence: "low" | "med" | "high";
    impact_score: number;
    evidence: string[];
    symbol: string;
    sector_id: string;
  }>;
  source: BriefSource;
  status: "pending" | "fallback" | "ready";
  generated_at?: string;
};

export type WatchlistPulse = {
  headline: string;
  subtitle: string;
  stats: {
    count?: number;
    movers_up?: number;
    movers_down?: number;
    avg_overall_score?: number | null;
    alert_count?: number;
  };
};

export type WatchlistTodaySetup = {
  headline: string;
  body: string;
  signals: Array<{
    ticker: string;
    position_type: "holding" | "watchlist" | string;
    kind: string;
    tone: "positive" | "negative" | "neutral" | string;
    urgency: number;
    title: string;
    why_it_matters: string;
    action: string;
    evidence: string[];
  }>;
  market_threads?: string[];
  generated_at?: string;
};

export type RadarCitation = {
  title: string;
  url: string;
  publisher?: string;
  published_at?: string;
};

export type RadarAttentionItem = {
  item_id: string;
  instrument_id: string;
  ticker: string;
  instrument_name?: string;
  position_type?: "holding" | "watchlist";
  event_type: string;
  direction: "positive" | "negative" | "neutral" | "mixed";
  headline: string;
  what_changed: string;
  why_it_matters: string;
  next_trigger?: string;
  occurred_at: string;
  priority: number;
  priority_score: number;
  event_ids: string[];
  citations: RadarCitation[];
};

export type RadarUserView = {
  uid: string;
  generated_at: string;
  as_of: string;
  narrative: {
    headline: string;
    body: string;
  };
  attention_items: RadarAttentionItem[];
  upcoming_events: Array<{
    instrument_id: string;
    ticker: string;
    event_type: string;
    expected_at: string;
    description: string;
    confidence?: number;
  }>;
  quiet_summary: {
    instrument_ids: string[];
    body: string;
    count: number;
  };
  source_versions: Array<{
    source_id: string;
    version: string;
    as_of: string;
  }>;
  generated_copy_status: "generated" | "fallback" | "pending" | "stale" | "failed";
  shadow_mode?: boolean;
  quality?: {
    passed: boolean;
    issues?: string[];
  };
};

export function isActiveRadarUserView(view: RadarUserView | null | undefined): view is RadarUserView {
  return Boolean(
    view &&
      view.shadow_mode !== true &&
      view.quality?.passed !== false &&
      (view.generated_copy_status === "generated" || view.generated_copy_status === "fallback"),
  );
}

export type WatchlistView = {
  uid: string;
  source_version?: number;
  today_version_applied?: number;
  diagnosis_version_applied?: number;
  activity_version_applied?: number;
  tracked_count: number;
  holdings_count?: number;
  watchlist_count?: number;
  tracked_ids: string[];
  rows: WatchlistRow[];
  pulse: WatchlistPulse;
  brief: WatchlistBrief;
  portfolio?: {
    position_aware?: boolean;
    total_entered_value?: number | null;
    concentration?: {
      top1_pct?: number;
      top3_pct?: number;
      hhi?: number;
      risk_label?: "low" | "medium" | "high";
    };
    position_risks?: Array<{
      kind: string;
      severity: string;
      ticker?: string;
      headline: string;
      body: string;
    }>;
    [key: string]: unknown;
  };
  attention_items?: Record<string, unknown>[];
  suggestions?: Record<string, unknown>[];
  blind_spot_suggestions?: Record<string, unknown>[];
  momentum_lift_suggestions?: Record<string, unknown>[];
  pillar_lift_suggestions?: {
    weakest_pillar: PortfolioPillarKey;
    weakest_score: number;
    items: Record<string, unknown>[];
  };
  risk_summary?: Record<string, unknown>;
  event_radar?: Record<string, unknown>[];
  today_setup?: WatchlistTodaySetup;
  changes?: Record<string, unknown>;
  built_at: string;
  updated_at?: string;
};

// -----------------------------------------------------------------------------
// Reader (cheap - one Firestore read)
// -----------------------------------------------------------------------------

export async function getWatchlistView(uid: string): Promise<WatchlistView | null> {
  const doc = await adminFirestore.collection("tm_watchlist_views").doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as WatchlistView;
}

export async function getRadarUserView(uid: string): Promise<RadarUserView | null> {
  const doc = await adminFirestore.collection("tm_radar_user_views").doc(uid).get();
  if (!doc.exists) return null;
  const payload = doc.data() as Partial<RadarUserView>;
  if (
    payload.uid !== uid ||
    !payload.narrative ||
    !Array.isArray(payload.attention_items) ||
    !payload.generated_at
  ) {
    return null;
  }
  const generatedAt = Date.parse(payload.generated_at);
  if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > 72 * 60 * 60 * 1000) {
    return null;
  }
  return {
    ...(payload as RadarUserView),
    attention_items: payload.attention_items.slice(0, 3),
    upcoming_events: Array.isArray(payload.upcoming_events)
      ? payload.upcoming_events.slice(0, 6)
      : [],
  };
}

export async function getRadarStockStates(
  instrumentIds: string[],
): Promise<Record<string, RadarStockStateDoc>> {
  const ids = [...new Set(instrumentIds.map((id) => String(id || "").trim().toUpperCase()).filter(Boolean))];
  if (ids.length === 0) return {};
  const byId = await getDocsById<RadarStockStateDoc>(
    adminFirestore.collection("tm_radar_stock_state"),
    ids,
  );
  const out: Record<string, RadarStockStateDoc> = {};
  for (const [id, doc] of byId) out[id] = doc;
  return out;
}

export type RadarStockStateDoc = {
  ticker?: string;
  rsi_14?: number | null;
  rsi_state?: string;
  earnings_date?: string | null;
  earnings_status?: string | null;
  day_change_pct?: number | null;
  analyst_rating?: string | null;
  last_filing_kind?: string | null;
  guidance_direction?: string | null;
};

export async function overlayLatestPrices(rows: WatchlistRow[]): Promise<WatchlistRow[]> {
  const ids = rows.map((row) => row.instrument_id).filter(Boolean);
  if (ids.length === 0) return rows;
  const latestById = await getLatestPriceQuotes(ids);
  return rows.map((row) => {
    const latest = latestById.get(row.instrument_id);
    const quote = latest?.quote;
    const price = toNumber(quote?.current);
    const dayChangePct = toNumber(quote?.day_change_pct);
    const dayChangeAbs = toNumber(quote?.day_change_abs);
    if (price === null && dayChangePct === null && dayChangeAbs === null) {
      return row;
    }
    const holding =
      row.holding && price !== null && toNumber(row.holding.quantity) !== null
        ? {
            ...row.holding,
            computed_market_value: (toNumber(row.holding.quantity) as number) * price,
          }
        : row.holding;
    return {
      ...row,
      currency: typeof latest?.currency === "string" ? latest.currency : row.currency,
      price: price ?? row.price,
      day_change_pct: dayChangePct ?? row.day_change_pct,
      day_change_abs: dayChangeAbs ?? row.day_change_abs,
      holding,
    };
  });
}

/**
 * Lightweight market data for arbitrary instruments (e.g. suggestion ideas that
 * aren't in the user's book). Reads live prices + analyst facts and computes the
 * analyst target runway. Batched: two `getDocsById` reads regardless of count.
 */
export async function getIdeaMarketData(
  instrumentIds: string[],
): Promise<
  Map<
    string,
    { price: number | null; currency: string | null; dayChangePct: number | null; targetUpsidePct: number | null }
  >
> {
  const ids = [...new Set(instrumentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map<
    string,
    { price: number | null; currency: string | null; dayChangePct: number | null; targetUpsidePct: number | null }
  >();
  if (ids.length === 0) return out;

  const [pricesById, factsById] = await Promise.all([
    getLatestPriceQuotes(ids),
    // Idea cards only need the analyst block; field-select it so LocalDB does
    // not ship the full facts doc (financial history, holders, events) per idea.
    getDocsByIdSelected<Record<string, unknown>>(
      adminFirestore.collection("tm_stock_facts"),
      ids,
      ["analyst"],
    ),
  ]);

  for (const id of ids) {
    const latest = pricesById.get(id);
    const quote = latest?.quote;
    const price = toNumber(quote?.current);
    const currency =
      typeof latest?.currency === "string"
        ? (latest.currency as string)
        : id.toUpperCase().startsWith("IN_")
          ? "INR"
          : "USD";
    const facts = (factsById.get(id) as Record<string, unknown> | undefined) || {};
    out.set(id, {
      price,
      currency,
      dayChangePct: toNumber(quote?.day_change_pct),
      targetUpsidePct: targetUpsidePct(price, facts, {}),
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Builder (called on track/untrack to keep the view fresh)
// -----------------------------------------------------------------------------

function marketFromInstrumentId(id: string): "US" | "IN" | "" {
  const prefix = id.split("_", 1)[0];
  return prefix === "US" || prefix === "IN" ? prefix : "";
}

function positionTypeFor(
  instrumentId: string,
  positions?: Record<string, unknown> | null,
): "holding" | "watchlist" {
  return positions?.[instrumentId] === "holding" ? "holding" : "watchlist";
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundNumber(v: number | null, digits = 2): number | null {
  if (v === null) return null;
  const factor = 10 ** digits;
  return Math.round(v * factor) / factor;
}

type ActiveUniverses = Record<"US_ai" | "IN_ai" | "US_price" | "IN_price", string>;

function requireUniverse(config: Record<string, unknown>, key: string): string {
  const value = String(config[key] || "").trim();
  if (!value) {
    throw new Error(`Missing tm_config/active_universes key: ${key}`);
  }
  return value;
}

async function getActiveUniverses(): Promise<ActiveUniverses> {
  const snap = await adminFirestore.collection("tm_config").doc("active_universes").get();
  const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
  const usUniverse = requireUniverse(data, "US_universe");
  return {
    US_ai: usUniverse,
    US_price: usUniverse,
    IN_ai: requireUniverse(data, "IN_ai_universe"),
    IN_price: requireUniverse(data, "IN_price_universe"),
  };
}

async function getDocsById<T>(
  collection: FirebaseFirestore.CollectionReference,
  ids: string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, T>();
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const refs = uniqueIds.slice(start, start + 100).map((id) => collection.doc(id));
    const snaps = await adminFirestore.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, snap.data() as T);
    }
  }
  return out;
}

async function getDocsByIdSelected<T>(
  collection: FirebaseFirestore.CollectionReference,
  ids: string[],
  fields: string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, T>();
  const local = localFirestoreFromEnv();
  if (local) {
    const snaps = await local.getAllSelected(
      uniqueIds.map((id) => local.collection(collection.path).doc(id)),
      fields,
    );
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, snap.data() as T);
    }
    return out;
  }
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const refs = uniqueIds.slice(start, start + 100).map((id) => collection.doc(id));
    const snaps = await adminFirestore.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, snap.data() as T);
    }
  }
  return out;
}

function metricValue(intel: Record<string, unknown>, pillar: string, label: string): number | null {  const pillars = (intel.pillars as Record<string, unknown>) || {};
  const pillarDoc = (pillars[pillar] as Record<string, unknown>) || {};
  const metrics = Array.isArray(pillarDoc.metrics) ? pillarDoc.metrics : [];
  for (const metric of metrics) {
    const row = metric as Record<string, unknown>;
    if (String(row.label || "").trim().toLowerCase() === label.toLowerCase()) {
      return toNumber(row.value);
    }
  }
  return null;
}

function metricSummary(intel: Record<string, unknown>, pillar: string, label: string): string {
  const pillars = (intel.pillars as Record<string, unknown>) || {};
  const pillarDoc = (pillars[pillar] as Record<string, unknown>) || {};
  const metrics = Array.isArray(pillarDoc.metrics) ? pillarDoc.metrics : [];
  for (const metric of metrics) {
    const row = metric as Record<string, unknown>;
    if (String(row.label || "").trim().toLowerCase() === label.toLowerCase()) {
      return String(row.summary || "").trim();
    }
  }
  return "";
}

function compactFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const analyst = (facts.analyst as Record<string, unknown>) || {};
  const returns = (facts.returns as Record<string, unknown>) || {};
  const quick = (facts.quick_stats as Record<string, unknown>) || {};
  const financials = (facts.financials as Record<string, unknown>) || {};
  const institutions = (facts.institutions as Record<string, unknown>) || {};
  return {
    returns: {
      one_month_pct: toNumber(returns.one_month_pct),
      three_month_pct: toNumber(returns.three_month_pct),
      six_month_pct: toNumber(returns.six_month_pct),
      one_year_pct: toNumber(returns.one_year_pct),
    },
    quick_stats: {
      market_cap: toNumber(quick.market_cap),
      pe_ttm: toNumber(quick.pe_ttm),
      eps_next_year_growth_pct: toNumber(quick.eps_next_year_growth_pct),
      institutional_ownership_pct: toNumber(quick.institutional_ownership_pct),
      recommendation_score: toNumber(quick.recommendation_score),
    },
    analyst: {
      label: analyst.label,
      target_price: toNumber(analyst.target_price),
      target_low: toNumber(analyst.target_low),
      target_high: toNumber(analyst.target_high),
      buy: toNumber(analyst.buy) ?? 0,
      hold: toNumber(analyst.hold) ?? 0,
      sell: toNumber(analyst.sell) ?? 0,
      analyst_count: toNumber(analyst.analyst_count) ?? 0,
    },
    events: Array.isArray(facts.events)
      ? facts.events.filter((event) => {
          const row = event as Record<string, unknown>;
          return eventIsCurrent(String(row.date_label || ""));
        })
      : [],
    financials: {
      fiscal_year: financials.fiscal_year,
      revenue: toNumber(financials.revenue),
      revenue_growth_yoy_pct: toNumber(financials.revenue_growth_yoy_pct),
      operating_income: toNumber(financials.operating_income),
      net_income: toNumber(financials.net_income),
      eps_diluted: toNumber(financials.eps_diluted),
    },
    institutions: {
      ownership_pct: toNumber(institutions.ownership_pct),
      top_holders: Array.isArray(institutions.top_holders) ? institutions.top_holders.slice(0, 3) : [],
    },
  };
}

function mentionSummary(mentionStats: Record<string, unknown>): Record<string, unknown> {
  const days = (mentionStats.days as Record<string, Record<string, unknown>>) || {};
  const payloads = Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([, payload]) => payload || {});
  const counts = payloads.map((payload) => toNumber(payload.count) ?? 0);
  const sentiments = payloads
    .map((payload) => {
      const n = toNumber(payload.sentiment_n) ?? 0;
      if (n <= 0) return null;
      return (toNumber(payload.sentiment_sum) ?? 0) / n;
    })
    .filter((value): value is number => value !== null);
  return {
    mentions_1d: counts.at(-1) ?? 0,
    mentions_7d: roundNumber(counts.reduce((sum, value) => sum + value, 0), 2),
    avg_sentiment_7d: sentiments.length
      ? roundNumber(sentiments.reduce((sum, value) => sum + value, 0) / sentiments.length, 3)
      : null,
  };
}

function microcopyFromStockBrief(
  ticker: string,
  dayChangePct: number | null,
  stockBrief: Record<string, unknown>,
): { micro: string; vibe: "up" | "down" | "wild" } | null {
  if (!Object.keys(stockBrief).length) return null;
  const visual = (stockBrief.visual_summary as Record<string, unknown>) || {};
  const raw =
    visual.what_changed ||
    stockBrief.today_brief ||
    stockBrief.body ||
    stockBrief.thesis ||
    stockBrief.headline;
  const micro = String(raw || "").replace(/\s+/g, " ").trim();
  if (!micro) return null;

  const label = String(stockBrief.overall_label || "").toLowerCase();
  const vibe =
    label === "bullish"
      ? "up"
      : label === "bearish"
        ? "down"
        : dayChangePct !== null
          ? dayChangePct >= 0
            ? "up"
            : "down"
          : "wild";
  return {
    micro: `${ticker}: ${micro}`.slice(0, 150),
    vibe,
  };
}

function isFullAiBrief(stockBrief: Record<string, unknown>): boolean {
  const source = String(stockBrief.source || "").toLowerCase();
  const coverageType = String(stockBrief.coverage_type || "").toLowerCase();
  return isLlmBriefSource(source) && coverageType !== "on_demand_no_news";
}

function targetUpsidePct(
  price: number | null,
  facts: Record<string, unknown>,
  intel: Record<string, unknown>,
): number | null {
  const analyst = (facts.analyst as Record<string, unknown>) || {};
  const target = toNumber(analyst.target_price) ?? metricValue(intel, "valuation", "Analyst target");
  if (!price || !target) return null;
  return roundNumber(((target - price) / price) * 100, 2);
}

function eventIsCurrent(dateLabel: string): boolean {
  const parts = dateLabel.toLowerCase().replaceAll(",", " ").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const month = MONTHS[parts[0].slice(0, 3)];
  const day = Number(parts[1]);
  if (month === undefined || !Number.isFinite(day)) return false;
  const now = new Date();
  let year = now.getUTCFullYear();
  if (parts.length >= 3) {
    const parsedYear = Number(parts[2]);
    if (Number.isFinite(parsedYear)) year = parsedYear;
  }
  let eventDate = new Date(Date.UTC(year, month, day));
  if (parts.length < 3) {
    const todayTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const deltaDays = Math.round((eventDate.getTime() - todayTs) / 86_400_000);
    if (deltaDays < -180) eventDate = new Date(Date.UTC(year + 1, month, day));
    else if (deltaDays > 180) eventDate = new Date(Date.UTC(year - 1, month, day));
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const deltaDays = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000);
  return deltaDays >= -1 && deltaDays <= 45;
}

function catalystIsCurrent(catalyst: Record<string, unknown>): boolean {
  if (String(catalyst.kind || "").toLowerCase() !== "earnings") return true;
  const dateLabel = String(catalyst.date_label || catalyst.window || "").trim();
  if (dateLabel && eventIsCurrent(dateLabel)) return true;
  const dateRaw = String(catalyst.date || "").trim();
  if (dateRaw) {
    const iso = dateRaw.split("T", 1)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const eventDate = new Date(`${iso}T00:00:00.000Z`);
      const delta = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000);
      if (delta >= -1 && delta <= 45) return true;
    }
  }
  const parts = String(catalyst.title || "").split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return eventIsCurrent(parts.slice(1).join(" "));
  return false;
}

function premiumSignals(
  ticker: string,
  price: number | null,
  dayChangePct: number | null,
  facts: Record<string, unknown>,
  intel: Record<string, unknown>,
  technicals: Record<string, unknown>,
  alerts: Record<string, unknown>[],
): Record<string, unknown>[] {
  const compact = compactFacts(facts);
  const analyst = (compact.analyst as Record<string, unknown>) || {};
  const returns = (compact.returns as Record<string, unknown>) || {};
  const quick = (compact.quick_stats as Record<string, unknown>) || {};
  const events = Array.isArray(compact.events) ? compact.events as Record<string, unknown>[] : [];
  const rsiBlock = ((technicals.rsi_14 as Record<string, unknown>) || {});
  const signals: Record<string, unknown>[] = [];
  const upside = targetUpsidePct(price, facts, intel);
  if (upside !== null) {
    signals.push({
      kind: "analyst_upside",
      label: "Analyst runway",
      value: upside,
      unit: "%",
      tone: upside >= 10 ? "positive" : upside >= 0 ? "neutral" : "negative",
      sentence: `${ticker} has ${upside >= 0 ? "+" : ""}${upside.toFixed(1)}% target runway from ${analyst.analyst_count ?? 0} analysts.`,
    });
  }
  const oneMonth = toNumber(returns.one_month_pct);
  const oneYear = toNumber(returns.one_year_pct);
  if (oneMonth !== null || oneYear !== null) {
    signals.push({
      kind: "return_profile",
      label: "Return profile",
      value: oneMonth,
      unit: "%",
      tone: (oneMonth ?? 0) > 5 ? "positive" : (oneMonth ?? 0) < -5 ? "negative" : "neutral",
      sentence: oneMonth !== null && oneYear !== null
        ? `Returns: 1M ${oneMonth >= 0 ? "+" : ""}${oneMonth.toFixed(1)}% / 1Y ${oneYear >= 0 ? "+" : ""}${oneYear.toFixed(1)}%`
        : "Return history available.",
    });
  }
  const rsi = toNumber(rsiBlock.value);
  if (rsi !== null) {
    signals.push({
      kind: "technical_state",
      label: "Technical setup",
      value: rsi,
      unit: "RSI",
      tone: rsi >= 70 ? "negative" : rsi <= 35 ? "positive" : "neutral",
      sentence: `RSI ${rsi.toFixed(1)} is ${String(rsiBlock.state || "neutral").replaceAll("_", " ")}.`,
    });
  }
  const ownership = toNumber(quick.institutional_ownership_pct);
  if (ownership !== null) {
    signals.push({
      kind: "ownership",
      label: "Ownership",
      value: ownership,
      unit: "%",
      tone: ownership >= 60 ? "positive" : "neutral",
      sentence: `Institutions own ${ownership.toFixed(1)}% of ${ticker}.`,
    });
  }
  for (const event of events.slice(0, 1)) {
    const title = String(event.title || event.kind || "Event");
    const dateLabel = String(event.date_label || "").trim();
    if (dateLabel && eventIsCurrent(dateLabel)) {
      signals.push({
        kind: "event",
        label: title,
        value: dateLabel,
        tone: "neutral",
        sentence: `${title}: ${dateLabel}.`,
      });
    }
  }
  for (const flag of alerts.slice(0, 1)) {
    const message = String(flag.message || flag.label || flag.type || "").trim();
    if (message) {
      signals.push({
        kind: "alert",
        label: "Alert",
        value: flag.type || flag.kind,
        tone: String(flag.type || flag.kind || "").includes("bear") ? "negative" : "neutral",
        sentence: message.slice(0, 140),
      });
    }
  }
  if (dayChangePct !== null && Math.abs(dayChangePct) >= 3) {
    signals.push({
      kind: "price_move",
      label: "Large move",
      value: roundNumber(dayChangePct, 2),
      unit: "%",
      tone: dayChangePct > 0 ? "positive" : "negative",
      sentence: `${ticker} moved ${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(1)}% today.`,
    });
  }
  return signals.slice(0, 6);
}

function rowAttention(
  positionType: "holding" | "watchlist",
  ticker: string,
  dayChangePct: number | null,
  targetUpside: number | null,
  facts: Record<string, unknown>,
  technicals: Record<string, unknown>,
  mentionStats: Record<string, unknown>,
  alerts: Record<string, unknown>[],
): {
  attention_score: number;
  attention_reason: string;
  attention_kind: "move" | "risk" | "opportunity" | "news" | "calm";
  suggested_action: string;
  action_tone: "positive" | "negative" | "neutral";
} {
  const returns = ((compactFacts(facts).returns as Record<string, unknown>) || {});
  const oneMonth = toNumber(returns.one_month_pct);
  const rsi = toNumber(((technicals.rsi_14 as Record<string, unknown>) || {}).value);
  const mentions1d = toNumber(mentionStats.mentions_1d) ?? 0;
  const mentions7d = toNumber(mentionStats.mentions_7d) ?? 0;
  const bigMove = dayChangePct !== null && Math.abs(dayChangePct) >= 3;
  const hugeMove = dayChangePct !== null && Math.abs(dayChangePct) >= 5;
  const stretched = rsi !== null && rsi >= 70;
  const washedOut = rsi !== null && rsi <= 35;
  const newsy = mentions1d >= 2 || mentions7d >= 4;
  const alert = alerts[0];
  const alertMessage = String(alert?.message || alert?.label || "").trim();

  if (alertMessage) {
    return {
      attention_score: 92,
      attention_reason: alertMessage.slice(0, 150),
      attention_kind: "risk",
      suggested_action: positionType === "holding" ? "Review holding" : "Keep watching",
      action_tone: "negative",
    };
  }
  if (hugeMove || bigMove) {
    const up = (dayChangePct ?? 0) > 0;
    return {
      attention_score: hugeMove ? 88 : 74,
      attention_reason: `${ticker} moved ${formatSigned(dayChangePct)} today${oneMonth !== null ? ` and is ${formatSigned(oneMonth)} over 1M` : ""}.`,
      attention_kind: "move",
      suggested_action: positionType === "holding"
        ? (up ? "Check if move changes trim/add plan" : "Check if thesis is intact")
        : (up ? "Do not chase blindly" : "Watch for entry setup"),
      action_tone: up ? "positive" : "negative",
    };
  }
  if (stretched || washedOut) {
    return {
      attention_score: stretched ? 78 : 72,
      attention_reason: `${ticker} RSI is ${rsi?.toFixed(1)}, ${stretched ? "stretched after strength" : "washed out after weakness"}.`,
      attention_kind: stretched ? "risk" : "opportunity",
      suggested_action: positionType === "holding"
        ? (stretched ? "Avoid adding into heat" : "Decide if weakness is buyable")
        : (stretched ? "Wait for pullback" : "Investigate entry"),
      action_tone: stretched ? "negative" : "positive",
    };
  }
  if (targetUpside !== null && Math.abs(targetUpside) >= 15) {
    const positive = targetUpside > 0;
    return {
      attention_score: positive ? 68 : 76,
      attention_reason: `${ticker} has ${formatSigned(targetUpside)} analyst target runway.`,
      attention_kind: positive ? "opportunity" : "risk",
      suggested_action: positionType === "holding"
        ? (positive ? "Let thesis breathe" : "Recheck valuation risk")
        : (positive ? "Add to shortlist" : "Avoid until reset"),
      action_tone: positive ? "positive" : "negative",
    };
  }
  if (newsy) {
    return {
      attention_score: 64,
      attention_reason: `${ticker} has elevated news activity: ${mentions1d.toFixed(0)} today, ${mentions7d.toFixed(0)} this week.`,
      attention_kind: "news",
      suggested_action: "Read latest context",
      action_tone: "neutral",
    };
  }
  return {
    attention_score: 35,
    attention_reason: `Nothing material has changed for ${ticker} today.`,
    attention_kind: "calm",
    suggested_action: positionType === "holding" ? "Hold thesis" : "Keep on watch",
    action_tone: "neutral",
  };
}

function formatSigned(value: number | null): string {
  if (value === null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function previousRowsById(previousView: WatchlistView | null): Map<string, WatchlistRow> {
  return new Map((previousView?.rows || []).map((row) => [row.instrument_id, row]));
}

function scoreDelta(current: WatchlistRow, previous: WatchlistRow | undefined, key: keyof WatchlistRow["scores"]): number | null {
  const curr = current.scores[key];
  const prev = previous?.scores[key];
  if (typeof curr !== "number" || typeof prev !== "number") return null;
  return roundNumber(curr - prev, 1);
}

function valueDelta(current: unknown, previous: unknown): number | null {
  const curr = toNumber(current);
  const prev = toNumber(previous);
  if (curr === null || prev === null) return null;
  return roundNumber(curr - prev, 2);
}

function applyRowDeltas(rows: WatchlistRow[], previousView: WatchlistView | null): WatchlistRow[] {
  const previousById = previousRowsById(previousView);
  return rows.map((row) => {
    const previous = previousById.get(row.instrument_id);
    const scoreDeltas = {
      overall: scoreDelta(row, previous, "overall"),
      valuation: scoreDelta(row, previous, "valuation"),
      growth: scoreDelta(row, previous, "growth"),
      quality: scoreDelta(row, previous, "quality"),
      momentum: scoreDelta(row, previous, "momentum"),
    };
    const targetDelta = valueDelta(row.target_upside_pct, previous?.target_upside_pct);
    const dayChangeDelta = valueDelta(row.day_change_pct, previous?.day_change_pct);
    const previousAlertKeys = new Set(
      (previous?.alerts || []).map((alert) => String(alert.type || alert.kind || alert.message || JSON.stringify(alert))),
    );
    const newAlerts = row.alerts.filter((alert) => {
      const key = String(alert.type || alert.kind || alert.message || JSON.stringify(alert));
      return !previousAlertKeys.has(key);
    }).slice(0, 3);
    const material = [
      ...Object.values(scoreDeltas),
      targetDelta,
      dayChangeDelta,
    ].filter((value): value is number => typeof value === "number" && Math.abs(value) >= 1);
    return {
      ...row,
      changes: {
        is_new: !previous,
        score_deltas: scoreDeltas,
        target_upside_delta: targetDelta,
        day_change_delta: dayChangeDelta,
        new_alerts: newAlerts,
        has_material_change: !previous || material.length > 0 || newAlerts.length > 0,
      },
    } as WatchlistRow & { changes: Record<string, unknown> };
  });
}

async function loadAlertsByInstrument(uid: string): Promise<Record<string, Record<string, unknown>[]>> {
  const snap = await adminFirestore
    .collection("tm_user_alert_flags")
    .where("user_id", "==", uid)
    .get();
  const out: Record<string, Record<string, unknown>[]> = {};
  snap.forEach((doc) => {
    const data = doc.data() as { instrument_id?: string; flags?: unknown[] };
    const instrumentId = String(data?.instrument_id ?? "").trim();
    const flags = Array.isArray(data?.flags) ? (data.flags as Record<string, unknown>[]) : [];
    if (!instrumentId || flags.length === 0) return;
    (out[instrumentId] ||= []).push(...flags);
  });
  return out;
}

function rowFromDocs(
  instrumentId: string,
  positionType: "holding" | "watchlist",
  holdingRaw: Record<string, unknown> | null,
  latest: Record<string, unknown>,
  instrument: Record<string, unknown>,
  intel: Record<string, unknown>,
  stockBrief: Record<string, unknown>,
  facts: Record<string, unknown>,
  technicals: Record<string, unknown>,
  mentionStats: Record<string, unknown>,
  alertsByInstrument: Record<string, Record<string, unknown>[]>,
): WatchlistRow | null {
  const market = marketFromInstrumentId(instrumentId);
  if (!market) return null;

  const quote = (latest?.quote as Record<string, unknown>) || {};
  const pillars = (intel?.pillars as Record<string, { score?: unknown; metrics?: Array<{ summary?: string }> }>) || {};
  const overall = (intel?.overall as Record<string, unknown>) || {};
  const ticker = (latest?.ticker as string) || (intel?.ticker as string) || instrumentId.split("_").slice(1).join("_");
  const dayChange = toNumber(quote.day_change_pct);
  const alerts = alertsByInstrument[instrumentId] || [];
  const briefMicrocopy = microcopyFromStockBrief(ticker, dayChange, stockBrief);
  const { micro, vibe } = briefMicrocopy || rowMicrocopy(ticker, dayChange, intel, alerts);
  const price = toNumber(quote.current);
  const factsCompact = compactFacts(facts);
  const mentionCompact = mentionSummary(mentionStats);
  const holdingPayload: WatchlistRow["holding"] =
    positionType === "holding" && holdingRaw
      ? {
          quantity: toNumber(holdingRaw.quantity),
          market_value: toNumber(holdingRaw.market_value),
          average_cost: toNumber(holdingRaw.average_cost),
          computed_market_value:
            toNumber(holdingRaw.quantity) !== null && price !== null
              ? (toNumber(holdingRaw.quantity) as number) * price
              : toNumber(holdingRaw.market_value),
          source: typeof holdingRaw.source === "string" ? holdingRaw.source : "manual",
          updated_at: typeof holdingRaw.updated_at === "string" ? holdingRaw.updated_at : undefined,
        }
      : undefined;
  const targetUpside = targetUpsidePct(price, facts, intel);
  const attention = rowAttention(
    positionType,
    ticker,
    dayChange,
    targetUpside,
    facts,
    technicals,
    mentionCompact,
    alerts,
  );
  const rawDirective =
    stockBrief && typeof stockBrief.directive_v2 === "object" && stockBrief.directive_v2 !== null
      ? (stockBrief.directive_v2 as Record<string, unknown>)
      : {};
  const actionBlock =
    rawDirective.action && typeof rawDirective.action === "object"
      ? (rawDirective.action as Record<string, unknown>)
      : {};
  const zonesBlock =
    rawDirective.zones && typeof rawDirective.zones === "object"
      ? (rawDirective.zones as Record<string, unknown>)
      : {};
  const directiveText = String(actionBlock.label || "").trim();
  const directiveRationale = String(actionBlock.summary || rawDirective.watch_out || "").trim();
  const directiveStance = String(rawDirective.stance || "").toLowerCase();
  const directiveConfidence = String(rawDirective.confidence || "").toLowerCase();
  const directiveTrigger =
    typeof zonesBlock.accumulate_below === "number"
      ? `below ${zonesBlock.accumulate_below.toFixed(2)}`
      : typeof zonesBlock.breakout_above === "number"
        ? `above ${zonesBlock.breakout_above.toFixed(2)}`
        : typeof zonesBlock.trim_above === "number"
          ? `above ${zonesBlock.trim_above.toFixed(2)}`
          : undefined;

  let directivePriority: "high" | "medium" | "low" = "low";
  if (directiveStance === "trim" || directiveStance === "avoid") {
    directivePriority = holdingPayload?.portfolio_weight_pct != null && holdingPayload.portfolio_weight_pct >= 10 ? "high" : "medium";
  } else if (directiveStance === "accumulate") {
    directivePriority = directiveConfidence === "high" && (dayChange ?? 0) <= -2 ? "high" : "medium";
  } else if (directiveStance === "watch") {
    directivePriority = Math.abs(dayChange ?? 0) >= 3 ? "medium" : "low";
  }

  return {
    instrument_id: instrumentId,
    ticker,
    logo_url: typeof instrument.logo_url === "string" ? instrument.logo_url : null,
    position_type: positionType,
    market,
    sector_label: (intel?.sector_label as string) || String(instrument.sector || "").trim() || "",
    industry_label: (intel?.industry_label as string) || String(instrument.industry || "").trim() || "",
    instrument_sector: String(instrument.sector || "").trim() || undefined,
    currency: (latest?.currency as string) || (market === "US" ? "USD" : "INR"),
    price,
    day_change_pct: dayChange,
    day_change_abs: toNumber(quote.day_change_abs),
    scores: {
      overall: toNumber(overall.score),
      verdict: (overall.verdict as string) ?? null,
      valuation: toNumber(pillars.valuation?.score),
      growth: toNumber(pillars.growth?.score),
      quality: toNumber(pillars.quality?.score),
      momentum: toNumber(pillars.momentum?.score),
    },
    alerts,
    catalysts: Array.isArray(intel?.catalysts)
      ? (intel.catalysts as Record<string, unknown>[]).filter(catalystIsCurrent).slice(0, 3)
      : [],
    facts: factsCompact,
    technicals: {
      rsi_14: technicals.rsi_14 || {},
      moving_averages: technicals.moving_averages || {},
      distance: technicals.distance || {},
    },
    news_velocity: mentionCompact,
    premium_signals: premiumSignals(ticker, price, dayChange, facts, intel, technicals, alerts),
    target_upside_pct: targetUpside,
    top_metric_summaries: [
      metricSummary(intel, "valuation", "Analyst target"),
      metricSummary(intel, "growth", "Revenue growth (TTM)"),
      metricSummary(intel, "quality", "Institutional ownership"),
      metricSummary(intel, "momentum", "1-month performance"),
    ].filter(Boolean).slice(0, 3),
    brief_tile: {
      micro,
      vibe,
      source: briefMicrocopy && isFullAiBrief(stockBrief) ? LLM_BRIEF_SOURCE : "rules",
    },
    ai_directive: Object.keys(rawDirective).length > 0
      ? {
          ...(rawDirective as DirectiveV2Shape),
          text: directiveText || undefined,
          stance: (
            ["accumulate", "trim", "watch", "avoid", "hold"].includes(directiveStance)
              ? directiveStance
              : undefined
          ) as "accumulate" | "trim" | "watch" | "avoid" | "hold" | undefined,
          rationale: directiveRationale || undefined,
          trigger: directiveTrigger,
          confidence: (
            ["low", "med", "medium", "high"].includes(directiveConfidence)
              ? directiveConfidence
              : undefined
          ) as DirectiveV2Shape["confidence"],
        }
      : undefined,
    ai_directive_text: directiveText || undefined,
    ai_directive_rationale: directiveRationale || undefined,
    directive_v2: Object.keys(rawDirective).length > 0
      ? {
          ...(rawDirective as DirectiveV2Shape),
          title: directiveText || undefined,
          detail: directiveRationale || undefined,
          priority: directivePriority,
          trigger: directiveTrigger,
          holding_status: holdingPayload ? (holdingPayload.quantity || holdingPayload.market_value || holdingPayload.computed_market_value ? "known" : "unknown") : "watchlist",
        }
      : undefined,
    ...attention,
    coverage_status: Object.keys(intel).length > 0 ? "ready" : "score_pending",
    has_intel_pro: Object.keys(intel).length > 0,
    holding: holdingPayload,
  };
}

async function buildRows(
  ids: string[],
  positions: Record<string, unknown>,
  holdingsMap: Record<string, Record<string, unknown>>,
  universes: ActiveUniverses,
  alertsByInstrument: Record<string, Record<string, unknown>[]>,
): Promise<WatchlistRow[]> {
  const [latestById, instrumentsById, factsById, technicalsById, mentionsById] = await Promise.all([
    getLatestPriceQuotes(ids),
    getDocsById<Record<string, unknown>>(adminFirestore.collection("tm_instruments"), ids),
    getDocsById<Record<string, unknown>>(adminFirestore.collection("tm_stock_facts"), ids),
    getDocsById<Record<string, unknown>>(adminFirestore.collection("tm_stock_technicals_latest"), ids),
    getDocsById<Record<string, unknown>>(adminFirestore.collection("tm_mention_stats"), ids),
  ]);

  const intelById = new Map<string, Record<string, unknown>>();
  const stockBriefById = new Map<string, Record<string, unknown>>();
  for (const market of ["US", "IN"] as const) {
    const marketIds = ids.filter((id) => marketFromInstrumentId(id) === market);
    if (marketIds.length === 0) continue;
    const priceUniverse = universes[`${market}_price` as "US_price" | "IN_price"];
    const aiUniverse = universes[`${market}_ai` as "US_ai" | "IN_ai"];
    if (!priceUniverse || !aiUniverse) {
      throw new Error(`Missing active universe for market ${market}`);
    }

    const intelDocs = await getDocsById<Record<string, unknown>>(
      adminFirestore
        .collection("tm_stock_intel_pro")
        .doc(`${market}__${priceUniverse}`)
        .collection("stocks"),
      marketIds,
    );
    for (const [instrumentId, doc] of intelDocs.entries()) {
      intelById.set(instrumentId, doc);
    }

    const briefDocs = await getDocsById<Record<string, unknown>>(
      adminFirestore
        .collection("tm_news_runs")
        .doc(`${market}__${aiUniverse}`)
        .collection("stock_intelligence"),
      marketIds,
    );
    for (const [instrumentId, doc] of briefDocs.entries()) {
      stockBriefById.set(instrumentId, doc);
    }
  }

  const rows: WatchlistRow[] = [];
  for (const id of ids) {
    const latest = latestById.get(id);
    if (!latest) continue;
    const row = rowFromDocs(
      id,
      positionTypeFor(id, positions),
      holdingsMap[id] ?? null,
      latest,
      instrumentsById.get(id) || {},
      intelById.get(id) || {},
      stockBriefById.get(id) || {},
      factsById.get(id) || {},
      technicalsById.get(id) || {},
      mentionsById.get(id) || {},
      alertsByInstrument,
    );
    if (row) rows.push(row);
  }
  return rows;
}

function clusterSector(
  row: Pick<WatchlistRow, "sector_label" | "industry_label" | "instrument_sector">,
): string {
  const sector =
    row.sector_label?.trim() ||
    row.instrument_sector?.trim() ||
    row.industry_label?.trim();
  return sector || "Uncategorized";
}

function sectorClusters(rows: WatchlistRow[]): Array<Record<string, unknown>> {
  const holdingRows = rows.filter((r) => r.position_type === "holding");
  const allHoldingsWeighted =
    holdingRows.length > 0 &&
    holdingRows.every(
      (r) =>
        typeof r.holding?.portfolio_weight_pct === "number" &&
        (r.holding.portfolio_weight_pct as number) > 0,
    );

  if (allHoldingsWeighted) {
    // Dollar-weighted: only holdings contribute — this is where the money actually is.
    const bySector = new Map<string, { value: number; count: number }>();
    for (const row of holdingRows) {
      const sector = clusterSector(row);
      const weight = row.holding!.portfolio_weight_pct as number;
      const prev = bySector.get(sector) ?? { value: 0, count: 0 };
      bySector.set(sector, { value: prev.value + weight, count: prev.count + 1 });
    }
    const total = [...bySector.values()].reduce((s, v) => s + v.value, 0) || 1;
    return [...bySector.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([sector, { value, count }]) => ({
        sector,
        count,
        weight_pct: Math.round((value / total) * 1000) / 10,
        weight_basis: "value",
      }));
  }

  // Fallback: equal-weight count across holdings when present, else all rows.
  const scopeRows = holdingRows.length > 0 ? holdingRows : rows;
  const counts = new Map<string, number>();
  for (const row of scopeRows) {
    const sector = clusterSector(row);
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sector, count]) => ({
      sector,
      count,
      weight_pct: Math.round((count / Math.max(scopeRows.length, 1)) * 1000) / 10,
    }));
}

export type HoldingsDiagnosis = {
  summary: string;
  clusters: Array<Record<string, unknown>>;
  factor_tilt: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  risk_flags: Array<Record<string, unknown>>;
};

/** Portfolio diagnosis scoped to entered holdings (not watchlist names). */
export function buildHoldingsDiagnosis(holdings: WatchlistRow[]): HoldingsDiagnosis {
  const emptyTilt = {
    overall: null,
    valuation: null,
    growth: null,
    quality: null,
    momentum: null,
  };
  if (!holdings.length) {
    return {
      summary: "Add holdings to see portfolio diagnosis.",
      clusters: [],
      factor_tilt: emptyTilt,
      risk_flags: [],
    };
  }

  const positionWeights = new Map<string, number>();
  const allWeighted = holdings.every(
    (r) =>
      typeof r.holding?.portfolio_weight_pct === "number" &&
      (r.holding.portfolio_weight_pct as number) > 0,
  );
  if (allWeighted) {
    for (const row of holdings) {
      positionWeights.set(row.instrument_id, row.holding!.portfolio_weight_pct as number);
    }
  }
  const weights = positionWeights.size > 0 ? positionWeights : undefined;

  const clusters = sectorClusters(holdings);
  const dominant = clusters[0];

  const riskFlags: Array<Record<string, unknown>> = [];
  if (dominant && Number(dominant.weight_pct) >= 50) {
    riskFlags.push({
      kind: "sector_concentration",
      severity: Number(dominant.weight_pct) >= 70 ? "high" : "medium",
      headline: `${Math.round(Number(dominant.weight_pct))}% clustered in ${dominant.sector}`,
      body: "A single-sector book can look great until one macro factor hits every name together.",
    });
  }
  for (const row of holdings
    .filter((item) => typeof item.scores.overall === "number" && item.scores.overall < 45)
    .sort((a, b) => (a.scores.overall ?? 0) - (b.scores.overall ?? 0))
    .slice(0, 3)) {
    riskFlags.push({
      kind: "low_score",
      severity: "medium",
      ticker: row.ticker,
      headline: `${row.ticker} is the weakest score in your holdings`,
      body: `Overall score ${row.scores.overall} with pressure in the factor stack.`,
    });
  }
  for (const row of holdings
    .filter((item) => toNumber(((item.technicals?.rsi_14 as Record<string, unknown>) || {}).value) !== null)
    .filter((item) => (toNumber(((item.technicals?.rsi_14 as Record<string, unknown>) || {}).value) ?? 0) >= 70)
    .slice(0, 3)) {
    const rsi = toNumber(((row.technicals?.rsi_14 as Record<string, unknown>) || {}).value);
    riskFlags.push({
      kind: "overbought",
      severity: "medium",
      ticker: row.ticker,
      headline: `${row.ticker} is technically stretched`,
      body: `RSI is ${rsi?.toFixed(1)}; this is a watch-for-pullback setup.`,
    });
  }

  const summaryParts: string[] = [];
  if (dominant) {
    summaryParts.push(
      `${dominant.sector} is the largest cluster at ${Math.round(Number(dominant.weight_pct))}%.`,
    );
  }
  const avgOverall = averageScore(holdings, "overall", weights);
  if (avgOverall !== null) summaryParts.push(`Average stocksbrew score is ${avgOverall}.`);
  if (riskFlags.length) {
    summaryParts.push(`${riskFlags.length} risk flag${riskFlags.length === 1 ? "" : "s"} need review.`);
  }

  return {
    summary: summaryParts.join(" ") || "Holdings diagnosis is ready.",
    clusters,
    factor_tilt: {
      overall: averageScore(holdings, "overall", weights),
      valuation: averageScore(holdings, "valuation", weights),
      growth: averageScore(holdings, "growth", weights),
      quality: averageScore(holdings, "quality", weights),
      momentum: averageScore(holdings, "momentum", weights),
    },
    risk_flags: riskFlags.slice(0, 6),
  };
}

function averageScore(
  rows: WatchlistRow[],
  key: keyof WatchlistRow["scores"],
  positionWeights?: Map<string, number>,
): number | null {
  if (positionWeights && positionWeights.size > 0) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const row of rows) {
      const score = row.scores[key];
      const w = positionWeights.get(row.instrument_id) ?? 0;
      if (typeof score === "number" && w > 0) {
        weightedSum += score * w;
        totalWeight += w;
      }
    }
    if (totalWeight === 0) return null;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }
  const values = rows
    .map((row) => row.scores[key])
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

type SuggestionContext = {
  avgOverall: number | null;
  avgGrowth: number | null;
  avgQuality: number | null;
  avgValuation: number | null;
  avgMomentum: number | null;
  dominantSector: string;
};

function liveDiscoveryScore(candidate: Record<string, unknown>): number {
  const sources = Array.isArray(candidate.sources) ? candidate.sources.map(String) : [];
  if (!sources.some((source) => ["mover", "reddit"].includes(source))) return 0;
  return Math.abs(toNumber(candidate.mover_move_pct) ?? 0) * 10 + (toNumber(candidate.reddit_mentions) ?? 0) * 4;
}

// Rank the personalized union with a small freshness bonus so daily movers and
// Reddit names can rotate into the six suggestions.
async function finalizeSuggestions(
  candidates: Array<Record<string, unknown>>,
  ctx: SuggestionContext,
): Promise<Array<Record<string, unknown>>> {
  const suggested = new Set<string>();
  const rankScore = (candidate: Record<string, unknown>) =>
    (toNumber(candidate.personalization_score) ?? 0) + liveDiscoveryScore(candidate) * 0.2;
  const freshFirst = [...candidates].sort((a, b) => rankScore(b) - rankScore(a));
  const moverCandidate = freshFirst.find((candidate) =>
    Array.isArray(candidate.sources) && candidate.sources.map(String).includes("mover"),
  );
  const redditCandidate = freshFirst.find((candidate) =>
    Array.isArray(candidate.sources) && candidate.sources.map(String).includes("reddit"),
  );
  const orderedCandidates = [
    ...[moverCandidate, redditCandidate].filter((candidate): candidate is Record<string, unknown> => Boolean(candidate)),
    ...freshFirst,
    ...candidates,
  ];
  // Take top 8 to give the LLM rewriter some room to pick the best 6.
  const topCandidates: Array<Record<string, unknown>> = [];
  for (const candidate of orderedCandidates) {
    const instrumentId = String(candidate.instrument_id || "");
    if (!instrumentId || suggested.has(instrumentId)) continue;
    suggested.add(instrumentId);

    // Build a fallback `why` by joining signal bits — used when LLM rewrite is unavailable.
    const reasons = Array.isArray(candidate.personalization_reasons)
      ? candidate.personalization_reasons.map((v) => String(v)).filter(Boolean)
      : [];
    const summaryBits = [...reasons];
    const mentions = Math.round(toNumber(candidate.reddit_mentions) ?? 0);
    if (mentions > 0) summaryBits.push(`Reddit buzz ${mentions} mentions`);
    const moverMove = toNumber(candidate.mover_move_pct);
    if (moverMove !== null) summaryBits.push(`${moverMove >= 0 ? "+" : ""}${moverMove.toFixed(1)}% yesterday`);
    const themeName = Array.isArray(candidate.theme_names) ? String(candidate.theme_names[0] || "").trim() : "";
    if (themeName) summaryBits.push(themeName);
    // If `why` is still empty, fill from the candidate's current evidence.
    if (!candidate.why && summaryBits.length) {
      candidate.why = summaryBits.slice(0, 3).join("; ");
    }
    topCandidates.push(candidate);
    if (topCandidates.length >= 8) break;
  }

  // LLM rewrite: generate one short personalized "why" line per top candidate
  // in a single batched call. Fail gracefully — if the LLM is unavailable, the
  // existing rule-based `why` text already populated above stays.
  if (topCandidates.length > 0) {
    try {
      const rewritten = await rewriteSuggestionWhys(topCandidates, ctx);
      for (const c of topCandidates) {
        const id = String(c.instrument_id || "");
        const fresh = rewritten[id];
        if (fresh && fresh.trim()) c.why = fresh.trim();
      }
    } catch (err) {
      console.warn("[radar-suggestions] LLM rewrite failed, using rule-based whys:", err);
    }
  }

  return topCandidates.slice(0, 6);
}

async function gatherSuggestionCandidates(
  rows: WatchlistRow[],
): Promise<{ candidates: Array<Record<string, unknown>>; ctx: SuggestionContext }> {
  const tracked = new Set(rows.map((row) => row.instrument_id));
  const markets = [...new Set(rows.map((row) => row.market).filter(Boolean))] as Array<"US" | "IN">;
  const effectiveMarkets: Array<"US" | "IN"> = markets.length > 0 ? markets : ["US"];
  const avgOverall = averageScore(rows, "overall");
  const avgGrowth = averageScore(rows, "growth");
  const avgQuality = averageScore(rows, "quality");
  const avgValuation = averageScore(rows, "valuation");
  const avgMomentum = averageScore(rows, "momentum");
  const clusters = sectorClusters(rows);
  const dominant = (clusters[0] || {}) as Record<string, unknown>;
  const dominantSector = String(dominant.sector || "");
  const dominantWeight = toNumber(dominant.weight_pct) ?? 0;

  const [moverDocs, redditDocs, snapshots] = await Promise.all([
    Promise.all(effectiveMarkets.map((market) => getMarketMovers(market))),
    adminFirestore.getAll(
      ...effectiveMarkets.map((market) => adminFirestore.collection("reddit_snapshots").doc(`${market}__latest`)),
    ),
    Promise.all(effectiveMarkets.map((market) => getMarketSnapshot(market))),
  ]);

  const snapshotByMarket = new Map<string, Map<string, Record<string, unknown>>>();
  effectiveMarkets.forEach((market, index) => {
    const byTicker = new Map<string, Record<string, unknown>>();
    for (const row of snapshots[index] || []) {
      const ticker = String(row.symbol || "").trim().toUpperCase();
      if (ticker) byTicker.set(ticker, row as unknown as Record<string, unknown>);
    }
    snapshotByMarket.set(market, byTicker);
  });

  const candidateMap = new Map<string, Record<string, unknown>>();
  const uniqueStrings = (values: unknown[]): string[] =>
    [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];

  function portfolioFit(
    score: number | null,
    sector: string,
  ): { points: number; reasons: string[] } {
    let points = 0;
    const reasons: string[] = [];
    if (score !== null && avgOverall !== null) {
      const gap = score - avgOverall;
      if (gap >= 4) {
        points += Math.min(12, gap * 0.35);
        reasons.push(`scores ${Math.round(gap)} points above your average`);
      }
    }
    if (dominantWeight >= 50 && dominantSector && sector) {
      if (sector !== dominantSector) {
        points += 10;
        reasons.push(`adds exposure outside ${dominantSector}`);
      } else {
        points -= 6;
      }
    }
    return { points, reasons };
  }

  function resolveInstrument(
    market: "US" | "IN",
    ticker: string,
    payload: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const snapshot = snapshotByMarket.get(market)?.get(ticker) || {};
    const price = (snapshot.price as Record<string, unknown> | undefined) || {};
    return {
      instrument_id: String(payload.instrument_id || snapshot.instrumentId || `${market}_${ticker}`),
      ticker,
      market,
      name: String(payload.name || payload.company_name || snapshot.name || ticker),
      sector: String(payload.sector || snapshot.sectorId || ""),
      price: toNumber(payload.price) ?? toNumber(price.current),
      day_change_pct: toNumber(payload.day_change_pct) ?? toNumber(price.changePct),
    };
  }

  function mergeCandidate(next: Record<string, unknown>): void {
    const id = String(next.instrument_id || "");
    if (!id || tracked.has(id)) return;
    const existing = candidateMap.get(id);
    if (!existing) {
      candidateMap.set(id, {
        ...next,
        sources: uniqueStrings((next.sources as unknown[]) || []),
        theme_names: uniqueStrings((next.theme_names as unknown[]) || []),
        theme_roles: uniqueStrings((next.theme_roles as unknown[]) || []),
      });
      return;
    }
    const sources = uniqueStrings([
      ...((existing.sources as unknown[]) || []),
      ...((next.sources as unknown[]) || []),
    ]);
    const themeNames = uniqueStrings([
      ...((existing.theme_names as unknown[]) || []),
      ...((next.theme_names as unknown[]) || []),
    ]);
    const themeRoles = uniqueStrings([
      ...((existing.theme_roles as unknown[]) || []),
      ...((next.theme_roles as unknown[]) || []),
    ]);
    const existingScore = toNumber(existing.personalization_score) ?? 0;
    const nextScore = toNumber(next.personalization_score) ?? 0;
    candidateMap.set(id, {
      ...existing,
      name: existing.name || next.name,
      sector: existing.sector || next.sector,
      price: existing.price ?? next.price,
      day_change_pct: existing.day_change_pct ?? next.day_change_pct,
      score: existing.score ?? next.score,
      overall_score: existing.overall_score ?? next.overall_score,
      why: existing.why || next.why,
      sources,
      theme_names: themeNames,
      theme_roles: themeRoles,
      personalization_score: Math.round((Math.max(existingScore, nextScore) + (sources.length - 1) * 8) * 10) / 10,
      reddit_mentions: Math.max(toNumber(existing.reddit_mentions) ?? 0, toNumber(next.reddit_mentions) ?? 0),
      reddit_summary: existing.reddit_summary || next.reddit_summary,
      mover_move_pct: existing.mover_move_pct ?? next.mover_move_pct,
      mover_headline: existing.mover_headline || next.mover_headline,
      personalization_reasons: uniqueStrings([
        ...((existing.personalization_reasons as unknown[]) || []),
        ...((next.personalization_reasons as unknown[]) || []),
      ]).slice(0, 3),
    });
  }

  // 1. Research themes are the evergreen research universe.
  if (effectiveMarkets.includes("US")) {
    for (const theme of INVESTMENT_THEMES) {
      for (const [rank, candidate] of theme.candidates.slice(0, 10).entries()) {
        const ticker = candidate.ticker.toUpperCase();
        const base = resolveInstrument("US", ticker, { name: candidate.company });
        const score = candidate.stocksbrewScore ?? null;
        const fit = portfolioFit(score, String(base.sector || ""));
        mergeCandidate({
          ...base,
          reason: theme.name,
          why: candidate.benefitMechanism,
          score,
          overall_score: score,
          sources: ["theme"],
          theme_names: [theme.name],
          theme_roles: [candidate.role],
          personalization_score: 38 + (score ?? 55) * 0.42 + Math.max(0, 10 - rank) + fit.points,
          personalization_reasons: [
            `${theme.name} · ${candidate.role}`,
            ...fit.reasons,
          ].slice(0, 3),
        });
      }
    }
  }

  // 2. Yesterday's top 10 gainers and top 10 losers add the daily reset.
  for (const [index, doc] of moverDocs.entries()) {
    const market = effectiveMarkets[index] as "US" | "IN";
    if (!doc) continue;
    const addMovers = (items: Array<Record<string, unknown>>, direction: "gainer" | "loser") => {
      items.slice(0, 10).forEach((item, rank) => {
        const ticker = String(item.ticker || "").trim().toUpperCase();
        if (!ticker) return;
        const base = resolveInstrument(market, ticker, item);
        const move = toNumber(item.day_change_pct);
        const score = toNumber(item.overall_score);
        const fit = portfolioFit(score, String(base.sector || ""));
        const moveText = move === null ? "Yesterday's mover" : `${move >= 0 ? "+" : ""}${move.toFixed(1)}% yesterday`;
        mergeCandidate({
          ...base,
          reason: "Yesterday's movers",
          why: moveText,
          score,
          overall_score: score,
          sources: ["mover"],
          mover_direction: direction,
          mover_rank: rank + 1,
          mover_move_pct: move,
          mover_headline: moveText,
          personalization_score: 42 + Math.min(28, Math.abs(move ?? 0) * 1.35) + Math.max(0, 10 - rank) + fit.points,
          personalization_reasons: [moveText, ...fit.reasons].slice(0, 3),
        });
      });
    };
    addMovers((doc.gainers || []) as unknown as Array<Record<string, unknown>>, "gainer");
    addMovers((doc.losers || []) as unknown as Array<Record<string, unknown>>, "loser");
  }

  // 3. Reddit contributes the six most-mentioned names from the latest scan.
  for (const doc of redditDocs) {
    if (!doc.exists) continue;
    const market = String(doc.id.split("__")[0] || "US").toUpperCase() as "US" | "IN";
    const raw = doc.data()?.tickers;
    const entries: Array<[string, Record<string, unknown>]> = [];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [ticker, payload] of Object.entries(raw as Record<string, unknown>)) {
        entries.push([ticker.toUpperCase(), (payload || {}) as Record<string, unknown>]);
      }
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        const payload = (item || {}) as Record<string, unknown>;
        const ticker = String(payload.ticker || payload.symbol || "").toUpperCase();
        if (ticker) entries.push([ticker, payload]);
      }
    }
    entries
      .sort((a, b) => (toNumber(b[1].mention_count ?? b[1].mentions) ?? 0) - (toNumber(a[1].mention_count ?? a[1].mentions) ?? 0))
      .slice(0, 6)
      .forEach(([ticker, item], rank) => {
        const base = resolveInstrument(market, ticker, item);
        const mentions = Math.max(0, Math.round(toNumber(item.mention_count ?? item.mentions) ?? 0));
        const summary = String(item.summary || item.context || "").trim().slice(0, 200);
        const score = toNumber(item.overall_score);
        const fit = portfolioFit(score, String(base.sector || ""));
        mergeCandidate({
          ...base,
          name: String(item.company_name || item.name || base.name),
          reason: "Reddit buzz",
          why: summary || `${mentions} Reddit mentions`,
          score,
          overall_score: score,
          sources: ["reddit"],
          reddit_mentions: mentions,
          reddit_summary: summary,
          reddit_sentiment: String(item.sentiment || "").toLowerCase(),
          personalization_score: 40 + Math.min(28, mentions * 1.7) + Math.max(0, 8 - rank) + fit.points,
          personalization_reasons: [
            `Reddit buzz · ${mentions} mentions`,
            ...fit.reasons,
          ].slice(0, 3),
        });
      });
  }

  const candidates = Array.from(candidateMap.values()).sort(
    (a, b) => (toNumber(b.personalization_score) ?? 0) - (toNumber(a.personalization_score) ?? 0),
  );
  return {
    candidates,
    ctx: { avgOverall, avgGrowth, avgQuality, avgValuation, avgMomentum, dominantSector },
  };
}

async function radarSuggestions(rows: WatchlistRow[]): Promise<Array<Record<string, unknown>>> {
  const { candidates, ctx } = await gatherSuggestionCandidates(rows);
  return finalizeSuggestions(candidates, ctx);
}

// Broad sector buckets used to detect what the user has *no* exposure to. Keyword
// matching keeps it robust across the differing sector vocabularies in the book.
export const SECTOR_BUCKETS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Energy", pattern: /energy|oil|gas|petroleum|refin/i },
  { label: "Financials", pattern: /financ|bank|insur|capital market|asset manage|brokerage|payment/i },
  { label: "Healthcare", pattern: /health|pharma|biotech|medical|life scien|drug|therapeutic/i },
  { label: "Technology", pattern: /tech|software|semiconduct|hardware|electronic|internet|cloud|it serv/i },
  { label: "Communication", pattern: /communicat|media|telecom|entertainment|broadcast|advertis|social/i },
  { label: "Consumer", pattern: /consumer|retail|apparel|restaurant|auto|e-commerce|leisure|hospitality|food|beverage|household|staple|luxury/i },
  { label: "Industrials", pattern: /industrial|aerospace|defen[sc]e|machinery|transport|airline|logistic|construct|manufactur|railroad/i },
  { label: "Materials", pattern: /material|chemical|metal|mining|steel|paper|gold|copper|cement/i },
  { label: "Utilities", pattern: /utilit|electric util|water util|power/i },
  { label: "Real Estate", pattern: /real estate|reit|propert/i },
];

export function sectorBucket(sector: string): string | null {
  const raw = String(sector || "").trim();
  if (!raw) return null;
  for (const bucket of SECTOR_BUCKETS) {
    if (bucket.pattern.test(raw)) return bucket.label;
  }
  return null;
}

// Turn the "blind spot" into concrete, addable names: pick top-scored candidates
// from broad sectors the user currently has ZERO tracked exposure to. Diversifies
// across the gap sectors first (one per bucket) before backfilling, so 4 cards
// span the actual gaps rather than piling into a single hot name.
export function blindSpotSuggestions(
  rows: Array<{ sector_label?: string }>,
  candidates: Array<Record<string, unknown>>,
  limit = 4,
): Array<Record<string, unknown>> {
  if (rows.length === 0) return [];
  const covered = new Set<string>();
  for (const row of rows) {
    const bucket = sectorBucket(row.sector_label || "");
    if (bucket) covered.add(bucket);
  }
  // If the user already spans most of the market, there is no meaningful gap.
  const uncovered = new Set(
    SECTOR_BUCKETS.map((b) => b.label).filter((label) => !covered.has(label)),
  );
  if (uncovered.size === 0) return [];

  // Bucket the (already score-sorted) candidate pool by their gap sector.
  const byBucket = new Map<string, Array<Record<string, unknown>>>();
  for (const candidate of candidates) {
    const bucket = sectorBucket(String(candidate.sector || ""));
    if (!bucket || !uncovered.has(bucket)) continue;
    (byBucket.get(bucket) ?? byBucket.set(bucket, []).get(bucket)!).push({
      ...candidate,
      blind_spot_sector: bucket,
    });
  }
  if (byBucket.size === 0) return [];

  // Round-robin across gap buckets (highest-scored first within each) so the
  // cards diversify before doubling up on any one sector.
  const orderedBuckets = [...byBucket.entries()].sort(
    (a, b) =>
      (toNumber(b[1][0]?.personalization_score) ?? 0) -
      (toNumber(a[1][0]?.personalization_score) ?? 0),
  );
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let depth = 0;
  while (out.length < limit) {
    let advanced = false;
    for (const [, pool] of orderedBuckets) {
      const candidate = pool[depth];
      if (!candidate) continue;
      advanced = true;
      const id = String(candidate.instrument_id || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(candidate);
        if (out.length >= limit) break;
      }
    }
    if (!advanced) break;
    depth += 1;
  }
  return out;
}

function projectedPillarLift(
  holdingsCount: number,
  current: number,
  candidate: number,
): number {
  const n = Math.max(1, holdingsCount);
  const next = (current * n + candidate) / (n + 1);
  return Math.round((next - current) * 10) / 10;
}

export type PortfolioPillarKey = "valuation" | "growth" | "quality" | "momentum";

const PILLAR_LABEL: Record<PortfolioPillarKey, string> = {
  valuation: "Valuation",
  growth: "Growth",
  quality: "Quality",
  momentum: "Momentum",
};

function readCandidatePillarScores(item: Record<string, unknown>): Record<PortfolioPillarKey, number | null> {
  const nested =
    item.pillar_scores && typeof item.pillar_scores === "object"
      ? (item.pillar_scores as Record<string, unknown>)
      : {};
  return {
    valuation: toNumber(item.valuation_score) ?? toNumber(nested.valuation),
    growth: toNumber(item.growth_score) ?? toNumber(nested.growth),
    quality: toNumber(item.quality_score) ?? toNumber(nested.quality),
    momentum: toNumber(item.momentum_score) ?? toNumber(nested.momentum),
  };
}

export function weakestPillarFromTilt(tilt: {
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
}): { key: PortfolioPillarKey; score: number; label: string } | null {
  const entries: Array<[PortfolioPillarKey, number]> = [];
  for (const key of ["valuation", "growth", "quality", "momentum"] as const) {
    const score = tilt[key];
    if (typeof score === "number" && Number.isFinite(score)) entries.push([key, score]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [key, score] = entries[0];
  return { key, score, label: PILLAR_LABEL[key] };
}

function candidatePillarScore(
  candidate: Record<string, unknown>,
  pillar: PortfolioPillarKey,
): number | null {
  const direct = toNumber(candidate[`${pillar}_score`]);
  if (direct !== null) return direct;
  const overall = toNumber(candidate.overall_score) ?? toNumber(candidate.score);
  return overall;
}

function buildPillarLiftHook(
  candidate: Record<string, unknown>,
  pillar: PortfolioPillarKey,
  portfolioScore: number,
): string {
  const boilerplate = /vs your holdings at|equal-weight add could lift/i;
  const existing = String(candidate.why || "").trim();
  if (existing && !boilerplate.test(existing)) return existing;

  const mover = String(candidate.mover_headline || "").trim();
  if (mover) return mover;

  const theme = Array.isArray(candidate.theme_names) ? String(candidate.theme_names[0] || "").trim() : "";
  if (theme) return theme;

  const reddit = String(candidate.reddit_summary || "").trim();
  if (reddit) return reddit;

  const reasons = Array.isArray(candidate.personalization_reasons)
    ? candidate.personalization_reasons.map((v) => String(v)).filter(Boolean)
    : [];
  if (reasons.length) return reasons.slice(0, 2).join(" · ");

  const candidateWhy = String(candidate.why || "").trim();
  if (candidateWhy && !boilerplate.test(candidateWhy)) return candidateWhy;

  const source = String(candidate.reason || "").trim();
  const pillarScore = candidatePillarScore(candidate, pillar);
  const gap = pillarScore !== null ? Math.round(pillarScore - portfolioScore) : null;
  const sector = String(candidate.sector || "").trim();

  if (source && gap !== null && gap > 0) {
    return `${source} · +${gap} ${pillar}`;
  }
  if (sector && gap !== null && gap > 0) {
    return `${sector} · +${gap} on ${PILLAR_LABEL[pillar].toLowerCase()}`;
  }
  if (gap !== null && gap > 0) {
    return `+${gap} on ${PILLAR_LABEL[pillar].toLowerCase()} vs your book`;
  }
  return source || "";
}

/** Names that score above the book on the weakest pillar. */
export function pillarLiftSuggestions(
  bookRows: Array<{ instrument_id?: string }>,
  allRows: Array<{ instrument_id?: string }>,
  candidates: Array<Record<string, unknown>>,
  weakest: { key: PortfolioPillarKey; score: number },
  portfolioOverall: number | null,
  limit = 4,
): Array<Record<string, unknown>> {
  if (!bookRows.length) return [];

  const tracked = new Set(
    allRows.map((row) => String(row.instrument_id || "")).filter(Boolean),
  );
  const pillar = weakest.key;
  const portfolioScore = weakest.score;
  const scoreField = `${pillar}_score`;

  const rankCandidates = (minGap: number) =>
    candidates
      .filter((candidate) => {
        const id = String(candidate.instrument_id || "");
        if (!id || tracked.has(id)) return false;
        const pillarScore = candidatePillarScore(candidate, pillar);
        return pillarScore !== null && pillarScore > portfolioScore + minGap;
      })
      .map((candidate) => {
        const pillarScore = candidatePillarScore(candidate, pillar) ?? 0;
        const overall = toNumber(candidate.overall_score) ?? toNumber(candidate.score) ?? 0;
        const pillarGap = pillarScore - portfolioScore;
        const overallGap =
          portfolioOverall !== null && overall > 0 ? Math.max(0, overall - portfolioOverall) : 0;
        const liftScore = pillarGap * 1.35 + overallGap * 0.45 + overall * 0.12;
        return {
          ...candidate,
          [scoreField]: pillarScore,
          reason: `${PILLAR_LABEL[pillar]} lift`,
          why: buildPillarLiftHook(candidate, pillar, portfolioScore),
          pillar_lift_pts: projectedPillarLift(bookRows.length, portfolioScore, pillarScore),
          lift_score: liftScore,
          lift_pillar: pillar,
        };
      })
      .sort((a, b) => (toNumber(b.lift_score) ?? 0) - (toNumber(a.lift_score) ?? 0));

  let ranked = rankCandidates(2);
  if (ranked.length === 0) ranked = rankCandidates(0);

  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const candidate of ranked) {
    const row = candidate as Record<string, unknown>;
    const id = String(row.instrument_id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function mergeSuggestionCandidates(
  ...groups: Array<Array<Record<string, unknown>> | null | undefined>
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const id = String(item.instrument_id || "").trim().toUpperCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

export function buildPillarLiftPayloadSync(
  bookRows: WatchlistRow[],
  allRows: WatchlistRow[],
  candidates: Array<Record<string, unknown>>,
  limit = 4,
): PillarLiftPayload | null {
  if (!bookRows.length) return null;
  const diagnosis = buildHoldingsDiagnosis(bookRows);
  const weakest = weakestPillarFromTilt(diagnosis.factor_tilt);
  if (!weakest) return null;
  const items = pillarLiftSuggestions(
    bookRows,
    allRows,
    candidates,
    weakest,
    diagnosis.factor_tilt.overall,
    limit,
  );
  return {
    weakest_pillar: weakest.key,
    weakest_score: weakest.score,
    weakest_label: weakest.label,
    portfolio_overall: diagnosis.factor_tilt.overall,
    items,
  };
}

export type PillarLiftPayload = {
  weakest_pillar: PortfolioPillarKey;
  weakest_score: number;
  weakest_label: string;
  portfolio_overall: number | null;
  items: Array<Record<string, unknown>>;
};

export async function getPillarLiftSuggestions(
  bookRows: WatchlistRow[],
  allRows: WatchlistRow[],
  limit = 4,
): Promise<PillarLiftPayload | null> {
  if (!bookRows.length) return null;
  const { candidates } = await gatherSuggestionCandidates(allRows);
  return buildPillarLiftPayloadSync(bookRows, allRows, candidates, limit);
}

/** @deprecated Use getPillarLiftSuggestions */
export async function getMomentumLiftSuggestions(
  holdings: WatchlistRow[],
  allRows: WatchlistRow[],
  limit = 4,
): Promise<Array<Record<string, unknown>>> {
  const payload = await getPillarLiftSuggestions(holdings, allRows, limit);
  return payload?.items ?? [];
}

/** @deprecated Use pillarLiftSuggestions */
export function momentumLiftSuggestions(
  holdings: Array<{ instrument_id?: string }>,
  allRows: Array<{ instrument_id?: string }>,
  candidates: Array<Record<string, unknown>>,
  portfolioMomentum: number | null,
  portfolioOverall: number | null,
  limit = 4,
): Array<Record<string, unknown>> {
  if (portfolioMomentum === null) return [];
  return pillarLiftSuggestions(
    holdings,
    allRows,
    candidates,
    { key: "momentum", score: portfolioMomentum },
    portfolioOverall,
    limit,
  );
}

// LLM-rewrite the `why` line for each top candidate in a single batched call.
// Returns a map keyed by instrument_id. Empty map on any failure (caller keeps
// the rule-based `why`).
async function rewriteSuggestionWhys(
  candidates: Array<Record<string, unknown>>,
  ctx: {
    avgOverall: number | null;
    avgGrowth: number | null;
    avgQuality: number | null;
    avgValuation: number | null;
    avgMomentum: number | null;
    dominantSector: string;
  },
): Promise<Record<string, string>> {
  const apiKey = llmApiKey();
  if (!apiKey || candidates.length === 0) return {};

  const model = llmModel();
  const compact = candidates.map((c) => ({
    id: String(c.instrument_id || ""),
    ticker: c.ticker,
    sector: c.sector || null,
    score: c.score ?? null,
    sources: c.sources || [],
    raw_why: c.why || null,
    reddit_mentions: toNumber(c.reddit_mentions) ?? 0,
    mover_move_pct: toNumber(c.mover_move_pct),
    mover_headline: c.mover_headline || null,
    theme_names: c.theme_names || [],
  }));

  const radarSummary = {
    avg_overall: ctx.avgOverall,
    avg_growth: ctx.avgGrowth,
    avg_quality: ctx.avgQuality,
    avg_valuation: ctx.avgValuation,
    avg_momentum: ctx.avgMomentum,
    dominant_sector: ctx.dominantSector || null,
  };

  const SYSTEM_PROMPT = `You write one-line stock suggestion rationales for a financial app's Watchlist page.

You receive (a) a user's current Watchlist profile (avg scores, dominant sector) and (b) a list of candidate stocks from research themes, yesterday's movers, and Reddit buzz.

For each candidate, write a SINGLE sentence (8-16 words) explaining why this stock could fit THIS user's Watchlist. Be specific to the signal:
- If multi-source (sources length > 1) — mention the combined evidence.
- If mover_move_pct — mention the move size and direction.
- If reddit_mentions >= 5 — mention the buzz.
- If theme_names — mention the relevant research theme when useful.
- Otherwise translate raw_why into something concrete.

Rules:
- NO marketing fluff ("must-buy", "explosive"). Plain, factual, conversational.
- NEVER invent numbers, dates, or peer comparisons that aren't in the input.
- If you can't say something useful, return the raw_why unchanged.
- Return JSON: { "rationales": { "<instrument_id>": "<sentence>", ... } }`;

  const payload = {
    radar_profile: radarSummary,
    candidates: compact,
  };

  try {
    const res = await fetch(llmApiUrl(), {
      method: "POST",
      headers: llmHeaders(apiKey),
      body: JSON.stringify({
        model,
        reasoning_effort: "low",
        max_completion_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return {};
    const parsed = JSON.parse(content);
    const out = parsed?.rationales;
    return out && typeof out === "object" ? (out as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function portfolioDiagnostics(rows: WatchlistRow[]): Promise<Record<string, unknown>> {
  if (!rows.length) {
    const { candidates, ctx } = await gatherSuggestionCandidates(rows);
    return {
      summary: "No Watchlist stocks yet.",
      clusters: [],
      risk_flags: [],
      opportunities: [],
      suggestions: await finalizeSuggestions(candidates, ctx),
    };
  }

  // ── Step 1: Position weights (all-or-none) ─────────────────────────────────
  // Only enable dollar-weighting when EVERY holding has quantity > 0.
  // A partial set would produce misleading weights, so fall back to equal-weight.
  const holdingRows = rows.filter((r) => r.position_type === "holding");
  const holdingsWithValues = holdingRows.filter((r) => {
    const qty = toNumber(r.holding?.quantity);
    return r.holding != null && qty != null && qty > 0;
  });
  const positionAware = holdingRows.length > 0 && holdingsWithValues.length === holdingRows.length;
  const totalEnteredValue = positionAware
    ? holdingsWithValues.reduce((sum, r) => {
        const val = toNumber(r.holding?.computed_market_value) ?? toNumber(r.holding?.market_value) ?? 0;
        return sum + val;
      }, 0)
    : 0;

  // Stamp portfolio_weight_pct early so sectorClusters + averageScore can read it.
  const positionWeights = new Map<string, number>();
  if (positionAware && totalEnteredValue > 0) {
    for (const row of holdingsWithValues) {
      const val = (toNumber(row.holding?.computed_market_value) ?? toNumber(row.holding?.market_value)) ?? 0;
      const pct = (val / totalEnteredValue) * 100;
      if (row.holding) row.holding.portfolio_weight_pct = pct;
      positionWeights.set(row.instrument_id, pct);
    }
  }

  // ── Step 2: Sector clusters + scores (holdings only when any exist) ─────────
  const diagnosisRows = holdingRows.length > 0 ? holdingRows : rows;
  const holdingsDiagnosis = buildHoldingsDiagnosis(holdingRows);
  const clusters = holdingsDiagnosis.clusters;
  const dominant = clusters[0];
  const weights = positionWeights.size > 0 ? positionWeights : undefined;
  const riskFlags = [...holdingsDiagnosis.risk_flags];
  const opportunities = rows
    .filter((row) => row.position_type !== "holding")
    .filter((row) => typeof row.target_upside_pct === "number" && (row.target_upside_pct ?? 0) >= 15)
    .sort((a, b) => (b.target_upside_pct ?? -999) - (a.target_upside_pct ?? -999))
    .slice(0, 3)
    .map((row) => ({
      ticker: row.ticker,
      market: row.market,
      kind: "analyst_runway",
      headline: `${row.ticker} has ${(row.target_upside_pct ?? 0) >= 0 ? "+" : ""}${row.target_upside_pct?.toFixed(1)}% target runway`,
      body: `On your watch list · score ${row.scores.overall}; consider adding at good entry points while runway holds.`,
    }));

  let summary: string;
  if (holdingRows.length > 0) {
    summary = holdingsDiagnosis.summary;
  } else {
    const summaryParts: string[] = [];
    if (dominant) {
      summaryParts.push(
        `${dominant.sector} is the largest cluster at ${Math.round(Number(dominant.weight_pct))}%.`,
      );
    }
    const avgOverall = averageScore(diagnosisRows, "overall", weights);
    if (avgOverall !== null) summaryParts.push(`Average stocksbrew score is ${avgOverall}.`);
    if (riskFlags.length) summaryParts.push(`${riskFlags.length} risk flags need review.`);
    if (opportunities.length) {
      summaryParts.push(
        `${opportunities.length} watch list name${opportunities.length === 1 ? "" : "s"} have strong analyst runway for entry.`,
      );
    }
    summary = summaryParts.join(" ") || "Watchlist diagnosis is ready.";
  }

  // ── Step 3: Concentration + position-level risk flags ──────────────────────
  const top1Value = holdingsWithValues.reduce((max, r) => {
    const val = toNumber(r.holding?.computed_market_value) ?? toNumber(r.holding?.market_value) ?? 0;
    return val > max ? val : max;
  }, 0);
  const top1Pct = totalEnteredValue > 0 ? (top1Value / totalEnteredValue) * 100 : null;

  const positionRisks: Array<Record<string, unknown>> = [];
  if (positionAware && totalEnteredValue > 0) {
    for (const row of [...holdingsWithValues].sort((a, b) => {
      const av = (toNumber(a.holding?.computed_market_value) ?? toNumber(a.holding?.market_value)) ?? 0;
      const bv = (toNumber(b.holding?.computed_market_value) ?? toNumber(b.holding?.market_value)) ?? 0;
      return bv - av;
    })) {
      const val = (toNumber(row.holding?.computed_market_value) ?? toNumber(row.holding?.market_value)) ?? 0;
      const weightPct = (val / totalEnteredValue) * 100;
      if (weightPct < 35) break;
      positionRisks.push({
        ticker: row.ticker,
        severity: weightPct >= 55 ? "high" : "medium",
        headline: `${row.ticker} is ${weightPct.toFixed(0)}% of your entered value`,
        body: `Heavy concentration — a significant move in ${row.ticker} has an outsized impact on your overall portfolio.`,
      });
    }
  }

  return {
    summary,
    clusters,
    factor_tilt: holdingRows.length > 0
      ? holdingsDiagnosis.factor_tilt
      : {
          overall: averageScore(diagnosisRows, "overall", weights),
          valuation: averageScore(diagnosisRows, "valuation", weights),
          growth: averageScore(diagnosisRows, "growth", weights),
          quality: averageScore(diagnosisRows, "quality", weights),
          momentum: averageScore(diagnosisRows, "momentum", weights),
        },
    risk_flags: riskFlags.slice(0, 6),
    opportunities: opportunities.slice(0, 6),
    suggestions: await radarSuggestions(rows),
    position_aware: positionAware,
    total_entered_value: totalEnteredValue > 0 ? totalEnteredValue : null,
    concentration: {
      top1_pct: top1Pct,
      risk_label: top1Pct !== null ? (top1Pct >= 50 ? "high" : top1Pct >= 30 ? "medium" : "low") : null,
    },
    position_risks: positionRisks,
  };
}

function attentionItems(rows: WatchlistRow[]): Record<string, unknown>[] {
  return [...rows]
    .sort((a, b) => (b.attention_score ?? 0) - (a.attention_score ?? 0))
    .slice(0, 8)
    .map((row) => ({
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      position_type: row.position_type,
      price: row.price,
      currency: row.currency,
      day_change_pct: row.day_change_pct,
      attention_score: row.attention_score ?? 0,
      attention_reason: row.attention_reason,
      attention_kind: row.attention_kind,
      suggested_action: row.suggested_action,
      action_tone: row.action_tone,
      sector_label: row.sector_label,
      brief_source: row.brief_tile.source,
    }));
}

function riskSummary(rows: WatchlistRow[], portfolio: Record<string, unknown>): Record<string, unknown> {
  const holdings = rows.filter((row) => row.position_type === "holding");
  const watchlist = rows.filter((row) => row.position_type === "watchlist");
  const highAttentionHoldings = holdings.filter((row) => (row.attention_score ?? 0) >= 70);
  const clusters = (portfolio.clusters as Record<string, unknown>[]) || [];
  const dominant = clusters[0];
  const headline = highAttentionHoldings[0]
    ? `${highAttentionHoldings[0].ticker} needs review first`
    : dominant
      ? `${dominant.sector} dominates your Watchlist`
      : "No obvious risk cluster yet";
  const body = highAttentionHoldings[0]
    ? String(highAttentionHoldings[0].attention_reason || "A holding has a material signal.")
    : dominant
      ? `${Math.round(toNumber(dominant.weight_pct) ?? 0)}% of Watchlist names sit in ${dominant.sector}. Keep an eye on single-theme risk.`
      : "Add more holdings/watching names and stocksbrew will detect concentration, technical, and news risk.";
  return {
    headline,
    body,
    holdings_with_attention: highAttentionHoldings.length,
    holding_count: holdings.length,
    watchlist_count: watchlist.length,
  };
}

function eventRadar(rows: WatchlistRow[], portfolio: Record<string, unknown>): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  function add(event: Record<string, unknown>) {
    events.push({
      tone: "neutral",
      evidence: [],
      ...event,
      urgency: Math.max(0, Math.min(100, Math.round(toNumber(event.urgency) ?? 50))),
    });
  }

  for (const row of rows) {
    const changes = ((row as WatchlistRow & { changes?: Record<string, unknown> }).changes) || {};
    if (changes.is_new) {
      add({
        ticker: row.ticker,
        kind: "new_tracking",
        title: `${row.ticker} is new to Watchlist`,
        body: "Baseline facts, score, technicals, and alerts are now being monitored for changes.",
        urgency: 60,
        evidence: ["new baseline"],
      });
    } else if (changes.has_material_change) {
      const scoreDeltas = (changes.score_deltas as Record<string, unknown>) || {};
      const overallDelta = toNumber(scoreDeltas.overall);
      if (overallDelta !== null && Math.abs(overallDelta) >= 1) {
        add({
          ticker: row.ticker,
          kind: "conviction_delta",
          title: `${row.ticker} conviction ${overallDelta > 0 ? "improved" : "weakened"}`,
          body: `Overall score changed ${overallDelta >= 0 ? "+" : ""}${overallDelta.toFixed(1)} since the last Watchlist update.`,
          urgency: Math.abs(overallDelta) >= 5 ? 72 : 58,
          tone: overallDelta > 0 ? "positive" : "negative",
          evidence: [`score ${overallDelta >= 0 ? "+" : ""}${overallDelta.toFixed(1)}`],
        });
      }
      const targetDelta = toNumber(changes.target_upside_delta);
      if (targetDelta !== null && Math.abs(targetDelta) >= 2) {
        add({
          ticker: row.ticker,
          kind: "target_delta",
          title: `${row.ticker} analyst runway changed`,
          body: `Target upside moved ${targetDelta >= 0 ? "+" : ""}${targetDelta.toFixed(1)} points since the last refresh.`,
          urgency: 65,
          tone: targetDelta > 0 ? "positive" : "negative",
          evidence: [`runway ${targetDelta >= 0 ? "+" : ""}${targetDelta.toFixed(1)} pts`],
        });
      }
    }

    for (const signal of row.premium_signals || []) {
      const kind = String(signal.kind || "");
      const tone = String(signal.tone || "neutral");
      const value = toNumber(signal.value);
      if (kind === "event") {
        add({
          ticker: row.ticker,
          kind: "upcoming_event",
          title: `${row.ticker}: ${String(signal.label || "Event")}`,
          body: String(signal.sentence || ""),
          urgency: 70,
          evidence: [String(signal.value || "")],
        });
      } else if (kind === "technical_state" && value !== null && (value >= 70 || value <= 35)) {
        add({
          ticker: row.ticker,
          kind: "technical_extreme",
          title: `${row.ticker} RSI is ${value >= 70 ? "stretched" : "washed out"}`,
          body: String(signal.sentence || ""),
          urgency: value >= 70 ? 68 : 62,
          tone,
          evidence: [`RSI ${value.toFixed(1)}`],
        });
      } else if (kind === "analyst_upside" && value !== null && Math.abs(value) >= 15) {
        add({
          ticker: row.ticker,
          kind: "analyst_runway",
          title: `${row.ticker} has meaningful analyst runway`,
          body: String(signal.sentence || ""),
          urgency: 64,
          tone,
          evidence: [`${value >= 0 ? "+" : ""}${value.toFixed(1)}% target upside`],
        });
      } else if (kind === "price_move" && value !== null && Math.abs(value) >= 5) {
        add({
          ticker: row.ticker,
          kind: "large_move",
          title: `${row.ticker} made a large move`,
          body: String(signal.sentence || ""),
          urgency: 66,
          tone,
          evidence: [`${value >= 0 ? "+" : ""}${value.toFixed(1)}% today`],
        });
      }
    }

    const newsVelocity = row.news_velocity || {};
    const mentions7d = toNumber(newsVelocity.mentions_7d) ?? 0;
    const mentions1d = toNumber(newsVelocity.mentions_1d) ?? 0;
    if (mentions7d >= 3 || mentions1d >= 2) {
      add({
        ticker: row.ticker,
        kind: "news_velocity",
        title: `${row.ticker} news activity is elevated`,
        body: `${mentions1d.toFixed(0)} mention(s) today and ${mentions7d.toFixed(0)} over 7 days.`,
        urgency: 55 + Math.min(20, Math.round(mentions7d * 3)),
        evidence: [`${mentions7d.toFixed(0)} mentions / 7D`],
      });
    }
  }

  for (const risk of (((portfolio.risk_flags as Record<string, unknown>[]) || []).slice(0, 3))) {
    const severity = String(risk.severity || "medium");
    add({
      ticker: risk.ticker || "",
      kind: risk.kind || "portfolio_risk",
      title: risk.headline || "Portfolio risk flag",
      body: risk.body || "",
      urgency: severity === "high" ? 82 : 70,
      tone: "negative",
      evidence: [severity],
    });
  }

  const seen = new Set<string>();
  return events
    .sort((a, b) => (toNumber(b.urgency) ?? 0) - (toNumber(a.urgency) ?? 0))
    .filter((event) => {
      const key = `${event.ticker || ""}:${event.kind || ""}:${event.title || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function changeSummary(rows: WatchlistRow[], previousView: WatchlistView | null): Record<string, unknown> {
  const withChanges = rows as Array<WatchlistRow & { changes?: Record<string, unknown> }>;
  const changed = withChanges.filter((row) => row.changes?.has_material_change);
  const newRows = withChanges.filter((row) => row.changes?.is_new);
  const scoreChanges = withChanges
    .map((row) => {
      const scoreDeltas = (row.changes?.score_deltas as Record<string, unknown>) || {};
      const delta = toNumber(scoreDeltas.overall);
      if (delta === null || Math.abs(delta) < 1) return null;
      return {
        ticker: row.ticker,
        delta,
        direction: delta > 0 ? "up" : "down",
        sentence: `${row.ticker} score moved ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}.`,
      };
    })
    .filter((item): item is {
      ticker: string;
      delta: number;
      direction: string;
      sentence: string;
    } => item !== null)
    .sort((a, b) => Math.abs(toNumber(b.delta) ?? 0) - Math.abs(toNumber(a.delta) ?? 0));
  return {
    has_previous: Boolean(previousView),
    changed_count: changed.length,
    new_count: newRows.length,
    score_changes: scoreChanges.slice(0, 6),
    new_tickers: newRows.map((row) => row.ticker),
    summary: previousView
      ? `${changed.length} Watchlist stock(s) changed materially since the last update.`
      : "No previous snapshot yet; this build sets the baseline.",
  };
}

function rowMicrocopy(
  ticker: string,
  dayChangePct: number | null,
  intel: Record<string, unknown>,
  alerts: Record<string, unknown>[],
): { micro: string; vibe: "up" | "down" | "wild" } {
  const firstAlert = alerts[0];
  if (firstAlert) {
    const message = String(firstAlert.message || firstAlert.label || firstAlert.type || "").trim();
    if (message) return { micro: message.slice(0, 120), vibe: "wild" };
  }

  const overall = (intel.overall as Record<string, unknown>) || {};
  const score = toNumber(overall.score);
  const pillars = (intel.pillars as Record<string, { score?: unknown; metrics?: Array<{ summary?: string }> }>) || {};
  let bestPillar = "";
  let bestScore = -1;
  for (const [key, payload] of Object.entries(pillars)) {
    const pillarScore = toNumber(payload?.score);
    if (pillarScore !== null && pillarScore > bestScore) {
      bestPillar = key;
      bestScore = pillarScore;
    }
  }

  if (score !== null && bestPillar) {
    const summary = pillars[bestPillar]?.metrics?.find((m) => m.summary)?.summary;
    const label = bestPillar.replaceAll("_", " ");
    const micro = `${label[0]?.toUpperCase() ?? ""}${label.slice(1)} leads the scorecard${summary ? `: ${summary}` : ""}`;
    return {
      micro: micro.slice(0, 120),
      vibe: score >= 70 ? "up" : score >= 50 ? "wild" : "down",
    };
  }

  if (dayChangePct !== null) {
    const direction = dayChangePct >= 0 ? "ripping" : "under pressure";
    return {
      micro: `${ticker} is ${direction} with AI score pending.`,
      vibe: dayChangePct >= 0 ? "up" : "down",
    };
  }

  return {
    micro: `${ticker} has price coverage; deeper AI score is pending.`,
    vibe: "wild",
  };
}

function pulseFromRows(rows: WatchlistRow[]): WatchlistPulse {
  if (rows.length === 0) {
    return {
      headline: "Your Watchlist is empty",
      subtitle: "Add a stock from any detail page to start getting daily briefs.",
      stats: {},
    };
  }
  const up = rows.filter((r) => (r.day_change_pct ?? 0) > 0);
  const down = rows.filter((r) => (r.day_change_pct ?? 0) < 0);
  const scored = rows.filter((r) => r.scores.overall !== null);
  const avgOverall = scored.length
    ? Math.round((scored.reduce((s, r) => s + (r.scores.overall ?? 0), 0) / scored.length) * 10) / 10
    : null;
  const alertCount = rows.reduce((s, r) => s + r.alerts.length, 0);

  let headline = "A mixed day";
  if (up.length && !down.length) headline = "Green across the board";
  else if (down.length && !up.length) headline = "Red across the board";
  else if (up.length > down.length) headline = "Mostly green";
  else if (down.length > up.length) headline = "Mostly red";

  const parts: string[] = [];
  if (alertCount) parts.push(`${alertCount} alert${alertCount === 1 ? "" : "s"} active`);
  if (avgOverall !== null) parts.push(`avg overall score ${avgOverall}`);
  parts.push(`${up.length} up, ${down.length} down`);

  return {
    headline,
    subtitle: parts.join(" · "),
    stats: {
      count: rows.length,
      movers_up: up.length,
      movers_down: down.length,
      avg_overall_score: avgOverall,
      alert_count: alertCount,
    },
  };
}

function fallbackBriefFromRows(rows: WatchlistRow[], pulse: WatchlistPulse): WatchlistBrief {
  const movers = [...rows]
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))
    .slice(0, 4);
  const sectors = rows.map((r) => r.sector_label).filter(Boolean);
  const counts = new Map<string, number>();
  for (const sector of sectors) counts.set(sector, (counts.get(sector) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const concentrated = dominant && dominant[1] >= Math.max(2, Math.ceil(rows.length / 2));
  const alertEvents = rows.flatMap((row) =>
    row.alerts.slice(0, 1).map((flag) => ({
      sentence: String(flag.message || flag.type || "Watchlist alert triggered.").slice(0, 120),
      event_type: "technical",
      scope: "stock" as const,
      direction: (String(flag.direction || "mixed") as "up" | "down" | "mixed"),
      confidence: "med" as const,
      impact_score: 65,
      evidence: [String(flag.type || "alert")],
      symbol: row.ticker,
      sector_id: "",
    })),
  );

  return {
    narrative: pulse.subtitle || pulse.headline,
    tiles: rows.map((row) => ({
      ticker: row.ticker,
      micro: row.brief_tile.micro,
      vibe: row.brief_tile.vibe,
    })),
    movers: movers.map((row) => ({
      ticker: row.ticker,
      one_liner: row.brief_tile.micro,
      vibe: row.brief_tile.vibe,
    })),
    signals: [
      {
        tag: "Breadth",
        headline: pulse.headline,
        body: pulse.subtitle,
        detail: "This refresh uses prices, scorecards, and alert flags while the scheduled personalized AI synthesis catches up.",
        vibe: "neutral",
      },
    ],
    blind_spot_title: "Exposure check",
    blind_spot_body: concentrated
      ? `Most of this Watchlist clusters around ${dominant[0]}. Add an unrelated sector to reduce single-theme risk.`
      : "No obvious concentration yet. Add more stocks and stocksbrew will flag sector, style, and event blind spots.",
    essential_events: alertEvents.length
      ? alertEvents.slice(0, 5)
      : movers.slice(0, 3).map((row) => ({
          sentence: `${row.ticker}: ${row.brief_tile.micro}`.slice(0, 120),
          event_type: "sentiment",
          scope: "stock" as const,
          direction: row.brief_tile.vibe === "wild" ? "mixed" : row.brief_tile.vibe,
          confidence: row.has_intel_pro ? "med" as const : "low" as const,
          impact_score: 50,
          evidence: [row.has_intel_pro ? "score" : "pending"],
          symbol: row.ticker,
          sector_id: "",
        })),
    source: "rules",
    status: "pending",
    generated_at: new Date().toISOString(),
  };
}

const FREE_WATCHLIST_ROW_CAP = 3;

export async function buildWatchlistView(
  uid: string,
  trackedStocks: string[],
  positions: Record<string, unknown> = {},
  isSubscribed = false,
  previousView?: WatchlistView | null,
): Promise<WatchlistView> {
  const universes = await getActiveUniverses();
  const alertsByInstrument = await loadAlertsByInstrument(uid);
  const previous = previousView ?? null;

  const userSnap = await adminFirestore.collection("users").doc(uid).get();
  const holdingsMap = (userSnap.exists ? (userSnap.data()?.watchlist_holdings as Record<string, Record<string, unknown>> | null) : null) ?? {};

  const ids = isSubscribed ? (trackedStocks || []) : (trackedStocks || []).slice(0, FREE_WATCHLIST_ROW_CAP);
  const rows = applyRowDeltas(await buildRows(ids, positions, holdingsMap, universes, alertsByInstrument), previous);
  rows.sort((a, b) => (b.attention_score ?? 0) - (a.attention_score ?? 0));
  const pulse = pulseFromRows(rows);
  const portfolio = await portfolioDiagnostics(rows);
  const { candidates: suggestionCandidates, ctx: suggestionCtx } = await gatherSuggestionCandidates(rows);
  const suggestions = await finalizeSuggestions(suggestionCandidates, suggestionCtx);
  const blindSpotFill = blindSpotSuggestions(rows, suggestionCandidates);
  const holdingRows = rows.filter((row) => row.position_type === "holding");
  const bookForPillarLift = holdingRows.length > 0 ? holdingRows : rows;
  const bookDiagnosis = buildHoldingsDiagnosis(bookForPillarLift);
  const weakest = weakestPillarFromTilt(bookDiagnosis.factor_tilt);
  const pillarLiftFill = weakest
    ? {
        weakest_pillar: weakest.key,
        weakest_score: weakest.score,
        items: pillarLiftSuggestions(
          bookForPillarLift,
          rows,
          suggestionCandidates,
          weakest,
          bookDiagnosis.factor_tilt.overall,
        ),
      }
    : undefined;
  const momentumLiftFill = pillarLiftFill?.items ?? [];
  const holdingsCount = rows.filter((row) => row.position_type === "holding").length;
  const watchlistCount = rows.length - holdingsCount;

  return {
    uid,
    tracked_count: rows.length,
    holdings_count: holdingsCount,
    watchlist_count: watchlistCount,
    tracked_ids: rows.map((r) => r.instrument_id),
    rows,
    pulse,
    brief: fallbackBriefFromRows(rows, pulse),
    portfolio,
    attention_items: attentionItems(rows),
    suggestions,
    blind_spot_suggestions: blindSpotFill,
    momentum_lift_suggestions: momentumLiftFill,
    pillar_lift_suggestions: pillarLiftFill,
    risk_summary: riskSummary(rows, portfolio),
    event_radar: eventRadar(rows, portfolio),
    changes: changeSummary(rows, previous),
    built_at: new Date().toISOString(),
  };
}

export async function rebuildAndSaveWatchlistView(
  uid: string,
  trackedStocks: string[],
  positions: Record<string, unknown> = {},
  isSubscribed = false,
  sourceVersion?: number,
  options?: {
    preserveBriefIfFallback?: boolean;
    preserveDirectivesIfMissing?: boolean;
    preserveActivityIfThin?: boolean;
  },
): Promise<WatchlistView> {
  const ref = adminFirestore.collection("tm_watchlist_views").doc(uid);
  const previous = await ref.get();
  const previousData = previous.exists ? (previous.data() as WatchlistView) : null;
  const view = await buildWatchlistView(uid, trackedStocks, positions, isSubscribed, previousData);
  if (
    options?.preserveBriefIfFallback &&
    previousData?.brief &&
    previousData.brief.source &&
    isLlmBriefSource(previousData.brief.source) &&
    !isLlmBriefSource(view.brief.source)
  ) {
    view.brief = previousData.brief;
  }
  if (options?.preserveDirectivesIfMissing && previousData?.rows?.length) {
    const previousById = new Map(previousData.rows.map((row) => [row.instrument_id, row]));
    view.rows = view.rows.map((row) => {
      const prev = previousById.get(row.instrument_id);
      if (!prev) return row;
      const hasDirective =
        Boolean(row.ai_directive && Object.keys(row.ai_directive).length > 0) ||
        Boolean((row.ai_directive_text || "").trim());
      if (hasDirective) return row;
      const prevHasDirective =
        Boolean(prev.ai_directive && Object.keys(prev.ai_directive).length > 0) ||
        Boolean((prev.ai_directive_text || "").trim());
      if (!prevHasDirective) return row;
      return {
        ...row,
        ai_directive: prev.ai_directive,
        ai_directive_text: prev.ai_directive_text,
        ai_directive_rationale: prev.ai_directive_rationale,
      };
    });
  }
  if (
    options?.preserveActivityIfThin &&
    previousData &&
    Array.isArray(previousData.event_radar) &&
    previousData.event_radar.length > 0 &&
    (!Array.isArray(view.event_radar) || view.event_radar.length === 0)
  ) {
    view.event_radar = previousData.event_radar;
  }
  if (previousData) {
    const historyId = String(previousData.built_at || previousData.updated_at || new Date().toISOString())
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    await ref.collection("history").doc(historyId).set(previousData);
    const oldHistory = await ref
      .collection("history")
      .orderBy("built_at", "desc")
      .limit(30)
      .get();
    const docsToDelete = oldHistory.docs.slice(10);
    if (docsToDelete.length > 0) {
      const batch = adminFirestore.batch();
      docsToDelete.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as WatchlistView) : null;
    const currentVersion = Number(current?.source_version ?? 0);
    const incomingVersion = Number(sourceVersion ?? 0);
    if (incomingVersion > 0 && currentVersion > incomingVersion) {
      return;
    }
    const appliedVersion = incomingVersion > 0 ? incomingVersion : currentVersion;
    tx.set(
      ref,
      {
        ...view,
        source_version: appliedVersion,
        today_version_applied: appliedVersion,
        diagnosis_version_applied: appliedVersion,
        activity_version_applied: appliedVersion,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );
  });
  return view;
}
