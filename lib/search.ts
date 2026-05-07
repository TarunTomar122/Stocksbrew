import { cache } from "react";
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
