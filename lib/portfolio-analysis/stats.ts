/**
 * Daily-return arithmetic shared by the swings and the move-together modules. Pure.
 *
 * Returns are lined up on the S&P 500's (SPY's) own sessions: a holding's return on a session is its close that
 * day over its close the session before, and only when both closes exist. A holding with fewer than
 * `minSessions` returns in the window is dropped first, so one recent listing does not shrink everyone's window;
 * the rest are compared on the sessions they all traded. A missing day is left out, never read as a flat day.
 */

export type CloseSeries = {
  dates: string[];
  closes: number[];
  /** False when the closes are not adjusted for splits and dividends: those cannot be compared over time. */
  adjusted?: boolean;
};

export const WINDOW_SESSIONS = 252;
export const MIN_SESSIONS = 60;
export const TRADING_DAYS = 252;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export type Aligned = {
  /** The session before the first return: where an index built from these returns starts. */
  start: string;
  dates: string[];
  bench: number[];
  /** Daily returns per ticker, on `dates`. */
  byTicker: Record<string, number[]>;
  /** Tickers left out: no prices, unadjusted prices, or too few sessions. */
  dropped: string[];
};

function closeMap(series: CloseSeries): Map<string, number> {
  const out = new Map<string, number>();
  const n = Math.min(series.dates.length, series.closes.length);
  for (let i = 0; i < n; i++) {
    const close = series.closes[i];
    const date = series.dates[i];
    if (typeof date === "string" && fin(close) && close > 0) out.set(date, close);
  }
  return out;
}

/** Returns on the benchmark's last `window` sessions, every holding on the same dates. Null when too little is left. */
export function alignReturns(input: {
  benchmark: CloseSeries | null | undefined;
  series: Record<string, CloseSeries | null | undefined>;
  tickers: readonly string[];
  window?: number;
  minSessions?: number;
}): Aligned | null {
  const window = input.window ?? WINDOW_SESSIONS;
  const minSessions = input.minSessions ?? MIN_SESSIONS;
  if (!input.benchmark || input.benchmark.adjusted === false) return null;
  const benchCloses = closeMap(input.benchmark);
  const sessions = [...benchCloses.keys()].sort();
  const tail = sessions.slice(-(window + 1));
  if (tail.length < minSessions + 1) return null;

  const dropped: string[] = [];
  const own = new Map<string, Map<string, number>>();
  for (const ticker of input.tickers) {
    const series = input.series[ticker];
    if (!series || series.adjusted === false) {
      dropped.push(ticker);
      continue;
    }
    const closes = closeMap(series);
    const returns = new Map<string, number>();
    for (let i = 1; i < tail.length; i++) {
      const prev = closes.get(tail[i - 1]!);
      const cur = closes.get(tail[i]!);
      if (prev !== undefined && cur !== undefined) returns.set(tail[i]!, cur / prev - 1);
    }
    if (returns.size < minSessions) dropped.push(ticker);
    else own.set(ticker, returns);
  }

  const dates: string[] = [];
  for (let i = 1; i < tail.length; i++) {
    const date = tail[i]!;
    if ([...own.values()].every((returns) => returns.has(date))) dates.push(date);
  }
  if (dates.length < minSessions || own.size === 0) return null;
  const position = new Map(tail.map((date, index) => [date, index]));
  const bench = dates.map((date) => benchCloses.get(date)! / benchCloses.get(tail[position.get(date)! - 1]!)! - 1);
  const byTicker: Record<string, number[]> = {};
  for (const [ticker, returns] of own) byTicker[ticker] = dates.map((date) => returns.get(date)!);
  return { start: tail[position.get(dates[0]!)! - 1]!, dates, bench, byTicker, dropped };
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample covariance. */
export function covariance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i]! - ma) * (b[i]! - mb);
  return sum / (n - 1);
}

/** Symmetric by construction: each pair is worked out once. */
export function covarianceMatrix(columns: readonly (readonly number[])[]): number[][] {
  const n = columns.length;
  const out = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const value = covariance(columns[i]!, columns[j]!);
      out[i]![j] = value;
      out[j]![i] = value;
    }
  }
  return out;
}

/** Annualised standard deviation of daily returns, percent. */
export function yearlySwing(returns: readonly number[]): number {
  return Math.sqrt(Math.max(0, covariance(returns, returns))) * Math.sqrt(TRADING_DAYS) * 100;
}

/** An index starting at 100, compounded day by day. */
export function compound(returns: readonly number[]): number[] {
  const out = [100];
  for (const value of returns) out.push(out[out.length - 1]! * (1 + value));
  return out;
}

/**
 * The largest fall from a high to a later low, percent (negative), with the two dates. `dates` has one more entry
 * than the returns: the first is the session before the window's first return.
 */
export function largestDrop(index: readonly number[], dates: readonly string[]): { pct: number; peak: string; trough: string } {
  let peakAt = 0;
  let best = { pct: 0, peak: dates[0] ?? "", trough: dates[0] ?? "" };
  for (let i = 1; i < index.length; i++) {
    if (index[i]! > index[peakAt]!) peakAt = i;
    const fall = (index[i]! / index[peakAt]! - 1) * 100;
    if (fall < best.pct) best = { pct: fall, peak: dates[peakAt] ?? "", trough: dates[i] ?? "" };
  }
  return best;
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
