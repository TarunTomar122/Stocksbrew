/**
 * A day said the way a person says it (owner, Nov 12: "these dates like nov 11 is so weird like who cares... say
 * yesterday"): "today", "yesterday", "tomorrow", the weekday name within six days either side ("Monday"), and the
 * date only past that ("Nov 3", with the year only when it is not this year's).
 *
 * Every day here is a New York calendar day. A plain "YYYY-MM-DD" is taken as that day; a timestamp is turned into
 * its New York day first, so a 9 PM ET close is never read as the next UTC day. "Yesterday" is the calendar day
 * before, not the last trading day: on a Monday morning Friday's close is "Friday", and after a holiday the last
 * close is named by its weekday too.
 *
 * Only for text read when it is rendered. A table column of many dates, a filing citation, an email subject, a
 * share card or OG image, or anything stored and read later keeps the absolute date (`absoluteDay`). A page that
 * renders these words must work them out at request time, or be cached for an hour at most, so a page cached
 * overnight never says "today" the next morning.
 */

const ZONE = "America/New_York";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Within this many days either side of today, a day is named by its weekday. */
const WEEKDAY_SPAN = 6;

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });

type DayInput = string | number | Date | null | undefined;

/** A real calendar day: "2026-11-31" and "2026-02-30" are not (Date would roll them into the next month). */
function validPlainDay(text: string): boolean {
  if (!PLAIN_DAY.test(text)) return false;
  const date = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** The New York calendar day ("2026-11-12") of a plain day or a timestamp; null when it is not a usable day. */
export function etDayOf(value: DayInput): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (PLAIN_DAY.test(text)) return validPlainDay(text) ? text : null;
    // A timestamp without a zone (Z or an offset) is ambiguous; only full instants are turned into a New York day.
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : ET_DAY.format(date);
}

/** Today in New York, "2026-11-12". */
export function etToday(now: number | Date = Date.now()): string {
  return ET_DAY.format(new Date(now));
}

/** Whole calendar days from `today` to `day`: 1 is tomorrow, -1 yesterday. Null when either is not a day. */
export function daysFromToday(day: DayInput, today: string): number | null {
  const target = etDayOf(day);
  const base = etDayOf(today);
  if (!target || !base) return null;
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / 86_400_000);
}

/** "Nov 3", or "Nov 3, 2025" when the year is not `today`'s (always with the year when `today` is not given). */
export function absoluteDay(day: DayInput, today?: string | null): string {
  const target = etDayOf(day);
  if (!target) return "";
  const label = `${MONTHS[Number(target.slice(5, 7)) - 1]} ${Number(target.slice(8, 10))}`;
  const base = today ? etDayOf(today) : null;
  return base && base.slice(0, 4) === target.slice(0, 4) ? label : `${label}, ${target.slice(0, 4)}`;
}

/** "Monday" for a day. */
export function weekdayName(day: DayInput): string {
  const target = etDayOf(day);
  return target ? WEEKDAYS[new Date(`${target}T12:00:00Z`).getUTCDay()]! : "";
}

/**
 * The day as a word: "today", "yesterday", "tomorrow", "Monday" within six days either side, else "Nov 3" ("Nov 3,
 * 2025" in another year). Empty for anything that is not a day. Lowercase words; `capitalize` for a label.
 */
export function dayWords(day: DayInput, today: string = etToday()): string {
  const gap = daysFromToday(day, today);
  if (gap === null) return "";
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap === 1) return "tomorrow";
  if (Math.abs(gap) <= WEEKDAY_SPAN) return weekdayName(day);
  return absoluteDay(day, today);
}

/** The same day inside a sentence: "today", "yesterday", "tomorrow", "on Monday", "on Nov 3". */
export function onDayWords(day: DayInput, today: string = etToday()): string {
  const words = dayWords(day, today);
  if (!words) return "";
  return words === "today" || words === "yesterday" || words === "tomorrow" ? words : `on ${words}`;
}

/** Before a noun: "today's", "yesterday's", "Monday's", or "the Nov 3" ("yesterday's close", "the Nov 3 close"). */
export function dayPossessive(day: DayInput, today: string = etToday()): string {
  const words = dayWords(day, today);
  if (!words) return "";
  const gap = daysFromToday(day, today)!;
  return Math.abs(gap) <= WEEKDAY_SPAN ? `${words}'s` : `the ${words}`;
}

/**
 * A timestamp in New York time, for a stamp that shows the time: "3:59 PM ET" today, "yesterday, 3:59 PM ET",
 * "Monday, 3:59 PM ET", "Nov 3, 3:59 PM ET". A plain day (no time) is said as `dayWords`, capitalized only by the
 * caller. Empty for anything that is not a time.
 */
export function stampWords(iso: DayInput, now: number | Date = Date.now()): string {
  if (typeof iso === "string" && PLAIN_DAY.test(iso.trim())) return dayWords(iso.trim(), etToday(now));
  const day = etDayOf(iso);
  if (!day) return "";
  const date = iso instanceof Date ? iso : new Date(iso as string | number);
  const time = `${ET_TIME.format(date)} ET`;
  const words = dayWords(day, etToday(now));
  return words === "today" ? time : `${words}, ${time}`;
}

/** "yesterday" to "Yesterday", for a label that starts with the day. */
export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
