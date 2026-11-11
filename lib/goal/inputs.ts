/**
 * The goal planner's inputs: what the person types, read from and written to
 * the address so a plan can be reloaded or shared. Pure.
 */

export const MIX_IDS = ["own", "spy", "qqq", "6040"] as const;
export type MixId = (typeof MIX_IDS)[number];

export type GoalInputs = {
  /** The goal, in dollars (today's dollars when `real`). */
  target: number;
  /** Age now and the age to reach the goal by. */
  age: number;
  byAge: number;
  /** Added at the end of every month. */
  monthly: number;
  /** What the money is worth today. */
  start: number;
  mix: MixId;
  /** Today's money: inflation taken off every return, the goal and the monthly amount kept in today's dollars. */
  real: boolean;
  /** Your holdings only: replay their full past lead over the S&P 500 (the flattering version) instead of half of it. */
  full: boolean;
};

export const DEFAULTS: Omit<GoalInputs, "start" | "mix"> = {
  target: 1_000_000,
  age: 35,
  byAge: 55,
  monthly: 500,
  real: true,
  full: false,
};

export const LIMITS = {
  target: [1_000, 1_000_000_000],
  age: [14, 90],
  byAge: [15, 110],
  monthly: [0, 1_000_000],
  start: [0, 1_000_000_000],
} as const;

type Params = Record<string, string | string[] | undefined> | URLSearchParams | null | undefined;

function param(params: Params, key: string): string | null {
  if (!params) return null;
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** "1,000,000", "$250k", "1.5m" -> a number; anything else -> null. */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase().replace(/[$,\s_]/g, "");
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1);
  return Number.isFinite(value) ? value : null;
}

function within(value: number | null, [lo, hi]: readonly [number, number]): number | null {
  if (value === null || !Number.isFinite(value) || value < lo || value > hi) return null;
  return value;
}

/** Inputs from the address, each falling back to its default (and `start` to the portfolio's value). */
export function readInputs(params: Params, fallbackStart: number, haveOwn: boolean): GoalInputs {
  const age = within(parseAmount(param(params, "age")), LIMITS.age);
  const byAge = within(parseAmount(param(params, "by")), LIMITS.byAge);
  const mixRaw = param(params, "mix");
  const mix = (MIX_IDS as readonly string[]).includes(mixRaw ?? "") ? (mixRaw as MixId) : haveOwn ? "own" : "spy";
  const realRaw = param(params, "real");
  return {
    target: within(parseAmount(param(params, "goal")), LIMITS.target) ?? DEFAULTS.target,
    age: age !== null ? Math.round(age) : DEFAULTS.age,
    byAge: byAge !== null ? Math.round(byAge) : DEFAULTS.byAge,
    monthly: within(parseAmount(param(params, "monthly")), LIMITS.monthly) ?? DEFAULTS.monthly,
    start: within(parseAmount(param(params, "start")), LIMITS.start) ?? Math.max(0, Math.round(fallbackStart)),
    mix: mix === "own" && !haveOwn ? "spy" : mix,
    real: realRaw === "0" ? false : realRaw === "1" ? true : DEFAULTS.real,
    full: param(params, "full") === "1",
  };
}

/** The address for a set of inputs; `start` is left out while it is still the portfolio's own value. */
export function inputsQuery(inputs: GoalInputs, portfolioStart: number): string {
  const query = new URLSearchParams();
  query.set("goal", String(Math.round(inputs.target)));
  query.set("age", String(inputs.age));
  query.set("by", String(inputs.byAge));
  query.set("monthly", String(Math.round(inputs.monthly)));
  if (Math.round(inputs.start) !== Math.round(portfolioStart)) query.set("start", String(Math.round(inputs.start)));
  query.set("mix", inputs.mix);
  query.set("real", inputs.real ? "1" : "0");
  if (inputs.full) query.set("full", "1");
  return query.toString();
}

/** Why a set of inputs cannot be planned, in a sentence, or null when it can. */
export function inputProblem(inputs: GoalInputs): string | null {
  const years = inputs.byAge - inputs.age;
  if (years < 1) return "The age to reach the goal by has to be at least a year after your age now.";
  if (years > 50) return "The planner looks at most 50 years ahead.";
  return null;
}
