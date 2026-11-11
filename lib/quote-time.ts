/**
 * When a number was measured. A move shown next to a time must carry the time
 * of the price it came from, not the time the reason was researched or the feed
 * was built: CRWV read +23.9% "as of 9:58 AM" on the briefing when the 23.9% was
 * a 3:03 PM quote and 9:58 was when the movers feed ran.
 */

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

function instant(value: string | null | undefined): number | null {
  // A bare day ("2026-11-11") parses as UTC midnight, 7 PM the evening before in New York: it is not a quote time.
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function pick(values: ReadonlyArray<string | null | undefined>, later: boolean): string | null {
  let best: { value: string; ms: number } | null = null;
  for (const value of values) {
    const ms = instant(value);
    if (ms !== null && (!best || (later ? ms > best.ms : ms < best.ms))) best = { value: value as string, ms };
  }
  return best?.value ?? null;
}

/** The newest of several timestamps, compared as instants ("…+00:00" and "…Z" sort together). Null when none parse. */
export function newestStamp(values: ReadonlyArray<string | null | undefined>): string | null {
  return pick(values, true);
}

/**
 * The oldest of several timestamps. One "as of" over a list of numbers is the oldest of their times: every number
 * is at least that fresh, while the newest would date a move that kept its morning quote to the afternoon.
 */
export function oldestStamp(values: ReadonlyArray<string | null | undefined>): string | null {
  return pick(values, false);
}

/** The New York day of a timestamp ("2026-11-11"), or null. */
export function etDayOfStamp(value: string | null | undefined): string | null {
  const ms = instant(value);
  return ms === null ? null : ET_DAY.format(new Date(ms));
}

/** "9:56 AM ET", or null when the timestamp does not parse. */
export function etClock(value: string | null | undefined): string | null {
  const ms = instant(value);
  return ms === null ? null : `${ET_CLOCK.format(new Date(ms))} ET`;
}

/**
 * The time a day's list of moves was priced, for one header: the oldest quote time
 * that falls on that New York day. Null when no quote is from that day (an
 * archived day whose prices carry no time says only the day).
 */
export function pricedAt(stamps: ReadonlyArray<string | null | undefined>, day: string): string | null {
  return etClock(oldestStamp(stamps.filter((stamp) => etDayOfStamp(stamp) === day)));
}
