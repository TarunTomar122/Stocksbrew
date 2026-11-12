import { unstable_cache } from "next/cache";

import { limitFor } from "@/lib/entitlements";

import { EXAMPLE_MIXES } from "./examples";
import { runBacktest, type BacktestRun } from "./index";
import { DEFAULT_SETUP, type BacktestSetup } from "./setup";

/**
 * The run /backtest opens on when the address names no mix: the classic
 * 60/40 of US stocks and long Treasuries over the window every plan can test,
 * so pressing Run on the form gives the same numbers for anyone. It is a
 * replay of real stored closes, run without counting against anyone's daily
 * allowance, and kept for an hour (one close a day is added).
 */

export const EXAMPLE_MIX = {
  /** How the page names it in a sentence. */
  words: "60% in the S&P 500 (SPY) and 40% in long-term US Treasuries (TLT)",
  holdings: EXAMPLE_MIXES[0]!.holdings,
};

/** The window Free can test (five years back from today, UTC), so the example is one anyone can rerun. */
export function exampleSetup(now: Date = new Date()): BacktestSetup {
  const years = limitFor("backtest_history", "free");
  const span = Number.isFinite(years) ? years : 5;
  const start = new Date(Date.UTC(now.getUTCFullYear() - span, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
  return { ...DEFAULT_SETUP, holdings: EXAMPLE_MIX.holdings, start, rebalance: "monthly", benchmark: "SPY", cost_bps: 10 };
}

async function runExample(setup: BacktestSetup): Promise<BacktestRun> {
  const response = await runBacktest(setup);
  // A failed run is thrown, not cached, so the next visit tries again.
  if (!response.ok) throw new Error(`example backtest failed: ${response.error.code}`);
  return response.result;
}

const runExampleCached = unstable_cache(runExample, ["backtest-example-v1"], { revalidate: 3600 });

/** The example's result, or null when it cannot run (the page then shows the empty form). */
export async function getExampleBacktest(now: Date = new Date()): Promise<{ setup: BacktestSetup; run: BacktestRun } | null> {
  const setup = exampleSetup(now);
  const run = await runExampleCached(setup).catch(() => null);
  return run ? { setup, run } : null;
}
