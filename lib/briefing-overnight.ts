/**
 * The briefing's "Overnight" strip: the person's holdings and watched stocks that moved big outside the regular
 * session (5% or more, or 3% or more after a report; lib/extended-quotes.ts), before the next open. One card each with
 * the logo, the after-hours or pre-market move, its price and one line; gone once the session opens.
 *
 * Pure: the read is `loadOvernight` in lib/briefing-overnight-server.ts. Never a session's move: the strip's figures
 * are not fed into the briefing's day moves, the heat map or the read.
 */

import { etToday } from "@/lib/day-words";
import {
  bigExtendedMove,
  extendedDropAt,
  extendedTime,
  isExtendedLive,
  lastPostQuote,
  reportedWhen,
  reportFits,
  sessionLabel,
  shortReason,
  type ExtendedQuote,
  type ExtendedSession,
} from "@/lib/extended-quotes";

export type OvernightCard = {
  ticker: string;
  name: string;
  session: ExtendedSession;
  pct: number;
  price: number;
  asOf: string;
  /** "Reported after the close: raised its outlook", or the session and time when the strip mixes sessions. */
  line: string | null;
  holding: boolean;
};

export type OvernightStrip = {
  /** "After hours" during the evening, "Overnight" from midnight to the open. */
  title: string;
  /** The session and newest time, said once for the strip when every card shares the session: "After hours, 7:59 PM ET". */
  when: string | null;
  cards: OvernightCard[];
  /** When the strip goes away: the next regular open (ms). */
  dropAt: number;
};

/** At most this many cards: the biggest moves. */
export const OVERNIGHT_MAX = 8;

type Position = { ticker: string; name: string; relation: "holding" | "watching" };

/** The print to show for a stock: the newest when it is big, else last evening's after-hours one when that was. */
function bigPrint(quote: ExtendedQuote, now: number): ExtendedQuote | null {
  if (!isExtendedLive(quote, now)) return null;
  const newest = reportFits(quote, quote.earnings) ? quote : { ...quote, earnings: null };
  if (bigExtendedMove(newest)) return newest;
  const post = lastPostQuote(quote);
  return post && bigExtendedMove(post) && isExtendedLive(post, now) ? post : null;
}

export function overnightStrip(positions: readonly Position[], quotes: ReadonlyMap<string, ExtendedQuote>, now: number = Date.now(), exclude: ReadonlySet<string> = new Set()): OvernightStrip | null {
  const seen = new Set<string>();
  const picked: Array<{ quote: ExtendedQuote; position: Position }> = [];
  for (const position of positions) {
    const ticker = position.ticker.toUpperCase();
    if (seen.has(ticker) || exclude.has(ticker)) continue;
    seen.add(ticker);
    const quote = quotes.get(ticker);
    const print = quote ? bigPrint(quote, now) : null;
    if (print) picked.push({ quote: print, position });
  }
  if (picked.length === 0) return null;
  picked.sort((a, b) => Math.abs(b.quote.changePct) - Math.abs(a.quote.changePct) || a.quote.ticker.localeCompare(b.quote.ticker));
  const top = picked.slice(0, OVERNIGHT_MAX);
  const sessions = new Set(top.map((entry) => entry.quote.session));
  const shared = sessions.size === 1 ? top[0]!.quote.session : null;
  const today = etToday(now);
  const cards: OvernightCard[] = top.map(({ quote, position }) => {
    const reason = quote.earnings ? shortReason(quote.earnings.reason) : null;
    const reported = quote.earnings ? `Reported ${reportedWhen(quote.earnings, today)}${reason ? `: ${reason}` : ""}` : null;
    // Each card says only what differs (owner rule 1): its report, or its session when the strip mixes them.
    const line = reported ?? (shared ? null : `${sessionLabel(quote.session)}, ${extendedTime(quote.asOf, now)}`);
    return { ticker: quote.ticker, name: position.name, session: quote.session, pct: quote.changePct, price: quote.price, asOf: quote.asOf, line, holding: position.relation === "holding" };
  });
  const newest = top.reduce((best, entry) => (Date.parse(entry.quote.asOf) > Date.parse(best.quote.asOf) ? entry : best), top[0]!);
  const drops = top.map((entry) => extendedDropAt(entry.quote)).filter((value): value is number => value !== null);
  // Before midnight on the evening of the prints, the strip is that evening's after hours; later it is overnight.
  const evening = shared === "post" && top.every((entry) => etToday(Date.parse(entry.quote.asOf)) === today);
  return {
    title: evening ? "After hours" : "Overnight",
    // The title already says "After hours" in the evening: the time alone then.
    when: shared ? (evening ? extendedTime(newest.quote.asOf, now) : `${sessionLabel(shared)}, ${extendedTime(newest.quote.asOf, now)}`) : null,
    cards,
    dropAt: drops.length > 0 ? Math.min(...drops) : now,
  };
}
