import { describe, expect, it } from "vitest";

import {
  BacktestError,
  SpecError,
  currentPicks,
  normalizeSpec,
  r4,
  resolveUniverse,
  MissingHistoryError,
  normalizeWeightsInput,
  runBacktest,
  runWeightsBacktest,
} from "./engine";
import casesJson from "./fixtures/cases.json";
import expectedJson from "./fixtures/expected.json";
import panelJson from "./fixtures/panel.json";
import type { BacktestData, BacktestResult, CongressEvent, PriceSeries, UniverseDoc } from "./types";

type FixtureCase = {
  name: string;
  spec: unknown;
  universe: string[];
  universe_label: string;
  universe_kind: "stocks" | "funds";
  universe_partial: boolean;
};

const panel = panelJson as unknown as {
  prices: Record<string, PriceSeries>;
  size_factors: Record<string, number>;
  events: CongressEvent[];
  fundamentals: Record<string, Record<string, number>>;
};
const cases = casesJson as unknown as {
  backtests: FixtureCase[];
  picks: FixtureCase[];
  weights: { name: string; input: unknown }[];
};
const expected = expectedJson as unknown as {
  backtests: Record<string, unknown>;
  picks: Record<string, unknown>;
  weights: Record<string, unknown>;
};

function caseData(item: FixtureCase, prices = panel.prices): BacktestData {
  return {
    prices,
    universe: item.universe,
    universe_label: item.universe_label,
    universe_kind: item.universe_kind,
    universe_partial: item.universe_partial,
    size_factors: panel.size_factors,
    events: panel.events,
    fundamentals: panel.fundamentals,
  };
}

/** Same shrink as `digest` in backend/agentdata/backtest_fixture.py. */
function digest(result: Pick<BacktestResult, "curve">): unknown {
  let strategySum = 0.0;
  let benchmarkSum = 0.0;
  for (const value of result.curve.strategy) strategySum += value;
  for (const value of result.curve.benchmark) benchmarkSum += value;
  return {
    ...result,
    curve: {
      points: result.curve.dates.length,
      first_date: result.curve.dates[0],
      last_date: result.curve.dates[result.curve.dates.length - 1],
      strategy_sum: r4(strategySum),
      benchmark_sum: r4(benchmarkSum),
      strategy_samples: result.curve.strategy.filter((_, index) => index % 50 === 0),
      benchmark_samples: result.curve.benchmark.filter((_, index) => index % 50 === 0),
    },
  };
}

