import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { LLM_BRIEF_SOURCE, type BriefSource, isLlmBriefSource } from "@/lib/brief-source";

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

export type WatchlistRow = {
  instrument_id: string;
  ticker: string;
  logo_url?: string | null;
  position_type: "holding" | "watchlist";
  market: "US" | "IN" | "";
  sector_label: string;
  industry_label: string;
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
  ai_directive?: {
    text?: string;
    stance?: "accumulate" | "trim" | "watch" | "avoid" | "hold";
    trigger_type?:
      | "price_below"
      | "price_above"
      | "date"
      | "sentiment_flip"
      | "new_catalyst"
      | "none";
    trigger_value?: string;
    rationale?: string;
    confidence?: "low" | "med" | "high";
  };
  ai_directive_text?: string;
  ai_directive_rationale?: string;
  coverage_status: "ready" | "score_pending";
  has_intel_pro: boolean;
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
  portfolio?: Record<string, unknown>;
  attention_items?: Record<string, unknown>[];
  suggestions?: Record<string, unknown>[];
  risk_summary?: Record<string, unknown>;
  event_radar?: Record<string, unknown>[];
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
  const refs = ids.map((id) => collection.doc(id));
  const snaps = await adminFirestore.getAll(...refs);
  const out = new Map<string, T>();
  for (const snap of snaps) {
    if (snap.exists) out.set(snap.id, snap.data() as T);
  }
  return out;
}

function metricValue(intel: Record<string, unknown>, pillar: string, label: string): number | null {
  const pillars = (intel.pillars as Record<string, unknown>) || {};
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
  if (parts.length < 2) return true;
  const month = MONTHS[parts[0].slice(0, 3)];
  const day = Number(parts[1]);
  if (month === undefined || !Number.isFinite(day)) return true;
  const now = new Date();
  const eventDate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const deltaDays = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000);
  return deltaDays >= -1 && deltaDays <= 45;
}

function catalystIsCurrent(catalyst: Record<string, unknown>): boolean {
  if (String(catalyst.kind || "").toLowerCase() !== "earnings") return true;
  const parts = String(catalyst.title || "").split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return eventIsCurrent(`${parts[1]} ${parts[2]}`);
  return true;
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
    attention_reason: `${ticker} is calm. No major price, technical, alert, or news anomaly stood out.`,
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
    stockBrief && typeof stockBrief.directive === "object" && stockBrief.directive !== null
      ? (stockBrief.directive as Record<string, unknown>)
      : {};
  const directiveText = String(rawDirective.text || "").trim();
  const directiveRationale = String(rawDirective.rationale || "").trim();
  const directiveStance = String(rawDirective.stance || "").toLowerCase();
  const directiveTrigger = String(rawDirective.trigger_type || "").toLowerCase();
  const directiveConfidence = String(rawDirective.confidence || "").toLowerCase();

  return {
    instrument_id: instrumentId,
    ticker,
    logo_url: typeof instrument.logo_url === "string" ? instrument.logo_url : null,
    position_type: positionType,
    market,
    sector_label: (intel?.sector_label as string) || "",
    industry_label: (intel?.industry_label as string) || "",
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
          text: directiveText || undefined,
          stance: (
            ["accumulate", "trim", "watch", "avoid", "hold"].includes(directiveStance)
              ? directiveStance
              : undefined
          ) as "accumulate" | "trim" | "watch" | "avoid" | "hold" | undefined,
          trigger_type: (
            ["price_below", "price_above", "date", "sentiment_flip", "new_catalyst", "none"].includes(directiveTrigger)
              ? directiveTrigger
              : undefined
          ) as "price_below" | "price_above" | "date" | "sentiment_flip" | "new_catalyst" | "none" | undefined,
          trigger_value: typeof rawDirective.trigger_value === "string" ? rawDirective.trigger_value : undefined,
          rationale: directiveRationale || undefined,
          confidence: (
            ["low", "med", "high"].includes(directiveConfidence)
              ? directiveConfidence
              : undefined
          ) as "low" | "med" | "high" | undefined,
        }
      : undefined,
    ai_directive_text: directiveText || undefined,
    ai_directive_rationale: directiveRationale || undefined,
    ...attention,
    coverage_status: Object.keys(intel).length > 0 ? "ready" : "score_pending",
    has_intel_pro: Object.keys(intel).length > 0,
  };
}

