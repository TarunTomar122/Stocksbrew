/**
 * One plan: the replays at the goal age, the range over time, and one lever
 * the person controls (more each month, or more or fewer years). Pure.
 */

import {
  bandAt,
  bands,
  chanceAt,
  monthlyForChance,
  roundUpMonthly,
  yearsForChance,
  type Band,
  type Replays,
} from "@/lib/goal/bootstrap";
import type { GoalInputs } from "@/lib/goal/inputs";

export type Lever =
  /** Put in `monthly` a month (`extra` more than now) and a share `q` of replays reach the goal. */
  | { kind: "more"; q: number; monthly: number; extra: number }
  /** At today's monthly amount, half the replays reach the goal by `age` (later than the goal age). */
  | { kind: "later"; age: number; years: number }
  /** At today's monthly amount, half the replays reach the goal by `age` (earlier than the goal age). */
  | { kind: "earlier"; age: number; years: number }
  /** `monthly` a month (`less` under today's) still reaches the goal in 3 of 4 replays. */
  | { kind: "less"; monthly: number; less: number };

export type Outcome = {
  years: number;
  /** One band per year from now to the goal age. */
  bands: Band[];
  /** The range at the goal age. */
  end: Band;
  /** Share of replays at or above the goal at the goal age, 0 to 1. */
  chance: number;
  /** The start plus every monthly amount, not grown. */
  putIn: number;
  levers: Lever[];
  /** The same plan replaying only the S&P 500 over the same stretches, when the mix is something else. */
  benchmark: { chance: number; p50: number } | null;
};

/** Ignore a lever that changes the plan by less than this (rounding noise). */
const MIN_EXTRA = 10;
/** A "later" age past this is no plan anyone can use. */
const OLDEST = 100;

/**
 * The solved amount rounded up to a typed figure, nudged one more step if
 * floating point left it a hair short of the chance it was solved for.
 */
function typedAmountFor(replays: Replays, years: number, start: number, target: number, q: number): number | null {
  const needed = monthlyForChance(replays, years, start, target, q);
  if (needed === null) return null;
  let rounded = roundUpMonthly(needed);
  if (chanceAt(replays, years, start, rounded, target) < q) rounded = roundUpMonthly(rounded + 1);
  return rounded;
}

export function levers(replays: Replays, inputs: GoalInputs, years: number, chance: number): Lever[] {
  const { start, monthly, target, age } = inputs;
  const out: Lever[] = [];
  // Already there today: no lever is worth naming.
  if (start >= target) return out;
  if (chance < 0.75) {
    const q = chance < 0.5 ? 0.5 : 0.75;
    const rounded = typedAmountFor(replays, years, start, target, q);
    if (rounded !== null && rounded - monthly >= MIN_EXTRA) out.push({ kind: "more", q, monthly: rounded, extra: rounded - monthly });
    if (chance < 0.5) {
      const by = yearsForChance(replays, start, monthly, target, 0.5);
      if (by !== null && by > years && age + by <= OLDEST) out.push({ kind: "later", age: age + by, years: by - years });
    }
    return out;
  }
  const by = yearsForChance(replays, start, monthly, target, 0.5);
  if (by !== null && by < years) out.push({ kind: "earlier", age: age + by, years: years - by });
  const rounded = typedAmountFor(replays, years, start, target, 0.75);
  if (rounded !== null && monthly - rounded >= MIN_EXTRA) out.push({ kind: "less", monthly: rounded, less: monthly - rounded });
  return out;
}

export function planOutcome(replays: Replays, inputs: GoalInputs, benchmark: Replays | null): Outcome {
  const years = Math.max(1, Math.min(replays.years, inputs.byAge - inputs.age));
  const { start, monthly, target } = inputs;
  const all = bands(replays, years, start, monthly);
  const chance = chanceAt(replays, years, start, monthly, target);
  return {
    years,
    bands: all,
    end: all[all.length - 1]!,
    chance,
    putIn: start + monthly * 12 * years,
    levers: levers(replays, inputs, years, chance),
    benchmark: benchmark
      ? { chance: chanceAt(benchmark, years, start, monthly, target), p50: bandAt(benchmark, years, start, monthly).p50 }
      : null,
  };
}
