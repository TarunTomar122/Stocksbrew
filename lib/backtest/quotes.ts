import { loadDatedPrices } from "@/lib/portfolio-data";

import type { GatedBacktestResponse } from "./gated";

/** A holding's price now and its move today, for the holding cards under a backtest (owner rule 4: price beside the move). */
export type HoldingQuote = { price: number; dayPct: number | null };

/** How long the cards may wait for prices before the result goes out without them. */
const QUOTES_MS = 1200;

/**
 * Today's price and move for each holding of a run, from the same quotes the stock pages show. Slow or failed, the
 * result goes without them (the cards then show only the test's figures): a backtest never waits on a quote.
 */
export async function holdingQuotes(symbols: readonly string[]): Promise<Record<string, HoldingQuote>> {
  const wanted = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  if (wanted.length === 0) return {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), QUOTES_MS);
  });
  const prices = await Promise.race([loadDatedPrices(wanted).catch(() => null), late]).finally(() => clearTimeout(timer));
  const out: Record<string, HoldingQuote> = {};
  for (const [symbol, quote] of prices ?? []) {
    if (Number.isFinite(quote.price) && quote.price > 0) out[symbol] = { price: quote.price, dayPct: quote.dayPct };
  }
  return out;
}

/** The tickers a setup names, read before the run so the quotes can load beside it rather than after it. */
export function setupSymbols(input: unknown): string[] {
  const holdings = input && typeof input === "object" ? (input as { holdings?: unknown }).holdings : null;
  if (!Array.isArray(holdings)) return [];
  return holdings.flatMap((item) => (item && typeof item === "object" && typeof (item as { symbol?: unknown }).symbol === "string" ? [(item as { symbol: string }).symbol] : []));
}

/** A run that went through, with each of its holdings' prices today (only the ones it holds) for the cards. */
export function withQuotes(response: GatedBacktestResponse, quotes: Record<string, HoldingQuote>): GatedBacktestResponse {
  if (!response.ok) return response;
  const held = Object.fromEntries(
    response.result.holdings.flatMap((holding) => {
      const quote = quotes[holding.symbol.toUpperCase()];
      return quote ? [[holding.symbol.toUpperCase(), quote] as const] : [];
    }),
  );
  return { ...response, quotes: held };
}
