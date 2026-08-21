import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { RadarStockStateDoc, WatchlistRow } from "@/lib/watchlist-view";
import { isPriceZoneHit } from "@/lib/radar-next-data";
import {
  EPS_OUTLOOK_LABELS,
  POST_PRINT_MOVE_LABELS,
  normalizeEpsOutlook,
  normalizePostPrintMove,
  type PreEarningsIntelDoc,
} from "@/lib/pre-earnings-intel-shared";

export type HubTone = "bull" | "bear" | "neutral";

/** The alert fields the hub renders, resolved from tm_alerts docs. */
export type HubAlert = {
  id: string;
  instrument_id?: string | null;
  ticker?: string | null;
  kind?: string | null;
  condition?: string | null;
  target_price?: number | null;
  active?: boolean;
};

export type HubAlertFlag = {
  kind: string;
  title: string;
  body: string;
  tone: HubTone;
};

/**
 * The one row shape the watchlist hub renders. Every field the page needs is
 * resolved here, on the server, from the sources that already exist in
 * Firestore — the client component stays a pure renderer.
 */
export type HubRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  position_type: "holding" | "watchlist";
  price: number | null;
  day_change_pct: number | null;
  target_upside_pct: number | null;
  overall_score: number | null;
  stance: string | null;
  rsi_14: number | null;
  rsi_state: string | null;
  earnings_date: string | null;
  earnings_headline: string | null;
  anomaly_headline: string | null;
  anomaly_confidence: string | null;
  mentions_7d: number | null;
  premarket_change_pct: number | null;
  reason_line: string;
  reason_tone: HubTone;
  flags: HubAlertFlag[];
  /** True when the live price is currently inside the AI call's buy-below / trim-above zone. */
  needs_attention: boolean;
  attention_direction: "bullish" | "bearish" | "neutral" | null;
};

export type HubRowSources = {
  rows: WatchlistRow[];
  states?: Record<string, RadarStockStateDoc> | null;
  anomaliesByInstrumentId?: Map<string, AnomalyItem> | null;
  earningsById?: Map<string, EarningsIntelDoc> | null;
  gappersByInstrumentId?: Map<string, number> | null;
  now?: Date;
};

export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function stanceOf(row: WatchlistRow): string | null {
  const directive = (row.directive_v2 ?? row.ai_directive ?? {}) as { stance?: unknown };
  const stance = cleanText(directive.stance);
  return stance ? stance.charAt(0).toUpperCase() + stance.slice(1) : null;
}

function flagsOf(row: WatchlistRow): HubAlertFlag[] {
  const out: HubAlertFlag[] = [];
  const rawFlags = Array.isArray(row.alerts) ? row.alerts.slice(0, 4) : [];
  for (const raw of rawFlags) {
    const flag = (raw ?? {}) as Record<string, unknown>;
    const title = cleanText(flag.title) ?? cleanText(flag.message);
    if (!title) continue;
    const toneRaw = cleanText(flag.tone);
    out.push({
      kind: cleanText(flag.kind) ?? "signal",
      title,
      body: cleanText(flag.body) ?? "",
      tone: toneRaw === "bull" || toneRaw === "bear" ? toneRaw : "neutral",
    });
  }
  return out;
}

