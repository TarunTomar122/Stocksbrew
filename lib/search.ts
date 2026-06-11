import { unstable_cache } from "next/cache";
import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { getHomeView } from "@/lib/home-view";
import {
  dedupeSearchEntries,
  type SearchEntry,
} from "@/lib/search-shared";

export type { SearchEntry } from "@/lib/search-shared";
export {
  dedupeSearchEntries,
  filterSearchEntries,
  scoreSearchEntry,
} from "@/lib/search-shared";

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

/** Cached catalog for interactive search APIs (short TTL, not SSR render paths). */
export function getSearchIndexForApi(market: "US" | "IN" = "US"): Promise<SearchEntry[]> {
  return unstable_cache(
    async () => getSearchIndexUncached(market),
    ["search-index-api", market],
    { revalidate: 300 },
  )();
}
