import { getMarketSessionState } from "@/lib/market-session";
import { etDayOfStamp } from "@/lib/quote-time";
import { isTradingDay, previousTradingDay } from "@/lib/results/build";

/**
 * Whether a quote's day move is today's to show beside its price (owner rule 4; council, Nov 12: a four-day window let
 * Monday's move show on Thursday). The move counts only when the quote is from the current session or, before
 * today's session has opened, the most recent one:
 * - on a trading day from the 9:30 ET open: a quote from today;
 * - on a trading day before the open: today (premarket) or the trading day before;
 * - on a weekend or holiday: the last trading day.
 * A quote stamped in the future, by any amount, is no quote. The price itself still shows; only the move goes.
 */

const OPEN_MINUTES = 9 * 60 + 30;

export function sessionDayMove(dayPct: number | null | undefined, capturedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (typeof dayPct !== "number" || !Number.isFinite(dayPct)) return null;
  const quoteDay = etDayOfStamp(capturedAt);
  const at = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (!quoteDay || !Number.isFinite(at) || at > now.getTime()) return null;
  const today = etDayOfStamp(now.toISOString());
  if (!today) return null;
  if (!isTradingDay(today)) return quoteDay === previousTradingDay(today) ? dayPct : null;
  if (getMarketSessionState(now).minutesOfDay >= OPEN_MINUTES) return quoteDay === today ? dayPct : null;
  return quoteDay === today || quoteDay === previousTradingDay(today) ? dayPct : null;
}
