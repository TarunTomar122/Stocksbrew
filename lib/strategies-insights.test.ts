import { describe, expect, it } from "vitest";

import type { StrategySummary } from "@/lib/strategies";
import { backtestGap, buildStrategiesRead, strategiesTally } from "@/lib/strategies-insights";

function summary(slug: string, name: string, mine: number, bench: number, extra: Partial<StrategySummary> = {}): StrategySummary {
  return {
    slug,
    name,
    order: 0,
    style: "",
    tagline: "",
    status: "backtested",
    universe: { id: "x", label: "", description: "", kind: "stocks", count: 100, top_by_size: null },
    risk: { label: "", level: "similar", ratio: 1 },
    live: { since: "2026-11-09", sessions: 0, first_fill_date: null, last_date: null, strategy_return: null, benchmark_return: null, curve: null, decisions: 0, note: null },
    price_as_of: "2026-11-09",
    published_at: "",
    next_rebalance: { signal_date: "", trade_date: "", estimated: true },
    holdings: 2,
    cash_weight: 0,
    backtest: {
      period: { start: "2015-12-01", end: "2026-11-09", first_signal: "", years: 11, sessions: 2700 },
      strategy: { total_return: 1, annualized_return: mine / 2, volatility: null, sharpe: null, max_drawdown: -0.3, max_drawdown_peak: "", max_drawdown_trough: "", final_value: 200 },
      benchmark: { total_return: 1, annualized_return: 0.12, volatility: null, sharpe: null, max_drawdown: -0.34, max_drawdown_peak: "", max_drawdown_trough: "", final_value: 200 },
      spark: { strategy: [], benchmark: [] },
      hit_rate: { beat: 5, years: 10, complete_years_only: true },
      latest_year: { year: 2026, strategy: mine, benchmark: bench, beat: mine > bench, complete: false, sessions: 215 },
    },
    sectors: [{ sector: "Technology", weight: 0.48 }],
    top_holdings: [
      { symbol: "MU", weight: 0.05 },
      { symbol: "NVDA", weight: 0.05 },
    ],
    ...extra,
  };
}

describe("strategies read", () => {
  const items = [summary("mom", "Momentum leaders", 0.355, 0.112), summary("trend", "Big companies in uptrends", -0.107, 0.112), summary("low", "Low volatility", 0.148, 0.112)];

  it("names the best and worst this year and the basket's lean, without holdings below Pro", () => {
    const read = buildStrategiesRead(items, { seesHoldings: false, year: 2026 });
    expect(read.headline).toBe("2 of 3 backtested strategies beat the S&P 500 this year; Momentum leaders is 24.3 pts ahead.");
    expect(read.insights[0].text).toBe("Best this year: Momentum leaders, +35.5% against +11.2% for the S&P 500 (backtested through Nov 9).");
    expect(read.insights[0].soWhat).toBe("Today's basket is 48% tech.");
    expect(read.insights[0].tickers).toEqual([]);
    expect(read.insights[1].text).toBe("Worst this year: Big companies in uptrends, −10.7%, 21.9 pts behind the S&P 500.");
  });

  it("names the holdings that carried it for Pro", () => {
    const read = buildStrategiesRead(items, { seesHoldings: true, ytd: { MU: 157.2, NVDA: -4 }, year: 2026 });
    expect(read.insights[0].soWhat).toBe("Today's basket is 48% tech, led by MU (+157% this year).");
    expect(read.insights[1].soWhat).toBe("Today's basket is 48% tech, dragged by NVDA (−4% this year).");
  });

  it("says so when no rule beat the market", () => {
    const read = buildStrategiesRead([summary("a", "A", 0.05, 0.1), summary("b", "B", 0.02, 0.1)], { seesHoldings: false, year: 2026 });
    expect(read.headline).toBe("None of 2 backtested strategies beat the S&P 500 this year; A came closest, 5.0 pts behind.");
  });

  it("stays empty without a current-year row", () => {
    expect(buildStrategiesRead(items, { seesHoldings: false, year: 2027 }).insights).toEqual([]);
  });
});

