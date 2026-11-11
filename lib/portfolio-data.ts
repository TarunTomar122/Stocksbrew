import { unstable_cache } from "next/cache";

import { benchmarkForDay } from "@/lib/benchmark-day";
import { getEarnings } from "@/lib/earnings";
import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getMarketsData } from "@/lib/markets";
import { datedPrice, onOneDay, type DatedPrice } from "@/lib/portfolio-prices";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import {
  FUNDS_SECTOR,
  buildPortfolio,
  type DailySeries,
  type EarningsDate,
  type HoldingInput,
  type Portfolio,
  type PortfolioRowInput,
} from "@/lib/portfolio-shared";

/**
 * Server-side inputs for the Portfolio page: a year and a half of adjusted
 * closes per ticker (`tm_price_history_daily`, written by
 * `backend/agentdata/prices.py`) and the next earnings date per ticker
 * (`tm_earnings_events`). Read-only.
 */

export const BENCHMARK_SYMBOL = "SPY";
export { FUNDS_SECTOR };
/** Enough for a 252-day window plus "since saved" lookbacks of about 18 months. */
const SERIES_POINTS = 400;

type RawSeries = { dates?: unknown; closes?: unknown };

async function loadSeriesUncached(symbol: string): Promise<DailySeries | null> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  if (!doc.exists) return null;
  const raw = doc.data() as RawSeries;
  const dates = Array.isArray(raw.dates) ? raw.dates : [];
  const closes = Array.isArray(raw.closes) ? raw.closes : [];
  const n = Math.min(dates.length, closes.length);
  const out: DailySeries = { dates: [], closes: [] };
  for (let i = Math.max(0, n - SERIES_POINTS); i < n; i++) {
    const date = dates[i];
    const close = closes[i];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.dates.push(date);
      out.closes.push(close);
    }
  }
  return out.dates.length > 1 ? out : null;
}

// The series gains one point a day.
const loadSeries = unstable_cache(loadSeriesUncached, ["portfolio-daily-series-v1"], { revalidate: 3 * 3600 });

export async function loadDailySeries(tickers: string[]): Promise<Map<string, DailySeries>> {
  const unique = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const loaded = await Promise.all(unique.map((ticker) => loadSeries(ticker).catch(() => null)));
  const out = new Map<string, DailySeries>();
  unique.forEach((ticker, index) => {
    const series = loaded[index];
    if (series) out.set(ticker, series);
  });
  return out;
}

export function newYorkToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function loadUpcomingEarningsUncached(today: string): Promise<Array<[string, EarningsDate]>> {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 120 * 86_400_000).toISOString().slice(0, 10);
  const events = await getEarnings("US", today, end);
  const first = new Map<string, EarningsDate>();
  for (const event of events) {
    const ticker = String(event.ticker || "").toUpperCase();
    if (!ticker || !event.event_date || first.has(ticker)) continue; // events arrive ordered by date
    const time = event.time === "bmo" || event.time === "amc" || event.time === "during" ? event.time : null;
    first.set(ticker, { date: event.event_date, time });
  }
  return [...first.entries()];
}

const loadUpcomingEarnings = unstable_cache(loadUpcomingEarningsUncached, ["portfolio-upcoming-earnings-v1"], {
  revalidate: 1800,
});

/** Next scheduled report per ticker, from the earnings calendar. */
export async function loadNextEarnings(today: string): Promise<Map<string, EarningsDate>> {
  return new Map(await loadUpcomingEarnings(today).catch(() => []));
}

export async function loadPortfolio(input: {
  rows: PortfolioRowInput[];
  holdings?: Record<string, HoldingInput | undefined> | null;
  now?: Date;
}): Promise<Portfolio> {
  const today = newYorkToday(input.now);
  const holdingTickers = input.rows.filter((row) => row.kind === "holding").map((row) => row.ticker);
  const [series, earnings] = await Promise.all([
    holdingTickers.length > 0
      ? loadDailySeries([...holdingTickers, BENCHMARK_SYMBOL])
      : Promise.resolve(new Map<string, DailySeries>()),
    loadNextEarnings(today),
  ]);
  return buildPortfolio({
    rows: input.rows,
    holdings: input.holdings,
    earnings,
    series,
    benchmark: series.get(BENCHMARK_SYMBOL) ?? null,
    today,
  });
}

/* ── the example shown to visitors ───────────────────────────────────────── */

/**
 * A made-up set of positions priced with real quotes. Shares and save dates
 * are invented; each cost is the stored close on its save date, so the gain in
 * the header and the "since added" figures tell the same story. Price and
 * day change are the quotes the stock pages and the screener show
 * (lib/portfolio-prices.ts); earnings dates, beta and volatility come from the
 * same stored data as a real portfolio.
 */
const EXAMPLE: Array<{
  ticker: string;
  name: string;
  sector: string;
  kind: "holding" | "watchlist";
  shares?: number;
  savedAt?: string;
}> = [
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", kind: "holding", shares: 30, savedAt: "2026-02-03" },
  { ticker: "AAPL", name: "Apple", sector: "Technology", kind: "holding", shares: 55, savedAt: "2026-02-03" },
  { ticker: "NVDA", name: "Nvidia", sector: "Technology", kind: "holding", shares: 80, savedAt: "2026-03-17" },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", kind: "holding", shares: 28, savedAt: "2026-03-17" },
  { ticker: "COST", name: "Costco", sector: "Consumer Staples", kind: "holding", shares: 7, savedAt: "2026-05-11" },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", kind: "holding", shares: 60, savedAt: "2026-05-11" },
  { ticker: "UNH", name: "UnitedHealth", sector: "Health Care", kind: "holding", shares: 12, savedAt: "2026-06-22" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", sector: FUNDS_SECTOR, kind: "holding", shares: 40, savedAt: "2026-02-03" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", sector: FUNDS_SECTOR, kind: "holding", shares: 30, savedAt: "2026-05-11" },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Technology", kind: "watchlist" },
  { ticker: "LLY", name: "Eli Lilly", sector: "Health Care", kind: "watchlist" },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrials", kind: "watchlist" },
];

