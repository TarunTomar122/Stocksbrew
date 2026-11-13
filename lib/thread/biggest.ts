import { biggestThings, dollarsIn, fitLine, RATING, withoutTicker, type BigCandidate, type BigKind, type BigThing } from "@/lib/biggest";
import type { OvernightCard } from "@/lib/briefing-overnight";
import { tradingDayBefore } from "@/lib/briefing-face";
import { etDayOf } from "@/lib/day-words";
import type { InboxItem } from "@/lib/inbox/types";

import { withoutLevels } from "./build";
import { withoutDayWords } from "./record";

/**
 * /agent's "Biggest things" from what the thread already read: the inbox's items (reports, the agents' move findings
 * with their confirmed reasons, insider buys, filings that add risks) and the Overnight strip's after-hours and
 * pre-market prints (lib/briefing-overnight.ts, from the same cached extended quotes the inbox reads). Ranked by
 * lib/biggest.ts. Pure.
 */

export type ThreadBigInput = {
  today: string;
  items: readonly InboxItem[];
  /** The stocks the person owns (the rest they watch). */
  holding: ReadonlySet<string>;
  /** Each stock's name and latest price, from the thread's screener rows. */
  names: Readonly<Record<string, string>>;
  prices: Readonly<Record<string, number>>;
  /** Each stock's latest day move, percent: what an insider buy's or a filing's card shows beside the price. */
  dayPcts?: Readonly<Record<string, number>>;
  /** Whether the viewer's plan shows our levels on this stock: a line with a level in it is cut for the rest. */
  levels: (ticker: string) => boolean;
  overnight?: readonly OvernightCard[];
};


/** "CBRS reported …, and is up 16% before the open." → "CBRS reported ….": the card's figure already says the move. */
function withoutMove(text: string): string {
  return text.replace(/,?\s+and\s+(?:is\s+|was\s+)?(?:up|down|rose|fell|jumped|dropped|gained|slid)\b[^.]*\./i, ".");
}

/** "about twice a normal day" out of "AVGO rose 5.5% yesterday, about twice a normal day.": the move's size in words. */
function normalClause(text: string): string | null {
  const match = /,\s+(about [^,.]*normal day)\./i.exec(text);
  return match ? `${match[1]!.charAt(0).toUpperCase()}${match[1]!.slice(1)}.` : null;
}

function candidateOf(item: InboxItem, input: ThreadBigInput): BigCandidate | null {
  const ticker = item.tickers[0]!.toUpperCase();
  const said = (text: string | null | undefined) => {
    if (!text) return null;
    const clean = input.levels(ticker) ? text : withoutLevels(text);
    return clean ? withoutDayWords(withoutTicker(clean, ticker), item.day, input.today) : null;
  };
  const base = {
    ticker,
    name: input.names[ticker] || ticker,
    holding: input.holding.has(ticker),
    day: item.day,
    source: item.source || null,
    href: item.external ? `/stock/${encodeURIComponent(ticker)}` : item.href || `/stock/${encodeURIComponent(ticker)}`,
    price: input.prices[ticker] ?? null,
    ids: [item.id],
  };
  if (item.kind === "results") {
    const result = item.result;
    const session = result?.moveSession === "after_hours" ? "post" : result?.moveSession === "pre_market" ? "pre" : null;
    // The day it reported (the item's id carries it), not the day the market took it: "Earnings · Yesterday".
    const reported = /^results:[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(item.id)?.[1] ?? item.day;
    return { ...base, day: reported, kind: "results", pct: result?.movePct ?? null, session, line: fitLine([said(result?.figures), said(withoutMove(item.text))]) };
  }
  if (item.kind === "agent" && (item.move || item.extended)) {
    // A confirmed reason makes it news (or a rating change) even when it is too long for the card's line.
    const detail = said(item.detail);
    const reason = fitLine([detail]);
    const kind: BigKind = detail ? (RATING.test(detail) ? "analyst" : "news") : "move";
    if (item.move) {
      return { ...base, kind, pct: item.move.pct, session: null, normalPct: item.move.normalPct, line: reason ?? fitLine([normalClause(item.text)]) };
    }
    const ext = item.extended!;
    return { ...base, kind, pct: ext.pct, session: ext.session, price: ext.price, line: reason };
  }
  // Buys only: a sale is not "Insider buy" (the inbox's insider source reads buys, but the words decide).
  if (item.kind === "insider" && /\bbought\b/i.test(item.text)) {
    return { ...base, kind: "insider", pct: input.dayPcts?.[ticker] ?? null, session: null, amount: dollarsIn(item.text), line: fitLine([said(item.text)]) };
  }
  // A filing that adds risks changes the story; one that lists none, or none new, is a quiet check.
  if (item.kind === "filing" && /\badds? \d+ (?:new )?risks?\b/i.test(item.text)) {
    return { ...base, kind: "filing", pct: input.dayPcts?.[ticker] ?? null, session: null, line: fitLine([said(item.text)]) };
  }
  return null;
}

/**
 * The thread's biggest things since the last trading day. A report and its after-hours or pre-market print are one
 * event: the report's words with the print's move and price.
 */
export function threadBiggest(input: ThreadBigInput): BigThing[] {
  const from = tradingDayBefore(input.today);
  const prints = new Map((input.overnight ?? []).map((card) => [card.ticker.toUpperCase(), card]));
  const candidates: BigCandidate[] = [];
  for (const item of input.items) {
    if (item.quiet || item.locked || item.tickers.length !== 1 || item.day < from || item.day > input.today) continue;
    const candidate = candidateOf(item, input);
    if (!candidate) continue;
    const print = prints.get(candidate.ticker);
    if (candidate.kind === "results" && print) {
      prints.delete(candidate.ticker);
      candidates.push({ ...candidate, pct: print.pct, session: print.session, price: print.price });
    } else candidates.push(candidate);
  }
  for (const print of prints.values()) {
    const ticker = print.ticker.toUpperCase();
    const reported = Boolean(print.line && /^Reported\b/.test(print.line));
    candidates.push({
      ticker,
      name: print.name || input.names[ticker] || ticker,
      kind: reported ? "results" : "move",
      pct: print.pct,
      session: print.session,
      price: print.price,
      holding: print.holding,
      line: reported ? fitLine([print.line]) : null,
      day: etDayOf(print.asOf),
      source: null,
      href: `/stock/${encodeURIComponent(ticker)}`,
    });
  }
  return biggestThings(candidates);
}
