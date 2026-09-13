import { marketClockParts } from "@/lib/premarket-shared";

/**
 * US equity market session state for the web UI: open / premarket /
 * afterhours / overnight / weekend / holiday, plus the next opening bell as a
 * countdown. Pure functions, ET-based via Intl (DST handled), no dependencies.
 * Early closes (1pm ET half-days) are intentionally ignored in v1.
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
  /** Preformatted countdown, e.g. "2d 14h", "9h 12m", "47:12". */
  countdown: string;
};

const OPEN_MINUTES = 9 * 60 + 30; // 9:30 ET
const CLOSE_MINUTES = 16 * 60; // 16:00 ET
const AFTERHOURS_END_MINUTES = 20 * 60; // 20:00 ET

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

  const newYear = observedDate(year, 1, 1);
  put(newYear.year, newYear.month, newYear.day, `New Year's Day${newYear.shifted ? " (observed)" : ""}`);
  put(year, 1, nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  put(year, 2, nthWeekday(year, 2, 1, 3), "Presidents' Day");

  const easter = easterSunday(year);
  const goodFriday = utcDate(year, easter.month, easter.day);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  put(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate(), "Good Friday");

  put(year, 5, lastWeekday(year, 5, 1), "Memorial Day");

  const juneteenth = observedDate(year, 6, 19);
  put(juneteenth.year, juneteenth.month, juneteenth.day, `Juneteenth${juneteenth.shifted ? " (observed)" : ""}`);
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
    holidaysForYear(year)[dateKey] ??
    holidaysForYear(year + 1)[dateKey] ??
    holidaysForYear(year - 1)[dateKey] ??
    null
  );
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
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  return !isNyseHoliday(dateKey(parts));
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
  const minutesOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const holiday = isNyseHoliday(dateKey(parts));
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const msToOpen = millisecondsUntilNextOpen(ref);

  let kind: MarketSessionKind;
  if (holiday) {
    kind = "holiday";
  } else if (isWeekend) {
    kind = "weekend";
  } else if (minutesOfDay >= OPEN_MINUTES && minutesOfDay < CLOSE_MINUTES) {
    kind = "open";
  } else if (minutesOfDay >= CLOSE_MINUTES && minutesOfDay < AFTERHOURS_END_MINUTES) {
    kind = "afterhours";
  } else if (minutesOfDay >= 4 * 60 && minutesOfDay < OPEN_MINUTES) {
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
    minutesOfDay >= AFTERHOURS_END_MINUTES
  ) {
    kind = "weekend";
  }

  return {
    kind,
    holidayName: holiday ?? undefined,
    weekday: parts.weekday,
    minutesOfDay,
    msToOpen,
    countdown: formatCountdown(msToOpen),
  };
}
