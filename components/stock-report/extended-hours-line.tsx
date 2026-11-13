import { etDayOf, etToday } from "@/lib/day-words";
import { isExtendedLive, reportedWhen, reportFits } from "@/lib/extended-quotes";
import { getExtendedQuote } from "@/lib/extended-quotes-server";
import type { LivePremarketQuote } from "@/lib/premarket-shared";

import { ExtendedHoursText, type ExtendedLine } from "./extended-hours-text";

/**
 * The stock page's one line under the price when the stock trades outside the regular session: "After hours $115.68
 * +18.3% · 7:59 PM ET", or, when it reported, "Reported after the close; up 18.3% after hours at $115.68 · 7:59 PM ET".
 * Never the close and never the day's change: the big price above stays the regular session's.
 *
 * Wired in components/stock-report/report.tsx under the price figure, inside its own Suspense, so the hero never
 * waits for it. Its own read (lib/extended-quotes-server.ts, cached a minute). Without a stored quote, this morning's
 * premarket snapshot (the movers job, already checked live by the loader) is the pre-market line instead, so the page
 * shows one pre-market figure, not two.
 */
export async function ExtendedHoursLine({
  ticker,
  market,
  regularAt,
  premarket,
  nowIso,
}: {
  ticker: string;
  market: "US" | "IN";
  /** The page's own regular-session quote time: an extended print older than it is not shown. */
  regularAt: string | null;
  premarket: LivePremarketQuote | null;
  nowIso: string;
}) {
  if (market !== "US") return null;
  const parsedNow = Date.parse(nowIso);
  const now = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const quote = await getExtendedQuote(ticker);
  let line: ExtendedLine | null = null;
  if (quote && isExtendedLive(quote, now, regularAt)) {
    // Only a report that explains this print: a before-open report is not the reason for that evening's move.
    const earnings = reportFits(quote, quote.earnings) ? quote.earnings : null;
    line = {
      session: quote.session,
      // "after the close yesterday" the morning after, "on Friday" over the weekend: the report's day is said here, and
      // the time below leaves it out when it is the same day.
      reported: earnings ? reportedWhen(earnings, etToday(now)) : null,
      reason: earnings?.reason ?? null,
      price: quote.price,
      changePct: quote.changePct,
      asOf: quote.asOf,
      timeWithDay: !(earnings && etDayOf(quote.asOf) === earnings.date),
      title: `${quote.source}, against the $${quote.regularClose.toFixed(2)} close. Trading outside the regular session is thin.`,
    };
  } else if (premarket && Number.isFinite(premarket.price) && Number.isFinite(premarket.changePct)) {
    line = {
      session: "pre",
      reported: null,
      reason: null,
      price: premarket.price,
      changePct: premarket.changePct,
      asOf: premarket.generatedAt,
      timeWithDay: true,
      title: "Pre-market snapshot. Trading outside the regular session is thin.",
    };
  }
  return line ? <ExtendedHoursText line={line} /> : null;
}
