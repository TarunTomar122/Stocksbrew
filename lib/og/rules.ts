/**
 * The honesty rules the data cards share, kept pure so tests can pin them:
 * a price is only shown with the day it is from, a ranking keeps its order even
 * where a figure is missing, and a total is only a total when every part of it
 * is in.
 */

import { etDay } from "@/lib/insight-format";
import { ogDayLabel, ogPrice, ogSignedPct, ogTone } from "@/lib/og/format";
import { fitsLines } from "@/lib/og/text-width";
import type { OgTone } from "@/lib/og/types";
import { isBaitTitle } from "@/lib/wire-companies";
import type { WireItem } from "@/lib/wire-shared";

export type DatedQuote = { price: number | null; dayPct: number | null; at: string | null };

export type SessionPrices = {
  /** The newest price time on the card, for the footnote; null when nothing is dated. */
  newestAt: string | null;
  /** True when every price shown is from the same New York day, so one date covers them all. */
  oneSession: boolean;
  /** Each column's price, move and, when the days differ, its own day ("Nov 11"). */
  columns: Array<{ price: number | null; dayPct: number | null; dayLabel: string | null }>;
};

/**
 * Prices side by side (the compare card). A price with no date is left off: it
 * cannot be placed against the others, and drawing it under another price's
 * time would date it wrongly. When the dated prices come from different days,
 * every one of them carries its own day.
 */
export function sessionPrices(quotes: readonly DatedQuote[], now: Date = new Date()): SessionPrices {
  const dated = quotes.map((quote) => {
    const day = quote.price !== null && quote.at ? etDay(quote.at) : null;
    return day ? { ...quote, day } : null;
  });
  const days = new Set(dated.filter(Boolean).map((quote) => quote!.day));
  const oneSession = days.size <= 1;
  let newestAt: string | null = null;
  for (const quote of dated) {
    if (quote && (newestAt === null || Date.parse(quote.at!) > Date.parse(newestAt))) newestAt = quote.at;
  }
  return {
    newestAt,
    oneSession,
    columns: dated.map((quote) =>
      quote ? { price: quote.price, dayPct: quote.dayPct, dayLabel: oneSession ? null : ogDayLabel(quote.day, now) } : { price: null, dayPct: null, dayLabel: null },
    ),
  };
}

/**
 * The most-talked-about stocks: the wire's own top `max`, in its order and with
 * no threshold of our own. A stock is never skipped for lacking a quote, so a
 * card that says "these drew the most" shows exactly those.
 */
export function topCovered<T>(rows: readonly T[], max = 3): T[] {
  return rows.slice(0, max);
}

/**
 * The room a news tile's headline has (lib/og/cards.tsx StockCards with three tiles): 19px Instrument Sans in a tile
 * about 298px wide inside its padding, one line (owner rule 8: a card's supporting text is at most one line). The
 * width keeps about 3% back for kerning and rounding.
 */
export const TILE_HEADLINE = { fontSize: 19, width: 288, lines: 1 } as const;

/** A headline the publisher already cut ("Why the chip rally…", "What it means..."). */
const CUT = /(?:…|\.\.\.)\s*$/;

/**
 * The whole headline when it fits, else null. No part of a headline stands in for it, not even its first sentence:
 * a headline that does not fit is a different headline's turn. One that already ends in an ellipsis never counts.
 */
function wholeHeadline(title: string, room: { fontSize: number; width: number; lines: number }): string | null {
  const spaced = title.replace(/\s+/g, " ").trim();
  if (!spaced || CUT.test(spaced)) return null;
  const clean = spaced.replace(/[.!]+$/, "");
  return fitsLines(clean, room) ? clean : null;
}

/**
 * The first headline, in the order given, that fits a tile whole, measured with the card's own font. Never a cut
 * sentence or part of a headline (owner rule 8), and never one that came cut. When none fits, null, and the tile goes
 * without the line. Titles come in already sentence-cased (lib/wire-casing.ts caseWireHeadlines).
 */
export function tileHeadline(titles: Iterable<string>, room: { fontSize: number; width: number; lines: number } = TILE_HEADLINE): string | null {
  for (const title of titles) {
    const fits = wholeHeadline(title, room);
    if (fits) return fits;
  }
  return null;
}