/** Parse a YYYY-MM-DD date as midday US Eastern so day math stays on the exchange's calendar. */
export function easternDate(raw: string): Date | null {
  const full = raw.length === 10 ? `${raw}T12:00:00-04:00` : raw;
  const parsed = new Date(full);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function daysUntil(dateRaw: string, today: Date): number | null {
  const target = easternDate(dateRaw);
  if (!target) return null;
  const ms = target.getTime() - today.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

type ReasonRowInput = {
  day_change_pct: number | null;
  earnings_headline: string | null;
  /** Days since the earnings print the headline refers to, so an old readout doesn't read as today's reason. */
  earnings_days_ago?: number | null;
  anomaly_headline: string | null;
  flags: HubAlertFlag[];
  brief_micro?: string | null;
  brief_vibe?: "up" | "down" | "wild";
};

// A line that just restates the day's percentage move ("XYZ moved -4% today")
// tells the reader nothing they don't already see in the price column.
const MEANINGFUL_KEYWORDS =
  /(earnings|eps|revenue|guidance|beat|miss|upgrade|downgrade|fda|merger|acquisition|lawsuit|recall|contract|dividend|split|spinoff|ipo|bankruptcy|ceo|cfo|resign|layoff|strike|settlement|fine|filing|\bsec\b|announce|launch|partnership|\bdeal\b|forecast|outlook)/i;

function isGenericMoveOnly(text: string): boolean {
  if (!text.includes("%")) return false;
  return !MEANINGFUL_KEYWORDS.test(text);
}

/**
 * The one-line answer for a stock, in priority order: a verified move
 * explanation beats an earnings readout beats a system flag beats the AI
 * micro-line. Give away the answer; the application is what costs money.
 * Lines that only restate the day's percentage move are skipped - the price
 * column already says that.
 */
export function reasonForRow(row: ReasonRowInput): {
  line: string;
  tone: HubTone;
} {
  const anomaly = cleanText(row.anomaly_headline);
  if (anomaly && !isGenericMoveOnly(anomaly)) {
    return { line: anomaly, tone: (row.day_change_pct ?? 0) >= 0 ? "bull" : "bear" };
  }
  const earnings = cleanText(row.earnings_headline);
  const earningsStale = earnings != null && row.earnings_days_ago != null && row.earnings_days_ago > 14;
  if (earnings && !earningsStale && !isGenericMoveOnly(earnings)) {
    const daysAgo = row.earnings_days_ago;
    const line = daysAgo != null && daysAgo >= 1 ? `Reported ${daysAgo}d ago: ${earnings}` : earnings;
    return { line, tone: "neutral" };
  }
  const flag = row.flags[0];
  if (flag) {
    const flagLine = flag.body ? `${flag.title}. ${flag.body}` : flag.title;
    if (!isGenericMoveOnly(flagLine)) return { line: flagLine, tone: flag.tone };
  }
  const micro = cleanText(row.brief_micro);
  if (micro && !isGenericMoveOnly(micro)) {
    const tone: HubTone = row.brief_vibe === "up" ? "bull" : row.brief_vibe === "down" ? "bear" : "neutral";
    return { line: micro, tone };
  }
  return { line: "", tone: "neutral" };
}

export function buildHubRows(sources: HubRowSources): HubRow[] {
  const states = sources.states ?? {};
  const anomalies = sources.anomaliesByInstrumentId ?? new Map();
  const earnings = sources.earningsById ?? new Map();
  const gappers = sources.gappersByInstrumentId ?? new Map();
  const now = sources.now ?? new Date();

  return sources.rows.map((row) => {
    const state = states[row.instrument_id] ?? {};
    const anomaly = anomalies.get(row.instrument_id);
    const intel = earnings.get(row.instrument_id);
    const earningsDaysAgo = intel?.event_date
      ? (() => {
          const until = daysUntil(intel.event_date, now);
          return until == null ? null : Math.max(0, -until);
        })()
      : null;

    const base = {
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: cleanText(row.instrument_name) ?? row.ticker,
      logo_url: row.logo_url ?? null,
      position_type: row.position_type === "holding" ? ("holding" as const) : ("watchlist" as const),
      price: finiteNumber(row.price),
      day_change_pct: finiteNumber(row.day_change_pct),
      target_upside_pct: finiteNumber(row.target_upside_pct),
      overall_score: finiteNumber(row.scores?.overall),
      stance: stanceOf(row),
      rsi_14: finiteNumber(state.rsi_14),
      rsi_state: cleanText(state.rsi_state),
      earnings_date: cleanText(state.earnings_date),
      earnings_headline: cleanText(intel?.report?.headline),
      anomaly_headline: cleanText(anomaly?.headline) ?? cleanText(anomaly?.thesis),
      anomaly_confidence: cleanText(anomaly?.move_explanation?.confidence),
      mentions_7d: finiteNumber(
        (row.news_velocity as { mentions_7d?: unknown } | undefined)?.mentions_7d,
      ),
      premarket_change_pct: gappers.get(row.instrument_id) ?? null,
      flags: flagsOf(row),
      brief_micro: cleanText(row.brief_tile?.micro),
      brief_vibe: row.brief_tile?.vibe ?? "neutral",
    };

    // A fresh post-earnings readout supersedes a stale upcoming date.
    const earningsDate =
      intel && base.earnings_date && intel.event_date && intel.event_date > base.earnings_date
        ? null
        : base.earnings_date;

    const { line, tone } = reasonForRow({ ...base, earnings_days_ago: earningsDaysAgo });
    const zone = isPriceZoneHit(row);

    return {
      ...base,
      earnings_date: earningsDate ?? null,
      reason_line: line,
      reason_tone: tone,
      needs_attention: zone.hit,
      attention_direction: zone.direction,
    };
  });
}

export type EarningsPrediction = {
  eps: { label: string; tone: HubTone } | null;
  move: { label: string; tone: HubTone } | null;
  headline: string | null;
  confidence: number | null;
};

function runwayDateLabel(raw: string): string {
  const parsed = easternDate(raw);
  if (!parsed) return raw;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A tracked name reporting soon, with the pre-earnings prediction when we have one. */
export type EarningsCard = {
  instrument_id: string;
  ticker: string;
  name: string;
  position_type: "holding" | "watchlist";
  date: string;
  date_label: string;
  days_away: number;
  has_prediction: boolean;
  prediction: EarningsPrediction | null;
};

/** Tracked names reporting soon, soonest first, each carrying its pre-print call. */
export function buildEarningsCards(
  rows: HubRow[],
  preEarnings: PreEarningsIntelDoc[],
  today: Date,
  horizonDays = 30,
  cap = 12,
): EarningsCard[] {
  const preById = new Map(preEarnings.map((doc) => [doc.instrument_id, doc]));
  const cards: EarningsCard[] = [];
  for (const row of rows) {
    if (!row.earnings_date) continue;
    const daysAway = daysUntil(row.earnings_date, today);
    if (daysAway == null || daysAway < 0 || daysAway > horizonDays) continue;

    const pre = preById.get(row.instrument_id);
    const epsRaw = normalizeEpsOutlook(pre?.report?.call?.eps_outlook);
    const moveRaw = normalizePostPrintMove(pre?.report?.call?.post_print_move);
    const eps = epsRaw
      ? {
          label: EPS_OUTLOOK_LABELS[epsRaw],
          tone: epsRaw === "beat" ? ("bull" as const) : epsRaw === "miss" ? ("bear" as const) : ("neutral" as const),
        }
      : null;
    const move = moveRaw
      ? {
          label: POST_PRINT_MOVE_LABELS[moveRaw],
          tone: moveRaw === "rally" ? ("bull" as const) : moveRaw === "fade" ? ("bear" as const) : ("neutral" as const),
        }
      : null;
    const headline = cleanText(pre?.report?.headline);
    const confidence =
      typeof pre?.report?.confidence?.score_0_100 === "number"
        ? pre.report.confidence.score_0_100
        : null;
    const hasPrediction = Boolean(eps || move || headline);

    cards.push({
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: row.name,
      position_type: row.position_type,
      date: row.earnings_date,
      date_label: runwayDateLabel(row.earnings_date),
      days_away: daysAway,
      has_prediction: hasPrediction,
      prediction: hasPrediction ? { eps, move, headline, confidence } : null,
    });
  }
  return cards.sort((a, b) => a.days_away - b.days_away).slice(0, cap);
}

export type EarningsRunwayEntry = {
  instrument_id: string;
  ticker: string;
  name: string;
  date_label: string;
  days_away: number;
};

/** Tracked names reporting soon, soonest first — the compact strip above the earnings cards. */
export function buildEarningsRunway(
  rows: HubRow[],
  today: Date,
  horizonDays = 30,
  cap = 6,
): EarningsRunwayEntry[] {
  const entries: EarningsRunwayEntry[] = [];
  for (const row of rows) {
    if (!row.earnings_date) continue;
    const daysAway = daysUntil(row.earnings_date, today);
    if (daysAway == null || daysAway < 0 || daysAway > horizonDays) continue;

    entries.push({
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: row.name,
      date_label: runwayDateLabel(row.earnings_date),
      days_away: daysAway,
    });
  }
  return entries.sort((a, b) => a.days_away - b.days_away).slice(0, cap);
}
