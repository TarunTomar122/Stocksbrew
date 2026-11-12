/**
 * Plain words for a backtest result: the Sharpe ratio and the years it beat
 * its benchmark as sentences, and the starting sum the chart is drawn in.
 * Pure, so the client workbench can use it after every run.
 */

import { countWord } from "@/lib/plain-copy";

const MINUS = "−";

/** The comparison funds by what people call them; anything else keeps its ticker. */
const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "the S&P 500",
  "S&P 500": "the S&P 500",
  QQQ: "the Nasdaq 100",
  IWM: "small US companies (IWM)",
  RSP: "the equal-weight S&P 500",
  AGG: "US bonds (AGG)",
};

export function benchmarkName(ticker: string): string {
  return BENCHMARK_NAMES[ticker] ?? ticker;
}

/** The sum the chart imagines putting in on the first day: its curves are drawn in dollars from this. */
export const START_MONEY = 10_000;

function ratioWords(value: number): string {
  return `${value < 0 ? MINUS : ""}${Math.abs(value).toFixed(2)}`;
}

/**
 * The Sharpe ratio as a sentence (owner rule 8: "Return per unit of swing" was code): "It gained 0.35 points for each
 * point it swung, against 0.73 for the S&P 500." "Swung" matches the "Typical yearly swing" figure beside it. Null
 * without the mix's own figure.
 */
export function swingSentence(mine: number | null | undefined, theirs: number | null | undefined, benchmark: string): string | null {
  if (mine == null || !Number.isFinite(mine)) return null;
  const known = theirs != null && Number.isFinite(theirs);
  const bench = benchmarkName(benchmark);
  if (Number(mine.toFixed(2)) <= 0) {
    if (!known) return "It swung around with nothing gained for it.";
    return Number(theirs.toFixed(2)) > 0
      ? `It swung around with nothing gained for it, while ${bench} gained ${ratioWords(theirs)} points for each point it swung.`
      : `It swung around with nothing gained for it, and so did ${bench}.`;
  }
  return `It gained ${ratioWords(mine)} points for each point it swung${known ? `, against ${ratioWords(theirs)} for ${bench}` : ""}.`;
}

/**
 * How many years it beat the index, in words instead of "0 of 4": "It trailed the S&P 500 in every full year." Part
 * years count only when the test has no full year, and the sentence says so. Null with no year to count.
 */
export function beatYearsSentence(hitRate: { beat: number; years: number; complete_years_only: boolean }, benchmark: string): string | null {
  const { beat, years } = hitRate;
  if (!(years > 0) || beat < 0 || beat > years) return null;
  const bench = benchmarkName(benchmark);
  const kind = hitRate.complete_years_only ? "full year" : "year of the test";
  const plural = hitRate.complete_years_only ? "full years" : "years of the test";
  if (years === 1) return `It ${beat === 1 ? "beat" : "trailed"} ${bench} in its one ${kind}.`;
  if (beat === 0) return `It trailed ${bench} in every ${kind}.`;
  if (beat === years) return `It beat ${bench} in every ${kind}.`;
  return `It beat ${bench} in ${countWord(beat)} of ${countWord(years)} ${plural}.`;
}
