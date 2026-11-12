import { getMarketSessionState } from "@/lib/market-session";
import { getLivePremarketQuote, getPremarketMovers } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { futuresCues } from "@/lib/premarket-read";
import { marketDateIso } from "@/lib/premarket-shared";

/**
 * This morning's premarket moves for the briefing's stocks and the S&P 500 (SPY's premarket, else S&P 500 futures),
 * the same rule as /api/premarket/quotes. Only from 4:00 ET to the open on a trading day and only with today's
 * quotes; null otherwise, and the page then shows the last close. Two cached reads with a short time limit, so a
 * slow read never holds the page.
 */

export type BriefingPremarket = {
  at: string;
  /** This morning's move per ticker, percent from the last close. */
  stocks: Record<string, number>;
  /** This morning's price per ticker, for the same tickers as `stocks`. */
  prices: Record<string, number>;
  sp500: { pct: number; source: "SPY" | "futures" } | null;
};

const READ_TIMEOUT_MS = 1200;

/** The promise's answer, or null when it fails or takes longer than `ms`: a side read never holds the page. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function briefingPremarket(tickers: readonly string[], now: Date = new Date()): Promise<BriefingPremarket | null> {
  if (getMarketSessionState(now).kind !== "premarket" || tickers.length === 0) return null;
  const [movers, report] = await Promise.all([within(getPremarketMovers("US"), READ_TIMEOUT_MS), within(getPremarketOpeningReport(), READ_TIMEOUT_MS)]);
  if (!movers) return null;
  const stocks: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const ticker of new Set(tickers.map((value) => value.trim().toUpperCase()).filter(Boolean))) {
    const quote = getLivePremarketQuote(movers, ticker, "US", now);
    if (!quote) continue;
    stocks[ticker] = quote.changePct;
    prices[ticker] = quote.price;
  }
  if (Object.keys(stocks).length === 0) return null;
  return { at: movers.generated_at, stocks, prices, sp500: premarketSp500(movers, report, now) };
}

type Movers = NonNullable<Awaited<ReturnType<typeof getPremarketMovers>>>;
type OpeningReport = Awaited<ReturnType<typeof getPremarketOpeningReport>>;

/** The S&P 500 this morning: SPY's premarket move, else today's S&P 500 futures from the opening report, else null. */
export function premarketSp500(movers: Movers, report: OpeningReport | null, now: Date): BriefingPremarket["sp500"] {
  const spy = getLivePremarketQuote(movers, "SPY", "US", now);
  if (spy) return { pct: spy.changePct, source: "SPY" };
  if (!report) return null;
  const today = marketDateIso("US", now);
  const sameDay = (iso: string | undefined) => Boolean(iso) && Number.isFinite(Date.parse(iso!)) && marketDateIso("US", new Date(iso!)) === today;
  const es = futuresCues(report.global_cues).find((cue) => cue.id.toUpperCase().endsWith("_ES") || cue.ticker.toUpperCase().startsWith("ES="));
  return es && sameDay(report.generated_at) && sameDay(es.captured_at ?? report.generated_at) ? { pct: es.change_pct, source: "futures" } : null;
}
