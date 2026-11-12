import { getDailySeries } from "@/lib/screener-series";
import { getScreenerRows } from "@/lib/screener";
import { getSnapshotFacts } from "@/lib/insight-data";
import { getStockSummary } from "@/lib/stock";
import { getStockLongSeries, getStockSnapshotHistory } from "@/lib/stock-events";
import { buildChartRanges, withLiveClose as liveOnHistory, type ChartPoint, type ChartRange } from "@/lib/stock-chart";
import { loadFunds } from "@/lib/xray-data";
import type { FundDoc } from "@/lib/xray";
import type { UserDoc } from "@/lib/watchlist";
import { getFundFacts, type FundFacts } from "@/lib/funds/server";
import { fundLookThrough, lastCloseQuote, navDayOf, yearReturn, type FundLookThrough, type YearReturn } from "@/lib/funds/view";

/**
 * Everything the fund page shows, read side by side: the live quote (or, when
 * the price job has not quoted the fund yet, its last stored close), the daily
 * closes for the chart and the year against SPY, the fund's facts
 * (tm_fund_facts) and its holdings (tm_etf_holdings). Each read degrades to
 * "no data"; nothing here is estimated.
 */

export type FundQuote = {
  price: number;
  changeAbs: number | null;
  changePct: number | null;
  /** ISO time of a live quote, or null when the price is a stored close. */
  capturedAt: string | null;
  /** The close's day when the price is a stored close. */
  closeDate: string | null;
};

export type FundPageData = {
  ticker: string;
  instrumentId: string;
  name: string;
  quote: FundQuote | null;
  chart: { ranges: ChartRange[]; asOf: string | null } | null;
  facts: FundFacts | null;
  /** A mutual fund: one price a day (its NAV), no intraday quote. */
  dailyPriced: boolean;
  year: YearReturn | null;
  holdings: { doc: FundDoc | null; inside: FundLookThrough };
};

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

function etDay(iso: string | null | undefined): string | null {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? ET_DAY.format(new Date(ms)) : null;
}

function withLiveClose(series: ChartPoint[] | null, day: string | null, price: number | null | undefined): ChartPoint[] | null {
  if (!series?.length || !day || typeof price !== "number" || !Number.isFinite(price) || price <= 0) return series;
  const last = series[series.length - 1]!;
  if (day < last.date) return series;
  return day === last.date ? [...series.slice(0, -1), { date: day, close: price }] : [...series, { date: day, close: price }];
}

/** The fund's holdings with the names and sectors the rest of the app uses, and the S&P 500 sector weights. */
async function insideContext(doc: FundDoc | null) {
  const tickers = doc ? [...new Set(doc.holdings.map((row) => row.ticker).filter((t): t is string => Boolean(t)))] : [];
  const [rows, snapshot] = await Promise.all([
    tickers.length ? getScreenerRows(tickers).catch(() => new Map()) : Promise.resolve(new Map()),
    getSnapshotFacts([]).catch(() => ({ sectorOf: {}, spSectorWeights: {} as Record<string, number>, priceDay: null })),
  ]);
  const sectorOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  for (const [symbol, row] of rows) {
    if (row.sector) sectorOf[symbol] = row.sector;
    if (row.name) nameOf[symbol] = row.name;
  }
  return { sectorOf, nameOf, benchmarkSectors: snapshot.spSectorWeights };
}

async function loadHoldings(ticker: string): Promise<FundDoc | null> {
  const docs = await loadFunds([ticker]).catch(() => ({}) as Record<string, FundDoc>);
  return docs[ticker] ?? null;
}

export async function loadFundPage(ticker: string, fallbackName: string): Promise<FundPageData> {
  const upper = ticker.trim().toUpperCase();
  const instrumentId = `US_${upper.replace(/\./g, "_")}`;
  const [summary, spySummary, facts, doc, longSeries, daily] = await Promise.all([
    getStockSummary(upper, "US").catch(() => null),
    getStockSummary("SPY", "US").catch(() => null),
    getFundFacts(upper).catch(() => null),
    loadHoldings(upper),
    getStockLongSeries(upper).catch(() => null),
    getDailySeries([upper, "SPY"]).catch(() => null),
  ]);
  const closes = daily?.series[upper] ?? null;

  // A mutual fund has one price a day, its NAV: shown as that day's close, never as a live quote.
  const navOnly = facts?.quoteType === "MUTUALFUND";
  let quote: FundQuote | null = null;
  if (summary && Number.isFinite(summary.price) && summary.price > 0) {
    const navDay = navOnly ? navDayOf(summary.captured_at) : null;
    quote = {
      price: summary.price,
      changeAbs: Number.isFinite(summary.day_change_abs) ? (summary.day_change_abs as number) : null,
      changePct: Number.isFinite(summary.day_change_pct) ? (summary.day_change_pct as number) : null,
      capturedAt: navDay ? null : summary.captured_at ?? null,
      closeDate: navDay,
    };
  } else {
    const close = lastCloseQuote(closes);
    if (close) quote = { price: close.price, changeAbs: close.changeAbs, changePct: close.changePct, capturedAt: null, closeDate: close.date };
  }

  // Today's quote on the whole history, then the ranges cut from it (lib/stock-chart.ts withLiveClose).
  const history = longSeries?.closes.length ? longSeries.closes : ((await getStockSnapshotHistory(instrumentId).catch(() => null))?.closes ?? []);
  const ranges = buildChartRanges(quote?.capturedAt ? liveOnHistory(history, etDay(quote.capturedAt), quote.price) : history);

  const context = await insideContext(doc);
  const inside = fundLookThrough({ doc, ...context, yahooSectors: facts?.sectorWeights ?? null });

  return {
    ticker: upper,
    instrumentId,
    name: facts?.name && fallbackName === upper ? facts.name : fallbackName,
    quote,
    chart: ranges.length ? { ranges, asOf: longSeries?.lastDate ?? null } : null,
    facts,
    dailyPriced: navOnly,
    // Today's quotes on the end of both series, as the chart has, so the card's year matches the chart's 1Y.
    year: yearReturn(
      withLiveClose(closes, etDay(quote?.capturedAt) ?? quote?.closeDate ?? null, quote?.price),
      withLiveClose(daily?.series.SPY ?? null, etDay(spySummary?.captured_at), spySummary?.price),
      ranges.find((range) => range.key === "1Y")?.fromDate ?? null,
    ),
    holdings: { doc, inside },
  };
}

/** Tickers this person holds directly (their holdings, not their watchlist), funds and all; the overlap keeps only companies. */
export function directHoldings(userDoc: UserDoc | null): string[] {
  if (!userDoc) return [];
  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const kinds = userDoc.watchlist_positions ?? {};
  return [
    ...new Set(
      tracked
        .filter((id) => kinds[id] === "holding" && id.toUpperCase().startsWith("US_"))
        .map((id) => id.slice(3).toUpperCase().replace(/_/g, ".")),
    ),
  ];
}

/** The overlap with what this person holds, from the same cached reads as the page. */
export async function loadFundOverlap(ticker: string, direct: readonly string[]): Promise<FundLookThrough["overlap"]> {
  if (!direct.length) return null;
  const doc = await loadHoldings(ticker.trim().toUpperCase());
  if (!doc) return null;
  const context = await insideContext(doc);
  return fundLookThrough({ doc, ...context, direct }).overlap;
}
