/**
 * One S&P 500 figure per day across the site.
 *
 * The screener snapshot prices covered stocks from the latest quotes, but its
 * SPY benchmark row comes from the daily price history, which can end a
 * session earlier. Reading the two together printed "+2.6% for the S&P 500"
 * (Monday's move) beside Tuesday's stocks. These helpers find the day the
 * stock rows are priced on and give back an S&P row for that same day: the
 * markets page's S&P 500 (the figure the briefing and Market today use) when
 * it is from that day, the SPY row when it is, and nothing otherwise.
 *
 * Pure.
 */

import { daysFromToday, dayPossessive } from "@/lib/day-words";
import { sessionCloseMinutes } from "@/lib/market-session";
import type { MarketAsset } from "@/lib/markets-shared";
import type { ScreenerRow } from "@/lib/screener-shared";

// Built once: the screener calls etDayOf for every row.
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** New York calendar day of an ISO time, YYYY-MM-DD. Null for a missing or bad time. */
export function etDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return ET_DAY.format(at);
}

/**
 * The day most rows are priced on (their `price_at`, New York time). A few
 * stale quotes do not move it. Falls back to `fallback` when no row has a time.
 */
export function quoteDay(rows: readonly Pick<ScreenerRow, "price_at">[], fallback: string | null = null): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = etDayOf(row.price_at);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [day, count] of counts) {
    if (count > most || (count === most && best !== null && day > best)) {
      best = day;
      most = count;
    }
  }
  return best ?? fallback;
}

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The S&P 500 row to compare `day`'s stock moves against: the markets page's
 * S&P 500 (`sp500`, the figure Market today shows) when its quote is from
 * `day`, else the snapshot's SPY row when its price is from `day`. A row from
 * any other day comes back without its returns, so no sentence compares two
 * different days.
 */
export function benchmarkForDay(spy: ScreenerRow | null, day: string | null, sp500?: MarketAsset | null): ScreenerRow | null {
  if (!day) return spy;
  if (sp500 && etDayOf(sp500.as_of) === day && finite(sp500.change.d1)) {
    const change = sp500.change;
    const row: ScreenerRow = { ...withoutReturns(spy ?? { symbol: "SPY", benchmark: true }), price_at: sp500.as_of, day_pct: change.d1 as number };
    if (finite(change.w1)) row.ret_1w = change.w1;
    if (finite(change.m1)) row.ret_1m = change.m1;
    if (finite(change.ytd)) row.ret_ytd = change.ytd;
    if (finite(change.y1)) row.ret_1y = change.y1;
    return row;
  }
  if (spy && etDayOf(spy.price_at) === day) return spy;
  // From another session: keep the row (callers key on it) but drop every return.
  return spy ? withoutReturns(spy) : null;
}

const RETURN_KEYS = ["day_pct", "ret_1w", "ret_1m", "ret_3m", "ret_6m", "ret_ytd", "ret_1y", "ret_3y", "ret_5y"] as const;

function withoutReturns(row: ScreenerRow): ScreenerRow {
  const next = { ...row };
  for (const key of RETURN_KEYS) delete next[key];
  return next;
}

const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * How to say which prices a page shows: "yesterday's close", "Monday's close"
 * within the week, "the Nov 3 close" before it, or "today, during trading" when
 * the quotes are from today and the market has not closed yet (before 4 PM New
 * York time). `label` is the day already formatted, used only for a day more
 * than a week back. Worked out against `now`: only for pages cached an hour or less.
 */
export function closeWords(day: string, label: string, now: number | Date = Date.now()): string {
  const parts = Object.fromEntries(ET_CLOCK.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  // The close is 4 PM, 1 PM on a half day (lib/market-session.ts).
  const beforeClose = Number(parts.hour) * 60 + Number(parts.minute) < sessionCloseMinutes(today);
  if (day === today && beforeClose) return "today, during trading";
  const gap = daysFromToday(day, today);
  return gap !== null && Math.abs(gap) <= 6 ? `${dayPossessive(day, today)} close` : `the ${label} close`;
}
