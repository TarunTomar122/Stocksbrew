/**
 * Whether a day's move is an old number. The movers feed is priced once after
 * the open (~9:58 AM ET) and re-priced only for stocks with a fresher quote, so
 * at 3 PM a read could say "CoreWeave rose 23.9%" next to a live index when the
 * 23.9% is five hours old. A move whose quote is more than two hours behind
 * (behind the close, once the session is over) says its own time instead:
 * "By 9:58 AM, CoreWeave was up 23.9%".
 */

/** A quote this far behind now (or behind the close) is no longer "today's move" without its time. */
export const STALE_MOVE_MINUTES = 120;

const CLOSE_MINUTES = 16 * 60;

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

function etParts(ms: number): { day: string; minutes: number } | null {
  const parts = Object.fromEntries(ET_PARTS.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (!parts.year || !Number.isFinite(minutes)) return null;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes };
}

/** "9:58 AM" from minutes after midnight. */
function clockWords(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * "9:58 AM" when a move priced at `stamp` is stale at `now`: a quote from today's
 * New York session, taken before the close and more than two hours before now
 * (or before the close, once the market has shut). Null when the move is fresh,
 * from another day (the reads say "on Monday" for those), or has no usable time.
 */
export function staleMoveClock(stamp: string | null | undefined, now: number = Date.now()): string | null {
  // A bare day ("2026-11-11") is not a quote time.
  if (!stamp || /^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at) || !Number.isFinite(now) || at > now) return null;
  const quote = etParts(at);
  const current = etParts(now);
  if (!quote || !current || quote.day !== current.day) return null;
  // A quote from the close or later is the day's result, never stale on its own day.
  if (quote.minutes >= CLOSE_MINUTES) return null;
  const reference = Math.min(current.minutes, CLOSE_MINUTES);
  return reference - quote.minutes > STALE_MOVE_MINUTES ? clockWords(quote.minutes) : null;
}