describe("one tally behind every count", () => {
  // The live page on Nov 11: 12 rows, 10 with a backtest (one only two months long, so no yearly figure), 2 without.
  const short = (slug: string, name: string, mine: number, bench: number) => {
    const base = summary(slug, name, mine, bench);
    return {
      ...base,
      backtest: {
        ...base.backtest!,
        period: { ...base.backtest!.period, years: 0.19 },
        strategy: { ...base.backtest!.strategy, annualized_return: null, total_return: mine },
        benchmark: { ...base.backtest!.benchmark, annualized_return: null, total_return: bench },
        latest_year: { year: 2026, strategy: mine, benchmark: bench, beat: mine > bench, complete: false, sessions: 50 },
      },
    };
  };
  const none = (slug: string, name: string) => ({ ...summary(slug, name, 0, 0), status: "live_only", backtest: null });
  // summary() sets the yearly return to mine / 2 against a 12% S&P, so mine > 0.24 beats it over the whole test.
  const page = [
    summary("momentum", "Momentum leaders", 0.338, 0.108, { backtest: { ...summary("m", "m", 0.338, 0.108).backtest!, strategy: { ...summary("m", "m", 0.338, 0.108).backtest!.strategy, annualized_return: 0.265 } } }),
    summary("calm", "Calm stocks", 0.153, 0.108),
    summary("steady", "Steady climbers", 0.103, 0.108),
    summary("ten", "Ten largest, equal weight", 0.062, 0.108, { backtest: { ...summary("t", "t", 0.062, 0.108).backtest!, strategy: { ...summary("t", "t", 0.062, 0.108).backtest!.strategy, annualized_return: 0.195 } } }),
    summary("trend", "Big companies in uptrends", -0.128, 0.108),
    summary("exit", "S&P 500 with a 200-day exit", 0.006, 0.108),
    summary("assets", "Asset-class momentum", 0.011, 0.108),
    summary("sectors", "Sector rotation", 0.052, 0.108),
    summary("dip", "Buy the dip", 0.099, 0.108),
    short("congress", "Follow the filing: Congress", -0.045, -0.013),
    none("quality", "Quality companies"),
    none("dividends", "Dividend growers"),
  ] as StrategySummary[];

  it("counts this year and the whole test out of the same backtested list", () => {
    const tally = strategiesTally(page, 2026);
    expect(tally.total).toBe(12);
    expect(tally.tested.map((item) => item.slug)).toHaveLength(10);
    expect(tally.untested.map((item) => item.slug)).toEqual(["quality", "dividends"]);
    expect(tally.thisYear).toHaveLength(10);
    expect(tally.thisYearBeat.map((row) => row.item.slug)).toEqual(["momentum", "calm"]);
    expect(tally.wholeTestBeat.map((item) => item.slug)).toEqual(["momentum", "ten"]);
  });

  it("states both counts with the same denominator", () => {
    const read = buildStrategiesRead(page, { seesHoldings: false, year: 2026 });
    expect(read.headline).toBe("Only 2 of 10 backtested strategies beat the S&P 500 this year; Momentum leaders is 23.0 pts ahead.");
    const longRun = read.insights.find((insight) => insight.id === "long-run")!;
    expect(longRun.text).toBe("Over their whole backtests, 2 of those 10 beat the S&P 500: Momentum leaders and Ten largest, equal weight.");
    expect(longRun.figure).toEqual({ value: "2 of 10" });
  });

  it("names the smaller group when a backtest has no row for this year yet", () => {
    const stale = summary("stale", "Stale", 0.5, 0.1, { backtest: { ...summary("s", "s", 0.5, 0.1).backtest!, latest_year: { year: 2025, strategy: 0.5, benchmark: 0.1, beat: true, complete: true, sessions: 250 } } });
    const read = buildStrategiesRead([...page, stale], { seesHoldings: false, year: 2026 });
    expect(read.headline).toBe("Only 2 of the 10 strategies backtested this year beat the S&P 500; Momentum leaders is 23.0 pts ahead.");
    expect(read.insights.find((insight) => insight.id === "long-run")?.text).toMatch(/^Over their whole backtests, 3 of the 11 backtested strategies beat the S&P 500: /);
  });

  it("measures the whole-test gap per year when it can, in total when the test is too short", () => {
    expect(backtestGap(page[0])).toBeCloseTo(0.145);
    expect(backtestGap(page[9])).toBeCloseTo(-0.032);
    expect(backtestGap(page[10])).toBeNull();
    // One side annualised and the other not: both are compared in total, never a yearly figure against a total.
    const mixed = summary("mixed", "Mixed", 0.3, 0.1);
    mixed.backtest = { ...mixed.backtest!, benchmark: { ...mixed.backtest!.benchmark, annualized_return: null, total_return: 0.8 } };
    expect(backtestGap(mixed)).toBeCloseTo(0.2);
  });
});
