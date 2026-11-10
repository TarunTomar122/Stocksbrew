import { unstable_cache } from "next/cache";

import { getEarnings } from "@/lib/earnings";
import { adminFirestore } from "@/lib/firebase-admin";
import {
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
 * A made-up set of positions priced with real closes. Shares, costs and save
 * dates are invented; price, day change, earnings dates, beta and volatility
 * are computed from the same stored data as a real portfolio.
 */
const EXAMPLE: Array<{
  ticker: string;
  name: string;
  sector: string;
  kind: "holding" | "watchlist";
  shares?: number;
  avgCost?: number;
  savedAt?: string;
}> = [
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", kind: "holding", shares: 30, avgCost: 402.5, savedAt: "2026-02-03" },
  { ticker: "AAPL", name: "Apple", sector: "Technology", kind: "holding", shares: 55, avgCost: 198.2, savedAt: "2026-02-03" },
  { ticker: "NVDA", name: "Nvidia", sector: "Technology", kind: "holding", shares: 80, avgCost: 118.4, savedAt: "2026-03-17" },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", kind: "holding", shares: 28, avgCost: 241.0, savedAt: "2026-03-17" },
  { ticker: "COST", name: "Costco", sector: "Consumer Staples", kind: "holding", shares: 7, avgCost: 905.0, savedAt: "2026-05-11" },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", kind: "holding", shares: 60, avgCost: 109.8, savedAt: "2026-05-11" },
  { ticker: "UNH", name: "UnitedHealth", sector: "Health Care", kind: "holding", shares: 12, avgCost: 348.0, savedAt: "2026-06-22" },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Technology", kind: "watchlist" },
  { ticker: "LLY", name: "Eli Lilly", sector: "Health Care", kind: "watchlist" },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrials", kind: "watchlist" },
];

export type ExamplePortfolio = { portfolio: Portfolio; pricesAsOf: string | null };

async function loadExamplePortfolioUncached(): Promise<ExamplePortfolio | null> {
  const today = newYorkToday();
  const [series, earnings] = await Promise.all([
    loadDailySeries([...EXAMPLE.map((item) => item.ticker), BENCHMARK_SYMBOL]),
    loadNextEarnings(today),
  ]);
  const rows: PortfolioRowInput[] = [];
  const holdings: Record<string, HoldingInput> = {};
  let pricesAsOf: string | null = null;
  for (const item of EXAMPLE) {
    const history = series.get(item.ticker);
    if (!history) continue; // no stored price: leave the row out rather than invent one
    const n = history.closes.length;
    const last = history.closes[n - 1]!;
    const prev = history.closes[n - 2]!;
    const lastDate = history.dates[n - 1]!;
    if (!pricesAsOf || lastDate > pricesAsOf) pricesAsOf = lastDate;
    const id = `US_${item.ticker}`;
    rows.push({
      instrument_id: id,
      ticker: item.ticker,
      name: item.name,
      sector: item.sector,
      kind: item.kind,
      price: last,
      day_change_pct: (last / prev - 1) * 100,
      stance: null,
    });
    if (item.kind === "holding") {
      holdings[id] = { quantity: item.shares, average_cost: item.avgCost, updated_at: item.savedAt };
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
  return { portfolio, pricesAsOf };
}

export const loadExamplePortfolio = unstable_cache(loadExamplePortfolioUncached, ["portfolio-example-v1"], {
  revalidate: 3600,
});
