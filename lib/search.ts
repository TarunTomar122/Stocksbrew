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

export const getSearchIndex = cache(async (
  market: "US" | "IN" = "US",
): Promise<SearchEntry[]> => {
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
      entries.sort((a, b) => a.ticker.localeCompare(b.ticker));
      return entries;
    }
  }

  const homeView = await getHomeView(market);
  const rows = homeView?.market_snapshot_rows ?? [];
  return rows.map((r) => ({
    instrument_id: r.instrumentId,
    ticker: r.symbol,
    name: r.name ?? r.symbol,
    price: r.price?.current,
    day_change_pct: r.price?.changePct,
  }));
});
