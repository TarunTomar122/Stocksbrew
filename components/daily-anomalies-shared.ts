import type { AnomalyItem } from "@/lib/daily-anomalies";

export type MoveSide = "up" | "down";

export const MAX_DISPLAY_MOVE_PCT = 100;
export const TOP_MOVES_LIMIT = 10;

export const MOVES_SECTION_TAGLINE = "Top 10 gainers and losers, and why they're moving.";

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

export function anomalyHeadline(item: AnomalyItem): string {
  const headline =
    item.move_explanation?.headline?.trim() ||
    item.headline?.trim() ||
    item.visual_summary?.what_changed?.trim();
  return headline || `${item.ticker} moved sharply today`;
}

export function anomalyDetail(item: AnomalyItem): string | null {
  const candidates = [
    item.move_explanation?.why_it_matters?.trim(),
    item.today_brief?.trim(),
    item.thesis?.trim(),
    item.visual_summary?.why_it_matters?.trim(),
    ...(item.key_points || []).map((point) => point?.trim()).filter((point): point is string => Boolean(point)),
  ].filter((value): value is string => Boolean(value));

  if (!candidates.length) return null;

  const detail = candidates[0];
  const headline = anomalyHeadline(item);
  return detail === headline ? null : detail;
}

export function anomalyWatchLine(item: AnomalyItem): string | null {
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

export function splitDisplayableMoves(anomalies: AnomalyItem[]): {
  ups: AnomalyItem[];
  downs: AnomalyItem[];
} {
  const displayable = anomalies.filter(isDisplayableMove);
  const ups = displayable
    .filter((a) => a.direction === "up")
    .sort((a, b) => b.day_change_pct - a.day_change_pct)
    .slice(0, TOP_MOVES_LIMIT);
  const downs = displayable
    .filter((a) => a.direction === "down")
    .sort((a, b) => a.day_change_pct - b.day_change_pct)
    .slice(0, TOP_MOVES_LIMIT);
  return { ups, downs };
}
