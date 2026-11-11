/**
 * Monthly returns for the goal planner, from stored adjusted daily closes
 * (`tm_price_history_daily`, dividends included).
 *
 * A month's return is its last close over the last close of the month before.
 * The month that is still running is left out. Every series is laid on one
 * calendar of months (the S&P 500's), so the replays pick the same months for
 * the portfolio and for the index.
 *
 * Pure, and safe to import in the browser.
 */

export type DailyCloses = { dates: string[]; closes: number[] };

/** "2026-11-10" -> "2026-11". */
const monthOf = (day: string) => day.slice(0, 7);

function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Month -> return over that month, for every month whose close and the close
 * of the month right before it are both stored. The month of `today` (New York
 * day, YYYY-MM-DD) is still running and never counts.
 */
export function monthlyReturns(series: DailyCloses, today: string): Map<string, number> {
  const ends = new Map<string, number>();
  const n = Math.min(series.dates.length, series.closes.length);
  for (let i = 0; i < n; i++) {
    const day = series.dates[i];
    const close = series.closes[i];
    if (typeof day !== "string" || day.length < 10) continue;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    ends.set(monthOf(day), close); // dates arrive in order, so the last one wins
  }
  const running = monthOf(today);
  const out = new Map<string, number>();
  for (const [month, close] of ends) {
    if (month >= running) continue;
    const before = ends.get(previousMonth(month));
    if (before === undefined) continue;
    out.set(month, close / before - 1);
  }
  return out;
}

export type MixPart = {
  ticker: string;
  name: string;
  /** Any positive number; parts are scaled to add up to 1. */
  weight: number;
  fund: boolean;
  /** Its own monthly returns, or null when we hold no prices for it. */
  returns: Map<string, number> | null;
};

export type PartHistory = {
  ticker: string;
  name: string;
  /** Share of the mix, 0 to 1. */
  weight: number;
  fund: boolean;
  /** First and last month of the calendar with its own return, null when it has none. */
  first: string | null;
  last: string | null;
  /** Months of the calendar with its own return. */
  own: number;
  /** Months where the S&P 500's return stands in for it. */
  filled: number;
  /** Its own average yearly return over its own months (compounded), or null under a year of them. */
  yearly: number | null;
  /**
   * Its share of the mix's average monthly return (weight × the slot's average month ÷ the mix's
   * average month, months filled by the benchmark included), or null under a year of its own
   * returns or when the mix did not gain on average.
   */
  driveShare: number | null;
};

export type Mix = {
  /** The calendar: one "YYYY-MM" per return. */
  months: string[];
  /** The mix's return each month, at fixed weights (as if rebalanced every month). */
  returns: number[];
  parts: PartHistory[];
  /** Weighted share of the calendar that used the S&P 500 in place of a holding, 0 to 1. */
  filledShare: number;
};

function compoundYearly(values: number[]): number | null {
  if (values.length < 12) return null;
  let log = 0;
  for (const value of values) log += Math.log1p(value);
  return Math.expm1((log / values.length) * 12);
}

/**
 * The mix's monthly returns on the benchmark's calendar. A part without its
 * own return in a month (it was not trading yet, or the stored prices stop
 * early) takes the benchmark's return for that month, and its history says so.
 */
export function buildMix(benchmark: Map<string, number>, input: MixPart[]): Mix | null {
  const months = [...benchmark.keys()].sort();
  const parts = input.filter((part) => Number.isFinite(part.weight) && part.weight > 0);
  if (months.length === 0 || parts.length === 0) return null;
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const returns = new Array<number>(months.length).fill(0);
  let filledWeight = 0;
  const own: number[][] = [];
  const slotSums: number[] = [];
  const histories: PartHistory[] = parts.map((part) => {
    const weight = part.weight / total;
    let first: string | null = null;
    let last: string | null = null;
    const mine: number[] = [];
    let filled = 0;
    let slot = 0;
    months.forEach((month, index) => {
      const value = part.returns?.get(month);
      if (value !== undefined && Number.isFinite(value)) {
        returns[index] += weight * value;
        slot += value;
        mine.push(value);
        if (first === null) first = month;
        last = month;
      } else {
        const stand = benchmark.get(month)!;
        returns[index] += weight * stand;
        slot += stand;
        filled++;
      }
    });
    slotSums.push(slot);
    filledWeight += weight * filled;
    own.push(mine);
    return { ticker: part.ticker, name: part.name, weight, fund: part.fund, first, last, own: mine.length, filled, yearly: compoundYearly(mine), driveShare: null };
  });
  const mixMean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  // Shares of the mix's average month add up to 1 across the parts (filled months count for the slot).
  histories.forEach((history, index) => {
    if (own[index]!.length < 12 || !(mixMean > 0)) return;
    history.driveShare = (history.weight * (slotSums[index]! / months.length)) / mixMean;
  });
  return { months, returns, parts: histories, filledShare: filledWeight / months.length };
}

/**
 * The hindsight discount: the share of each holding's past lead (or lag) over
 * the S&P 500 the replays count. Today's holdings were picked knowing how they
 * did, so replaying their full past flatters them.
 */
export const HINDSIGHT_DISCOUNT = 0.5;

/**
 * A mix with only part of its past lead over the benchmark: each month
 * benchmark + k × (mix − benchmark). The weights add up to 1, so this is the
 * same as pulling every holding's own return toward the benchmark by k.
 * Both series are on the same calendar of months.
 */
export function discounted(mix: readonly number[], benchmark: readonly number[], k = HINDSIGHT_DISCOUNT): number[] {
  return mix.map((value, index) => {
    const base = benchmark[index];
    return base === undefined ? value : base + k * (value - base);
  });
}

/** "2014-12" -> "Dec 2014". */
export function monthWords(month: string | null): string {
  if (!month) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = Number(month.slice(5, 7));
  return `${names[m - 1] ?? month.slice(5, 7)} ${month.slice(0, 4)}`;
}
