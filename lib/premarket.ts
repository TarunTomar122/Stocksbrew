import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

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
  by_ticker: Record<string, { pre_market_change_pct: number; pre_market_price: number }>;
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

export const getPremarketMovers = unstable_cache(
  getPremarketMoversUncached,
  ["premarket-movers"],
  { revalidate: 120 },
);

/** True only during the live pre-market window (Yahoo marketState === "PRE").
 * Sample/seeded docs use "PRE (sample)" which also passes, for previewing. */
export function isPremarketLive(doc: PremarketMovers | null): boolean {
  if (!doc) return false;
  return String(doc.market_state || "").toUpperCase().startsWith("PRE");
}