/**
 * A stock's stories for its tile headline, in feed order: the feed's lead first, then the rest of the day's naming it.
 * Only a story whose own headline says what happened qualifies, as written (sentence-cased): a bait headline
 * (`isBaitTitle`, which the News page would tell with its excerpt's first sentence) is left out, never replaced, so
 * the card never shows excerpt text as a headline.
 */
export function tileStories(ticker: string, lead: WireItem | null, today: readonly WireItem[]): WireItem[] {
  const seen = new Set<string>();
  const out: WireItem[] = [];
  for (const item of [...(lead ? [lead] : []), ...today.filter((story) => story.tickers.includes(ticker))]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (!isBaitTitle(item.title)) out.push(item);
  }
  return out;
}

/** A tile's price and move from its quote; a stock with no quote shows "—" for the move and no price. */
export function tileMove(quote: { price: number; dayPct: number | null } | null): { price: string | null; value: string; tone: OgTone } {
  if (!quote) return { price: null, value: "—", tone: "flat" };
  return { price: ogPrice(quote.price), value: ogSignedPct(quote.dayPct) ?? "—", tone: ogTone(quote.dayPct) };
}

export type HoldingsTotal =
  | { kind: "total"; value: number; dayMove: number | null; dayPct: number | null }
  | { kind: "partial"; priced: number; expected: number };

/**
 * A portfolio's total, only when every holding it should have is valued and
 * priced in the same session (`session`, a New York day); otherwise how many
 * are priced in that session ("6 of 9 holdings priced today"), never a
 * subtotal, nor a sum of prices from different days, shown as the total. The
 * day's change likewise needs every holding's move.
 */
export function holdingsTotal(
  holdings: ReadonlyArray<{ value: number | null; dayMove: number | null; day: string | null }>,
  expected: number,
  session: string | null,
): HoldingsTotal {
  const inSession = holdings.filter((holding) => holding.value !== null && Number.isFinite(holding.value) && session !== null && holding.day === session);
  if (expected <= 0 || holdings.length < expected || inSession.length < holdings.length) {
    return { kind: "partial", priced: inSession.length, expected: Math.max(expected, holdings.length) };
  }
  const value = inSession.reduce((sum, holding) => sum + holding.value!, 0);
  const moves = inSession.map((holding) => holding.dayMove);
  const dayMove = moves.every((move) => move !== null && Number.isFinite(move)) ? moves.reduce((sum: number, move) => sum + move!, 0) : null;
  const dayPct = dayMove !== null && value - dayMove > 0 ? (dayMove / (value - dayMove)) * 100 : null;
  return { kind: "total", value, dayMove, dayPct };
}

/** A bar on a shared track, as fractions of its width: from `start` to `end`, with the zero line at `zero`. */
export type CompareBar = { start: number; end: number; zero: number; best: boolean };

/**
 * Bars for one figure across the stocks on a compare card, all on one scale.
 * "signed" (returns, growth): bars grow from a shared zero line, left for a
 * loss, and the highest is best. "lower" (P/E): plain bars from the left edge,
 * positive values only, and the lowest is best. `best` marks a single winner;
 * a tie has none. Fewer than two values give no bars: there is nothing to compare.
 */
export function compareBars(values: ReadonlyArray<number | null | undefined>, mode: "signed" | "lower"): Array<CompareBar | null> {
  const usable = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value) && (mode === "signed" || value > 0);
  const kept = values.filter(usable);
  if (kept.length < 2) return values.map(() => null);
  const winner = mode === "signed" ? Math.max(...kept) : Math.min(...kept);
  const unique = kept.filter((value) => value === winner).length === 1;
  if (mode === "lower") {
    const top = Math.max(...kept);
    return values.map((value) => (usable(value) ? { start: 0, end: value / top, zero: 0, best: unique && value === winner } : null));
  }
  const up = Math.max(0, ...kept);
  const down = Math.max(0, ...kept.map((value) => -value));
  const span = up + down || 1;
  const zero = down / span;
  return values.map((value) => {
    if (!usable(value)) return null;
    const best = unique && value === winner;
    return value >= 0 ? { start: zero, end: zero + value / span, zero, best } : { start: zero + value / span, end: zero, zero, best };
  });
}
