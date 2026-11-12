import fundTickers from "@/backend/config/us_fund_tickers.json";
import type { FundKind } from "@/lib/funds/adding";

/**
 * Every US-listed ETF and US mutual fund ticker (backend/config/us_fund_tickers.json,
 * written by backend/scripts/build_us_fund_tickers.py from Nasdaq Trader and the
 * SEC). It answers "is this a fund?" without a read, so an unknown fund can be
 * offered on demand. Server only: the file is about 160 KB, so browser code asks
 * GET /api/stock-request instead of importing this.
 */

export type { FundKind };

const ETFS = new Set(fundTickers.etfs.split(" "));
const MUTUAL_FUNDS = new Set(fundTickers.mutual_funds.split(" "));
const FUND_TICKER = /^[A-Z]{1,5}$/;

/** "etf", "mutual_fund", or null for a stock, a money market fund or anything we cannot tell. */
export function fundKindOf(ticker: string | null | undefined): FundKind | null {
  const key = String(ticker ?? "").trim().toUpperCase().replace(/^\$/, "");
  if (!FUND_TICKER.test(key)) return null;
  if (ETFS.has(key)) return "etf";
  if (MUTUAL_FUNDS.has(key)) return "mutual_fund";
  return null;
}

/** The house instrument id for a fund ticker (US_VTWO). */
export function fundInstrumentId(ticker: string): string {
  return `US_${ticker.trim().toUpperCase().replace(/\./g, "_")}`;
}
