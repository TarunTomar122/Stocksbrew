import { typicalDailyMove } from "@/lib/calendar-insights";
import { vsDayWords } from "@/lib/earnings-season";
import { shortDay } from "@/lib/read-format";

/**
 * Price facts for a briefing card whose stock moved with no confirmed reason (owner rule 3: every stock card carries
 * one highlighted fact of its own; rule 7: never a reason we could not confirm). Worked out from the stock's own daily
 * closes, so every word is a measured number: "Its biggest gain since Sep 9", "About three times a normal day", "A
 * normal day moves it about 1.1%". Pure; the closes are read in ./briefing-move-facts-server.ts.
 */

/** Daily closes, oldest first. */
export type CloseSeries = { dates: string[]; closes: number[] };

/** A move this many sessions after the last one at least as big is worth "its biggest since" (about two months). */
const SINCE_MIN_SESSIONS = 40;
/** A same-sized move is "this one" when the last close already holds it (prices taken after the close). */
const SAME_MOVE_PP = 0.2;
/** A move at least this many times a normal day says so ("About twice a normal day"). */
const VS_DAY_MIN = 1.75;
/** The month is the last 21 sessions, today's included. */
const MONTH_SESSIONS = 21;
/** A month that moved less than this says nothing worth a card. */
const MONTH_MIN_PCT = 1;

function capitalise(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** "Sep 9", or "Sep 9, 2025" when it is from another year than the move. */
function sinceDay(day: string, moveDay: string): string {
  return day.slice(0, 4) === moveDay.slice(0, 4) ? shortDay(day) : `${shortDay(day)}, ${day.slice(0, 4)}`;
}

/**
 * The facts for a move of `pct` percent on `moveDay`, most telling first. Only closes before the move's day count, and
 * a last close that already holds this same move is left out, so the move is never measured against itself. Empty
 * when the history is too short to say anything.
 */
export function moveFacts(pct: number, series: CloseSeries | null | undefined, moveDay: string, options: { exactDay?: boolean } = {}): string[] {
  if (!series || !Number.isFinite(pct) || pct === 0) return [];
  const points: Array<{ date: string; close: number }> = [];
  const n = Math.min(series.dates.length, series.closes.length);
  for (let index = 0; index < n; index += 1) {
    const date = series.dates[index];
    const close = series.closes[index];
    if (typeof date === "string" && date < moveDay && typeof close === "number" && Number.isFinite(close) && close > 0) points.push({ date, close });
  }
  // Only when the move's day is a guess (no quote time): a close that already holds this same move is the move itself.
  if (!options.exactDay && points.length >= 2) {
    const last = points[points.length - 1]!;
    const before = points[points.length - 2]!;
    const lastPct = (last.close / before.close - 1) * 100;
    if (Math.abs(lastPct - pct) < SAME_MOVE_PP) points.pop();
  }
  if (points.length < 31) return [];

  const out: string[] = [];
  const up = pct > 0;
  const size = Math.abs(pct);
  // The last session that moved at least as much the same way.
  let found: number | null = null;
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const move = (points[index]!.close / points[index - 1]!.close - 1) * 100;
    if ((move > 0) === up && Math.abs(move) >= size) {
      found = index;
      break;
    }
  }
  const word = up ? "gain" : "drop";
  if (found !== null) {
    if (points.length - found >= SINCE_MIN_SESSIONS) out.push(`Its biggest ${word} since ${sinceDay(points[found]!.date, moveDay)}`);
  } else if (points.length >= SINCE_MIN_SESSIONS) {
    const days = (Date.parse(`${moveDay}T12:00:00Z`) - Date.parse(`${points[0]!.date}T12:00:00Z`)) / 86_400_000;
    const years = Math.floor(days / 365.25);
    const months = Math.floor(days / 30.44);
    if (years >= 2) out.push(`Its biggest ${word} in more than ${years} years`);
    else if (years === 1) out.push(`Its biggest ${word} in more than a year`);
    else if (months >= 2) out.push(`Its biggest ${word} in more than ${months} months`);
  }

  const normal = typicalDailyMove(points.map((point) => point.close));
  if (normal !== null && normal > 0) {
    const ratio = size / normal;
    // "About twice a normal 1.1% day": the stock's own normal day in the words, so two cards never say the same thing.
    const versus = ratio >= VS_DAY_MIN ? vsDayWords(ratio) : null;
    out.push(versus ? `${capitalise(versus.replace(/ normal day$/, ""))} normal ${normal.toFixed(1)}% day` : `A normal day moves it about ${normal.toFixed(1)}%`);
  }

  // Where the month stands with today's move in it: "Still down 5.1% over the past month" after a gain.
  const monthAgo = points[points.length - MONTH_SESSIONS];
  // Only from a series that runs up to the move (a cached copy a session or more behind would count the wrong month).
  const lastGap = (Date.parse(`${moveDay}T12:00:00Z`) - Date.parse(`${points[points.length - 1]!.date}T12:00:00Z`)) / 86_400_000;
  if (monthAgo && lastGap <= 4) {
    const now = points[points.length - 1]!.close * (1 + pct / 100);
    const month = (now / monthAgo.close - 1) * 100;
    if (Math.abs(month) >= MONTH_MIN_PCT) {
      const words = `${month > 0 ? "up" : "down"} ${Math.abs(month).toFixed(1)}% over the past month`;
      out.push(month > 0 === up ? capitalise(words) : `Still ${words}`);
    }
  }
  return out;
}
