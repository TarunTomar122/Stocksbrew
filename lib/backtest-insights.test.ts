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
    expect(read.headline).toBe("Beat SPY by 3.2 pts a year from 2016 to 2026, but with a deeper worst drop (−38% vs −24%).");
    expect(read.insights[0].text).toBe("This mix returned +15.2% a year against +12.0% for SPY.");
    expect(read.insights[1].text).toBe("Most of the lead came in 2020 (+45% vs +18%) and 2021 (+40% vs +28%).");
    expect(read.insights[2].text).toBe("NVDA did the heavy lifting: +2,400% on its own at a 20% weight.");
    expect(read.insights[2].tickers).toEqual(["NVDA", "TLT"]);
    expect(read.source).toBe("Backtested, not traded · Jan 2016 to Nov 2026");
  });

  it("explains a lag by the years it fell behind", () => {
    const read = buildBacktestRead({
      benchmark: "SPY",
      period: { start: "2016-01-04", end: "2026-11-09", years: 10.8 },
      summary: { strategy: stats(0.08, -0.2), benchmark: stats(0.12, -0.34) },
      years: [year(2019, 0.1, 0.31), year(2020, 0.1, 0.15), year(2021, 0.2, 0.28)],
      holdings: [],
    });
    expect(read.headline).toBe("Trailed SPY by 4.0 pts a year from 2016 to 2026, with a shallower worst drop (−20% vs −34%).");
    expect(read.insights[1].text).toBe("It fell behind most in 2019 (+10% vs +31%) and 2021 (+20% vs +28%).");
  });
});
