/**
 * The read of a plain-English basket: a headline and a few insights drawn
 * with plain rules from the matches and the backtest, then the choice of
 * which members the backtest can hold. Pure: no I/O.
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { isFiniteNumber, type ScreenerRow } from "@/lib/screener-shared";

import type { BasketMatch, BasketMember } from "./match";

/* ── which members the backtest can hold ────────────────────────────────── */

export type BacktestPick = {
  /** The first day every included member has a price. Null when fewer than two members have history. */
  start: string | null;
  included: string[];
  /** Listed after the start date, so left out to keep the window long. */
  lateStart: Array<{ symbol: string; first: string }>;
  /** No stored price history at all. */
  noHistory: string[];
};

/**
 * The longest window that still holds most of the basket. A test that waits
 * for the youngest listing to start can shrink twelve years to two, so the
 * start is the first day `share` of the members (at least three) have
 * prices, and the later listings sit out and are named.
 */
export function pickBacktestMembers(firstDates: ReadonlyMap<string, string | null>, share = 0.8): BacktestPick {
  const known = [...firstDates].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length >= 10);
  const noHistory = [...firstDates].filter(([, first]) => !first).map(([symbol]) => symbol);
  if (known.length < 2) return { start: null, included: known.map(([symbol]) => symbol), lateStart: [], noHistory };
  const sorted = [...known].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const need = Math.min(sorted.length, Math.max(3, Math.ceil(sorted.length * share)));
  const start = sorted[need - 1]![1];
  const included = known.filter(([, first]) => first <= start).map(([symbol]) => symbol);
  const lateStart = known.filter(([, first]) => first > start).map(([symbol, first]) => ({ symbol, first }));
  return { start, included, lateStart, noHistory };
}

/* ── the read ───────────────────────────────────────────────────────────── */

/** The few backtest figures the read needs. Returns are fractions (0.12 is 12%), as the engine gives them. */
export type BacktestSummary = {
  start: string;
  end: string;
  years: number;
  members: number;
  basket: { annual: number | null; total: number; worst: number };
  benchmark: { annual: number | null; total: number; worst: number };
};

function monthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[(month ?? 1) - 1]} ${year}`;
}

function pct(fraction: number, digits = 1): string {
  return `${Math.abs(fraction * 100).toFixed(digits)}%`;
}

function signed(fraction: number, digits = 1): string {
  const value = fraction * 100;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** "the 20 power companies", or "the only one" when there is one. */
function ofThe(count: number, noun: string): string {
  return count === 1 ? "the only one" : `the ${count} ${noun}`;
}

function listNames(symbols: string[]): string {
  if (symbols.length <= 1) return symbols[0] ?? "";
  return `${symbols.slice(0, -1).join(", ")} and ${symbols[symbols.length - 1]}`;
}

/** The figure a headline compares: per year when the test ran a year or more, else in total. */
function headlineGap(test: BacktestSummary): { gap: number; perYear: boolean } {
  if (test.basket.annual !== null && test.benchmark.annual !== null) return { gap: test.basket.annual - test.benchmark.annual, perYear: true };
  return { gap: test.basket.total - test.benchmark.total, perYear: false };
}

export function backtestInsight(test: BacktestSummary): Insight {
  const { gap, perYear } = headlineGap(test);
  const ret = perYear ? `${signed(test.basket.annual!)} a year against ${signed(test.benchmark.annual!)} for the S&P 500` : `${signed(test.basket.total)} against ${signed(test.benchmark.total)} for the S&P 500`;
  const deeper = test.basket.worst < test.benchmark.worst - 0.02;
  const shallower = test.basket.worst > test.benchmark.worst + 0.02;
  const fall = `Its worst fall was ${pct(test.basket.worst)}, ${deeper ? "deeper than" : shallower ? "shallower than" : "about the same as"} the index's ${pct(test.benchmark.worst)}.`;
  return {
    id: "backtest",
    tone: toneOfChange(gap * 100, 0.5),
    text: `Held in equal amounts from ${monthYear(test.start)} to ${monthYear(test.end)}, the ${test.members} members with that much price history returned ${ret}. ${fall}`,
    soWhat: `${
      test.members < 5 ? `With only ${test.members} companies, one stock's run decides most of this. ` : ""
    }This puts today's list on the past, so it never holds the companies that failed or shrank out of the theme along the way. Treat it as a description of history, not a forecast.`,
    action: { label: "See the backtest", href: "#backtest" },
  };
}

function concentrationInsight(members: BasketMember[]): Insight | null {
  if (members.length < 4) return null;
  const counts = new Map<string, string[]>();
  for (const member of members) {
    const key = member.row.industry && member.row.industry !== member.row.sector ? member.row.industry : member.row.sector;
    if (!key) continue;
    counts.set(key, [...(counts.get(key) ?? []), member.row.symbol]);
  }
  const top = [...counts].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top || top[1].length * 2 < members.length) return null;
  return {
    id: "concentration",
    tone: "flat",
    text: `${top[1].length} of the ${members.length} are in ${top[0].toLowerCase()}, so the basket rides mostly on one industry.`,
    soWhat: "A single bad report season for that industry would hit most of it at once.",
    tickers: top[1].slice(0, 4),
  };
}

