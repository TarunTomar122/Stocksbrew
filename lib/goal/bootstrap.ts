/**
 * Replays for the goal planner: a block bootstrap over real monthly returns.
 *
 * Each replay strings together random 12-month stretches of the stored
 * history (a stretch that runs past the newest month carries on from the
 * oldest), so a crash and the months after it stay together. The random
 * starts come from a fixed seed and depend only on the number of months, so
 * the server and the browser draw the same replays, and two mixes on the
 * same calendar are replayed over the same stretches of history.
 *
 * A replay's value after y years is linear in the money put in:
 *   value = start × growth[y] + monthly × saved[y]
 * where growth is what $1 held from the start grows to and saved is what $1
 * added at the end of every month grows to. Both are stored per replay per
 * year, so changing the goal, the start or the monthly amount needs no new
 * replays, and the monthly amount that reaches a chance can be solved exactly.
 *
 * Pure, and safe to import in the browser.
 */

export const BLOCK_MONTHS = 12;
export const PATHS = 4000;
/** Replays run this long, so "how many years would it take" has room past the goal. */
export const MAX_YEARS = 60;
/** The longest goal the planner takes. */
export const MAX_GOAL_YEARS = 50;
/**
 * Yearly inflation taken off every return in today's money: a flat 3%, close to
 * the average yearly rise in US consumer prices since 2014. We do not store the
 * monthly price index, so it is a flat rate.
 */
export const INFLATION = 0.03;
const SEED = 0x5eed2014;
/** 1.03 ^ (1 / 12), written out so the server and every browser divide by the very same number. */
const MONTHLY_DEFLATE = 1.0024662697723037;

/** Small, fast, seeded PRNG (mulberry32): the same seed gives the same draws everywhere. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Replays = {
  paths: number;
  years: number;
  /** growth[p × (years + 1) + y]: what $1 held from the start is worth after y years. */
  growth: Float64Array;
  /** saved[p × (years + 1) + y]: what $1 added at the end of every month is worth after y years. */
  saved: Float64Array;
};

export type ReplayOptions = {
  paths?: number;
  years?: number;
  block?: number;
  seed?: number;
  /** Take this yearly inflation off every return (today's money). 0 for plain dollars. */
  inflation?: number;
};

export function replay(returns: readonly number[], options: ReplayOptions = {}): Replays {
  const paths = options.paths ?? PATHS;
  const years = options.years ?? MAX_YEARS;
  const block = Math.max(1, options.block ?? BLOCK_MONTHS);
  const inflation = options.inflation ?? 0;
  const n = returns.length;
  const stride = years + 1;
  const growth = new Float64Array(paths * stride);
  const saved = new Float64Array(paths * stride);
  if (n === 0) {
    for (let p = 0; p < paths; p++) growth[p * stride] = 1;
    return { paths, years, growth, saved };
  }
  const deflate = inflation === 0 ? 1 : inflation === INFLATION ? MONTHLY_DEFLATE : Math.pow(1 + inflation, 1 / 12);
  const factors = returns.map((value) => (1 + value) / deflate);
  const rng = seeded(options.seed ?? SEED);
  const months = years * 12;
  for (let p = 0; p < paths; p++) {
    const row = p * stride;
    let g = 1;
    let s = 0;
    let start = 0;
    growth[row] = 1;
    for (let m = 0; m < months; m++) {
      const at = m % block;
      if (at === 0) start = Math.floor(rng() * n);
      const f = factors[(start + at) % n]!;
      g *= f;
      s = s * f + 1;
      if ((m + 1) % 12 === 0) {
        const y = (m + 1) / 12;
        growth[row + y] = g;
        saved[row + y] = s;
      }
    }
  }
  return { paths, years, growth, saved };
}

/** Each replay's value after `year` years. */
export function valuesAt(replays: Replays, year: number, start: number, monthly: number): Float64Array {
  const y = Math.max(0, Math.min(replays.years, Math.round(year)));
  const stride = replays.years + 1;
  const out = new Float64Array(replays.paths);
  for (let p = 0; p < replays.paths; p++) out[p] = start * replays.growth[p * stride + y]! + monthly * replays.saved[p * stride + y]!;
  return out;
}

/** Linear-interpolated percentile (q from 0 to 1) of an ascending array. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = Math.min(1, Math.max(0, q)) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export type Band = { year: number; p10: number; p25: number; p50: number; p75: number; p90: number };

export function bandAt(replays: Replays, year: number, start: number, monthly: number): Band {
  const values = valuesAt(replays, year, start, monthly).sort();
  return {
    year,
    p10: quantile(values, 0.1),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
  };
}

/** One band per year from now (year 0) to `years`. */
export function bands(replays: Replays, years: number, start: number, monthly: number): Band[] {
  const out: Band[] = [];
  const last = Math.max(0, Math.min(replays.years, Math.round(years)));
  for (let y = 0; y <= last; y++) out.push(bandAt(replays, y, start, monthly));
  return out;
}

/** Share of replays (0 to 1) worth at least `target` after `year` years. */
export function chanceAt(replays: Replays, year: number, start: number, monthly: number, target: number): number {
  const values = valuesAt(replays, year, start, monthly);
  let hit = 0;
  for (let p = 0; p < values.length; p++) if (values[p]! >= target) hit++;
  return values.length > 0 ? hit / values.length : 0;
}

/**
 * The smallest monthly amount that gets at least a share `q` of replays to
 * `target` after `year` years, or null when no amount can (no months to add
 * money in). Exact for these replays, since each one's value is linear in it.
 */
export function monthlyForChance(replays: Replays, year: number, start: number, target: number, q: number): number | null {
  const y = Math.max(0, Math.min(replays.years, Math.round(year)));
  const stride = replays.years + 1;
  const needed = new Float64Array(replays.paths);
  for (let p = 0; p < replays.paths; p++) {
    const short = target - start * replays.growth[p * stride + y]!;
    const per = replays.saved[p * stride + y]!;
    needed[p] = short <= 0 ? 0 : per > 0 ? short / per : Infinity;
  }
  needed.sort();
  const k = Math.max(1, Math.ceil(Math.min(1, Math.max(0, q)) * replays.paths));
  const value = needed[k - 1]!;
  return Number.isFinite(value) ? value : null;
}

/** The first whole year (1 to the replays' length) by which at least a share `q` of replays reach `target`, or null. */
export function yearsForChance(replays: Replays, start: number, monthly: number, target: number, q: number): number | null {
  for (let y = 1; y <= replays.years; y++) if (chanceAt(replays, y, start, monthly, target) >= q) return y;
  return null;
}

/** A monthly amount rounded up to a figure a person would type: $10 steps under $1,000, $50 under $10,000, then $100. */
export function roundUpMonthly(value: number): number {
  if (!(value > 0)) return 0;
  const step = value < 1000 ? 10 : value < 10000 ? 50 : 100;
  return Math.ceil(value / step - 1e-9) * step;
}

/** Compounded yearly return of a monthly series, e.g. 0.12 for 12% a year. */
export function yearlyOf(returns: readonly number[]): number | null {
  if (returns.length < 12) return null;
  let log = 0;
  for (const value of returns) log += Math.log1p(value);
  return Math.expm1((log / returns.length) * 12);
}
