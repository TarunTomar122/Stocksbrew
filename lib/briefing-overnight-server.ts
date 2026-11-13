import { getMarketSessionState } from "@/lib/market-session";
import { getExtendedQuotes } from "@/lib/extended-quotes-server";
import type { ExtendedQuote } from "@/lib/extended-quotes";

/**
 * The stored extended quotes for the briefing's Overnight strip (lib/briefing-overnight.ts builds it once the page
 * knows which stocks other modules already show), or null: only outside the regular session (the strip is gone once
 * it opens). One cached read; a slow or failed read leaves the strip out.
 */
export async function loadOvernightQuotes(tickers: readonly string[], now: Date = new Date()): Promise<Map<string, ExtendedQuote> | null> {
  if (tickers.length === 0 || getMarketSessionState(now).kind === "open") return null;
  return getExtendedQuotes(tickers);
}
