import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { cleanSeries, type ChartPoint } from "@/lib/stock-chart";

/**
 * Full adjusted daily closes for a handful of symbols, for the basket chart
 * and the compare overlay. One document per symbol in
 * `tm_price_history_daily` (written by backend/agentdata/prices.py), cached
 * per symbol because the series only gains one point a day.
 */

type RawDailyDoc = { dates?: string[]; closes?: number[]; source?: string; fetched_at?: string };

type CompactSeries = { dates: string[]; closes: number[]; source: string; fetchedAt: string | null };

const SOURCE_LABELS: Record<string, string> = { yahoo_chart: "Yahoo Finance" };

async function readSeries(symbol: string): Promise<CompactSeries | null> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  if (!doc.exists) return null;
  const raw = doc.data() as RawDailyDoc;
  const dates = raw.dates ?? [];
  const closes = raw.closes ?? [];
  const clean = cleanSeries(dates.map((date, index) => ({ date, close: closes[index] })));
  if (clean.length < 2) return null;
  return {
    dates: clean.map((point) => point.date),
    closes: clean.map((point) => Math.round(point.close * 10000) / 10000),
    source: SOURCE_LABELS[raw.source ?? ""] ?? "Price history",
    fetchedAt: typeof raw.fetched_at === "string" ? raw.fetched_at : null,
  };
}

const getSeriesCached = unstable_cache(readSeries, ["screener-daily-series-v1"], { revalidate: 3 * 3600 });

export type DailySeriesSet = {
  /** Oldest first. Symbols with no stored history are simply absent. */
  series: Record<string, ChartPoint[]>;
  source: string;
  /** The most recent close across the set. */
  lastDate: string | null;
};

export async function getDailySeries(symbols: readonly string[]): Promise<DailySeriesSet> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 40);
  const loaded = await Promise.all(unique.map((symbol) => getSeriesCached(symbol).catch(() => null)));
  const series: Record<string, ChartPoint[]> = {};
  let source = "Price history";
  let lastDate: string | null = null;
  unique.forEach((symbol, index) => {
    const compact = loaded[index];
    if (!compact) return;
    series[symbol] = compact.dates.map((date, i) => ({ date, close: compact.closes[i]! }));
    source = compact.source;
    const last = compact.dates[compact.dates.length - 1]!;
    if (!lastDate || last > lastDate) lastDate = last;
  });
  return { series, source, lastDate };
}