export type ExamplePortfolio = {
  portfolio: Portfolio;
  /** New York day the example is priced on (the quotes' day), YYYY-MM-DD. */
  pricesAsOf: string | null;
  /** S&P 500 move on that day, from the same quotes, or null when it is from another day. */
  marketPct: number | null;
};

/**
 * Dated prices for a set of tickers from the quotes the stock pages and the
 * screener read: the screener snapshot, else the markets page's fund quotes,
 * else the latest quote. Tickers with none are missing from the map.
 */
export async function loadDatedPrices(tickers: string[]): Promise<Map<string, DatedPrice>> {
  const wanted = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  // All three sources for every ticker, so the newest session wins (datedPrice): a day-old
  // snapshot during market hours must not beat the live quote the stock page shows.
  const [rows, markets, quotes] = await Promise.all([
    getScreenerRows(wanted).catch(() => new Map<string, ScreenerRow>()),
    getMarketsData().catch(() => null),
    getLatestPriceQuotes(wanted.map((ticker) => `US_${ticker}`)).catch(() => new Map()),
  ]);
  const assetOf = new Map((markets?.assets ?? []).filter((asset) => asset.symbol).map((asset) => [asset.symbol.toUpperCase(), asset]));
  const out = new Map<string, DatedPrice>();
  for (const ticker of wanted) {
    const price = datedPrice({ snapshot: rows.get(ticker), market: assetOf.get(ticker), quote: quotes.get(`US_${ticker}`) });
    if (price) out.set(ticker, price);
  }
  return out;
}

/** The series cut at `day`, so the analytics never run past the prices on screen. */
function upTo(series: DailySeries, day: string | null): DailySeries {
  if (!day) return series;
  const n = Math.min(series.dates.length, series.closes.length);
  let end = n;
  while (end > 0 && series.dates[end - 1]! > day) end--;
  return end === n ? series : { dates: series.dates.slice(0, end), closes: series.closes.slice(0, end) };
}

function closeOnOrAfter(series: DailySeries | undefined, day: string): number | null {
  if (!series) return null;
  for (let i = 0; i < Math.min(series.dates.length, series.closes.length); i++) {
    if (series.dates[i]! >= day) return series.closes[i]!;
  }
  return null;
}

async function loadExamplePortfolioUncached(): Promise<ExamplePortfolio | null> {
  const today = newYorkToday();
  const tickers = EXAMPLE.map((item) => item.ticker);
  const [quoted, rawSeries, earnings] = await Promise.all([
    loadDatedPrices([...tickers, BENCHMARK_SYMBOL]),
    loadDailySeries([...tickers, BENCHMARK_SYMBOL]),
    loadNextEarnings(today),
  ]);
  const { day, prices } = onOneDay(quoted);
  const series = new Map([...rawSeries].map(([ticker, history]) => [ticker, upTo(history, day)]));
  const rows: PortfolioRowInput[] = [];
  const holdings: Record<string, HoldingInput> = {};
  for (const item of EXAMPLE) {
    const quote = prices.get(item.ticker);
    if (!quote) continue; // no dated price: leave the row out rather than invent one
    const id = `US_${item.ticker}`;
    rows.push({
      instrument_id: id,
      ticker: item.ticker,
      name: item.name,
      sector: item.sector,
      kind: item.kind,
      price: quote.price,
      day_change_pct: quote.dayPct,
      stance: null,
    });
    if (item.kind === "holding") {
      const cost = item.savedAt ? closeOnOrAfter(series.get(item.ticker), item.savedAt) : null;
      holdings[id] = {
        quantity: item.shares,
        average_cost: cost !== null ? Math.round(cost * 100) / 100 : null,
        updated_at: item.savedAt,
      };
    }
  }
  if (rows.filter((row) => row.kind === "holding").length < 3) return null;
  const portfolio = buildPortfolio({
    rows,
    holdings,
    earnings,
    series,
    benchmark: series.get(BENCHMARK_SYMBOL) ?? null,
    today,
  });
  // One S&P 500 figure per day across the site: the markets page's S&P 500 when it is from this day, else SPY's.
  const [spyRows, markets] = await Promise.all([
    getScreenerRows([BENCHMARK_SYMBOL]).catch(() => new Map<string, ScreenerRow>()),
    getMarketsData().catch(() => null),
  ]);
  const sp500 = markets?.assets.find((asset) => asset.id === "sp500") ?? null;
  const bench = benchmarkForDay(spyRows.get(BENCHMARK_SYMBOL) ?? null, day, sp500);
  const marketPct = typeof bench?.day_pct === "number" && Number.isFinite(bench.day_pct) ? bench.day_pct : null;
  return { portfolio, pricesAsOf: day, marketPct };
}

export const loadExamplePortfolio = unstable_cache(loadExamplePortfolioUncached, ["portfolio-example-v2"], {
  revalidate: 600,
});
