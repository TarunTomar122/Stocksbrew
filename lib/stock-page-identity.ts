/**
 * Which stock the stock page's reads are started for before the stock-summary read is back
 * (components/stock-page-stream.tsx). Pure, so it can be tested without the store.
 */

export type StockIdentity = { market: "US" | "IN"; instrumentId: string; ticker: string };

/** The characters a ticker can carry (the same rule as lib/stock.ts normalizeStockSymbolParam). */
const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;

/**
 * The stock the summary read resolves to when it is found in the reader's market under the address's own ticker,
 * which is nearly every visit: lib/stock.ts getStockSummary reads `${market}_${symbol.toUpperCase()}` first. Null for
 * an address that is not a plain ticker (nothing is started for it).
 */
export function presumedStockIdentity(symbol: string, market: "US" | "IN"): StockIdentity | null {
  const ticker = symbol.toUpperCase();
  if (!TICKER_RE.test(ticker)) return null;
  return { market, instrumentId: `${market}_${ticker}`, ticker };
}

/**
 * Whether reads started for the presumed stock are the ones the resolved stock needs: same market, instrument id
 * and ticker. Anything else (the other market, a renamed ticker found by the alias lookup) starts its own reads.
 */
export function samePresumedStock(presumed: StockIdentity | null, stock: StockIdentity): boolean {
  return Boolean(
    presumed &&
      presumed.market === stock.market &&
      presumed.instrumentId === stock.instrumentId &&
      presumed.ticker === stock.ticker,
  );
}
