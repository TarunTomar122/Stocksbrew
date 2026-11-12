import { capitalize, dayWords, etDayOf, etToday } from "@/lib/day-words";
import { isNyseTradingDay, previousTradingDay, tradingDayOnOrBefore } from "@/lib/market-session";
import { marketClockParts } from "@/lib/premarket-shared";

/**
 * The honest day for market data (owner rule 4's day words, rule 7's data honesty): which trading session a
 * figure belongs to, and how to say it. A heading or tab that says "Today" over market data asks this first, so a
 * figure measured yesterday is labelled "Yesterday" (or "Friday", or "Nov 3") instead of "Today".
 *
 * A timestamp belongs to the latest session that had opened by then: 5:51 PM Wednesday is Wednesday's session, 8 AM
 * Thursday (before the bell) is still Wednesday's, Saturday is Friday's. A plain day ("2026-11-10", a bar date) is
 * that day's session, or the trading day before it when the exchange was shut.
 */

const OPEN_MINUTES = 9 * 60 + 30;

type Stamp = string | number | Date | null | undefined;

/** The trading session ("2026-11-11") a data timestamp or a plain day belongs to; null when it is not a time. */
export function sessionDayOf(value: Stamp): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const day = etDayOf(value.trim());
    return day ? tradingDayOnOrBefore(day) : null;
  }
  const day = etDayOf(value);
  if (!day) return null;
  const date = value instanceof Date ? value : new Date(value);
  const parts = marketClockParts("US", date);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (isNyseTradingDay(day) && minutes >= OPEN_MINUTES) return day;
  // Before the bell, or on a day the exchange is shut: the last session that ran.
  return isNyseTradingDay(day) ? previousTradingDay(day) : tradingDayOnOrBefore(day);
}

/** The session the market is on now: today's once the bell has rung, else the last one. */
export function currentSessionDay(now: number | Date = Date.now()): string {
  return sessionDayOf(new Date(now)) ?? etToday(now);
}

export type SessionLabel = {
  /** The session the data belongs to, a New York day. */
  day: string;
  /** "today", "yesterday", "Tuesday", "Nov 3": the session said against today's calendar day (lib/day-words.ts). */
  words: string;
  /** The same, capitalized for a heading or a tab: "Today", "Yesterday", "Tuesday". */
  label: string;
  /** The data is from the latest session (today's once the market has opened; Friday's over a weekend). */
  isCurrentSession: boolean;
  /** The session is today's: only then may a heading say "today". */
  isToday: boolean;
};

/**
 * How to say the day of a data timestamp: "today" only when it is today's session; null when there is no time.
 * Over a weekend Friday's close is the current session but is labelled "Friday", never "today".
 */
export function sessionLabel(value: Stamp, now: number | Date = Date.now()): SessionLabel | null {
  const day = sessionDayOf(value);
  if (!day) return null;
  const today = etToday(now);
  const words = dayWords(day, today);
  return {
    day,
    words,
    label: capitalize(words),
    isCurrentSession: day === currentSessionDay(now),
    isToday: day === today,
  };
}

/**
 * A heading or tab label over a day's market figures: `todayLabel` ("Today", "Up today") when the data is today's
 * session, else the data's own day ("Yesterday", "Tuesday"), through `other` when the label needs more words
 * ("Up yesterday"). Falls back to `todayLabel` only when there is no timestamp at all to judge by.
 */
export function dayLabelFor(value: Stamp, todayLabel: string, now: number | Date = Date.now(), other?: (label: SessionLabel) => string): string {
  const label = sessionLabel(value, now);
  if (!label || label.isToday) return todayLabel;
  return other ? other(label) : label.label;
}
