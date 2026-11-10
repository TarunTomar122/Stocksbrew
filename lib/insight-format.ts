/**
 * Small pure helpers the page insight builders share (stock, portfolio,
 * compare, screener): medians, the way a percentage or a day is written in a
 * sentence, and joining names. No I/O.
 */

export function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function median(values: readonly number[]): number | null {
  const clean = values.filter(fin).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2;
}

export function mean(values: readonly number[]): number | null {
  const clean = values.filter(fin);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

/** One decimal under 10, whole numbers above: "4.3%", "38%". No sign. */
export function pct(value: number, digits?: number): string {
  const abs = Math.abs(value);
  const d = digits ?? (abs < 10 ? 1 : 0);
  return `${abs.toFixed(d)}%`;
}

/** "+4.3%" / "−4.3%" with a real minus sign. */
export function signedPct(value: number, digits?: number): string {
  const text = pct(value, digits);
  if (text === pct(0, digits)) return text;
  return `${value >= 0 ? "+" : "−"}${text}`;
}

/** "rose 4.3%" / "fell 4.3%" / "was flat". */
export function movedWord(value: number, flatBand = 0.05): string {
  if (Math.abs(value) < flatBand) return "was flat";
  return `${value > 0 ? "rose" : "fell"} ${pct(value)}`;
}

/** "is up 4.3%" / "is down 4.3%" / "is flat". */
export function upDown(value: number, flatBand = 0.05): string {
  if (Math.abs(value) < flatBand) return "is flat";
  return `is ${value > 0 ? "up" : "down"} ${pct(value)}`;
}

export function money(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 || Number.isInteger(abs) ? 0 : 2;
  return `$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-12" → "Nov 12". Empty string for anything that is not a date. */
export function shortDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : "";
}

/** Whole days from one ISO day to another. */
export function dayGap(fromDay: string, toDay: string): number | null {
  const from = Date.parse(`${fromDay.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toDay.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/** The New York calendar day of an ISO timestamp, or null. */
export function etDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "today" when the quote is from today, else "on Nov 9". */
export function dayWord(quoteDay: string | null | undefined, today: string): string {
  if (!quoteDay || quoteDay === today) return "today";
  return `on ${shortDay(quoteDay)}`;
}

/** "in 7 days" / "tomorrow" / "today". */
export function inDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Number words for small counts at the start of a sentence fragment. */
export function countWord(count: number): string {
  return ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][count] ?? String(count);
}
