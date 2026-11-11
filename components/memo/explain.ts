import type { CallWord, Memo, MemoCallChange, MemoCurvePoint, MemoItem, MemoMover } from "@/lib/memo/types";
import { pct } from "@/lib/memo/format";
import { CALL_CHIP } from "@/lib/memo/view";
import { longDay, shortDay, weekdayName } from "@/lib/memo/week";

/**
 * What opens under a row of the memo's charts and tables: the memo's own
 * sentence about it (why a holding moved, the call's reason), where that came
 * from and when, the page with the evidence, and a question for Ask that starts
 * from the same memo line (lib/ask-context.ts `memo:<item id>`). Built from the
 * stored memo's items, so nothing is written for the page. Pure.
 */

export type LinkTo = { label: string; href: string };

export type Explanation = {
  /** The memo's sentence, or null when the memo has none for this row. */
  text: string | null;
  /** "Researched move explanations · Nov 10". */
  source: string | null;
  evidence: LinkTo | null;
  ask: LinkTo;
};

/** A stock's explained moves or report on one day of the week, for the week chart's day panel. */
export type DayStory = { ticker: string; text: string; source: string; evidence: LinkTo };

export type DayExplain = { day: string; stories: DayStory[]; ask: LinkTo };

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MEMO_ITEM = /^[A-Za-z0-9:._-]{1,120}$/;

function allItems(memo: Pick<Memo, "changed" | "hurt" | "look">): MemoItem[] {
  return [...memo.changed, ...memo.hurt, ...memo.look];
}

/** /ask with the question and the memo line (or the stock) it starts from. Same link as lib/next-steps.ts askHref. */
function askLink(question: string, context: string | null): LinkTo {
  return { label: "Ask about this", href: `/ask?q=${encodeURIComponent(question)}${context ? `&ctx=${encodeURIComponent(context)}` : ""}` };
}

/** The memo line as an Ask context, or the stock when the line has no usable id. */
function contextFor(item: MemoItem | null, ticker: string | null, example: boolean): string | null {
  if (item && MEMO_ITEM.test(item.id)) return `${example ? "ex." : ""}memo:${item.id}`;
  return ticker && TICKER.test(ticker) ? `stock:${ticker}` : example ? "ex.memo" : "memo";
}

function sourceWords(item: MemoItem): string {
  return [item.source, /^\d{4}-\d{2}-\d{2}$/.test(item.asOf) ? shortDay(item.asOf) : null].filter(Boolean).join(" · ");
}

/**
 * A move or call line only explains anything when it carries a confirmed reason. Without one, lib/memo/facts.ts
 * writes just the event, ending on its day ("Nvidia fell 5.2% on Monday, Nov 9."), which repeats the row.
 * Stored items keep no reason field, so the sentence's end tells.
 */
const hasReason = (item: MemoItem) => !/^\d{4}-\d{2}-\d{2}$/.test(item.asOf) || !item.text.trim().endsWith(`on ${longDay(item.asOf)}.`);

/** The item that explains a holding's week: its report, else its biggest move with a confirmed reason. */
function moverItem(items: MemoItem[], ticker: string): MemoItem | null {
  const own = items.filter((item) => item.tickers.length === 1 && item.tickers[0] === ticker);
  return own.find((item) => item.kind === "report") ?? own.find((item) => item.kind === "move" && hasReason(item)) ?? null;
}

export function explainMover(memo: Pick<Memo, "changed" | "hurt" | "look">, mover: MemoMover, example: boolean): Explanation {
  const item = moverItem(allItems(memo), mover.ticker);
  const verb = Math.abs(mover.pct) < 0.05 ? "move" : mover.pct > 0 ? "rise" : "fall";
  const question = verb === "move" ? `What moved ${mover.ticker} this week?` : `Why did ${mover.ticker} ${verb} ${pct(mover.pct)} this week?`;
  const evidenceLabel = mover.href.includes("/earnings/") ? "The earnings report" : mover.href.includes("/moves/") ? "Why it moved" : `Open ${mover.ticker}`;
  return {
    text: item?.text ?? null,
    source: item ? sourceWords(item) : null,
    evidence: item ? { label: item.linkLabel, href: item.href } : { label: evidenceLabel, href: mover.href },
    ask: askLink(question, contextFor(item, mover.ticker, example)),
  };
}

/** The item about a call change: its own line, and only when it carries the reason (the grouped line just repeats the row). */
function callItem(items: MemoItem[], call: MemoCallChange): MemoItem | null {
  const own = items.filter((item) => item.kind === "call" && item.tickers.length === 1 && item.tickers[0] === call.ticker && hasReason(item));
  return own.find((item) => item.id === `call:${call.ticker}:${call.date}`) ?? own[0] ?? null;
}

const callWords = (call: CallWord) => CALL_CHIP[call].label;

export function explainCall(memo: Pick<Memo, "changed" | "hurt" | "look">, call: MemoCallChange, example: boolean): Explanation {
  const item = callItem(allItems(memo), call);
  const question = `Why did the call on ${call.ticker} change from ${callWords(call.from)} to ${callWords(call.to)}?`;
  return {
    text: item?.text ?? null,
    source: item ? sourceWords(item) : null,
    evidence: { label: `${call.ticker}'s call and its reason`, href: `/stock/${encodeURIComponent(call.ticker)}` },
    ask: askLink(question, contextFor(item, call.ticker, example)),
  };
}

/** Each day on the week chart with the holdings' explained moves and reports that day, and a question about it. */
export function explainDays(memo: Pick<Memo, "changed" | "hurt" | "look" | "subject">, curve: MemoCurvePoint[]): DayExplain[] {
  const items = allItems(memo).filter((item) => (item.kind === "report" || (item.kind === "move" && hasReason(item))) && item.tickers.length === 1);
  const example = memo.subject === "example";
  const whose = example ? "the example portfolio" : "my portfolio";
  return curve.map((point, index) => {
    const stories = items
      .filter((item) => item.asOf === point.day)
      .map((item) => ({ ticker: item.tickers[0]!, text: item.text, source: sourceWords(item), evidence: { label: item.linkLabel, href: item.href } }));
    // The first point is the close before Monday: the week's starting line, not a day of it (the chart offers no story for it).
    const question = index === 0 ? `How did ${whose} start this week?` : `What moved ${whose} on ${weekdayName(point.day)}, ${shortDay(point.day)}?`;
    // A day is about the whole memo, not one of its lines.
    return { day: point.day, stories, ask: askLink(question, example ? "ex.memo" : "memo") };
  });
}
