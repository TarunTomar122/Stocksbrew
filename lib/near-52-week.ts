import { getLatestPriceFundamentals, getMarketSnapshot, getNear52WeekView } from "@/lib/firestore";
import type { Market } from "@/lib/types";

export type Near52WeekRow = {
  instrumentId: string;
  ticker: string;
  name: string;
  price: number;
  changePct?: number;
  week52High: number;
  week52Low: number;
  /** 0 at the 52w low, 100 at the 52w high. Used only for ranking. */
  rangePct: number;
  /** % above (positive) or below (negative) the 52-week high. */
  pctFromHigh: number;
  /** % above (positive) or below (negative) the 52-week low. */
  pctFromLow: number;
};

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function getNear52WeekLists(
  market: Market,
  limit = 10,
): Promise<{ nearHighs: Near52WeekRow[]; nearLows: Near52WeekRow[] }> {
  const materialized = await getNear52WeekView(market);
  if (materialized) {
    const rows = materialized.map((row) => ({
      instrumentId: row.instrumentId,
      ticker: row.ticker,
      name: row.name,
      price: row.price,
      changePct: row.changePct,
      week52High: row.week52High,
      week52Low: row.week52Low,
      rangePct: ((row.price - row.week52Low) / (row.week52High - row.week52Low)) * 100,
      pctFromHigh: ((row.price - row.week52High) / row.week52High) * 100,
      pctFromLow: ((row.price - row.week52Low) / row.week52Low) * 100,
    }));
    return {
      nearHighs: [...rows].sort((a, b) => b.rangePct - a.rangePct).slice(0, limit),
      nearLows: [...rows].sort((a, b) => a.rangePct - b.rangePct).slice(0, limit),
    };
  }
  const snapshot = await getMarketSnapshot(market);
  const ids = snapshot.map((row) => row.instrumentId).filter(Boolean);
  const prices = await getLatestPriceFundamentals(ids);

  const rows: Near52WeekRow[] = [];
  for (const row of snapshot) {
    const doc = prices.get(row.instrumentId);
    const high = doc?.fundamentals?.week_52_high;
    const low = doc?.fundamentals?.week_52_low;
    const price = row.price?.current;
    if (!n(high) || !n(low) || high <= low || !n(price)) continue;

    rows.push({
      instrumentId: row.instrumentId,
      ticker: row.symbol,
      name: row.name,
      price,
      changePct: row.price?.changePct,
      week52High: high,
      week52Low: low,
      rangePct: ((price - low) / (high - low)) * 100,
      pctFromHigh: ((price - high) / high) * 100,
      pctFromLow: ((price - low) / low) * 100,
    });
  }

  const nearHighs = [...rows].sort((a, b) => b.rangePct - a.rangePct).slice(0, limit);
  const nearLows = [...rows].sort((a, b) => a.rangePct - b.rangePct).slice(0, limit);
  return { nearHighs, nearLows };
}
