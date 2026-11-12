import { getMarketSessionState } from "@/lib/market-session";
import { getLivePremarketQuote, getPremarketMovers } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { futuresCues, hasTodaysPremarket, premarketInputFrom } from "@/lib/premarket-read";
import { marketDateIso } from "@/lib/premarket-shared";

/**
 * This morning's premarket moves for a list of tickers, plus the S&P 500's (SPY's premarket price, else S&P 500
 * futures), for the weekly memo chart's dotted leg before the open. Answers `{ live: false }` outside 4:00-9:30 ET on
 * a trading day, or when today's quotes are not in yet. Public premarket prices only; nothing about the asker.
 *
 * Without `tickers` it answers only whether this morning's premarket is in (`{ live }`, the same rule /premarket
 * uses), so the nav shows Premarket only when the page has today's numbers. Cached at the edge for a minute.
 */

export const dynamic = "force-dynamic";

const MAX_TICKERS = 200;
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
/** The page never waits on this, but the route still gives up on a slow read rather than hold a connection. */
const READ_TIMEOUT_MS = 2500;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
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

function json(body: unknown, maxAge: number) {
  return Response.json(body, { headers: { "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` } });
}

export async function GET(request: Request) {
  const now = new Date();
  if (getMarketSessionState(now).kind !== "premarket") return json({ live: false }, 60);
  const params = new URL(request.url).searchParams;
  const asked = params.has("tickers");
  const raw = params.get("tickers") ?? "";
  const tickers = [...new Set(raw.split(",").map((t) => t.trim().toUpperCase()).filter((t) => TICKER.test(t)))].slice(0, MAX_TICKERS);
  if (asked && tickers.length === 0) return json({ live: false }, 60);

  const [movers, report] = await Promise.all([
    within(getPremarketMovers("US"), READ_TIMEOUT_MS),
    within(getPremarketOpeningReport(), READ_TIMEOUT_MS),
  ]);
  const today = marketDateIso("US", now);
  if (!asked) {
    // The page's own rule (app/(app)/premarket/page.tsx), so the nav never offers a page that would send you away.
    return json({ live: hasTodaysPremarket(premarketInputFrom(report, movers), now) }, 60);
  }

  const stocks: Record<string, number> = {};
  for (const ticker of tickers) {
    const quote = getLivePremarketQuote(movers, ticker, "US", now);
    if (quote) stocks[ticker] = quote.changePct;
  }
  // No live stock quotes, no leg: the S&P 500 alone is not drawn.
  if (!movers || Object.keys(stocks).length === 0) return json({ live: false }, 60);
  const at = movers.generated_at;

  let sp500: { pct: number; source: "SPY" | "futures" } | null = null;
  const spy = getLivePremarketQuote(movers, "SPY", "US", now);
  if (spy) sp500 = { pct: spy.changePct, source: "SPY" };
  else if (report) {
    const sameDay = (iso: string | undefined) => Boolean(iso) && Number.isFinite(Date.parse(iso!)) && marketDateIso("US", new Date(iso!)) === today;
    const es = futuresCues(report.global_cues).find((cue) => cue.id.toUpperCase().endsWith("_ES") || cue.ticker.toUpperCase().startsWith("ES="));
    if (es && sameDay(report.generated_at) && sameDay(es.captured_at ?? report.generated_at)) sp500 = { pct: es.change_pct, source: "futures" };
  }
  return json({ live: true, at, stocks, sp500 }, 60);
}
