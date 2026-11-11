import { etWallTimeToUtcMs, isNyseHoliday } from "@/lib/market-session";

/**
 * When the agents run on their own: the VPS after-close group
 * (backend/agentdata/schedule.py, `after_close`), started by
 * backend/vps/units/tikrr-agentdata-after-close.timer at 5:30 PM New York
 * time, Monday to Friday. It refreshes prices first, then runs the standing
 * agents (tm_agent_runs) and the nightly reason check (tm_thesis_checks).
 * lib/agent-schedule.test.ts reads the timer file, so this cannot drift from it.
 *
 * Use these for any "checks again after the close" line, so the promise is
 * the real schedule. Pure: no store, no clock unless one is passed.
 */

/** The timer's start time, New York wall clock. */
export const AFTER_CLOSE_RUN_ET = { hour: 17, minute: 30 } as const;
/** ISO weekdays the timer fires on (1 = Monday). */
export const AFTER_CLOSE_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
/**
 * Start to finished on a usual night: prices and strategies take about an
 * hour (their cap is 90 minutes), the earnings, dividend and screener steps a
 * few minutes, the agents and reason checks a few more. Not a bound: each step
 * has its own timeout, so a bad night can finish later. Say "usually" or
 * "by about" when showing it.
 */
export const AFTER_CLOSE_USUALLY_DONE_MINUTES = 120;

export type AfterCloseRun = {
  /** The New York day of the run, YYYY-MM-DD: the market day whose close it reads. */
  day: string;
  startsAt: Date;
  /** By when the agents and reason checks have usually finished (not a guarantee). */
  usuallyDoneBy: Date;
  /** False on an NYSE holiday: the timer still fires, but there is no new close to read. */
  marketDay: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function newYorkDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The after-close run on a New York day, or null when the timer does not fire that day (weekends). */
export function afterCloseRunOn(day: string): AfterCloseRun | null {
  if (!DAY.test(day) || !AFTER_CLOSE_WEEKDAYS.includes(isoWeekday(day))) return null;
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const startsAt = new Date(etWallTimeToUtcMs(year, month, date, AFTER_CLOSE_RUN_ET.hour, AFTER_CLOSE_RUN_ET.minute));
  return {
    day,
    startsAt,
    usuallyDoneBy: new Date(startsAt.getTime() + AFTER_CLOSE_USUALLY_DONE_MINUTES * 60_000),
    marketDay: !isNyseHoliday(day),
  };
}

export type NextRunOptions = {
  /**
   * Count a run that has started and may not have finished (`after` is
   * between its start and `usuallyDoneBy`) as the next one. Default false: only runs
   * that have not started yet.
   */
  includeRunning?: boolean;
  /** Skip NYSE holidays, when the run has no new close to read. Default true. */
  marketDaysOnly?: boolean;
};

/** The next after-close run after `after`. */
export function nextAfterCloseRun(after: Date = new Date(), options: NextRunOptions = {}): AfterCloseRun {
  const { includeRunning = false, marketDaysOnly = true } = options;
  let day = newYorkDay(after);
  // Two weeks always holds a run: at most a long weekend plus a holiday in a row.
  for (let i = 0; i < 14; i++, day = shiftDay(day, 1)) {
    const run = afterCloseRunOn(day);
    if (!run || (marketDaysOnly && !run.marketDay)) continue;
    const cutoff = includeRunning ? run.usuallyDoneBy : run.startsAt;
    if (cutoff.getTime() > after.getTime()) return run;
  }
  throw new Error("no after-close run in the next two weeks");
}

/** The most recent after-close run that has started by `at` (it may still be running). */
export function lastAfterCloseRun(at: Date = new Date(), options: Pick<NextRunOptions, "marketDaysOnly"> = {}): AfterCloseRun {
  const { marketDaysOnly = true } = options;
  let day = newYorkDay(at);
  for (let i = 0; i < 14; i++, day = shiftDay(day, -1)) {
    const run = afterCloseRunOn(day);
    if (!run || (marketDaysOnly && !run.marketDay)) continue;
    if (run.startsAt.getTime() <= at.getTime()) return run;
  }
  throw new Error("no after-close run in the last two weeks");
}

/** "5:30 PM ET": the run's start on the New York clock. */
export function afterCloseTimeEt(run: Pick<AfterCloseRun, "startsAt">): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(run.startsAt);
  return `${time} ET`;
}

/** "today", "tomorrow" or "on Monday" for a run, as seen from `now` (New York days). Past six days: "on Nov 27". */
export function afterCloseDayWords(run: Pick<AfterCloseRun, "day">, now: Date = new Date()): string {
  const today = newYorkDay(now);
  if (run.day === today) return "today";
  if (run.day === shiftDay(today, 1)) return "tomorrow";
  const at = new Date(`${run.day}T12:00:00Z`);
  const ahead = Math.round((at.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (ahead > 1 && ahead < 7) return `on ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(at)}`;
  return `on ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(at)}`;
}