function funnelInsight(match: BasketMatch, subjectNoun: string): Insight | null {
  const biggest = [...match.funnel].sort((a, b) => b.removed - a.removed)[0];
  if (!biggest || biggest.removed === 0 || match.subjectCount === 0) return null;
  const leftOut = biggest.examples.length > 0 ? `, including ${listNames(biggest.examples)}` : "";
  return {
    id: "funnel",
    tone: "flat",
    text: `The “${biggest.label}” condition left out ${biggest.removed} of ${ofThe(match.subjectCount, subjectNoun)}${leftOut}.`,
    soWhat: biggest.removed * 2 >= match.subjectCount ? "Loosen that one first if the list feels thin." : undefined,
    tickers: biggest.examples,
  };
}

function valuationInsight(members: BasketMember[], all: readonly ScreenerRow[]): Insight | null {
  const mine = median(members.map((member) => member.row.pe).filter((pe): pe is number => isFiniteNumber(pe) && pe > 0));
  const market = median(all.map((row) => row.pe).filter((pe): pe is number => isFiniteNumber(pe) && pe > 0));
  const priced = members.filter((member) => isFiniteNumber(member.row.pe) && member.row.pe > 0).length;
  if (mine === null || market === null || priced < 3) return null;
  const ratio = mine / market;
  const word = ratio < 0.85 ? "cheaper than" : ratio > 1.15 ? "dearer than" : "in line with";
  return {
    id: "valuation",
    tone: "flat",
    text: `The middle company here trades on ${mine.toFixed(1)} times earnings, ${word} the ${market.toFixed(1)} of the middle stock we cover.`,
    soWhat:
      priced < members.length
        ? members.length - priced === 1
          ? "One of them has no positive P/E, usually because it is not making a profit."
          : `${members.length - priced} of them have no positive P/E, usually because they are not making a profit.`
        : undefined,
  };
}

function callInsight(members: BasketMember[]): Insight | null {
  const counts = { Add: 0, Hold: 0, Trim: 0 };
  for (const member of members) if (member.row.call) counts[member.row.call] += 1;
  const called = counts.Add + counts.Hold + counts.Trim;
  if (called < 3) return null;
  const adds = members.filter((member) => member.row.call === "Add").map((member) => member.row.symbol);
  return {
    id: "calls",
    tone: counts.Add > counts.Trim ? "up" : counts.Trim > counts.Add ? "down" : "flat",
    text: `Our call says ${CALL_PLAIN.Add.toLowerCase()} on ${counts.Add} of the ${called} we rate, ${CALL_PLAIN.Hold.toLowerCase()} on ${counts.Hold} and ${CALL_PLAIN.Trim.toLowerCase()} on ${counts.Trim}.`,
    tickers: adds.slice(0, 4),
  };
}

/**
 * The read on top of the basket page. `subjectNoun` names what the subject
 * stage counted ("power, grid and cooling companies"); `all` is every covered
 * row, for the market comparison.
 */
export function buildBasketRead(input: {
  match: BasketMatch;
  test: BacktestSummary | null;
  subjectNoun: string;
  all: readonly ScreenerRow[];
  asOf: string | null;
}): TheRead {
  const { match, test } = input;
  const count = match.members.length;
  if (count === 0) {
    const funnel = funnelInsight(match, input.subjectNoun);
    return {
      headline:
        match.subjectCount === 0
          ? "No company we cover fits that description today."
          : match.subjectCount === 1
            ? "The one company that matches the subject does not pass every condition today."
            : `None of the ${match.subjectCount} ${input.subjectNoun} passes every condition today.`,
      insights: pickInsights([funnel]),
      source: "stocksbrew screener",
      asOf: input.asOf,
    };
  }
  const fits = count === 1 ? "One company fits" : `${count} companies fit`;
  let headline = `${fits} today.`;
  if (test) {
    const { gap, perYear } = headlineGap(test);
    const verb = Math.abs(gap) < 0.005 ? "kept pace with" : gap > 0 ? "beat" : "trailed";
    const by = Math.abs(gap) < 0.005 ? "" : ` by ${(Math.abs(gap) * 100).toFixed(1)} points${perYear ? " a year" : ""}`;
    // The test holds at most the first 25 and only those with prices back to its start; say so when that is not everyone.
    const who = test.members === count ? (count === 1 ? "it" : "they") : `the ${test.members} we could test`;
    // "Held equally" and the full dates are the first line under it (backtestInsight); the start month stays
    // here unless the "we could test" caveat needs the room.
    const since = test.members === count ? ` since ${monthYear(test.start)}` : "";
    headline = `${fits} today, and${since} ${who} ${verb} the S&P 500${by}.`;
  }
  const shown = match.members.slice(0, 25);
  return {
    headline,
    insights: pickInsights(
      [test ? backtestInsight(test) : null, funnelInsight(match, input.subjectNoun), concentrationInsight(shown), valuationInsight(shown, input.all), callInsight(shown)],
      4,
    ),
    source: "stocksbrew screener and adjusted daily closes",
    asOf: input.asOf,
  };
}
