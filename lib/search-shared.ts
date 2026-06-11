export type SearchEntry = {
  instrument_id: string;
  ticker: string;
  name: string;
  price?: number;
  day_change_pct?: number;
};

/** Drop alternate share classes when the canonical ticker is already indexed. */
const SEARCH_TICKER_SUPPRESSED_BY: Record<string, string> = {
  GOOG: "GOOGL",
};

export function scoreSearchEntry(entry: SearchEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const ticker = entry.ticker.toLowerCase();
  const name = entry.name.toLowerCase();
  if (ticker === q) return 100;
  if (ticker.startsWith(q)) return 80;
  if (name.startsWith(q)) return 60;
  if (ticker.includes(q)) return 45;
  if (name.includes(q)) return 25;
  return 0;
}

export function filterSearchEntries(
  entries: SearchEntry[],
  query: string,
  limit = 20,
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

export function dedupeSearchEntries(entries: SearchEntry[]): SearchEntry[] {
  const tickers = new Set(entries.map((entry) => entry.ticker.toUpperCase()));
  return entries.filter((entry) => {
    const ticker = entry.ticker.toUpperCase();
    const preferred = SEARCH_TICKER_SUPPRESSED_BY[ticker];
    return !(preferred && tickers.has(preferred));
  });
}
