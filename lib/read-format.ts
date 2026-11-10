/**
 * Small formatters for the sentences in a page's read (`lib/*-insights.ts`).
 * Pure and dependency free so the insight builders stay easy to test.
 */

const MINUS = "−";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "+2.35%" / "−3.9%". */
export function signedPct(value: number, digits = 1): string {
  const rounded = Number(Math.abs(value).toFixed(digits));
  const sign = rounded === 0 ? "" : value > 0 ? "+" : MINUS;
  return `${sign}${rounded.toFixed(digits)}%`;
}

/** "3.9%" with no sign, for sentences that already say up or down. */
export function absPct(value: number, digits = 1): string {
  return `${Math.abs(value).toFixed(digits)}%`;
}

/** "1.4 pts", "1 pt". */
export function pts(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return `${text} ${Number(text) === 1 ? "pt" : "pts"}`;
}

/** "$4.2M", "$310K", "$1.1B". */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

/** "AMD", "AMD and NVDA", "AMD, NVDA and MU". */
export function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** "1 report" / "3 reports". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Spelled-out small counts read better at the start of a sentence: "Six of ...". */
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export function countWord(count: number): string {
  return WORDS[count] ?? String(count);
}

function etDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * The session an as-of time belongs to, as a reader would say it: "today",
 * "Monday" within the last week, "on Nov 2" before that. Uses New York days.
 */
export function sessionName(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "in the last session";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "in the last session";
  const day = etDay(at);
  const today = etDay(now);
  if (day === today) return "today";
  const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  if (gap > 0 && gap < 7) return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
  return `on ${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

/** Weekday of a YYYY-MM-DD day: "Thursday". */
export function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? day;
}

/** "Aug 12" from YYYY-MM-DD. */
export function shortDay(day: string): string {
  const month = MONTHS[Number(day.slice(5, 7)) - 1];
  return month ? `${month} ${Number(day.slice(8, 10))}` : day;
}

/** First letter up. */
export function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
