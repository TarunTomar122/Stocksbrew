import { describe, expect, it } from "vitest";

import type { Strategy, StrategySummary } from "@/lib/strategies";
import { buildStrategiesRead, buildStrategyRead } from "@/lib/strategies-insights";

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
    expect(read.headline).toBe("2 of 3 rules beat the S&P 500 this year; the best, Momentum leaders, is 24.3 pts ahead.");
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
    expect(read.headline).toBe("None of 2 rules beat the S&P 500 this year; the closest, A, trails by 5.0 pts.");
  });

  it("stays empty without a current-year row", () => {
    expect(buildStrategiesRead(items, { seesHoldings: false, year: 2027 }).insights).toEqual([]);
  });
});

describe("one strategy", () => {
  it("reads this year, the long run and the years that made it", () => {
    const strategy = {
      basket: { holdings: [{ symbol: "MU", weight: 0.5, sector: "Technology" }, { symbol: "KO", weight: 0.5, sector: "Consumer Staples" }] },
      backtest: {
        period: { start: "2015-12-01", end: "2026-11-09", years: 10.9 },
        strategy: { annualized_return: 0.2, max_drawdown: -0.39 },
        benchmark: { annualized_return: 0.14, max_drawdown: -0.34 },
        hit_rate: { beat: 7, years: 10 },
        years: [
          { year: 2020, strategy: 0.37, benchmark: 0.18, complete: true, sessions: 252, beat: true },
          { year: 2021, strategy: 0.27, benchmark: 0.29, complete: true, sessions: 252, beat: false },
          { year: 2023, strategy: 0.2, benchmark: 0.26, complete: true, sessions: 252, beat: false },
          { year: 2024, strategy: 0.58, benchmark: 0.25, complete: true, sessions: 252, beat: true },
          { year: 2026, strategy: 0.355, benchmark: 0.112, complete: false, sessions: 215, beat: true },
        ],
      },
    } as unknown as Strategy;
    const read = buildStrategyRead(strategy, { seesHoldings: false, year: 2026 });
    expect(read.headline).toBe("Beat the S&P 500 by 6.0 pts a year over 11 years, backtested.");
    expect(read.insights.map((insight) => insight.text)).toEqual([
      "This year it is +35.5% against +11.2% for the S&P 500, 24.3 pts ahead.",
      "Over 11 years it beat the S&P 500 by 6.0 pts a year, with a worst drop of −39% against −34%.",
      "Its best years against the S&P 500 were 2024 (+58% vs +25%) and 2020 (+37% vs +18%).",
    ]);
    expect(read.insights[2].soWhat).toBe("Its worst year against the S&P was 2023: +20% vs +26%.");
    expect(read.source).toBe("Backtested, not traded · Dec 1 2015 to Nov 9 2026");
  });
});
