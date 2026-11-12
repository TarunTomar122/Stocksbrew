import { describe, expect, it } from "vitest";

import { beatYearsSentence, swingSentence } from "@/lib/backtest-insights";

describe("backtest figures in words", () => {
  it("says the return for its swing as a sentence", () => {
    expect(swingSentence(0.35, 0.73, "SPY")).toBe("It gained 0.35 points for each point it swung, against 0.73 for the S&P 500.");
    expect(swingSentence(0.35, null, "S&P 500")).toBe("It gained 0.35 points for each point it swung.");
    expect(swingSentence(-0.2, 0.73, "QQQ")).toBe("It swung around with nothing gained for it, while the Nasdaq 100 gained 0.73 points for each point it swung.");
    expect(swingSentence(0.001, -0.1, "SPY")).toBe("It swung around with nothing gained for it, and so did the S&P 500.");
    expect(swingSentence(null, 0.73, "SPY")).toBeNull();
  });

  it("counts the years it beat the index in words", () => {
    expect(beatYearsSentence({ beat: 0, years: 4, complete_years_only: true }, "SPY")).toBe("It trailed the S&P 500 in every full year.");
    expect(beatYearsSentence({ beat: 4, years: 4, complete_years_only: true }, "S&P 500")).toBe("It beat the S&P 500 in every full year.");
    expect(beatYearsSentence({ beat: 2, years: 4, complete_years_only: true }, "SPY")).toBe("It beat the S&P 500 in two of four full years.");
    expect(beatYearsSentence({ beat: 1, years: 1, complete_years_only: true }, "SPY")).toBe("It beat the S&P 500 in its one full year.");
    expect(beatYearsSentence({ beat: 0, years: 2, complete_years_only: false }, "SPY")).toBe("It trailed the S&P 500 in every year of the test.");
    expect(beatYearsSentence({ beat: 0, years: 0, complete_years_only: true }, "SPY")).toBeNull();
  });
});
