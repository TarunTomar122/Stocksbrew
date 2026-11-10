import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

import { thinCurve, type ChartCurve } from "./chart";
import { BacktestError, MissingHistoryError, SpecError, normalizeWeightsInput, runWeightsBacktest } from "./engine";
import type { PriceSeries, WeightsResult } from "./types";

/**
 * The self-serve backtester's one entry point. The page, the API route and
 * (later) the Copilot all call this, so they cannot disagree.
 *
 * Input: `{ holdings: [{symbol, weight}], start?, end?, rebalance?, benchmark?, cost_bps? }`.
 * Weights can be any positive numbers; they are rescaled to add up to 100%.
 *
 * Output is plain JSON. `ok: false` carries a message that is safe to show a
 * person. A ticker with no stored history is named, never guessed at.
 */

export const PRICE_SOURCE = "Yahoo Finance daily closes, adjusted for splits and dividends";

export type BacktestRun = Omit<WeightsResult, "curve"> & {
  curve: ChartCurve;
  price_as_of: string;
  source: string;
};

export type BacktestResponse =
  | { ok: true; result: BacktestRun }
  | {
      ok: false;
      error: {
        code: "invalid_input" | "missing_history" | "not_enough_history" | "unavailable";
        message: string;
        /** Tickers we hold no price history for. */
        symbols?: string[];
      };
    };

type RawPriceDoc = { dates?: unknown; closes?: unknown; fetched_at?: unknown };

// US markets close at 20:00 or 21:00 UTC depending on daylight saving. A bar
// dated the day it was fetched, fetched before this time, is a price from the
// middle of a session and not a close. Mirrors `completed_sessions` in
// backend/agentdata/backtest_strategies.py.
const SESSION_DONE_UTC = "21:10";

/** Dates and closes with a still-open last session removed. Exported for tests. */
export function completedSessions(raw: RawPriceDoc): PriceSeries | null {
  if (!Array.isArray(raw.dates) || !Array.isArray(raw.closes)) return null;
  let count = Math.min(raw.dates.length, raw.closes.length);
  const fetched = typeof raw.fetched_at === "string" ? raw.fetched_at : "";
  if (count > 0 && fetched.length >= 16 && raw.dates[count - 1] === fetched.slice(0, 10) && fetched.slice(11, 16) < SESSION_DONE_UTC) {
    count -= 1;
  }
  if (count < 2) return null;
  return { dates: raw.dates.slice(0, count) as string[], closes: raw.closes.slice(0, count) as number[] };
}

/** Document ids cannot contain a slash. Mirrors `doc_id` in backend/agentdata/prices.py. */
export function priceDocId(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\//g, "-");
}

async function loadSeriesUncached(symbol: string): Promise<PriceSeries | null> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(priceDocId(symbol)).get();
  if (!doc.exists) return null;
  return completedSessions(doc.data() as RawPriceDoc);
}

// One point a day is added, so an hour of staleness never changes a past result.
const loadSeries = unstable_cache(loadSeriesUncached, ["backtest-price-series-v2"], { revalidate: 3600 });

/** Daily closes for each symbol we hold. Symbols with no stored history are simply absent. */
export async function loadPriceSeries(symbols: string[]): Promise<Record<string, PriceSeries>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const loaded = await Promise.all(unique.map((symbol) => loadSeries(symbol).catch(() => null)));
  const out: Record<string, PriceSeries> = {};
  unique.forEach((symbol, index) => {
    const series = loaded[index];
    if (series) out[symbol] = series;
  });
  return out;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1) + (text.endsWith(".") ? "" : ".");
}

export async function runBacktest(input: unknown): Promise<BacktestResponse> {
  let spec;
  try {
    spec = normalizeWeightsInput(input);
  } catch (error) {
    if (error instanceof SpecError) {
      return { ok: false, error: { code: "invalid_input", message: sentence(error.message) } };
    }
    throw error;
  }

  let prices: Record<string, PriceSeries>;
  try {
    prices = await loadPriceSeries([...spec.holdings.map((holding) => holding.symbol), spec.benchmark]);
  } catch {
    return {
      ok: false,
      error: { code: "unavailable", message: "We could not read price history just now. Try again in a minute." },
    };
  }

  try {
    const result = runWeightsBacktest(input, prices);
    const benchmark = prices[spec.benchmark];
    return {
      ok: true,
      result: {
        ...result,
        curve: thinCurve(result.curve),
        price_as_of: benchmark.dates[benchmark.dates.length - 1],
        source: PRICE_SOURCE,
      },
    };
  } catch (error) {
    if (error instanceof MissingHistoryError) {
      const list = error.symbols.join(", ");
      return {
        ok: false,
        error: {
          code: "missing_history",
          symbols: error.symbols,
          message: `We have no price history for ${list}. Remove ${error.symbols.length === 1 ? "it" : "them"} to run the test. We will not guess at prices.`,
        },
      };
    }
    if (error instanceof BacktestError) {
      return { ok: false, error: { code: "not_enough_history", message: sentence(error.message) } };
    }
    throw error;
  }
}
