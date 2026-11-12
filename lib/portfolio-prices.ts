/**
 * One dated price per ticker, from the same quotes the stock pages and the
 * screener show.
 *
 * The example portfolio used to price itself from the last bar of the daily
 * price history (`tm_price_history_daily`). That bar can be an unfinished
 * session written mid-day, a history can end a day early (VOO), and the
 * history is cached for hours, so the example said "the Nov 10 close" next to
 * NVDA at $176.79 while the stock page and the screener said $168.79. This
 * picks the quote everyone else reads, with the time it was taken:
 *
 * 1. the screener snapshot row (`price`, `day_pct`, `price_at`), which the
 *    screener and the stock lists print;
 * 2. the markets page's asset (`price`, `change.d1`, `as_of`), for funds the
 *    snapshot does not carry (VOO);
 * 3. the latest quote (`tm_latest_prices`), which the stock page prints.
 *
 * A row without any dated price is left out rather than priced from a guess.
 *
 * Pure.
 */

import { etDayOf, quoteDay } from "@/lib/benchmark-day";
import { dayPossessive } from "@/lib/day-words";

export type DatedPrice = {
  price: number;
  /** The day's move in percent, or null when it is unknown or from another session than the rest. */
  dayPct: number | null;
  /** ISO time the price was taken. */
  at: string;
  source: "snapshot" | "market" | "quote";
};

export type PriceSources = {
  snapshot?: { price?: number | null; day_pct?: number | null; price_at?: string | null } | null;
  market?: { price?: number | null; change?: { d1?: number | null } | null; as_of?: string | null } | null;
  quote?: { captured_at?: string | null; updated_at?: string | null; quote?: { current?: number | null; day_change_pct?: number | null } | null } | null;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => fin(value) && value > 0;

/**
 * The price from the newest session among the sources; on the same day the
 * order above decides, so a snapshot a day behind never beats today's quote.
 */
export function datedPrice(sources: PriceSources): DatedPrice | null {
  const { snapshot, market, quote } = sources;
  const found: DatedPrice[] = [];
  if (snapshot && positive(snapshot.price) && etDayOf(snapshot.price_at)) {
    found.push({ price: snapshot.price, dayPct: fin(snapshot.day_pct) ? snapshot.day_pct : null, at: snapshot.price_at!, source: "snapshot" });
  }
  if (market && positive(market.price) && etDayOf(market.as_of)) {
    const d1 = market.change?.d1;
    found.push({ price: market.price, dayPct: fin(d1) ? d1 : null, at: market.as_of!, source: "market" });
  }
  const at = quote?.captured_at || quote?.updated_at || null;
  const current = quote?.quote?.current;
  if (quote && positive(current) && etDayOf(at)) {
    const pct = quote.quote?.day_change_pct;
    found.push({ price: current, dayPct: fin(pct) ? pct : null, at: at!, source: "quote" });
  }
  let best: DatedPrice | null = null;
  for (const price of found) if (!best || etDayOf(price.at)! > etDayOf(best.at)!) best = price;
  return best;
}

/**
 * The day the set is priced on (most prices' New York day) and the prices
 * with the day's move dropped for any that are from another session, so a
 * "change on Nov 10" never adds in a Nov 7 move.
 */
export function onOneDay(prices: Map<string, DatedPrice>): { day: string | null; prices: Map<string, DatedPrice> } {
  const day = quoteDay([...prices.values()].map((price) => ({ price_at: price.at })));
  const out = new Map<string, DatedPrice>();
  for (const [ticker, price] of prices) {
    out.set(ticker, day && etDayOf(price.at) !== day ? { ...price, dayPct: null } : price);
  }
  return { day, prices: out };
}

const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });

/**
 * Which prices a page shows, said so it fits after "Prices from": "yesterday's
 * close", "Monday's close" within the week, "the Nov 3 close" before, or "today,
 * while the market is open" between 9:30 and 4 PM New York time on a weekday when
 * the quotes are that day's ("today, before the open" earlier that morning).
 * Worked out against `now`, so only for a page rendered at request time.
 */
export function pricesWords(day: string | null, now: number | Date = Date.now()): string | null {
  if (!day) return null;
  const parts = Object.fromEntries(ET_CLOCK.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const close = dayPossessive(day, today);
  if (!close) return null;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = parts.weekday !== "Sat" && parts.weekday !== "Sun";
  if (day === today && weekday && minutes < 16 * 60) return minutes >= 9 * 60 + 30 ? "today, while the market is open" : "today, before the open";
  return `${close} close`;
}
