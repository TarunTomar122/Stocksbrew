import { biggestThings, dollarsIn, fitLine, RATING, withoutTicker, type BigCandidate, type BigThing } from "@/lib/biggest";
import type { BriefingPosition } from "@/lib/briefing";
import type { MovedCard } from "@/lib/briefing-face";
import type { OvernightCard } from "@/lib/briefing-overnight";
import { etDayOf } from "@/lib/day-words";
import type { SinceCard } from "@/lib/since-visit";

/**
 * The briefing's "Biggest things" (lib/biggest.ts) from the modules the page already worked out: the Overnight strip's
 * after-hours and pre-market prints, Why it moved's moves with a confirmed reason and this week's reports, and Since
 * you last looked's reports and insider buys (its moves span several sessions, so they stay there). No read of its own. The page then leaves these stocks out of
 * those modules (a stock shows once, owner rule 1). Pure.
 */

export type BriefingBigInput = {
  positions: readonly BriefingPosition[];
  overnight: readonly OvernightCard[];
  moved: readonly MovedCard[];
  since: readonly SinceCard[];
  /** The day the page's prices are from: a move on Why it moved happened then. */
  priceDay: string | null;
  /** The source words for a moved card's hover ("Reuters, Nov 11"). */
  sourceOf?: (card: MovedCard) => string | null;
  /**
   * This week's report on each stock in one sentence without its move ("CBRS reported revenue of $211M, up 55% from a
   * year ago and raised its outlook."), from the results reads the page already has: a report card says that first.
   */
  reports?: Readonly<Record<string, string>>;
  /** Each stock's report day this week: a report card says when it reported, not when its print traded. */
  reportDays?: Readonly<Record<string, string>>;
};

export function briefingBiggest(input: BriefingBigInput): BigThing[] {
  const byTicker = new Map(input.positions.map((position) => [position.ticker.toUpperCase(), position]));
  const holding = (ticker: string) => byTicker.get(ticker)?.relation === "holding";
  const href = (ticker: string) => `/stock/${encodeURIComponent(ticker)}`;
  const report = (ticker: string) => {
    const said = input.reports?.[ticker];
    return said ? withoutTicker(said, ticker) : null;
  };
  const candidates: BigCandidate[] = [];
  for (const card of input.overnight) {
    const ticker = card.ticker.toUpperCase();
    const reported = Boolean(card.line && /^Reported\b/.test(card.line));
    candidates.push({
      ticker,
      name: card.name || ticker,
      kind: reported ? "results" : "move",
      pct: card.pct,
      session: card.session,
      price: card.price,
      holding: card.holding,
      line: reported ? fitLine([report(ticker), card.line]) : null,
      day: (reported ? input.reportDays?.[ticker] : null) ?? etDayOf(card.asOf),
      source: null,
      href: href(ticker),
    });
  }
  for (const card of input.moved) {
    const ticker = card.ticker.toUpperCase();
    // Every Why it moved card has a confirmed reason (a move's research, a story that is the reason, a report).
    const kind = card.kind === "results" ? "results" : RATING.test(card.line) ? "analyst" : "news";
    candidates.push({
      ticker,
      name: card.name || ticker,
      kind,
      pct: card.pct,
      session: null,
      price: card.price,
      holding: holding(ticker),
      line: card.kind === "results" ? fitLine([report(ticker), card.line]) : fitLine([card.line]),
      day: (card.kind === "results" ? input.reportDays?.[ticker] : null) ?? input.priceDay,
      source: input.sourceOf?.(card) ?? null,
      href: card.href || href(ticker),
    });
  }
  for (const card of input.since) {
    const ticker = card.ticker.toUpperCase();
    const base = { ticker, name: card.name || ticker, session: null, price: card.price, holding: holding(ticker), line: fitLine([card.line]), day: null, source: null, href: card.href || href(ticker) };
    if (card.kind === "results") candidates.push({ ...base, kind: "results", pct: card.pct });
    // Buys only: Since you last looked also lists insider sales, which are not "Insider buy".
    else if (card.kind === "insider" && /\bbought\b/i.test(card.line)) candidates.push({ ...base, kind: "insider", pct: card.pct, amount: dollarsIn(card.line) });
  }
  return biggestThings(candidates);
}
