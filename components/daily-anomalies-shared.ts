import type { AnomalyItem } from "@/lib/daily-anomalies";

export type MoveSide = "up" | "down";

export const MAX_DISPLAY_MOVE_PCT = 100;
export const TOP_MOVES_LIMIT = 15;

export const MOVES_SECTION_TAGLINE = "Top 15 gainers and losers, and why they're moving.";

export const ANOMALY_NO_NEWS_COPY =
  "We didn't find company-specific news explaining today's move yet.";

const VERDICT_STYLES: Record<string, { text: string; bg: string }> = {
  Buy: { text: "#10b981", bg: "#ecfdf5" },
  Accumulate: { text: "#10b981", bg: "#ecfdf5" },
  Hold: { text: "#f59e0b", bg: "#fffbeb" },
  Trim: { text: "#f59e0b", bg: "#fffbeb" },
  Sell: { text: "#ef4444", bg: "#fef2f2" },
  Avoid: { text: "#ef4444", bg: "#fef2f2" },
};

export function verdictStyle(v: string): { text: string; bg: string } {
  return VERDICT_STYLES[v] ?? VERDICT_STYLES.Hold;
}

export function isDisplayableMove(item: AnomalyItem): boolean {
  return Number.isFinite(item.day_change_pct) && Math.abs(item.day_change_pct) <= MAX_DISPLAY_MOVE_PCT;
}

const WEAK_MOVE_HEADLINE = "No clear company-specific driver surfaced yet.";
const GENERIC_HEADLINE_PATTERNS = [
  /\bis a top (?:up|down) mover\b/i,
  /\bis moving (?:higher|lower)\b/i,
  /\b(?:rises|falls|gains|drops) \d+(?:\.\d+)?%\s*$/i,
];
const GENERIC_DETAIL_PATTERNS = [
  /^provides? stock quote(?:,| )/i,
  /^stock (?:quote|price),? (?:price,? )?(?:history|forecast|news)/i,
  /^shares? (?:experienced|saw|had) a pause\b/i,
  /^investors are waiting for more information\b/i,
  /^move is driven by price momentum\b/i,
  /^watch for follow-through, catalyst updates\b/i,
  /^verified source coverage is available\b/i,
  /^no confirmed catalyst yet\.?$/i,
];

function isUsefulNarrative(value: string | null | undefined, patterns: RegExp[]): value is string {
  const text = value?.trim();
  return Boolean(text && !patterns.some((pattern) => pattern.test(text)));
}

function isUsefulHeadline(value: string | null | undefined): value is string {
  return (
    isUsefulNarrative(value, GENERIC_HEADLINE_PATTERNS) &&
    isUsefulNarrative(value, GENERIC_DETAIL_PATTERNS)
  );
}

function isUsefulDetail(value: string | null | undefined): value is string {
  return isUsefulNarrative(value, GENERIC_DETAIL_PATTERNS);
}

export function isWeakMoveExplanation(item: AnomalyItem): boolean {
  const explanation = item.move_explanation;
  if (!explanation) return false;
  if (String(explanation.cause_type || "").toLowerCase() === "unclear") return true;
  const headline = String(explanation.headline || "").trim();
  if (headline === WEAK_MOVE_HEADLINE || headline.startsWith("No clear company-specific")) return true;
  const why = String(explanation.why_it_matters || "").trim();
  return why.startsWith("The move is large, but current internal");
}

export function topMoverHeadline(item: AnomalyItem): string {
  const ticker = item.ticker.trim().toUpperCase();
  const side = item.direction === "up" ? "up" : "down";
  const sector = item.sector?.trim();
  if (sector) return `${ticker} is a top ${side} mover in ${sector}.`;
  return `${ticker} is a top ${side} mover today.`;
}

export function anomalyHeadline(item: AnomalyItem): string {
  if (isWeakMoveExplanation(item)) {
    return topMoverHeadline(item);
  }
  const headline = [
    item.move_explanation?.headline,
    item.headline,
    item.visual_summary?.what_changed,
    item.catalyst,
    item.thesis,
    item.visual_summary?.drivers?.[0]?.label,
  ].find(isUsefulHeadline)?.trim();
  return headline || `${item.ticker} moved sharply today`;
}

export function anomalyDetail(item: AnomalyItem): string | null {
  if (isWeakMoveExplanation(item)) {
    return ANOMALY_NO_NEWS_COPY;
  }

  const matchingCatalyst = item.visual_summary?.catalyst_cards?.find((card) => {
    const event = card.event?.trim().toLowerCase();
    const catalyst = item.catalyst?.trim().toLowerCase();
    return Boolean(event && catalyst && (event.includes(catalyst) || catalyst.includes(event)));
  });
  const candidates = [
    item.move_explanation?.why_it_matters?.trim(),
    item.today_brief?.trim(),
    item.visual_summary?.why_it_matters?.trim(),
    matchingCatalyst?.detail?.trim(),
    item.visual_summary?.catalyst_cards?.[0]?.detail?.trim(),
    item.visual_summary?.drivers?.[0]?.detail?.trim(),
    item.thesis?.trim(),
    item.catalyst?.trim(),
    ...(item.key_points || []).map((point) => point?.trim()).filter((point): point is string => Boolean(point)),
  ].filter(isUsefulDetail);

  if (!candidates.length) return null;

  const detail = candidates[0];
  const headline = anomalyHeadline(item);
  return detail === headline ? null : detail;
}

export function anomalyWatchLine(item: AnomalyItem): string | null {
  if (isWeakMoveExplanation(item)) return null;
  const watch = item.visual_summary?.what_to_watch?.trim();
  if (!watch) return null;
  const headline = anomalyHeadline(item);
  const detail = anomalyDetail(item);
  if (watch === headline || watch === detail) return null;
  return watch;
}

export function fmtMovePct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) > MAX_DISPLAY_MOVE_PCT) return "Large move";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function fmtMovePrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

export function splitDisplayableMoves(
  anomalies: AnomalyItem[],
  opts?: { explainedOnly?: boolean; limit?: number },
): {
  ups: AnomalyItem[];
  downs: AnomalyItem[];
} {
  const displayable = anomalies.filter(isDisplayableMove);
  const explainedOnly = opts?.explainedOnly ?? false;
  const limit = opts?.limit ?? TOP_MOVES_LIMIT;

  const ups = displayable
    .filter((a) => a.direction === "up")
    .filter((a) => !explainedOnly || !isWeakMoveExplanation(a))
    .sort((a, b) => b.day_change_pct - a.day_change_pct)
    .slice(0, limit);
  const downs = displayable
    .filter((a) => a.direction === "down")
    .filter((a) => !explainedOnly || !isWeakMoveExplanation(a))
    .sort((a, b) => a.day_change_pct - b.day_change_pct)
    .slice(0, limit);
  return { ups, downs };
}
