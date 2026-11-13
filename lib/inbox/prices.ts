import type { InboxItem } from "@/lib/inbox/types";
import { withLivePrices, type LivePrice } from "@/lib/wire-prices";

/** A stock row's price as the inbox shows it: the price, and the session's day when the quote is not from today. */
export type RowPrice = { price: number; day: string | null };

/** Whether an item reports a price move (an agent's move or level, or a report's move): its row shows the price. */
export function showsMove(item: Pick<InboxItem, "move" | "result">): boolean {
  return Boolean(item.move) || (item.result?.movePct !== null && item.result?.movePct !== undefined);
}

/**
 * The current price beside each stock's move in the inbox (owner rule 4), from the quote the stock page reads
 * (lib/wire-prices.ts withLivePrices: today's quote, or an earlier session's with its day; none when unsure). Only the
 * stocks whose rows report a move, so the page sends no prices it does not draw.
 */
export function rowPrices(items: readonly InboxItem[], live: ReadonlyMap<string, LivePrice>, now: number | Date = Date.now()): Record<string, RowPrice> {
  const tickers = new Set<string>();
  for (const item of items) {
    const lead = item.tickers[0]?.toUpperCase();
    if (lead && showsMove(item)) tickers.add(lead);
  }
  const out: Record<string, RowPrice> = {};
  for (const row of withLivePrices([...tickers].map((ticker) => ({ ticker, pct: null })), live, now)) {
    if (row.price !== null) out[row.ticker] = { price: row.price, day: row.priceDay };
  }
  return out;
}
