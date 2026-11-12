import { unstable_cache } from "next/cache";
import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { getFundCatalog } from "@/lib/funds/server";
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

/**
 * Funds we cover get a "Fund" tag, and any of them the index does not hold yet
 * (registered by backend/scripts/register_fund_instruments.py, rebuilt nightly)
 * is added, so search and the import know VOO before its first price lands.
 */
async function withFunds(entries: SearchEntry[], market: "US" | "IN"): Promise<SearchEntry[]> {
  if (market !== "US") return entries;
  const funds = await getFundCatalog().catch(() => new Map<string, string>());
  if (funds.size === 0) return entries;
  const seen = new Set(entries.map((entry) => entry.ticker));
  // A fund registered from a stock request can be named by its ticker alone ("SCHD"); the fund list has its name.
  const tagged = entries.map((entry) => {
    const name = funds.get(entry.ticker);
    if (name === undefined) return entry;
    return { ...entry, name: entry.name && entry.name !== entry.ticker ? entry.name : name, fund: true };
  });
  for (const [ticker, name] of funds) {
    if (!seen.has(ticker)) tagged.push({ instrument_id: `US_${ticker.replace(/\./g, "_")}`, ticker, name, fund: true });
  }
  tagged.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return tagged;
}

async function getSearchIndexUncached(market: "US" | "IN" = "US"): Promise<SearchEntry[]> {
  return withFunds(await getSearchIndexBase(market), market);
}

async function getSearchIndexBase(
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
    ["search-index-api-v3", market],
    { revalidate: 60 },
  )();
}
