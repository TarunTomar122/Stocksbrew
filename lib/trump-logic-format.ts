/** Client-safe display helpers for Trump Logic (no firebase-admin). */

import type { TrumpLogicTickerRow } from "@/lib/trump-logic-types";

export type TrumpLogicSortKey = "mentions" | "bullish" | "bearish" | "move" | "latest";

export const TRUMP_LOGIC_SORT_OPTIONS: { key: TrumpLogicSortKey; label: string }[] = [
  { key: "mentions", label: "Most mentions" },
  { key: "bullish", label: "Most bullish" },
  { key: "bearish", label: "Most bearish" },
  { key: "move", label: "Biggest moves" },
  { key: "latest", label: "Latest" },
];

function moveMagnitude(row: TrumpLogicTickerRow): number {
  const value = row.latest_change_since_pct;
  return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : -Infinity;
}

export function sortTrumpLogicTickers(
  rows: TrumpLogicTickerRow[],
  sortKey: TrumpLogicSortKey,
): TrumpLogicTickerRow[] {
  const copy = [...rows];
  switch (sortKey) {
    case "bullish":
      copy.sort(
        (a, b) =>
          b.bullish_count - a.bullish_count ||
          b.mention_count - a.mention_count ||
          a.ticker.localeCompare(b.ticker),
      );
      break;
    case "bearish":
      copy.sort(
        (a, b) =>
          b.bearish_count - a.bearish_count ||
          b.mention_count - a.mention_count ||
          a.ticker.localeCompare(b.ticker),
      );
      break;
    case "move":
      copy.sort(
        (a, b) =>
          moveMagnitude(b) - moveMagnitude(a) ||
          b.mention_count - a.mention_count ||
          a.ticker.localeCompare(b.ticker),
      );
      break;
    case "latest":
      copy.sort(
        (a, b) =>
          String(b.latest_published_at || "").localeCompare(String(a.latest_published_at || "")) ||
          b.mention_count - a.mention_count ||
          a.ticker.localeCompare(b.ticker),
      );
      break;
    case "mentions":
    default:
      copy.sort(
        (a, b) =>
          b.mention_count - a.mention_count ||
          String(b.latest_published_at || "").localeCompare(String(a.latest_published_at || "")) ||
          a.ticker.localeCompare(b.ticker),
      );
      break;
  }
  return copy;
}

export function formatSincePct(
  pct: number | null | undefined,
): { text: string; positive: boolean } | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const positive = pct >= 0;
  return {
    text: `${positive ? "+" : ""}${pct.toFixed(1)}% since`,
    positive,
  };
}
