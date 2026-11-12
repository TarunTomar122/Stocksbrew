import popularFunds from "@/backend/config/popular_funds.json";

/**
 * The popular US funds we cover as funds (backend/config/popular_funds.json, the
 * same list the backend registers, prices and reads holdings for). No store
 * reads here, so the browser and the server can both use it; the full set of
 * funds we know about, held ones included, is `getFundCatalog` in
 * lib/funds/server.ts.
 */

export type FundListing = { ticker: string; name: string };

export const POPULAR_FUNDS: readonly FundListing[] = popularFunds.funds.map((row) => ({
  ticker: row.ticker.trim().toUpperCase(),
  name: row.name.trim(),
}));

const BY_TICKER = new Map(POPULAR_FUNDS.map((fund) => [fund.ticker, fund]));

/** The popular fund behind this ticker, or null. */
export function popularFund(ticker: string | null | undefined): FundListing | null {
  return BY_TICKER.get(String(ticker ?? "").trim().toUpperCase()) ?? null;
}
