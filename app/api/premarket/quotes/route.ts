import { premarketSp500, within } from "@/lib/briefing-premarket-server";
import { getMarketSessionState } from "@/lib/market-session";
import { getLivePremarketQuote, getPremarketMovers } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { hasTodaysPremarket, premarketInputFrom } from "@/lib/premarket-read";

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
  const sp500 = premarketSp500(movers, report, now);
  return json({ live: true, at, stocks, sp500 }, 60);
}
