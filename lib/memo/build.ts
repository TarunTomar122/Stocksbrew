import { buildFacts, leftOutSentence, moveSize, pct, rise, type WeekPerformance } from "./facts";
import { MEMO_VERSION, type Memo, type MemoFact, type MemoInputs, type MemoItem, type MemoSection } from "./types";

/**
 * The memo from the week's facts: rules pick what goes in each section and
 * write every sentence. word.ts may reword them afterwards, under a numbers
 * check. "Nothing changed" is a real answer: a quiet week gives a short memo,
 * never padding.
 */

export const SECTION_MAX: Record<MemoSection, number> = { changed: 5, hurt: 3, look: 3 };

const countWords = (n: number) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

const capital = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export function pickSection(facts: readonly MemoFact[], section: MemoSection): MemoFact[] {
  return facts
    // The week's return is the top line's first sentence; listing it again under "What changed" repeated it.
    .filter((fact) => fact.section === section && fact.kind !== "performance")
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
    .slice(0, SECTION_MAX[section]);
}

export function toItem(fact: MemoFact, text: string = fact.text): MemoItem {
  return {
    id: fact.id,
    kind: fact.kind,
    text,
    href: fact.href,
    linkLabel: fact.linkLabel,
    tone: fact.tone,
    tickers: fact.tickers,
    source: fact.source,
    asOf: fact.asOf,
  };
}

/** Two sentences: how the week went against the S&P 500, then the one thing to look at (or that nothing needs you). */
export function ruleTopLine(
  inputs: Pick<MemoInputs, "subject" | "week">,
  perf: WeekPerformance | null,
  chosen: { changed: MemoFact[]; hurt: MemoFact[]; look: MemoFact[] },
): string {
  const example = inputs.subject === "example";
  const subject = example ? "The example portfolio" : "Your holdings";
  const past = inputs.week.complete;
  let first: string;
  if (perf) {
    const partial = perf.priced < perf.total;
    const verb = partial ? (past ? (perf.portfolioPct >= 0 ? "rose" : "fell") : perf.portfolioPct >= 0 ? "are up" : "are down") : rise(perf.portfolioPct, past, inputs.subject);
    // "Together": the figure is the group's, not each holding's ("Eight of nine are down 0.1%" read as each one).
    const who = partial ? `Together, ${countWords(perf.priced)} of ${example ? "the example's" : "your"} ${countWords(perf.total)} holdings` : subject;
    const when = past ? "this week" : "so far this week";
    let against = "";
    if (perf.marketPct !== null) {
      const gap = perf.portfolioPct - perf.marketPct;
      const market = `the S&P 500's ${pct(perf.marketPct)} ${perf.marketPct >= 0 ? "rise" : "fall"}`;
      against = Math.abs(gap) < 0.25 ? `, about in step with ${market}` : gap > 0 ? `, ahead of ${market}` : `, behind ${market}`;
    }
    const drivers = chosen.changed.find((fact) => fact.kind === "drivers");
    const lead = drivers ? leadDriver(drivers, perf) : null;
    const leadWords = lead ? `, with ${lead} doing the most ${perf.portfolioPct >= 0 ? "to lift it" : "damage"}` : "";
    first = `${who} ${verb} ${moveSize(perf.portfolioPct)} ${when}${against}${leadWords}.`;
    // The holding the figure leaves out is named, with why, so nobody wonders where it went.
    const leftOut = partial ? leftOutSentence(perf) : "";
    if (leftOut) first = `${first} ${leftOut}`;
  } else {
    first = `We cannot measure ${example ? "the example's" : "your"} week yet: fewer than two holdings have both a share count and this week's closes.`;
  }
  const watch = chosen.hurt[0];
  const look = chosen.look[0];
  const news = chosen.changed.filter((fact) => fact.kind !== "performance" && fact.kind !== "drivers");
  let second: string;
  if (watch) second = `The thing to watch is that ${watch.short}.`;
  else if (look) second = `Worth a look: ${look.short}.`;
  else if (news.length > 0) second = `Nothing in ${example ? "its" : "your"} stocks needs a decision right now.`;
  else second = `Nothing else changed: no call changes, explained moves, earnings reports or filings in ${example ? "its" : "your"} stocks.`;
  return `${first} ${capital(second)}`;
}

/** The driver named in the top line: the one in the direction of the week, when it did at least 40% of the move. */
function leadDriver(fact: MemoFact, perf: WeekPerformance): string | null {
  const key = perf.portfolioPct >= 0 ? "best" : "worst";
  const ticker = fact.data[key];
  const share = fact.data[`${key}_points`];
  if (typeof ticker !== "string" || typeof share !== "number" || perf.portfolioPct === 0) return null;
  if (Math.sign(share) !== Math.sign(perf.portfolioPct) || Math.abs(share) < Math.abs(perf.portfolioPct) * 0.4) return null;
  return perf.moves.find((move) => move.ticker === ticker)?.name ?? ticker;
}

export type BuiltMemo = {
  memo: Memo;
  /** The facts in the memo, by item id, for wording and checking. */
  chosen: MemoFact[];
  /** Every holding's name, so a reworded sentence cannot bring in a company its facts do not name. */
  names: string[];
  /** Words a reworded top line must keep: "Together" and the holdings left out of a partial week's figure. */
  topLineMustSay: string[];
};

export function buildMemo(inputs: MemoInputs, now: Date = new Date()): BuiltMemo {
  const { facts, performance } = buildFacts(inputs);
  const chosen = { changed: pickSection(facts, "changed"), hurt: pickSection(facts, "hurt"), look: pickSection(facts, "look") };
  // The week's return is not listed as an item, but it is kept on the memo, and its values still back the top
  // line's numbers when it is reworded.
  const performanceFact = facts.find((fact) => fact.kind === "performance");
  const memo: Memo = {
    version: MEMO_VERSION,
    weekKey: inputs.week.key,
    monday: inputs.week.monday,
    friday: inputs.week.friday,
    endDay: performance?.to ?? inputs.week.endDay,
    complete: inputs.week.complete,
    subject: inputs.subject,
    topLine: ruleTopLine(inputs, performance, chosen),
    week: performanceFact ? toItem(performanceFact) : null,
    changed: chosen.changed.map((fact) => toItem(fact)),
    hurt: chosen.hurt.map((fact) => toItem(fact)),
    look: chosen.look.map((fact) => toItem(fact)),
    // Only what the memo would have shown: reasons on facts that made it into a section.
    heldBack: [...chosen.changed, ...chosen.hurt, ...chosen.look].reduce((sum, fact) => sum + (fact.heldBack ?? 0), 0),
    wordedBy: "rules",
    writtenAt: now.toISOString(),
  };
  const partial = performance ? performance.priced < performance.total : false;
  return {
    memo,
    chosen: [...(performanceFact ? [performanceFact] : []), ...chosen.changed, ...chosen.hurt, ...chosen.look],
    names: inputs.holdings.map((holding) => holding.name),
    topLineMustSay: partial && performance ? ["Together", ...performance.left.slice(0, 4).map((row) => row.name)] : [],
  };
}
