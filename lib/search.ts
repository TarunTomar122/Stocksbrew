import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { getHomeView } from "@/lib/home-view";

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

export function dedupeSearchEntries(entries: SearchEntry[]): SearchEntry[] {
  const tickers = new Set(entries.map((entry) => entry.ticker.toUpperCase()));
  return entries.filter((entry) => {
    const ticker = entry.ticker.toUpperCase();
    const preferred = SEARCH_TICKER_SUPPRESSED_BY[ticker];
    return !(preferred && tickers.has(preferred));
  });
}

async function getSearchIndexUncached(
  market: "US" | "IN" = "US"
): Promise<SearchEntry[]> {
  const searchDoc = await adminFirestore.collection("tm_search_index").doc(market).get();
  if (searchDoc.exists) {
    const data = searchDoc.data() as { entries?: Record<string, Partial<SearchEntry>> };
    const entries = Object.values(data.entries || {})
      .map((entry) => ({
        instrument_id: String(entry.instrument_id || "").toUpperCase(),
        ticker: String(entry.ticker || "").toUpperCase(),
        name: String(entry.name || entry.ticker || "").trim(),
        price: typeof entry.price === "number" ? entry.price : undefined,
        day_change_pct: typeof entry.day_change_pct === "number" ? entry.day_change_pct : undefined,
      }))
      .filter((entry) => entry.instrument_id && entry.ticker);
    if (entries.length > 0) {
      const deduped = dedupeSearchEntries(entries);
      deduped.sort((a, b) => a.ticker.localeCompare(b.ticker));
      return deduped;
    }
  }

  const homeView = await getHomeView(market);
  const rows = homeView?.market_snapshot_rows ?? [];
  return dedupeSearchEntries(
    rows.map((r) => ({
      instrument_id: r.instrumentId,
      ticker: r.symbol,
      name: r.name ?? r.symbol,
      price: r.price?.current,
      day_change_pct: r.price?.changePct,
    })),
  );
}

// The search index is a broad catalog doc, but it has to reflect fresh
// fulfillment and universe updates immediately. Keep only request-local
// memoization here; do not cross-request cache it.
export const getSearchIndex = cache(getSearchIndexUncached);
