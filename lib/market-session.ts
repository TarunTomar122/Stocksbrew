import { marketClockParts, marketDateIso } from "@/lib/premarket-shared";

/**
 * US equity market session state for the web UI: open / premarket /
 * afterhours / overnight / weekend / holiday, plus the next opening bell and
 * the next change of session as countdowns. Pure functions, ET-based via Intl
 * (DST handled), no dependencies.
 *
 * The calendar follows backend/mail/nyse.py, the pipeline's NYSE rules: a
 * Saturday New Year's Day is not observed, Juneteenth from 2022, announced
 * one-off closures, and the 1 PM early closes (the day before Independence Day,
 * the day after Thanksgiving, Christmas Eve, each only on a trading weekday).
 * On a half day the regular session ends at 1 PM and after hours at 5 PM.
 */

export type MarketSessionKind =
  | "open"
  | "premarket"
  | "afterhours"
  | "overnight"
  | "weekend"
  | "holiday";

export type MarketSessionState = {
  kind: MarketSessionKind;
  /** Present only when kind === "holiday". */
  holidayName?: string;
  /** Short ET weekday of the reference time, e.g. "Mon". */
  weekday: string;
  /** Minutes past midnight ET. */
  minutesOfDay: number;
  /** Milliseconds from the reference time to the next 9:30 ET open. */
  msToOpen: number;
  /** Preformatted countdown to the next open, e.g. "2d 14h", "9h 12m", "47:12". */
  countdown: string;
  /** Today is a 1 PM half day. */
  earlyClose: boolean;
  /**
   * The next change of session: "close" while the market is open (after hours starts then, 4 PM or 1 PM on a half
   * day), "afterhours_end" during after hours (8 PM, 5 PM on a half day), "open" otherwise (the next 9:30 bell).
   */
  next: { kind: "close" | "afterhours_end" | "open"; at: string; ms: number; countdown: string };
};

const OPEN_MINUTES = 9 * 60 + 30; // 9:30 ET
const CLOSE_MINUTES = 16 * 60; // 16:00 ET
const EARLY_CLOSE_MINUTES = 13 * 60; // 13:00 ET on a half day
const AFTERHOURS_END_MINUTES = 20 * 60; // 20:00 ET
const EARLY_AFTERHOURS_END_MINUTES = 17 * 60; // 17:00 ET on a half day
const PREMARKET_START_MINUTES = 4 * 60; // 4:00 ET

/** Announced one-off closures (backend/mail/nyse.py UNSCHEDULED_CLOSED): the national day of mourning for President Carter. */
const UNSCHEDULED_CLOSED: Record<string, string> = { "2025-01-09": "a national day of mourning" };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** nth weekday of a month: weekday 0=Sun..6=Sat, n starting at 1. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number): number {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return last.getUTCDate() - offset;
}

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Saturday holidays move to Friday, Sunday holidays to Monday. */
function observedDate(year: number, month: number, day: number): { year: number; month: number; day: number; shifted: boolean } {
  const date = utcDate(year, month, day);
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(date.getUTCDate() - 1);
  else if (dow === 0) date.setUTCDate(date.getUTCDate() + 1);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    shifted: dow === 0 || dow === 6,
  };
}

const holidayCache = new Map<number, Record<string, string>>();

function holidaysForYear(year: number): Record<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const out: Record<string, string> = {};
  const put = (y: number, m: number, d: number, name: string) => {
    out[`${y}-${pad2(m)}-${pad2(d)}`] = name;
  };

  // A Saturday New Year's Day is not observed: the exchange stays open on Dec 31 (NYSE Rule 7.2).
  if (utcDate(year, 1, 1).getUTCDay() !== 6) {
    const newYear = observedDate(year, 1, 1);
    put(newYear.year, newYear.month, newYear.day, `New Year's Day${newYear.shifted ? " (observed)" : ""}`);
  }
  put(year, 1, nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  put(year, 2, nthWeekday(year, 2, 1, 3), "Presidents' Day");

  const easter = easterSunday(year);
  const goodFriday = utcDate(year, easter.month, easter.day);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  put(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate(), "Good Friday");

  put(year, 5, lastWeekday(year, 5, 1), "Memorial Day");

  if (year >= 2022) {
    const juneteenth = observedDate(year, 6, 19);
    put(juneteenth.year, juneteenth.month, juneteenth.day, `Juneteenth${juneteenth.shifted ? " (observed)" : ""}`);
  }
  const independence = observedDate(year, 7, 4);
  put(independence.year, independence.month, independence.day, `Independence Day${independence.shifted ? " (observed)" : ""}`);
  put(year, 9, nthWeekday(year, 9, 1, 1), "Labor Day");
  put(year, 11, nthWeekday(year, 11, 4, 4), "Thanksgiving");
  const christmas = observedDate(year, 12, 25);
  put(christmas.year, christmas.month, christmas.day, `Christmas Day${christmas.shifted ? " (observed)" : ""}`);

  holidayCache.set(year, out);
  return out;
}

