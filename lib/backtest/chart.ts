/**
 * Shrink a daily curve to something a chart can draw. Pure.
 * The Python twin is `thin_curve` in backend/agentdata/backtest_strategies.py.
 */

export type ChartCurve = {
  dates: string[];
  strategy: number[];
  benchmark: number[];
  /** Deepest fall from the running high seen since the previous point, as a negative fraction. */
  dd_strategy: number[];
  dd_benchmark: number[];
};

const MAX_POINTS = 640;

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Keeps the last point always, and the worst drawdown inside each bucket, so thinning never hides a fall. */
export function thinCurve(curve: { dates: string[]; strategy: number[]; benchmark: number[] }): ChartCurve {
  const count = curve.dates.length;
  const step = Math.max(1, Math.ceil(count / MAX_POINTS));
  const out: ChartCurve = { dates: [], strategy: [], benchmark: [], dd_strategy: [], dd_benchmark: [] };
  let peakS = 100.0;
  let peakB = 100.0;
  let lowS = 0.0;
  let lowB = 0.0;
  for (let i = 0; i < count; i += 1) {
    const s = curve.strategy[i];
    const b = curve.benchmark[i];
    peakS = Math.max(peakS, s);
    peakB = Math.max(peakB, b);
    lowS = Math.min(lowS, s / peakS - 1.0);
    lowB = Math.min(lowB, b / peakB - 1.0);
    if (i === count - 1 || (i + 1) % step === 0) {
      out.dates.push(curve.dates[i]);
      out.strategy.push(round(s, 2));
      out.benchmark.push(round(b, 2));
      out.dd_strategy.push(round(lowS, 4));
      out.dd_benchmark.push(round(lowB, 4));
      lowS = 0.0;
      lowB = 0.0;
    }
  }
  return out;
}
