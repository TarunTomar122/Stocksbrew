import { describe, expect, it } from "vitest";

import { buildBacktestRead } from "@/lib/backtest-insights";

const stats = (annual: number, dd: number, final = 200) => ({
  total_return: final / 100 - 1,
  annualized_return: annual,
  volatility: null,
  sharpe: null,
  max_drawdown: dd,
  max_drawdown_peak: "2020-02-19",
  max_drawdown_trough: "2020-03-23",
  final_value: final,
});

const year = (y: number, s: number, b: number) => ({ year: y, strategy: s, benchmark: b, beat: s > b, complete: true, sessions: 252 });

describe("backtest read", () => {
  it("says the result in plain words, labelled with its period", () => {
    const read = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.152, -0.38, 460), benchmark: stats(0.12, -0.24, 340) },
      years: [year(2019, 0.3, 0.31), year(2020, 0.45, 0.18), year(2021, 0.4, 0.28), year(2022, -0.25, -0.18)],
      holdings: [
        { symbol: "NVDA", weight: 0.2, end_weight: 0.6, first_date: "", last_price_date: null, total_return: 24 },
        { symbol: "TLT", weight: 0.4, end_weight: 0.1, first_date: "", last_price_date: null, total_return: -0.3 },
      ],
    });
    expect(read.headline).toBe("This mix would have turned $10,000 into $46,000 since Jan 2016.");
    expect(read.insights[0].text).toBe("3.2 points a year ahead of the S&P 500, which made +12.0% a year.");
    expect(read.insights[0].figure).toEqual({ value: "+15.2%", label: "a year" });
    expect(read.insights[0].soWhat).toBe("The same $10,000 in the S&P 500 would be $34,000.");
    // Three cards at most: the result, the worst fall and the holding that carried it.
    expect(read.insights).toHaveLength(3);
    expect(read.insights[2].text).toBe("NVDA did the heavy lifting: +2,400% at a 20% weight.");
    expect(read.insights[2].tickers).toEqual(["NVDA", "TLT"]);
    expect(read.source).toBe("Backtested, not traded · Jan 2016 to Nov 2026");
    // The takeaway: what the extra return cost at the worst moment.
    expect(read.insights[1].text).toBe("The extra return came with a deeper worst fall: −38% against −24% for the S&P 500.");
    expect(read.insights[1].figure).toEqual({ value: "−38%", label: "at its worst" });
    expect(read.insights[1].tone).toBe("down");
  });

  it("explains a lag by the years it fell behind", () => {
    const read = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.08, -0.2), benchmark: stats(0.12, -0.34) },
      years: [year(2019, 0.1, 0.31), year(2020, 0.1, 0.15), year(2021, 0.2, 0.28)],
      holdings: [],
    });
    expect(read.headline).toBe("This mix would have turned $10,000 into $20,000 since Jan 2016.");
    expect(read.insights[2].text).toBe("Behind the S&P 500 in all three full years, most in 2019: +10% against +31%.");
    expect(read.insights[2].figure).toEqual({ value: "−21.0 pts", label: "in 2019" });
    expect(read.insights[2].tone).toBe("down");
  });

  it("says what trailing the index bought at the worst moment", () => {
    const read = (mine: number, theirs: number) =>
      buildBacktestRead({
        benchmark: "SPY",
        period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
        summary: { strategy: stats(0.08, mine), benchmark: stats(0.12, theirs) },
        years: [],
        holdings: [],
      }).insights[1]?.text;
    expect(read(-0.2, -0.34)).toBe("Trailing the S&P 500 bought a smaller worst fall: −20% against −34%.");
    expect(read(-0.27, -0.24)).toBe("It trailed the S&P 500 and still fell further at its worst: −27% against −24%.");
    expect(read(-0.25, -0.24)).toBe("It trailed the S&P 500 with about the same worst fall: −25% against −24%.");
  });

  it("counts the years on the side of the overall result, so the card never contradicts itself", () => {
    const behind = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.08, -0.2), benchmark: stats(0.12, -0.34) },
      years: [year(2019, 0.1, 0.31), year(2020, 0.2, 0.15), year(2021, 0.3, 0.28), year(2022, -0.2, -0.1)],
      holdings: [],
    });
    expect(behind.insights[2].text).toBe("Behind the S&P 500 in two of four full years, most in 2019: +10% against +31%.");
    expect(behind.insights[2].tone).toBe("down");
    const ahead = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.14, -0.2), benchmark: stats(0.12, -0.34) },
      years: [year(2019, 0.5, 0.31), year(2020, 0.1, 0.15), year(2021, 0.2, 0.28)],
      holdings: [],
    });
    expect(ahead.insights[2].text).toBe("Ahead of the S&P 500 in one of three full years, in 2019: +50% against +31%.");
    expect(ahead.insights[2].figure).toEqual({ value: "+19.0 pts", label: "in 2019" });
    expect(ahead.insights[2].tone).toBe("up");
  });

  it("says level when the mix matched the index", () => {
    const read = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.12, -0.2), benchmark: stats(0.12, -0.34) },
      years: [],
      holdings: [],
    });
    expect(read.insights[0].text).toBe("Level with the S&P 500, which made +12.0% a year.");
  });

  it("keeps an unknown comparison fund by its ticker and never shows a negative balance", () => {
    const read = buildBacktestRead({
      benchmark: "VTI",
      period: { start: "2024-03-01", end: "2026-11-09", years: 2.7 },
      summary: { strategy: stats(-0.5, -1, 0), benchmark: stats(0.1, -0.1, 130) },
      years: [],
      holdings: [],
    });
    expect(read.headline).toBe("This mix would have turned $10,000 into $0 since Mar 2024.");
  });
});