export function isNyseHoliday(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  // Neighbor years catch New Year's Day observed spilling into December.
  return (
    UNSCHEDULED_CLOSED[dateKey] ??
    holidaysForYear(year)[dateKey] ??
    holidaysForYear(year + 1)[dateKey] ??
    holidaysForYear(year - 1)[dateKey] ??
    null
  );
}

function weekdayOfKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function shiftKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whether the NYSE trades on this New York day ("2026-11-12"): a weekday that is not a holiday. */
export function isNyseTradingDay(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const dow = weekdayOfKey(dateKey);
  return dow !== 0 && dow !== 6 && !isNyseHoliday(dateKey);
}

/** The trading day on or before `dateKey` (that day itself when it trades). */
export function tradingDayOnOrBefore(dateKey: string): string {
  let key = dateKey;
  for (let i = 0; i < 15 && !isNyseTradingDay(key); i++) key = shiftKey(key, -1);
  return key;
}

/** The trading day before `dateKey`. */
export function previousTradingDay(dateKey: string): string {
  return tradingDayOnOrBefore(shiftKey(dateKey, -1));
}

/** The trading day after `dateKey`. */
export function nextTradingDay(dateKey: string): string {
  let key = shiftKey(dateKey, 1);
  for (let i = 0; i < 15 && !isNyseTradingDay(key); i++) key = shiftKey(key, 1);
  return key;
}

/** A 1 PM half day: the day before Independence Day, the day after Thanksgiving and Christmas Eve, when they trade. */
export function isNyseEarlyClose(dateKey: string): boolean {
  if (!isNyseTradingDay(dateKey)) return false;
  const year = Number(dateKey.slice(0, 4));
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return dateKey === `${year}-07-03` || dateKey === `${year}-11-${pad2(thanksgiving + 1)}` || dateKey === `${year}-12-24`;
}

/** Minutes past midnight ET when the regular session on this trading day ends: 16:00, or 13:00 on a half day. */
export function sessionCloseMinutes(dateKey: string): number {
  return isNyseEarlyClose(dateKey) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
}

function afterHoursEndMinutes(dateKey: string): number {
  return isNyseEarlyClose(dateKey) ? EARLY_AFTERHOURS_END_MINUTES : AFTERHOURS_END_MINUTES;
}

/** ET wall clock as ms-since-epoch minus real ms-since-epoch (negative). */
function etOffsetMs(at: Date): number {
  const parts = marketClockParts("US", at);
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallAsUtc - at.getTime();
}

/** UTC ms for a given ET wall-clock time. Two passes settle DST boundaries. */
export function etWallTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall - etOffsetMs(new Date(wall));
  utc = wall - etOffsetMs(new Date(utc));
  return utc;
}

function dateKey(parts: { year: string; month: string; day: string }): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(parts: { year: string; month: string; day: string }, days: number): { year: string; month: string; day: string; weekday: string } {
  const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days, 12));
  return {
    year: String(base.getUTCFullYear()),
    month: String(base.getUTCMonth() + 1).padStart(2, "0"),
    day: String(base.getUTCDate()).padStart(2, "0"),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][base.getUTCDay()],
  };
}

function isTradingDay(parts: { year: string; month: string; day: string; weekday: string }): boolean {
  return isNyseTradingDay(dateKey(parts));
}

