/** Client-safe types and helpers for pre-earnings intel (no firebase-admin). */

export type EpsOutlook = "beat" | "inline" | "miss" | "unclear";
export type PostPrintMove = "rally" | "fade" | "chop" | "unclear";

export type PreEarningsCardQuote = {
  sector?: string;
  price?: number;
  dayChangePct?: number;
};

export type PreEarningsIntelDoc = {
  doc_id: string;
  market: "US" | "IN";
  instrument_id: string;
  ticker: string;
  event_date: string;
  days_until?: number | null;
  generated_at: string;
  model?: string;
  report: {
    headline: string;
    summary: string;
    call?: {
      eps_outlook?: EpsOutlook;
      post_print_move?: PostPrintMove;
    };
    setup?: {
      consensus_context?: string;
      pre_earnings_positioning?: string;
      key_bull_case?: string[];
      key_bear_case?: string[];
    };
    decision_guide?: {
      for_holders?: string;
      for_watchers?: string;
      key_monitor_list?: string[];
    };
    confidence?: {
      score_0_100?: number;
      reason?: string;
    };
    invalidators?: string[];
  };
};

export function daysUntilEventDate(eventDate: string, ref = new Date()): number | null {
  const iso = eventDate.trim().split("T", 1)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const event = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(event.getTime())) return null;
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  return Math.round((event.getTime() - today.getTime()) / 86_400_000);
}

/** True when print is today..maxDays calendar days ahead (UTC). */
export function isWithinPreEarningsWindow(
  eventDate: string,
  maxDays = 7,
  ref = new Date(),
): boolean {
  const delta = daysUntilEventDate(eventDate, ref);
  return delta !== null && delta >= 0 && delta <= maxDays;
}

export function filterPreEarningsWithinDays(
  docs: PreEarningsIntelDoc[],
  maxDays = 7,
  ref = new Date(),
): PreEarningsIntelDoc[] {
  return docs
    .filter((d) => isWithinPreEarningsWindow(d.event_date, maxDays, ref))
    .sort((a, b) => {
      const da = daysUntilEventDate(a.event_date, ref) ?? 999;
      const db = daysUntilEventDate(b.event_date, ref) ?? 999;
      if (da !== db) return da - db;
      const ca = a.report?.confidence?.score_0_100 ?? 0;
      const cb = b.report?.confidence?.score_0_100 ?? 0;
      return cb - ca;
    });
}

/** Short prediction labels on cards, radar, and stock page. */
export const EPS_OUTLOOK_LABELS: Record<EpsOutlook, string> = {
  beat: "EPS beat",
  inline: "EPS inline",
  miss: "EPS miss",
  unclear: "EPS unclear",
};

export const POST_PRINT_MOVE_LABELS: Record<PostPrintMove, string> = {
  rally: "Bullish",
  fade: "Bearish",
  chop: "Neutral",
  unclear: "Unclear",
};

/** Supporting line under the prediction on the stock earnings setup card. */
export const EPS_OUTCOME_LINES: Record<EpsOutlook, string> = {
  beat: "We expect earnings above the consensus estimate",
  inline: "We expect earnings in line with the consensus estimate",
  miss: "We expect earnings below the consensus estimate",
  unclear: "Earnings direction is not clear enough to call",
};

export const STOCK_OUTCOME_LINES: Record<PostPrintMove, string> = {
  rally: "We expect a bullish reaction after the report",
  fade: "We expect a bearish reaction after the report",
  chop: "We expect a neutral, range-bound reaction after the report",
  unclear: "Post-report direction is not clear enough to call",
};

const EPS_OUTLOOK_VALUES = new Set<string>(Object.keys(EPS_OUTLOOK_LABELS));
const POST_PRINT_MOVE_VALUES = new Set<string>(Object.keys(POST_PRINT_MOVE_LABELS));

/** Coerce raw model output to a known enum, or undefined. */
export function normalizeEpsOutlook(raw: string | undefined): EpsOutlook | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  return EPS_OUTLOOK_VALUES.has(v) ? (v as EpsOutlook) : undefined;
}

export function normalizePostPrintMove(raw: string | undefined): PostPrintMove | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  return POST_PRINT_MOVE_VALUES.has(v) ? (v as PostPrintMove) : undefined;
}

export function epsOutlookLabel(raw: string | undefined): string | undefined {
  const key = normalizeEpsOutlook(raw);
  return key ? EPS_OUTLOOK_LABELS[key] : undefined;
}

export function postPrintMoveLabel(raw: string | undefined): string | undefined {
  const key = normalizePostPrintMove(raw);
  return key ? POST_PRINT_MOVE_LABELS[key] : undefined;
}

/** Strip em dashes and tighten punctuation from model copy. */
export function cleanEarningsProse(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/\s*;\s*/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

export function epsOutlookTone(outlook: EpsOutlook | undefined): { bg: string; text: string } {
  switch (outlook) {
    case "beat":
      return { bg: "#ecfdf5", text: "#047857" };
    case "miss":
      return { bg: "#fef2f2", text: "#b91c1c" };
    case "inline":
      return { bg: "#eff6ff", text: "#1d4ed8" };
    default:
      return { bg: "#f3f4f6", text: "#6b7280" };
  }
}

export function postPrintMoveTone(move: PostPrintMove | undefined): { bg: string; text: string } {
  switch (move) {
    case "rally":
      return { bg: "#ecfdf5", text: "#047857" };
    case "fade":
      return { bg: "#fef2f2", text: "#b91c1c" };
    case "chop":
      return { bg: "#fffbeb", text: "#b45309" };
    default:
      return { bg: "#f3f4f6", text: "#6b7280" };
  }
}