async function buildRows(
  ids: string[],
  positions: Record<string, unknown>,
  universes: ActiveUniverses,
  alertsByInstrument: Record<string, Record<string, unknown>[]>,
): Promise<WatchlistRow[]> {
  const [latestById, instrumentsById, factsById, technicalsById, mentionsById] = await Promise.all([
    getDocsById<Record<string, unknown>>(adminFirestore.collection("tm_latest_prices"), ids),
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

function sectorClusters(rows: WatchlistRow[]): Array<Record<string, unknown>> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const sector = row.sector_label || row.market || "Unknown";
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sector, count]) => ({
      sector,
      count,
      weight_pct: Math.round((count / Math.max(rows.length, 1)) * 1000) / 10,
    }));
}

function averageScore(rows: WatchlistRow[], key: keyof WatchlistRow["scores"]): number | null {
  const values = rows
    .map((row) => row.scores[key])
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function screenSuggestions(rows: WatchlistRow[]): Promise<Array<Record<string, unknown>>> {
  const tracked = new Set(rows.map((row) => row.instrument_id));
  const suggested = new Set<string>();
  const markets = [...new Set(rows.map((row) => row.market).filter(Boolean))];
  const preferred = ["quality_compounders", "cheap_growth", "oversold_quality", "smart_money", "tikrr_top"];
  const suggestions: Array<Record<string, unknown>> = [];
  const avgGrowth = averageScore(rows, "growth");
  const avgQuality = averageScore(rows, "quality");
  const avgValuation = averageScore(rows, "valuation");
  const avgMomentum = averageScore(rows, "momentum");
  const clusters = sectorClusters(rows);
  const dominant = (clusters[0] || {}) as Record<string, unknown>;
  const dominantSector = String(dominant.sector || "");
  const dominantWeight = toNumber(dominant.weight_pct) ?? 0;

  const screenDocs = await adminFirestore.getAll(
    ...markets.map((market) => adminFirestore.collection("tm_thematic_screens").doc(market)),
  );
  const redditDocs = await adminFirestore.getAll(
    ...markets.map((market) => adminFirestore.collection("reddit_snapshots").doc(`${market}__latest`)),
  );
  const anomalyDocs = await adminFirestore.getAll(
    ...markets.map((market) => adminFirestore.collection("tm_daily_anomalies").doc(`${market}__latest`)),
  );
  const redditByMarket = new Map<string, Map<string, Record<string, unknown>>>();
  for (const doc of redditDocs) {
    if (!doc.exists) continue;
    const payload = (doc.data() || {}) as Record<string, unknown>;
    const rowsRaw = payload.tickers;
    const market = String(doc.id.split("__")[0] || "").toUpperCase();
    const map = new Map<string, Record<string, unknown>>();
    if (rowsRaw && typeof rowsRaw === "object" && !Array.isArray(rowsRaw)) {
      for (const [ticker, item] of Object.entries(rowsRaw as Record<string, unknown>)) {
        map.set(String(ticker).toUpperCase(), (item || {}) as Record<string, unknown>);
      }
    } else if (Array.isArray(rowsRaw)) {
      for (const item of rowsRaw) {
        const row = (item || {}) as Record<string, unknown>;
        const ticker = String(row.ticker || row.symbol || "").toUpperCase();
        if (ticker) map.set(ticker, row);
      }
    }
    redditByMarket.set(market, map);
  }
  const anomalyByMarket = new Map<string, Map<string, Record<string, unknown>>>();
  for (const doc of anomalyDocs) {
    if (!doc.exists) continue;
    const payload = (doc.data() || {}) as Record<string, unknown>;
    const rowsRaw = (payload.anomalies || []) as Array<Record<string, unknown>>;
    const market = String(doc.id.split("__")[0] || "").toUpperCase();
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rowsRaw) {
      const ticker = String(row.ticker || row.symbol || "").toUpperCase();
      if (ticker) map.set(ticker, row);
    }
    anomalyByMarket.set(market, map);
  }

  const candidates: Array<Record<string, unknown>> = [];
  for (const doc of screenDocs) {
    const market = doc.id as "US" | "IN";
    const screens = ((doc.exists ? doc.data()?.screens : []) || []) as Array<Record<string, unknown>>;
    for (const screenId of preferred) {
      const screen = screens.find((item) => item.id === screenId);
      const matches = (screen?.matches || []) as Array<Record<string, unknown>>;
      matches.forEach((item, rank) => {
        const instrumentId = String(item.instrument_id || "");
        if (!instrumentId || tracked.has(instrumentId) || suggested.has(instrumentId)) return;
        const ticker = String(item.ticker || "").toUpperCase();
        if (!ticker) return;
        const overallScore = toNumber(item.overall_score) ?? 0;
        const sector = String(item.sector || "");
        let weaknessFit = 0;
        const reasons: string[] = [];
        const growthScore = toNumber(item.growth_score);
        const qualityScore = toNumber(item.quality_score);
        const valuationScore = toNumber(item.valuation_score);
        const momentumScore = toNumber(item.momentum_score);
        if (avgGrowth !== null && avgGrowth < 62 && growthScore !== null) {
          const fit = Math.max(0, growthScore - avgGrowth);
          weaknessFit += Math.min(12, fit * 0.35);
          if (fit >= 4) reasons.push("improves growth balance");
        }
        if (avgQuality !== null && avgQuality < 62 && qualityScore !== null) {
          const fit = Math.max(0, qualityScore - avgQuality);
          weaknessFit += Math.min(12, fit * 0.35);
          if (fit >= 4) reasons.push("lifts quality profile");
        }
        if (avgMomentum !== null && avgMomentum < 58 && momentumScore !== null) {
          const fit = Math.max(0, momentumScore - avgMomentum);
          weaknessFit += Math.min(10, fit * 0.3);
          if (fit >= 4) reasons.push("adds momentum support");
        }
        if (avgValuation !== null && avgValuation < 58 && valuationScore !== null) {
          const fit = Math.max(0, valuationScore - avgValuation);
          weaknessFit += Math.min(10, fit * 0.3);
          if (fit >= 4) reasons.push("improves valuation cushion");
        }
        let sectorFit = 0;
        if (dominantWeight >= 50 && dominantSector) {
          if (sector && sector !== dominantSector) {
            sectorFit += 12;
            reasons.push(`reduces ${dominantSector} concentration`);
          } else if (sector === dominantSector) {
            sectorFit -= 10;
          }
        }
        const redditItem = redditByMarket.get(String(market).toUpperCase())?.get(ticker) || {};
        const redditMentions = Math.max(0, Math.round(toNumber(redditItem.mentions) ?? 0));
        const redditSummary = String(redditItem.summary || redditItem.context || "");
        const redditBoost = Math.min(12, redditMentions * 2);
        const anomalyItem = anomalyByMarket.get(String(market).toUpperCase())?.get(ticker) || {};
        const anomalyMove = toNumber(anomalyItem.day_change_pct);
        const anomalyBoost = Math.min(12, Math.abs(anomalyMove ?? 0) * 1.2);
        const screenBias = screenId === "oversold_quality" ? 8 : screenId === "cheap_growth" ? 6 : 4;
        const rankBonus = Math.max(0, 8 - rank);
        const personalizationScore =
          25 + overallScore * 0.45 + screenBias + rankBonus + weaknessFit + sectorFit + redditBoost + anomalyBoost;
        candidates.push({
          instrument_id: instrumentId,
          ticker,
          name: item.name,
          market,
          reason: screen?.title,
          why: screen?.hook || screen?.tagline,
          score: item.overall_score,
          match_score: item.match_score,
          sector,
          personalization_score: Math.round(personalizationScore * 10) / 10,
          reddit_mentions: redditMentions,
          reddit_summary: redditSummary ? redditSummary.slice(0, 140) : "",
          anomaly_move_pct: anomalyMove,
          anomaly_headline: String(anomalyItem.headline || "").slice(0, 140),
          personalization_reasons: reasons.slice(0, 3),
        });
      });
    }
  }
  candidates.sort((a, b) => (toNumber(b.personalization_score) ?? 0) - (toNumber(a.personalization_score) ?? 0));
  for (const candidate of candidates) {
    const instrumentId = String(candidate.instrument_id || "");
    if (!instrumentId || suggested.has(instrumentId)) continue;
    suggested.add(instrumentId);
    const reasons = Array.isArray(candidate.personalization_reasons)
      ? candidate.personalization_reasons.map((v) => String(v)).filter(Boolean)
      : [];
    const summaryBits = [...reasons];
    const mentions = Math.round(toNumber(candidate.reddit_mentions) ?? 0);
    if (mentions > 0) summaryBits.push(`Reddit buzz ${mentions} mentions`);
    const anomalyMove = toNumber(candidate.anomaly_move_pct);
    if (anomalyMove !== null) summaryBits.push(`anomaly move ${anomalyMove >= 0 ? "+" : ""}${anomalyMove.toFixed(1)}%`);
    if (summaryBits.length) candidate.why = summaryBits.slice(0, 3).join("; ");
    suggestions.push(candidate);
    if (suggestions.length >= 6) break;
  }
  return suggestions;
}

