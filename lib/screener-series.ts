import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { readPriceTail } from "@/lib/price-tail";
import { cleanSeries, type ChartPoint } from "@/lib/stock-chart";

/**
 * Full adjusted daily closes for a handful of symbols, for the basket chart
 * and the compare overlay. One document per symbol in
 * `tm_price_history_daily` (written by backend/agentdata/prices.py), cached
 * per symbol because the series only gains one point a day.
 */

type RawDailyDoc = { dates?: string[]; closes?: number[]; source?: string; fetched_at?: string };

export type CompactSeries = { dates: string[]; closes: number[]; source: string; fetchedAt: string | null };

const SOURCE_LABELS: Record<string, string> = { yahoo_chart: "Yahoo Finance" };

async function readSeries(symbol: string): Promise<CompactSeries | null> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  if (!doc.exists) return null;
  return compactSeriesFromRaw(doc.data() as RawDailyDoc);
}

/** One symbol's series from its raw doc. Pure: the stock page's serving doc (lib/serve) runs it on its own copy. */
export function compactSeriesFromRaw(raw: RawDailyDoc): CompactSeries | null {
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

/**
 * How many sessions the recent read keeps: enough for the readers that use it (a year of closes for the 52-week
 * high, 60 sessions of daily moves, the last few weeks of crossings), with room to spare.
 */
export const RECENT_SESSIONS = 400;

/** The last `count` points of a compact series (the series itself when it is that short). */
export function lastPoints(series: CompactSeries, count: number): CompactSeries {
  if (series.dates.length <= count) return series;
  return { ...series, dates: series.dates.slice(-count), closes: series.closes.slice(-count) };
}

/**
 * One symbol's last RECENT_SESSIONS points, exactly the end of what readSeries returns. From the small tail
 * (lib/price-tail.ts) when it holds the whole history, or holds at least that many points of a history whose dates
 * all run forward (then cleaning the tail gives the end of cleaning the history); else from the history itself.
 */
async function readRecentSeries(symbol: string): Promise<CompactSeries | null> {
  const tail = await readPriceTail(symbol);
  if (tail === null) return null;
  if (tail) {
    const compact = compactSeriesFromRaw({
      dates: tail.dates as string[],
      closes: tail.closes as number[],
      source: tail.source as string | undefined,
      fetched_at: tail.fetchedAt as string | undefined,
    });
    if (tail.from === 0) return compact ? lastPoints(compact, RECENT_SESSIONS) : null;
    if (tail.ordered && compact && compact.dates.length >= RECENT_SESSIONS) return lastPoints(compact, RECENT_SESSIONS);
  }
  const full = await getSeriesCached(symbol);
  return full ? lastPoints(full, RECENT_SESSIONS) : null;
}

const getRecentSeriesCached = unstable_cache(readRecentSeries, ["screener-recent-series-v1"], { revalidate: 3 * 3600 });

/**
 * getDailySeries, cut to each symbol's last RECENT_SESSIONS points, for readers that never look further back.
 * Reads the ~14 KB tails instead of the ~60 KB histories.
 */
export async function getRecentDailySeries(symbols: readonly string[]): Promise<DailySeriesSet> {
  return dailySeriesSet(symbols, (symbol) => getRecentSeriesCached(symbol).catch(() => null));
}

/**
 * `preloaded` holds series the caller already has (the stock page's serving doc), by upper-case symbol; those are not
 * read again. A null there means "read it as usual".
 */
export async function getDailySeries(
  symbols: readonly string[],
  preloaded?: Readonly<Record<string, CompactSeries | null | undefined>>,
): Promise<DailySeriesSet> {
  return dailySeriesSet(symbols, (symbol) => preloaded?.[symbol] ?? getSeriesCached(symbol).catch(() => null));
}

async function dailySeriesSet(
  symbols: readonly string[],
  load: (symbol: string) => CompactSeries | null | Promise<CompactSeries | null>,
): Promise<DailySeriesSet> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 40);
  const loaded = await Promise.all(unique.map(load));
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
