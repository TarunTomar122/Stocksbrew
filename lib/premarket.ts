import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  marketDateIso,
  type PremarketQuoteValue,
} from "@/lib/premarket-shared";

export {
  getLivePremarketQuote,
  isPremarketLive,
  isUsPremarketWindow,
  type LivePremarketQuote,
} from "@/lib/premarket-shared";

export type PremarketRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
  pre_market_price: number;
  previous_close: number;
  pre_market_change_pct: number;
};

export type PremarketMovers = {
  market: "US" | "IN";
  generated_at: string;
  date: string;
  market_state: string;
  candidate_count: number;
  quoted_count: number;
  gappers_up: PremarketRow[];
  gappers_down: PremarketRow[];
  by_ticker: Record<string, PremarketQuoteValue>;
};

async function getPremarketMoversUncached(
  market: "US" | "IN" = "US",
): Promise<PremarketMovers | null> {
  const doc = await adminFirestore
    .collection("tm_premarket_movers")
    .doc(`${market.toUpperCase()}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as PremarketMovers;
}

export async function getPremarketMovers(
  market: "US" | "IN" = "US",
): Promise<PremarketMovers | null> {
  const dateKey = marketDateIso(market);
  return unstable_cache(
    () => getPremarketMoversUncached(market),
    ["premarket-movers", market, dateKey],
    { revalidate: 60, tags: [`premarket-${market}`] },
  )();
}

/** True when today's snapshot has at least one pre-market gapper. */
export function hasPremarketDataForToday(
  doc: PremarketMovers | null,
  market: "US" | "IN" = "US",
): boolean {
  if (!doc || doc.market !== market) return false;
  const todayEt = marketDateIso(market);
  const docDate = String(doc.date || "").slice(0, 10);
  if (docDate !== todayEt) return false;
  return (doc.gappers_up?.length ?? 0) + (doc.gappers_down?.length ?? 0) > 0;
}
