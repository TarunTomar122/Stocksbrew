import { getInstrumentIdsThatExist, getLatestPriceQuotes } from "@/lib/firestore";
import { fundKindOf } from "@/lib/funds/tickers";
import { getSeoStockPage } from "@/lib/seo/stock-pages";
import { hasStockPage, normalizedTicker as normalized, type StockPageSet } from "@/lib/stock-page-set-shared";

export { hasStockPage, type StockPageSet };

/** Whether a page exists changes slowly (a new listing, a dead one): each answer is kept this long per instance. */
const MEMO_MS = 10 * 60_000;
const MEMO_MAX = 5_000;
const memo = new Map<string, { has: boolean; at: number }>();

/**
 * Which of these tickers have a stock page that answers 200, so a list of
 * filings (13F holdings, congress trades) links only those and prints the rest
 * as plain text. Since at least Nov 14 every /follow page linked each traded
 * ticker, and about a quarter of them (ADP, KKR, FIS, O, ...) were 404s that
 * Bingbot, Googlebot and people kept following.
 *
 * The same rule as the stock page's 404 check (app/(app)/stock/[symbol]):
 * the 500-company catalogue, any US fund ticker (a fund page, or the page that
 * says we are adding it), else an instrument and a latest price with a current quote (getStockSummary). The price alone is not
 * enough: the heatmap prices all of the S&P 500, and on Nov 26 SBUX, ADP and MNST had a quote and no page. Only the US
 * market is read: filings are US listings. A page it misses (India only, an
 * alias) is printed instead of linked, never the other way round. `null` when
 * the store could not be read: then everything stays linked rather than
 * unlinking real pages on a guess.
 */
export async function stockPagesAmong(tickers: Iterable<string | null | undefined>, now: number = Date.now()): Promise<StockPageSet> {
  const pages = new Set<string>();
  const toRead = new Set<string>();
  for (const raw of tickers) {
    const ticker = normalized(raw);
    if (!ticker || pages.has(ticker) || toRead.has(ticker)) continue;
    if (getSeoStockPage(ticker) || fundKindOf(ticker)) {
      pages.add(ticker);
      continue;
    }
    const known = memo.get(ticker);
    if (known && now - known.at < MEMO_MS) {
      if (known.has) pages.add(ticker);
    } else toRead.add(ticker);
  }
  if (toRead.size === 0) return pages;
  try {
    const ids = [...toRead].map((ticker) => `US_${ticker}`);
    const [quotes, instruments] = await Promise.all([getLatestPriceQuotes(ids), getInstrumentIdsThatExist(ids)]);
    if (memo.size > MEMO_MAX) memo.clear();
    for (const ticker of toRead) {
      const has = typeof quotes.get(`US_${ticker}`)?.quote?.current === "number" && instruments.has(`US_${ticker}`);
      memo.set(ticker, { has, at: now });
      if (has) pages.add(ticker);
    }
    return pages;
  } catch (error) {
    console.error(`[stock-page-set] price read failed, linking every ticker: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** For tests: forget what was read. */
export function forgetStockPages(): void {
  memo.clear();
}
