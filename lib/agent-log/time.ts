/** New York day and clock helpers for the agent log. Pure. */

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The New York day ("YYYY-MM-DD") and minutes after midnight of an instant, or null for a bad timestamp. */
export function nyClock(input: string | number | Date): { day: string; minutes: number } | null {
  const ms = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(ET_PARTS.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function nyDayOf(input: string | number | Date): string | null {
  return nyClock(input)?.day ?? null;
}

/** "7:30 AM" in New York. Empty for a bad timestamp. */
export function nyTime(iso: string): string {
  const clock = nyClock(iso);
  if (!clock) return "";
  const hour = Math.floor(clock.minutes / 60);
  const minute = clock.minutes % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The weekday before `day` (Friday before a Monday). Market holidays are not skipped: a closed day just logs little. */
export function previousWeekday(day: string): string {
  let out = shiftDay(day, -1);
  while ([0, 6].includes(new Date(`${out}T12:00:00Z`).getUTCDay())) out = shiftDay(out, -1);
  return out;
}

export function isWeekend(day: string): boolean {
  return [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}

/** The UTC instant of `minutes` after midnight on a New York day, as "YYYY-MM-DDTHH:MM:SS" (no zone, for string ranges). */
export function nyInstant(day: string, minutes = 0): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  // New York is 4 or 5 hours behind UTC: take the offset that lands on the wanted wall-clock time.
  for (const offset of [4, 5]) {
    const ms = Date.UTC(y, m - 1, d, offset, minutes);
    const clock = nyClock(ms);
    if (clock && clock.day === day && clock.minutes === minutes) return new Date(ms).toISOString().slice(0, 19);
  }
  return new Date(Date.UTC(y, m - 1, d, 5, minutes)).toISOString().slice(0, 19);
}

/** [start, end) of a New York day in UTC, as range bounds for ISO timestamp strings. */
export function nyDayBounds(day: string): [string, string] {
  return [nyInstant(day), nyInstant(shiftDay(day, 1))];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "today", "yesterday" or the weekday name, seen from `today`. */
export function whenWord(day: string, today: string): string {
  if (day === today) return "today";
  if (day === shiftDay(today, -1)) return "yesterday";
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? day;
}

/**
 * When a batch job finished: the time by which nine in ten of its records were written, so one straggler re-run
 * hours later does not stand for the whole run (a later full run moves it, as it should).
 */
export function batchTime(stamps: string[]): string {
  const sorted = stamps
    .map((stamp) => ({ stamp, ms: Date.parse(stamp) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => a.ms - b.ms);
  if (sorted.length === 0) return "";
  return sorted[Math.ceil(sorted.length * 0.9) - 1]!.stamp;
}