/** Milliseconds from `ref` to the next 9:30 ET opening bell (skips weekends/holidays). */
export function millisecondsUntilNextOpen(ref = new Date()): number {
  const parts = marketClockParts("US", ref);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const seconds = Number(parts.second);
  const today = { year: parts.year, month: parts.month, day: parts.day, weekday: parts.weekday };
  let target = today;
  if (!isTradingDay(today) || minutes >= OPEN_MINUTES) {
    let offset = 1;
    while (offset <= 30) {
      const candidate = addDays(today, offset);
      if (isTradingDay(candidate)) {
        target = candidate;
        break;
      }
      offset += 1;
    }
  }
  const openMs = etWallTimeToUtcMs(Number(target.year), Number(target.month), Number(target.day), 9, 30);
  return Math.max(0, openMs - ref.getTime());
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function countdownParts(ms: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** When the next opening bell rings, as a Date. */
export function nextOpenAt(ref = new Date()): Date {
  return new Date(ref.getTime() + millisecondsUntilNextOpen(ref));
}

/** Human label for the next open in ET, e.g. "9:30 AM ET" or "Monday, Sep 14, 9:30 AM ET". */
export function formatNextOpenLabel(ref = new Date()): string {
  const target = nextOpenAt(ref);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(target);
  if (marketDateIso("US", target) === marketDateIso("US", ref)) return `${time} ET`;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(target);
  return `${day}, ${time} ET`;
}

/** Sentence phrase for the next open: "today at 9:30 AM ET" / "Monday, Sep 14 at 9:30 AM ET". */
export function formatNextOpenPhrase(ref = new Date()): string {
  const target = nextOpenAt(ref);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(target);
  if (marketDateIso("US", target) === marketDateIso("US", ref)) return `at ${time} ET`;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(target);
  return `${day} at ${time} ET`;
}

/**
 * How often the UI needs to re-render to keep the countdown honest.
 * Pass `showSeconds` when a seconds cell is on screen.
 */
export function countdownTickMs(msToOpen: number, showSeconds = false): number {
  if (showSeconds || msToOpen < 3_600_000) return 1_000;
  if (msToOpen < 86_400_000) return 15_000;
  return 300_000;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getMarketSessionState(ref = new Date()): MarketSessionState {
  const parts = marketClockParts("US", ref);
  const today = dateKey(parts);
  const minutesOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const holiday = isNyseHoliday(today);
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const msToOpen = millisecondsUntilNextOpen(ref);
  const closeMinutes = sessionCloseMinutes(today);
  const afterHoursEnd = afterHoursEndMinutes(today);

  let kind: MarketSessionKind;
  if (holiday) {
    kind = "holiday";
  } else if (isWeekend) {
    kind = "weekend";
  } else if (minutesOfDay >= OPEN_MINUTES && minutesOfDay < closeMinutes) {
    kind = "open";
  } else if (minutesOfDay >= closeMinutes && minutesOfDay < afterHoursEnd) {
    kind = "afterhours";
  } else if (minutesOfDay >= PREMARKET_START_MINUTES && minutesOfDay < OPEN_MINUTES) {
    kind = "premarket";
  } else {
    kind = "overnight";
  }

  // Friday night reads as the weekend, not a quiet overnight.
  if (
    !holiday &&
    !isWeekend &&
    kind === "overnight" &&
    parts.weekday === "Fri" &&
    minutesOfDay >= afterHoursEnd
  ) {
    kind = "weekend";
  }

  // The next change of session: the close (after hours starts) while open, the end of after hours after the
  // close, the opening bell otherwise.
  const wall = (minutes: number) =>
    etWallTimeToUtcMs(Number(parts.year), Number(parts.month), Number(parts.day), Math.floor(minutes / 60), minutes % 60);
  let next: MarketSessionState["next"];
  if (kind === "open") {
    const at = wall(closeMinutes);
    next = { kind: "close", at: new Date(at).toISOString(), ms: Math.max(0, at - ref.getTime()), countdown: formatCountdown(at - ref.getTime()) };
  } else if (kind === "afterhours") {
    const at = wall(afterHoursEnd);
    next = { kind: "afterhours_end", at: new Date(at).toISOString(), ms: Math.max(0, at - ref.getTime()), countdown: formatCountdown(at - ref.getTime()) };
  } else {
    next = { kind: "open", at: new Date(ref.getTime() + msToOpen).toISOString(), ms: msToOpen, countdown: formatCountdown(msToOpen) };
  }

  return {
    kind,
    holidayName: holiday ?? undefined,
    weekday: parts.weekday,
    minutesOfDay,
    msToOpen,
    countdown: formatCountdown(msToOpen),
    earlyClose: isNyseEarlyClose(today),
    next,
  };
}

/**
 * Whether a US stock's price has sat out today's session so far: the market is open, the session's first hourly
 * batches have had time to land (from 10:45 ET; backend/vps/install-systemd.sh runs price batches at 9:30, 9:50 and
 * on each hour from 10:00), and the price was captured before today's 9:30 open. Such a price updates only with the
 * run after the close. False for a missing or unreadable time: nothing is said without the evidence.
 */
export function priceSkipsSession(capturedAt: string | null | undefined, ref = new Date()): boolean {
  const captured = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (!Number.isFinite(captured)) return false;
  const state = getMarketSessionState(ref);
  if (state.kind !== "open" || state.minutesOfDay < 10 * 60 + 45) return false;
  const parts = marketClockParts("US", ref);
  const open = etWallTimeToUtcMs(Number(parts.year), Number(parts.month), Number(parts.day), 9, 30);
  return captured < open;
}
