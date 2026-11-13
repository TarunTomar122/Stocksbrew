import { bigExtendedMove, extendedSentence, lastPostQuote, reportFits, type ExtendedQuote } from "@/lib/extended-quotes";

import { nyDay } from "./merge";
import type { InboxItem } from "./types";

/**
 * Big moves outside the regular session as inbox items (and so as notes on /agent, which reads the inbox): a holding
 * or watched stock that moves 5% or more after hours or pre-market, or 3% or more after a report. Derived on every
 * read from `tm_extended_quotes` (backend/agentdata/extended_hours.py), never stored. Pure: the read is in ./sources.ts.
 *
 * Honesty: the item never carries a `move` (that is a session's move, which the read above the list counts against a
 * normal day); its `extended` figure is labelled after hours or pre-market wherever it is drawn.
 */

type Position = "holding" | "watchlist" | null;

/** The prints worth an item: the newest one, and last evening's after-hours one when a pre-market print replaced it. */
function prints(quote: ExtendedQuote): ExtendedQuote[] {
  const newest = reportFits(quote, quote.earnings) ? quote : { ...quote, earnings: null };
  const post = lastPostQuote(quote);
  return post ? [newest, post] : [newest];
}

export function extendedItems(quote: ExtendedQuote, position: Position, mode: "mine" | "example", now: Date = new Date()): InboxItem[] {
  const out: InboxItem[] = [];
  for (const print of prints(quote)) {
    const big = bigExtendedMove(print);
    const day = nyDay(print.asOf);
    if (!big || !day) continue;
    const at = nyDay(big.at) === day ? big.at : print.asOf;
    const ticker = print.ticker;
    const id = `extended:${ticker}:${print.session}:${day}`;
    const reported = print.earnings;
    out.push({
      id,
      kind: "agent",
      at,
      day: nyDay(at) ?? day,
      // The sentence carries the print's own time; a row clock would be when the move first got big.
      exact: false,
      tickers: [ticker],
      text: extendedSentence(print, now),
      detail: null,
      href: `/stock/${encodeURIComponent(ticker)}`,
      external: false,
      source: mode === "example" ? "Example agent" : "Your agent",
      tone: print.changePct > 0 ? "up" : print.changePct < 0 ? "down" : "flat",
      quiet: false,
      locked: false,
      // After a report the results row tells it (with this move as its "after hours"): this one gives way to it.
      dedupeKey: reported ? `results:${ticker}:${reported.date}` : id,
      weight: reported ? 0 : 1,
      // One stock's extended moves keep only the newest: this morning's pre-market print replaces last evening's.
      thread: `extended:${ticker}`,
      move: null,
      extended: { pct: print.changePct, session: print.session, price: print.price, at: print.asOf, holding: position === "holding" },
    });
  }
  return out;
}
