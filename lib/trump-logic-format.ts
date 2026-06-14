/** Client-safe display helpers for Trump Logic (no firebase-admin). */

import type { TrumpLogicMention, TrumpLogicTickerRow } from "@/lib/trump-logic-types";

export type TrumpLogicTableRow = {
  id: string;
  published_at: string;
  ticker: string;
  said: string;
  sentiment: "bullish" | "bearish";
  change_since_pct: number | null;
  truth_url: string;
  mention_count: number;
};

function dayKey(iso: string): string {
  return iso.trim().slice(0, 10);
}

function sinceKey(pct: number | null): string {
  return typeof pct === "number" && Number.isFinite(pct) ? pct.toFixed(1) : "na";
}

export function hasTrumpLogicMove(pct: number | null | undefined): pct is number {
  return typeof pct === "number" && Number.isFinite(pct);
}

function mergeGroupKey(row: TrumpLogicTableRow): string {
  return [row.ticker, dayKey(row.published_at), row.sentiment, sinceKey(row.change_since_pct)].join("|");
}

/** Collapse repeat posts for the same ticker on the same day with the same move. */
export function mergeTrumpLogicTableRows(rows: TrumpLogicTableRow[]): TrumpLogicTableRow[] {
  const grouped = new Map<string, TrumpLogicTableRow>();

  for (const row of rows) {
    const key = mergeGroupKey(row);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row, mention_count: 1 });
      continue;
    }

    existing.mention_count += 1;
    if (String(row.published_at) > String(existing.published_at)) {
      existing.published_at = row.published_at;
      existing.said = row.said;
      existing.truth_url = row.truth_url;
    }
  }

  return sortTrumpLogicTableRows([...grouped.values()]);
}

export function flattenTrumpLogicMentions(mentions: TrumpLogicMention[]): TrumpLogicTableRow[] {
  const rows: TrumpLogicTableRow[] = [];
  for (const mention of mentions) {
    const sentiment = mention.sentiment?.toLowerCase();
    if (sentiment !== "bullish" && sentiment !== "bearish") continue;
    for (const ticker of mention.tickers) {
      const move = mention.ticker_moves?.find((row) => row.ticker === ticker);
      const change_since_pct = move?.change_since_pct ?? null;
      if (!hasTrumpLogicMove(change_since_pct)) continue;
      rows.push({
        id: `${mention.post_id}-${ticker}`,
        published_at: mention.published_at,
        ticker,
        said: mention.said,
        sentiment,
        change_since_pct,
        truth_url: mention.truth_url,
        mention_count: 1,
      });
    }
  }
  return mergeTrumpLogicTableRows(rows);
}

export function sortTrumpLogicTableRows(rows: TrumpLogicTableRow[]): TrumpLogicTableRow[] {
  return [...rows].sort(
    (a, b) =>
      String(b.published_at || "").localeCompare(String(a.published_at || "")) ||
      a.ticker.localeCompare(b.ticker),
  );
}

export function splitTrumpLogicTableRows(rows: TrumpLogicTableRow[]) {
  return {
    bullish: rows.filter((row) => row.sentiment === "bullish"),
    bearish: rows.filter((row) => row.sentiment === "bearish"),
  };
}

export function formatTrumpLogicDate(iso: string, ref = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  const compare = new Date(d);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - compare.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
    text: `${positive ? "+" : ""}${pct.toFixed(1)}%`,
    positive,
  };
}