async function portfolioDiagnostics(rows: WatchlistRow[]): Promise<Record<string, unknown>> {
  if (!rows.length) {
    return { summary: "No Radar stocks yet.", clusters: [], risk_flags: [], opportunities: [], suggestions: [] };
  }
  const clusters = sectorClusters(rows);
  const dominant = clusters[0];
  const riskFlags: Array<Record<string, unknown>> = [];
  if (dominant && Number(dominant.weight_pct) >= 50) {
    riskFlags.push({
      kind: "sector_concentration",
      severity: Number(dominant.weight_pct) >= 70 ? "high" : "medium",
      headline: `${Math.round(Number(dominant.weight_pct))}% clustered in ${dominant.sector}`,
      body: "A single-sector Radar can look great until one macro factor hits every name together.",
    });
  }
  for (const row of rows
    .filter((item) => typeof item.scores.overall === "number" && item.scores.overall < 45)
    .sort((a, b) => (a.scores.overall ?? 0) - (b.scores.overall ?? 0))
    .slice(0, 3)) {
    riskFlags.push({
      kind: "low_score",
      severity: "medium",
      ticker: row.ticker,
      headline: `${row.ticker} is the weakest score in the list`,
      body: `Overall score ${row.scores.overall} with pressure in the factor stack.`,
    });
  }
  for (const row of rows
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
  const summaryParts: string[] = [];
  if (dominant) summaryParts.push(`${dominant.sector} is the largest cluster at ${Math.round(Number(dominant.weight_pct))}%.`);
  const avgOverall = averageScore(rows, "overall");
  if (avgOverall !== null) summaryParts.push(`Average tikrr score is ${avgOverall}.`);
  if (riskFlags.length) summaryParts.push(`${riskFlags.length} risk flags need review.`);
  if (opportunities.length) {
    summaryParts.push(
      `${opportunities.length} watch list name${opportunities.length === 1 ? "" : "s"} have strong analyst runway for entry.`,
    );
  }

  return {
    summary: summaryParts.join(" ") || "Radar diagnosis is ready.",
    clusters,
    factor_tilt: {
      overall: averageScore(rows, "overall"),
      valuation: averageScore(rows, "valuation"),
      growth: averageScore(rows, "growth"),
      quality: averageScore(rows, "quality"),
      momentum: averageScore(rows, "momentum"),
    },
    risk_flags: riskFlags.slice(0, 6),
    opportunities: opportunities.slice(0, 6),
    suggestions: await screenSuggestions(rows),
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
      ? `${dominant.sector} dominates your Radar`
      : "No obvious risk cluster yet";
  const body = highAttentionHoldings[0]
    ? String(highAttentionHoldings[0].attention_reason || "A holding has a material signal.")
    : dominant
      ? `${Math.round(toNumber(dominant.weight_pct) ?? 0)}% of Radar names sit in ${dominant.sector}. Keep an eye on single-theme risk.`
      : "Add more holdings/watching names and tikrr will detect concentration, technical, and news risk.";
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
        title: `${row.ticker} is new to Radar`,
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
          body: `Overall score changed ${overallDelta >= 0 ? "+" : ""}${overallDelta.toFixed(1)} since the last Radar build.`,
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
      ? `${changed.length} Radar stock(s) changed materially since the last build.`
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
      headline: "Your Radar is empty",
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

  let headline = "Mixed tape";
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
      sentence: String(flag.message || flag.type || "Radar alert triggered.").slice(0, 120),
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
      ? `Most of this Radar clusters around ${dominant[0]}. Add an unrelated sector to reduce single-theme risk.`
      : "No obvious concentration yet. Add more stocks and tikrr will flag sector, style, and event blind spots.",
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

  const ids = isSubscribed ? (trackedStocks || []) : (trackedStocks || []).slice(0, FREE_WATCHLIST_ROW_CAP);
  const rows = applyRowDeltas(await buildRows(ids, positions, universes, alertsByInstrument), previous);
  rows.sort((a, b) => (b.attention_score ?? 0) - (a.attention_score ?? 0));
  const pulse = pulseFromRows(rows);
  const portfolio = await portfolioDiagnostics(rows);
  const suggestions = await screenSuggestions(rows);
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
