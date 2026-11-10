import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceHistory } from "@/lib/firestore";
import type { EarningsEvent } from "@/lib/earnings";
import type { PowerTrade } from "@/lib/power-trades";
import { summarizeLongHistory } from "@/lib/price-history-daily";
import { buildPriceHistorySeries } from "@/lib/price-history-series";
import {
  buildChartRanges,
  buildMultipleHistory,
  cleanSeries,
  type CallRecord,
  type ChartPoint,
  type ChartRange,
  type MultipleHistory,
} from "@/lib/stock-chart";

/**
 * Cached reads the stock page needs beyond the batched page-view doc: the
 * multi-year price series, the dates we changed our call, every earnings date
 * we hold, and the disclosed congressional trades in the ticker.
 *
 * Each loader swallows its own errors and returns an empty value, because a
 * missing side collection must never take the page down.
 */

export type StockPriceSeries = {
  ranges: ChartRange[];
  source: string;
  /** True when closes are adjusted for splits and dividends. */
  adjusted: boolean;
  firstDate: string;
  lastDate: string;
  fetchedAt: string | null;
  allTimeHigh: { close: number; date: string } | null;
  allTimeLow: { close: number; date: string } | null;
  longReturns: Array<{ label: string; pct: number; fromDate: string }>;
};

type RawDailyDoc = { dates?: string[]; closes?: number[]; source?: string; fetched_at?: string; adjusted?: boolean };

async function loadLongSeries(symbol: string): Promise<StockPriceSeries | null> {
  const upper = symbol.trim().toUpperCase();
  if (!upper) return null;
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(upper).get();
  if (!doc.exists) return null;
  const raw = doc.data() as RawDailyDoc;
  const summary = summarizeLongHistory(raw, upper);
  if (!summary) return null;
  const dates = raw.dates ?? [];
  const closes = raw.closes ?? [];
  const series: ChartPoint[] = cleanSeries(dates.map((date, index) => ({ date, close: closes[index] })));
  const ranges = buildChartRanges(series);
  if (!ranges.length) return null;
  return {
    ranges,
    source: summary.source,
    adjusted: summary.adjusted,
    firstDate: summary.firstDate,
    lastDate: summary.lastDate,
    fetchedAt: summary.fetchedAt,
    allTimeHigh: summary.high,
    allTimeLow: summary.low,
    longReturns: summary.returns.map((row) => ({ label: row.label, pct: row.pct, fromDate: row.fromDate })),
  };
}

/** Multi-year closes from `tm_price_history_daily`. US symbols only; null when the job has not fetched this one. */
export const getStockLongSeries = unstable_cache(
  async (symbol: string) => loadLongSeries(symbol).catch(() => null),
  ["stock-long-series-v1"],
  { revalidate: 3600 },
);

export type StockSnapshotHistory = {
  /** Daily closes from our own price snapshots (about seven months), with today's quote on the end. */
  closes: ChartPoint[];
  /** Trailing P/E as stored each day. */
  multiple: MultipleHistory | null;
};

/** The rolling window inside `tm_latest_prices`: recent closes and the P/E we stored on each of those days. */
export const getStockSnapshotHistory = unstable_cache(
  async (instrumentId: string): Promise<StockSnapshotHistory> => {
    const data = await getLatestPriceHistory(instrumentId).catch(() => null);
    return {
      closes: buildPriceHistorySeries(data),
      multiple: buildMultipleHistory(
        data?.history_window as Array<{ captured_at?: string; fundamentals?: { pe_ttm?: number | null } }> | undefined,
      ),
    };
  },
  ["stock-snapshot-history-v1"],
  { revalidate: 300 },
);

/** Every day we wrote a call for this stock, oldest first. */
export const getStockCallHistory = unstable_cache(
  async (instrumentId: string): Promise<CallRecord[]> => {
    const docId = instrumentId.trim().toUpperCase();
    if (!docId) return [];
    const snap = await adminFirestore
      .collection("tm_directive_history")
      .doc(docId)
      .collection("calls")
      .orderBy("generated_at", "desc")
      .limit(400)
      .get()
      .catch(() => null);
    if (!snap) return [];
    return snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const price = data.price_at_call;
        return {
          date: String(data.generated_at || doc.id).slice(0, 10),
          stance: String(data.stance || ""),
          text: typeof data.text === "string" ? data.text : null,
          priceAtCall: typeof price === "number" && Number.isFinite(price) ? price : null,
        };
      })
      .reverse();
  },
  ["stock-call-history-v1"],
  { revalidate: 900 },
);

/** Past and scheduled earnings dates from the calendar, oldest first. */
export const getStockEarningsDates = unstable_cache(
  async (market: string, ticker: string): Promise<EarningsEvent[]> => {
    const upper = ticker.trim().toUpperCase();
    if (!upper) return [];
    const snap = await adminFirestore
      .collection("tm_earnings_events")
      .where("ticker", "==", upper)
      .get()
      .catch(() => null);
    if (!snap) return [];
    return snap.docs
      .map((doc) => doc.data() as EarningsEvent)
      .filter((event) => event.market === market && /^\d{4}-\d{2}-\d{2}/.test(String(event.event_date)))
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
  },
  ["stock-earnings-dates-v1"],
  { revalidate: 6 * 3600 },
);

/** Every disclosed congressional trade we hold in this ticker, newest first. */
export const getStockCongressTrades = unstable_cache(
  async (ticker: string): Promise<PowerTrade[]> => {
    const upper = ticker.trim().toUpperCase();
    if (!upper) return [];
    const snap = await adminFirestore
      .collection("tm_power_trades")
      .where("ticker", "==", upper)
      .get()
      .catch(() => null);
    if (!snap) return [];
    return snap.docs
      .map((doc) => doc.data() as PowerTrade)
      .filter((trade) => /^\d{4}-\d{2}-\d{2}/.test(String(trade.transaction_date)))
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      .slice(0, 200);
  },
  ["stock-congress-trades-v1"],
  { revalidate: 900 },
);
