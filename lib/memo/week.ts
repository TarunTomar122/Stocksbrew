/**
 * The memo's week: Monday to Friday in New York, keyed by ISO week
 * ("2026-46"). A week is "complete" once its Friday has passed or its last
 * close is the Friday's; until then the memo for it is "so far this week"
 * and is rewritten once a day.
 */

const DAY_MS = 86_400_000;

export type MemoWeek = {
  /** ISO week key, "2026-46". */
  key: string;
  /** Monday, YYYY-MM-DD. */
  monday: string;
  /** Friday, YYYY-MM-DD. */
  friday: string;
  /** Last close inside the week that the memo is built on (null before the Monday close). */
  endDay: string | null;
  /** True once the whole week has traded. */
  complete: boolean;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function mondayOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

/** ISO 8601 week key of the week holding `day`: the year of its Thursday, then the week number. */
export function weekKey(day: string): string {
  const thursday = addDays(mondayOf(day), 3);
  const year = Number(thursday.slice(0, 4));
  const firstThursday = addDays(mondayOf(`${year}-01-04`), 3);
  const week = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${firstThursday}T00:00:00Z`)) / (7 * DAY_MS)) + 1;
  return `${year}-${String(week).padStart(2, "0")}`;
}

/** Monday of an ISO week key, or null when the key is not one. */
export function mondayOfKey(key: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const monday = addDays(mondayOf(`${year}-01-04`), (week - 1) * 7);
  return weekKey(monday) === key ? monday : null;
}

/**
 * The week a memo is written for, from the newest stored close. Before the
 * Monday close the newest close is the previous Friday's, so the memo is the
 * finished previous week rather than an empty new one.
 */
export function memoWeekFor(lastClose: string, today: string): MemoWeek {
  const monday = mondayOf(lastClose);
  const friday = addDays(monday, 4);
  return {
    key: weekKey(monday),
    monday,
    friday,
    endDay: lastClose,
    complete: lastClose >= friday || today > friday,
  };
}

/** A finished earlier week, for history the person did not open at the time. */
export function pastWeek(monday: string, lastCloseInWeek: string | null): MemoWeek {
  return { key: weekKey(monday), monday, friday: addDays(monday, 4), endDay: lastCloseInWeek, complete: true };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Nov 6" */
export function shortDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

/** "Thursday" */
export function weekdayName(day: string): string {
  return WEEKDAYS[weekdayOf(day)]!;
}

/**
 * How a holding's move over the memo's week is labelled: "this week" once the week is done, "so far this week"
 * while it runs. Measured from the close before Monday, so it is not the trailing five-session move the stock
 * page and the call reasons give.
 */
export function weekMoveWords(complete: boolean): string {
  return complete ? "this week" : "so far this week";
}

/**
 * "since Friday's close": the close a running week is measured from (the memo curve's first point), so a partial
 * week's figure reads as what it is. Empty once the week is done, or when the day is unknown.
 */
export function sinceCloseWords(baseDay: string | null | undefined, complete: boolean): string {
  if (complete || !baseDay || !isIsoDay(baseDay)) return "";
  return `since ${weekdayName(baseDay)}'s close`;
}

/** "Thursday, Nov 13" */
export function longDay(day: string): string {
  return `${weekdayName(day)}, ${shortDay(day)}`;
}

/** "Week of Nov 9" */
export function weekTitle(week: Pick<MemoWeek, "monday">): string {
  return `Week of ${shortDay(week.monday)}`;
}
