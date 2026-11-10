/**
 * A backtest setup as a URL, so a run can be shared as a link. Pure, used on
 * both sides: the page reads it from the query string, the form writes it back.
 *
 *   /backtest?t=AAPL:40,MSFT:30,TLT:30&from=2018-01-02&rb=quarterly&bm=SPY
 */

import type { WeightsRebalance } from "./types";

export type BacktestSetup = {
  holdings: { symbol: string; weight: number }[];
  start: string | null;
  end: string | null;
  rebalance: WeightsRebalance;
  benchmark: string;
  cost_bps: number;
};

export const REBALANCE_OPTIONS: { value: WeightsRebalance; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "never", label: "Never (buy and hold)" },
];

export const BENCHMARK_OPTIONS: { value: string; label: string }[] = [
  { value: "SPY", label: "S&P 500 (SPY)" },
  { value: "QQQ", label: "Nasdaq 100 (QQQ)" },
  { value: "IWM", label: "Small companies (IWM)" },
  { value: "RSP", label: "S&P 500 equal weight (RSP)" },
  { value: "AGG", label: "US bonds (AGG)" },
];

export const DEFAULT_SETUP: BacktestSetup = {
  holdings: [],
  start: null,
  end: null,
  rebalance: "monthly",
  benchmark: "SPY",
  cost_bps: 10,
};

const TICKER = /^[A-Z][A-Z0-9.\-]{0,11}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HOLDINGS = 30;

export function cleanTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase();
  return TICKER.test(ticker) ? ticker : null;
}

function first(value: string | string[] | undefined | null): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Reads a query string. Unknown or malformed parts fall back to the default, never throw. */
export function parseSetup(query: Record<string, string | string[] | undefined>): BacktestSetup {
  const holdings: BacktestSetup["holdings"] = [];
  for (const part of first(query.t).split(",")) {
    if (holdings.length >= MAX_HOLDINGS) break;
    const [rawSymbol, rawWeight] = part.split(":");
    const symbol = cleanTicker(rawSymbol ?? "");
    if (!symbol || holdings.some((item) => item.symbol === symbol)) continue;
    const weight = rawWeight === undefined ? 1 : Number(rawWeight);
    holdings.push({ symbol, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }
  const start = first(query.from);
  const end = first(query.to);
  const rebalance = first(query.rb);
  const benchmark = cleanTicker(first(query.bm));
  const cost = Number(first(query.cost));
  return {
    holdings,
    start: ISO_DAY.test(start) ? start : null,
    end: ISO_DAY.test(end) ? end : null,
    rebalance: REBALANCE_OPTIONS.some((option) => option.value === rebalance)
      ? (rebalance as WeightsRebalance)
      : DEFAULT_SETUP.rebalance,
    benchmark: benchmark ?? DEFAULT_SETUP.benchmark,
    cost_bps: first(query.cost) !== "" && Number.isInteger(cost) && cost >= 0 && cost <= 200 ? cost : DEFAULT_SETUP.cost_bps,
  };
}

function weightText(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

/** The query string for a setup, without the leading "?". Defaults are left out to keep links short. */
export function setupToQuery(setup: BacktestSetup): string {
  const parts: string[] = [];
  if (setup.holdings.length > 0) {
    parts.push(`t=${setup.holdings.map((item) => `${item.symbol}:${weightText(item.weight)}`).join(",")}`);
  }
  if (setup.start) parts.push(`from=${setup.start}`);
  if (setup.end) parts.push(`to=${setup.end}`);
  if (setup.rebalance !== DEFAULT_SETUP.rebalance) parts.push(`rb=${setup.rebalance}`);
  if (setup.benchmark !== DEFAULT_SETUP.benchmark) parts.push(`bm=${setup.benchmark}`);
  if (setup.cost_bps !== DEFAULT_SETUP.cost_bps) parts.push(`cost=${setup.cost_bps}`);
  return parts.join("&");
}

export function setupHref(setup: BacktestSetup): string {
  const query = setupToQuery(setup);
  return query ? `/backtest?${query}` : "/backtest";
}
