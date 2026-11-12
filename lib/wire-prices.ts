import { dayWords, etDayOf, etToday } from "@/lib/day-words";

/**
 * Today's price and move on every stock card and row on the News page (owner rule 4: a stock card shows its current
 * price beside its move). The wire's own quotes come from the market snapshot, which can still hold yesterday's move
 * before it is rebuilt; these come from each stock's latest price, the quote the stock page itself reads
 * (lib/stock.ts getStockSummary: tm_latest_prices, timed by `captured_at`, else `updated_at`). Pure; the read is
 * lib/wire-prices-server.ts.
 */

/** How far ahead of now a quote's time may be (clock drift) before it counts as no quote at all. */
const FUTURE_SLACK_MS = 5 * 60_000;

/** A stock's latest quote: its price, that quote's own move (null when it has none) and when it was taken. */
export type LivePrice = { price: number; pct: number | null; at: string | null };

/**
 * Each row with its live price, the price and the move always from the same quote (council, Nov 12):
 * - a quote from today (New York): its price and its own move; a quote with no move shows the price alone, never the
 *   snapshot's move beside it;
 * - a quote from an earlier day: the price with that session's own move and its day ("$37.53 −7.7% yesterday"), so
 *   neither reads as today's; with no move in that quote, no price at all;
 * - no quote, one without a readable time, or one timed more than five minutes ahead of now: no price, and the row
 *   keeps the move it came with.
 */
export function withLivePrices<T extends { ticker: string; pct: number | null }>(
  rows: readonly T[],
  live: ReadonlyMap<string, LivePrice>,
  now: number | Date = Date.now(),
): Array<T & { price: number | null; priceDay: string | null }> {
  const today = etToday(now);
  const nowMs = typeof now === "number" ? now : now.getTime();
  return rows.map((row) => {
    const quote = live.get(row.ticker);
    const day = quote?.at ? etDayOf(quote.at) : null;
    // A quote stamped more than a few minutes ahead of now is a bad time, not a price from the future: no quote.
    const future = quote?.at ? Date.parse(quote.at) - nowMs > FUTURE_SLACK_MS : false;
    if (!quote || !day || future) return { ...row, price: null, priceDay: null };
    if (day === today) return { ...row, price: quote.price, pct: quote.pct, priceDay: null };
    // An earlier session's price comes with that session's move and its day, or not at all (owner rule 4).
    if (quote.pct === null) return { ...row, price: null, priceDay: null };
    return { ...row, price: quote.price, pct: quote.pct, priceDay: dayWords(day, today) || null };
  });
}

/** One stored quote document (tm_latest_prices) to a price we will show, or null when it is not a real price. */
export function livePriceOf(
  doc: { quote?: { current?: unknown; day_change_pct?: unknown } | null; captured_at?: unknown; updated_at?: unknown } | null | undefined,
): LivePrice | null {
  const quote = doc?.quote;
  const price = typeof quote?.current === "number" && Number.isFinite(quote.current) && quote.current > 0 ? quote.current : null;
  if (price === null) return null;
  const pct = typeof quote?.day_change_pct === "number" && Number.isFinite(quote.day_change_pct) ? quote.day_change_pct : null;
  // The stock page's price time: when the quote was taken, else when its document was written.
  const at = [doc?.captured_at, doc?.updated_at].find((value): value is string => typeof value === "string" && value.trim() !== "") ?? null;
  return { price, pct, at };
}