/** Deep equality with a tight tolerance on numbers, reporting the first path that differs. */
function firstDifference(actual: unknown, wanted: unknown, path = "$"): string | null {
  if (typeof wanted === "number" && typeof actual === "number") {
    const scale = Math.max(1, Math.abs(wanted));
    return Math.abs(actual - wanted) <= 1e-9 * scale ? null : `${path}: ${actual} != ${wanted}`;
  }
  if (wanted === null || actual === null || typeof wanted !== "object" || typeof actual !== "object") {
    return actual === wanted ? null : `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`;
  }
  if (Array.isArray(wanted) || Array.isArray(actual)) {
    if (!Array.isArray(wanted) || !Array.isArray(actual)) return `${path}: array mismatch`;
    if (wanted.length !== actual.length) return `${path}: length ${actual.length} != ${wanted.length}`;
    for (let i = 0; i < wanted.length; i += 1) {
      const diff = firstDifference(actual[i], wanted[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  const a = actual as Record<string, unknown>;
  const w = wanted as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(w)])].sort();
  for (const key of keys) {
    if (!(key in a) || !(key in w)) return `${path}.${key}: missing on one side`;
    const diff = firstDifference(a[key], w[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

describe("backtest engine parity with the Python engine", () => {
  for (const item of cases.backtests) {
    it(`matches expected.json for ${item.name}`, () => {
      const result = runBacktest(item.spec, caseData(item));
      expect(firstDifference(digest(result), expected.backtests[item.name])).toBeNull();
    });
  }

  for (const item of cases.picks) {
    it(`picks the same holdings for ${item.name}`, () => {
      const picks = currentPicks(item.spec, caseData(item));
      expect(firstDifference(picks, expected.picks[item.name])).toBeNull();
    });
  }

  it("covers every case in expected.json", () => {
    expect(Object.keys(expected.backtests).sort()).toEqual(cases.backtests.map((c) => c.name).sort());
    expect(Object.keys(expected.picks).sort()).toEqual(cases.picks.map((c) => c.name).sort());
  });
});

describe("no look-ahead", () => {
  const item = cases.backtests.find((c) => c.name === "momentum") as FixtureCase;
  const cut = "2021-06-30";

  it("gives the same past when every later price is changed", () => {
    const base = runBacktest(item.spec, caseData(item));
    const scrambled: Record<string, PriceSeries> = {};
    for (const [symbol, series] of Object.entries(panel.prices)) {
      scrambled[symbol] = {
        dates: series.dates,
        closes: series.closes.map((close, index) =>
          series.dates[index] > cut ? close * (1 + ((index * 7 + symbol.charCodeAt(0)) % 13) / 20) : close,
        ),
      };
    }
    const changed = runBacktest(item.spec, caseData(item, scrambled));

    const keep = base.curve.dates.filter((day) => day <= cut).length;
    expect(keep).toBeGreaterThan(100);
    expect(changed.curve.strategy.slice(0, keep)).toEqual(base.curve.strategy.slice(0, keep));
    // A rebalance whose signal date is on or before the cut picked from untouched prices.
    const before = base.rebalances.filter((r) => r.signal_date <= cut);
    expect(before.length).toBeGreaterThan(10);
    expect(changed.rebalances.slice(0, before.length).map((r) => r.holdings)).toEqual(
      before.map((r) => r.holdings),
    );
    // And the future really was different, so the check above means something.
    expect(changed.curve.strategy[changed.curve.strategy.length - 1]).not.toEqual(
      base.curve.strategy[base.curve.strategy.length - 1],
    );
  });

  it("trades one session after the signal", () => {
    const result = runBacktest(item.spec, caseData(item));
    const calendar = panel.prices.SPY.dates;
    for (const rebalance of result.rebalances) {
      const signalIndex = calendar.indexOf(rebalance.signal_date);
      expect(calendar[signalIndex + 1]).toBe(rebalance.trade_date);
      expect(rebalance.signal_date.slice(0, 7)).not.toBe(rebalance.trade_date.slice(0, 7));
    }
    expect(result.period.start).toBe(result.rebalances[0].trade_date);
  });
});

describe("costs and cash", () => {
  const item = cases.backtests.find((c) => c.name === "momentum") as FixtureCase;

  it("charges costs by default and they lower the result", () => {
    const withCosts = runBacktest(item.spec, caseData(item));
    const free = runBacktest({ ...(item.spec as object), cost_bps: 0 }, caseData(item));
    expect(withCosts.spec.cost_bps).toBe(10);
    expect(withCosts.costs.total_drag).toBeGreaterThan(0);
    expect(free.costs.total_drag).toBe(0);
    expect(free.summary.strategy.total_return).toBeGreaterThan(withCosts.summary.strategy.total_return);
    // Entry costs 10 bps of the full portfolio on day one.
    expect(withCosts.curve.strategy[0]).toBeCloseTo(99.9, 6);
    expect(free.curve.strategy[0]).toBe(100);
    expect(withCosts.curve.benchmark[0]).toBe(100);
  });

  it("leaves empty slots in cash and says so", () => {
    const trend = cases.backtests.find((c) => c.name === "trend_with_market_filter") as FixtureCase;
    const result = runBacktest(trend.spec, caseData(trend));
    expect(result.cash.max).toBe(1);
    expect(result.caveats.map((c) => c.id)).toContain("cash");
    for (const rebalance of result.rebalances) {
      const invested = rebalance.holdings.reduce((sum, h) => sum + h.weight, 0);
      expect(invested + rebalance.cash).toBeCloseTo(1, 5);
      if (!rebalance.market_ok) expect(rebalance.holdings).toEqual([]);
    }
  });
});

describe("caveats", () => {
  it("always labels the backtest and names survivorship for stock universes", () => {
    for (const item of cases.backtests) {
      const ids = runBacktest(item.spec, caseData(item)).caveats.map((c) => c.id);
      expect(ids[0]).toBe("backtest_label");
      if (item.universe_kind === "stocks") expect(ids).toContain("survivorship");
      else expect(ids).toContain("fixed_funds");
      expect(ids.includes("costs") || ids.includes("no_costs")).toBe(true);
    }
  });

  it("leaves no unfilled placeholder", () => {
    for (const item of cases.backtests) {
      for (const caveat of runBacktest(item.spec, caseData(item)).caveats) {
        expect(`${caveat.title} ${caveat.text}`).not.toMatch(/[{}]/);
      }
    }
  });
});

describe("spec validation", () => {
  const good = { universe: { id: "sp500" }, rank: [{ type: "momentum" }] };

  it("fills defaults", () => {
    const spec = normalizeSpec(good);
    expect(spec).toMatchObject({ holdings: 20, weighting: "equal", rebalance: "monthly", cost_bps: 10, benchmark: "SPY" });
    expect(spec.rank[0]).toEqual({ type: "momentum", months: 12, skip_months: 1, weight: 1 });
  });

  it("rejects runaway inputs", () => {
    const bad: unknown[] = [
      { ...good, holdings: 500 },
      { ...good, holdings: 0 },
      { ...good, cost_bps: -1 },
      { ...good, cost_bps: 5000 },
      { ...good, rebalance: "daily" },
      { ...good, rank: [] },
      { ...good, rank: [{ type: "momentum", months: 400 }] },
      { ...good, rank: [{ type: "momentum", months: 3, skip_months: 3 }] },
      { ...good, rank: [{ type: "low_volatility", days: 100000 }] },
      { ...good, rank: [{ type: "made_up" }] },
      { ...good, rank: Array.from({ length: 9 }, () => ({ type: "momentum" })) },
      { ...good, filters: [{ type: "trend" }] },
      { ...good, universe: { symbols: Array.from({ length: 200 }, (_, i) => `T${i}`) } },
      { ...good, universe: {} },
      { ...good, start: "yesterday" },
      { ...good, start: "2024-02-31" },
      { ...good, holdings: Number.POSITIVE_INFINITY },
      "not a spec",
    ];
    for (const spec of bad) expect(() => normalizeSpec(spec)).toThrow(SpecError);
  });

  it("refuses to backtest rules built on company financials", () => {
    const item = cases.picks[0];
    expect(() => runBacktest(item.spec, caseData(item))).toThrow(BacktestError);
  });

  it("resolves a named universe and rejects an unknown one", () => {
    const doc: UniverseDoc = {
      market: "US",
      generated_at: "",
      price_as_of: "",
      groups: [{ id: "funds", label: "sector funds", kind: "funds", symbols: ["XLK", "XLE"] }],
    };
    const resolved = resolveUniverse(normalizeSpec({ ...good, universe: { id: "funds" } }), doc);
    expect(resolved).toMatchObject({ symbols: ["XLE", "XLK"], kind: "funds", count: 2 });
    expect(() => resolveUniverse(normalizeSpec(good), doc)).toThrow(SpecError);
    expect(resolveUniverse(normalizeSpec({ ...good, universe: { symbols: ["msft", "AAPL"] } }), doc).symbols).toEqual([
      "AAPL",
      "MSFT",
    ]);
  });
});

describe("fixed-weights backtest", () => {
  it.each(cases.weights.map((item) => [item.name, item] as const))("matches the Python engine: %s", (_name, item) => {
    const result = runWeightsBacktest(item.input, panel.prices);
    expect(firstDifference(digest(result), expected.weights[item.name])).toBeNull();
  });

  it("rescales weights to add up to one and keeps the order given", () => {
    const input = normalizeWeightsInput({ holdings: [{ symbol: " ddd ", weight: 30 }, { symbol: "AAA", weight: 10 }] });
    expect(input.holdings).toEqual([
      { symbol: "DDD", weight: 0.75 },
      { symbol: "AAA", weight: 0.25 },
    ]);
    expect(input.rebalance).toBe("monthly");
    expect(input.cost_bps).toBe(10);
  });

  it("names the tickers it has no history for instead of guessing", () => {
    try {
      runWeightsBacktest({ holdings: [{ symbol: "AAA", weight: 1 }, { symbol: "NOPE", weight: 1 }] }, panel.prices);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingHistoryError);
      expect((error as MissingHistoryError).symbols).toEqual(["NOPE"]);
    }
  });

  it("rejects duplicate tickers, zero weights and bad cadences", () => {
    expect(() => normalizeWeightsInput({ holdings: [{ symbol: "AAA", weight: 1 }, { symbol: "aaa", weight: 1 }] })).toThrow(SpecError);
    expect(() => normalizeWeightsInput({ holdings: [{ symbol: "AAA", weight: 0 }] })).toThrow(SpecError);
    expect(() => normalizeWeightsInput({ holdings: [{ symbol: "AAA", weight: 1 }], rebalance: "daily" })).toThrow(SpecError);
    expect(() => normalizeWeightsInput({ holdings: [] })).toThrow(SpecError);
  });

  it("starts when the last ticker lists and says which one held it back", () => {
    const result = runWeightsBacktest(
      { holdings: [{ symbol: "III", weight: 1 }, { symbol: "BBB", weight: 1 }], start: "2019-06-03" },
      panel.prices,
    );
    expect(result.limited_by?.symbol).toBe("III");
    expect(result.period.start).toBe(result.limited_by?.first_date);
    expect(result.period.start > "2019-06-03").toBe(true);
    expect(result.caveats.some((caveat) => caveat.id === "late_start")).toBe(true);
  });

  it("does not let prices after the end date change the result", () => {
    const end = "2021-06-30";
    const input = { holdings: [{ symbol: "AAA", weight: 1 }, { symbol: "DDD", weight: 1 }], end };
    const full = runWeightsBacktest(input, panel.prices);
    const cut: Record<string, PriceSeries> = {};
    for (const [symbol, series] of Object.entries(panel.prices)) {
      const keep = series.dates.filter((day) => day <= end).length;
      cut[symbol] = { dates: series.dates.slice(0, keep), closes: series.closes.slice(0, keep) };
    }
    expect(firstDifference(runWeightsBacktest(input, cut), full)).toBeNull();
  });

  it("a single holding with no costs tracks its own price", () => {
    const result = runWeightsBacktest(
      { holdings: [{ symbol: "AAA", weight: 1 }], rebalance: "never", cost_bps: 0, benchmark: "AAA" },
      panel.prices,
    );
    expect(result.summary.strategy.total_return).toBeCloseTo(result.summary.benchmark.total_return, 6);
    expect(result.holdings[0].total_return).toBeCloseTo(result.summary.strategy.total_return, 6);
  });
});
