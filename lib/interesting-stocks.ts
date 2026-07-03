import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type InterestingStockRow = {
  instrument_id: string;
  ticker: string;
  name?: string;
  sector?: string | null;
  industry?: string | null;
  logo_url?: string | null;
  interesting_score: number;
  reasons: string[];
  setup_type: string;
  headline: string;
  risk_reward_ratio?: number | null;
  overall_score?: number | null;
  price?: number | null;
  day_change_pct?: number | null;
  rsi_14?: number | null;
  reddit_mentions?: number;
  is_anomaly?: boolean;
  session_max_move_pct?: number;
};

export type InterestingStocksDoc = {
  market: string;
  generated_at: string;
  universe_id?: string;
  row_count: number;
  rows: InterestingStockRow[];
};

async function getInterestingStocksUncached(
  market: "US" | "IN" = "US",
): Promise<InterestingStocksDoc | null> {
  const doc = await adminFirestore.collection("tm_interesting_stocks").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || typeof data !== "object") return null;
  const rows = Array.isArray(data.rows)
    ? (data.rows as unknown[]).filter((row): row is InterestingStockRow => {
        if (!row || typeof row !== "object") return false;
        const item = row as InterestingStockRow;
        return typeof item.ticker === "string" && typeof item.interesting_score === "number";
      })
    : [];
  return {
    market: typeof data.market === "string" ? data.market : market,
    generated_at: typeof data.generated_at === "string" ? data.generated_at : "",
    universe_id: typeof data.universe_id === "string" ? data.universe_id : undefined,
    row_count: typeof data.row_count === "number" ? data.row_count : rows.length,
    rows,
  };
}

export async function getInterestingStocks(
  market: "US" | "IN" = "US",
): Promise<InterestingStocksDoc | null> {
  return unstable_cache(
    async () => getInterestingStocksUncached(market),
    ["interesting-stocks", market],
    { revalidate: 60 },
  )();
}
