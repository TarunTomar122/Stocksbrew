/**
 * The goal planner's read, in plain sentences built from the replays. Pure.
 */

import type { Insight, TheRead } from "@/lib/insights";
import type { GoalInputs, MixId } from "@/lib/goal/inputs";
import type { Outcome } from "@/lib/goal/plan";
import { monthWords, type PartHistory } from "@/lib/goal/series";

function trimDecimals(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Dollars in words, cut down (never up) to three significant figures, so an
 * outcome just short of the goal never reads as the goal: 612,345 -> "$612,000",
 * 1,239,999 -> "$1.23 million", 999,600 -> "$999,000".
 */
export function moneyWords(value: number): string {
  if (!Number.isFinite(value)) return "an unknown amount";
  const v = Math.max(0, value);
  if (v < 1000) return `$${Math.floor(v).toLocaleString("en-US")}`;
  const unit = 10 ** (Math.floor(Math.log10(v)) - 2);
  const floored = Math.floor(v / unit + 1e-9) * unit;
  if (floored >= 1e12) return `$${trimDecimals(floored / 1e12)} trillion`;
  if (floored >= 1e9) return `$${trimDecimals(floored / 1e9)} billion`;
  if (floored >= 1e6) return `$${trimDecimals(floored / 1e6)} million`;
  return `$${Math.round(floored).toLocaleString("en-US")}`;
}

/** A monthly amount as typed: "$300". */
export function monthlyWords(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Whole-number percent of a 0-to-1 share, "under 1%" below half a percent. */
export function pctWords(share: number): string {
  const pct = Math.round(share * 100);
  return pct < 1 ? "under 1%" : `${pct}%`;
}

function yearsWords(n: number): string {
  return n === 1 ? "a year" : `${n} years`;
}

export function subjectOf(mix: MixId, example: boolean): string {
  if (mix === "own") return example ? "this portfolio" : "your portfolio";
  if (mix === "spy") return "an all S&P 500 portfolio";
  if (mix === "qqq") return "an all Nasdaq 100 portfolio";
  return "a 60/40 mix of stocks and bonds";
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The S&P 500's chance, said beside the mix's: "about 8 in 10". */
export function spyChanceWords(chance: number): string {
  if (chance >= 0.95) return "more than 9 in 10";
  if (chance < 0.05) return "fewer than 1 in 20";
  if (chance >= 0.45 && chance < 0.55) return "about half";
  return `about ${Math.round(chance * 10)} in 10`;
}

/**
 * The headline: how often the mix reaches the goal, with the S&P 500's
 * replays of the same stretches right beside it when the mix is something
 * else, then the weak end of the range.
 */
function withDiscount(sentence: string, on: boolean): string {
  return on ? sentence.replace(/\.$/, ", counting only half of each holding's past lead over the S&P 500.") : sentence;
}

export function headline(outcome: Outcome, inputs: GoalInputs, subject: string): string {
  const goal = moneyWords(inputs.target);
  const by = `by ${inputs.byAge}`;
  const { chance, end } = outcome;
  if (inputs.start <= 0 && inputs.monthly <= 0) return `With nothing to start with and nothing added each month, ${subject} has nothing to grow.`;
  if (inputs.start >= inputs.target) {
    return `What you have now already covers the ${goal} goal; in the weakest one in ten replays ${subject} is at ${moneyWords(end.p10)} ${by}.`;
  }
  const beside = outcome.benchmark ? `, against ${spyChanceWords(outcome.benchmark.chance)} with only the S&P 500` : "";
  if (chance >= 0.95) return `In almost every replay ${subject} reaches ${goal} ${by}${beside}; even the weakest one in ten gets to ${moneyWords(end.p10)}.`;
  if (chance < 0.05) {
    if (outcome.benchmark && outcome.benchmark.chance < 0.05) {
      return `Almost no replay gets ${subject}, or the S&P 500 alone, to ${goal} ${by}; the middle replay ends at ${moneyWords(end.p50)}.`;
    }
    return beside
      ? `Almost no replay gets ${subject} to ${goal} ${by}${beside}; the middle replay ends at ${moneyWords(end.p50)}.`
      : `Almost no replay gets ${subject} to ${goal} ${by}; the middle replay ends at ${moneyWords(end.p50)} and the strongest one in ten at ${moneyWords(end.p90)}.`;
  }
  if (chance >= 0.45 && chance < 0.55) {
    return `In about half of the replays ${subject} reaches ${goal} ${by}${beside}; in the weakest one in ten it gets to ${moneyWords(end.p10)}.`;
  }
  const k = Math.round(chance * 10);
  return beside
    ? `In about ${k} of every 10 replays ${subject} reaches ${goal} ${by}${beside}; the weakest one in ten gets to ${moneyWords(end.p10)}.`
    : `In about ${k} of every 10 replays ${subject} reaches ${goal} ${by}; the middle replay ends at ${moneyWords(end.p50)} and the weakest one in ten at ${moneyWords(end.p10)}.`;
}

function leverInsight(outcome: Outcome, inputs: GoalInputs): Insight | null {
  const goal = moneyWords(inputs.target);
  const more = outcome.levers.find((lever) => lever.kind === "more");
  const later = outcome.levers.find((lever) => lever.kind === "later");
  const earlier = outcome.levers.find((lever) => lever.kind === "earlier");
  const less = outcome.levers.find((lever) => lever.kind === "less");
  const pace = inputs.monthly > 0 ? `At ${monthlyWords(inputs.monthly)} a month` : "Without adding money";
  const laterText =
    later && later.kind === "later" ? `${pace}, half the replays get there by ${later.age}, ${yearsWords(later.years)} later than you planned.` : null;
  if (more && more.kind === "more") {
    const added =
      inputs.monthly > 0
        ? `Putting in ${monthlyWords(more.monthly)} a month, ${monthlyWords(more.extra)} more than now,`
        : `Putting in ${monthlyWords(more.monthly)} a month`;
    const result = more.q <= 0.5 ? `would lift the middle replay to ${goal}.` : `would get 3 in 4 replays to ${goal}.`;
    return { id: "goal-lever-more", tone: "up", text: `${added} ${result}`, ...(laterText ? { soWhat: laterText } : {}) };
  }
  if (laterText) return { id: "goal-lever-later", tone: "flat", text: laterText };
  const lessText =
    less && less.kind === "less"
      ? less.monthly === 0
        ? "Even if you stopped adding money, 3 in 4 replays would still get there."
        : `${monthlyWords(less.monthly)} a month, ${monthlyWords(less.less)} less than now, would still reach it in 3 of 4 replays.`
      : null;
  if (earlier && earlier.kind === "earlier") {
    return {
      id: "goal-lever-earlier",
      tone: "up",
      text: `${pace}, half the replays reach ${goal} by ${earlier.age}, ${yearsWords(earlier.years)} early.`,
      ...(lessText ? { soWhat: lessText } : {}),
    };
  }
  if (lessText) return { id: "goal-lever-less", tone: "up", text: lessText };
  return null;
}

/**
 * The holding that carried the mix: when one stock gave at least a quarter of
 * the mix's average monthly gain and at least twice its weight, the replays
 * lean on a run that may not repeat. Funds are left out (they spread their own risk).
 */
export function driverOf(parts: PartHistory[]): PartHistory | null {
  if (parts.length < 2) return null;
  const outsized = parts.filter((part) => !part.fund && part.driveShare !== null && part.driveShare >= 0.25 && part.driveShare >= part.weight * 2);
  return [...outsized].sort((a, b) => b.driveShare! - a.driveShare!)[0] ?? null;
}

function driverInsight(parts: PartHistory[], subject: string, full: boolean): Insight | null {
  const top = driverOf(parts);
  if (!top) return null;
  // The share counts the S&P 500's months where it stands in for the stock, so say so.
  const standIn = top.filled > 0 && top.first ? `, counting the S&P 500 in its place before ${monthWords(top.first)}` : "";
  return {
    id: `goal-driver-${top.ticker}`,
    tone: "flat",
    tickers: [top.ticker],
    leadName: top.name,
    text: `${top.ticker} is ${pctWords(top.weight)} of ${subject} but gave about ${pctWords(Math.min(1, top.driveShare!))} of its average monthly gain over these years${standIn}.`,
    soWhat: full
      ? "The replays assume a run like that can come again, so the better outcomes lean on it."
      : "Even counted at half, the better replays lean on a run like that coming again.",
  };
}

/** The hindsight discount in one sentence, and the S&P 500's middle replay beside the mix's. */
export const DISCOUNT_SENTENCE =
  "We count only half of how far each holding beat or trailed the S&P 500, because today's holdings were picked knowing how they did.";
export const FULL_SENTENCE =
  "This is the full replay, the flattering version: it counts all of how far each holding beat or trailed the S&P 500, though today's holdings were picked knowing how they did.";
/** The full replay when the holdings trailed the S&P 500: the discount was the kinder view, so "flattering" would be wrong. */
export const FULL_SENTENCE_TRAILED =
  "This is the full replay: it counts all of how far each holding beat or trailed the S&P 500, without the hindsight discount.";

function benchmarkInsight(outcome: Outcome, subject: string, discount: "half" | "full" | null, flatters: boolean): Insight | null {
  const bench = outcome.benchmark;
  const mine = outcome.end.p50;
  const compare =
    bench && (mine > 0 || bench.p50 > 0)
      ? `Replaying only the S&P 500 over the same stretches, the middle replay is ${moneyWords(bench.p50)}, against ${moneyWords(mine)} for ${subject}.`
      : null;
  if (discount) {
    return {
      id: discount === "half" ? "goal-discount" : "goal-full",
      tone: "flat",
      text: discount === "half" ? DISCOUNT_SENTENCE : flatters ? FULL_SENTENCE : FULL_SENTENCE_TRAILED,
      ...(compare ? { soWhat: compare } : {}),
    };
  }
  // A comparison, not good or bad news.
  return compare ? { id: "goal-benchmark", tone: "flat", text: compare } : null;
}

export function buildGoalRead(
  outcome: Outcome,
  inputs: GoalInputs,
  context: {
    example: boolean;
    parts: PartHistory[];
    span: { first: string; last: string };
    paths: number;
    /** The holdings' full past beat the S&P 500's, so the full replay is the flattering one. Defaults to true. */
    fullFlatters?: boolean;
  },
): TheRead {
  const subject = subjectOf(inputs.mix, context.example);
  const discount = inputs.mix === "own" ? (inputs.full ? "full" : "half") : null;
  return {
    // The discount goes in the headline itself, so the most-read sentence never states the flattering number bare.
    headline: cap(withDiscount(headline(outcome, inputs, subject), discount === "half" && inputs.start < inputs.target && (inputs.start > 0 || inputs.monthly > 0))),
    // The discount and the S&P 500 come second so they stay in view on a phone, next to the lever.
    insights: [
      leverInsight(outcome, inputs),
      benchmarkInsight(outcome, subject, discount, context.fullFlatters ?? true),
      inputs.mix === "own" ? driverInsight(context.parts, subject, inputs.full) : null,
    ].filter((item): item is Insight => item !== null),
    source: `${context.paths.toLocaleString("en-US")} replays of past monthly returns from ${monthWords(context.span.first)} to ${monthWords(context.span.last)}. A replay of the past, not a forecast.`,
  };
}
