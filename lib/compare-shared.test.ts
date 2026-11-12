import { describe, expect, it } from "vitest";

import {
  bestIndex,
  buildCompareTable,
  compareHref,
  describeDifferences,
  figureLabel,
  legacyCompareSymbols,
  parseCompareSymbols,
  tallyWins,
  withChartReturns,
} from "./compare-shared";
import type { ScreenerRow } from "./screener-shared";

const NVDA: ScreenerRow = {
  symbol: "NVDA",
  price: 177.25,
  market_cap: 4.6e12,
  pe: 29.1,
  fwd_pe: 15.4,
  rev_growth: 83.4,
  op_margin: 65.2,
  net_cash: 23.6e9,
  ret_1y: -0.8,
  vol_90d: 46,
  upside: 82,
  score: 83,
};
const AMD: ScreenerRow = {
  symbol: "AMD",
  price: 210,
  market_cap: 3.4e11,
  pe: 80,
  fwd_pe: 31,
  rev_growth: 21,
  op_margin: 9.5,
  net_cash: -1.2e9,
  ret_1y: 40,
  vol_90d: 58,
  upside: 12,
  score: 61,
};

describe("symbols in the URL", () => {
  it("normalises, dedupes and caps the list", () => {
    expect(parseCompareSymbols("nvda, amd,,AMD intc")).toEqual(["NVDA", "AMD", "INTC"]);
    expect(parseCompareSymbols("A,B,C,D,E,F")).toEqual(["A", "B", "C", "D"]);
    expect(parseCompareSymbols("BRK.B,1BAD,<script>,toolongticker")).toEqual(["BRK.B"]);
    expect(parseCompareSymbols(undefined)).toEqual([]);
    expect(parseCompareSymbols(["nvda", "amd"])).toEqual(["NVDA", "AMD"]);
  });

  it("builds the link and reads it back", () => {
    expect(compareHref(["NVDA", "AMD"])).toBe("/compare?symbols=NVDA,AMD");
    expect(compareHref(["NVDA", "AMD"], "1Y")).toBe("/compare?symbols=NVDA,AMD&range=1Y");
    expect(compareHref([])).toBe("/compare");
    expect(parseCompareSymbols("NVDA,AMD")).toEqual(["NVDA", "AMD"]);
  });

  it("accepts the old /compare-stocks parameters", () => {
    expect(legacyCompareSymbols({ t: "aapl,msft" })).toEqual(["AAPL", "MSFT"]);
    expect(legacyCompareSymbols({ tickers: "aapl" })).toEqual(["AAPL"]);
    expect(legacyCompareSymbols({ symbols: "NVDA", t: "AAPL" })).toEqual(["NVDA"]);
    expect(legacyCompareSymbols({})).toEqual([]);
  });
});

describe("bestIndex", () => {
  it("picks the high or the low end", () => {
    expect(bestIndex([10, 30, 20], "high")).toBe(1);
    expect(bestIndex([10, 30, 20], "low")).toBe(0);
  });

  it("ignores unknowns and needs two known values", () => {
    expect(bestIndex([null, 30, undefined, 20], "low")).toBe(3);
    expect(bestIndex([null, 30], "high")).toBe(-1);
    expect(bestIndex([], "high")).toBe(-1);
  });

  it("marks nobody on a tie for best, or when the field has no better end", () => {
    expect(bestIndex([30, 30, 10], "high")).toBe(-1);
    expect(bestIndex([30, 30, 10], "low")).toBe(2);
    expect(bestIndex([1, 2], undefined)).toBe(-1);
  });
});

describe("compare table", () => {
  it("groups rows, marks the winner and drops rows nobody has", () => {
    const groups = buildCompareTable([NVDA, AMD]);
    const valuation = groups.find((group) => group.id === "valuation")!;
    const pe = valuation.rows.find((row) => row.id === "pe")!;
    expect(pe.cells.map((cell) => cell.text)).toEqual(["29.1×", "80.0×"]);
    expect(pe.cells.map((cell) => cell.best)).toEqual([true, false]);
    // Nobody has a PEG, so there is no PEG row.
    expect(valuation.rows.find((row) => row.id === "peg")).toBeUndefined();
    // Market value has no better end.
    expect(valuation.rows.find((row) => row.id === "market_cap")!.cells.some((cell) => cell.best)).toBe(false);
    const price = groups.find((group) => group.id === "price")!;
    expect(price.rows.find((row) => row.id === "ret_1y")!.cells.map((cell) => cell.tone)).toEqual(["down", "up"]);
  });

  it("leaves an uncovered name's cells empty without breaking the row", () => {
    const groups = buildCompareTable([NVDA, null, AMD]);
    const growth = groups.find((group) => group.id === "growth")!;
    const rev = growth.rows.find((row) => row.id === "rev_growth")!;
    expect(rev.cells[1]).toEqual({ text: "", value: null, tone: null, best: false });
    expect(rev.cells[0]!.best).toBe(true);
  });

  it("tallies wins per name", () => {
    const groups = buildCompareTable([NVDA, AMD]);
    const wins = tallyWins(groups, 2);
    expect(wins[0]! + wins[1]!).toBeGreaterThan(5);
    expect(wins[0]).toBeGreaterThan(wins[1]!);
  });

  it("returns no groups when there is no data at all", () => {
    expect(buildCompareTable([null, null])).toEqual([]);
  });
});

describe("what separates them", () => {
  it("leads each row with one figure and the other name's number as its baseline", () => {
    const rows = describeDifferences([NVDA, AMD]).map((item) => `${item.figure} | ${item.text}`);
    expect(rows).toContain("14× | How much bigger NVDA is than AMD, at $4.60T against $340B.");
    expect(rows).toContain("+83% | NVDA's sales growth over a year, against +21% for AMD.");
    expect(rows).toContain("$15 | What you pay for $1 of NVDA's expected profit next year, against $31 for AMD.");
    expect(rows).toContain("65¢ | NVDA's operating profit on each sales dollar, against 10¢ for AMD.");
    expect(rows).toContain("$23.6B | NVDA's cash beyond its debt, while AMD owes $1.20B more than it holds.");
    expect(rows).toContain("+40% | AMD's move in the year to the last close, against −0.8% for NVDA.");
    expect(rows).toContain("58% | How much AMD's price swings in a year, against 46% for NVDA.");
  });

  it("puts the S&P 500 beside the year when it is known", () => {
    const year = describeDifferences([NVDA, AMD], { symbol: "SPY", ret_1y: 12.4 }).find((item) => item.topic === "The last year");
    expect(year?.text).toBe("AMD's move in the year to the last close, against −0.8% for NVDA and +12% for the S&P 500.");
  });

  it("stays silent when a number is missing or the gap is small", () => {
    const a: ScreenerRow = { symbol: "A", rev_growth: 10, pe: 20, op_margin: 15 };
    const b: ScreenerRow = { symbol: "B", rev_growth: 11, pe: 21, op_margin: 16 };
    expect(describeDifferences([a, b])).toEqual([]);
    expect(describeDifferences([NVDA])).toEqual([]);
    expect(describeDifferences([NVDA, null])).toEqual([]);
  });

  it("handles shrinking revenue and operating losses in plain words", () => {
    const grower: ScreenerRow = { symbol: "UP", rev_growth: 12, op_margin: 20 };
    const shrinker: ScreenerRow = { symbol: "DOWN", rev_growth: -6, op_margin: -8 };
    const rows = describeDifferences([grower, shrinker]).map((item) => `${item.figure} | ${item.text}`);
    expect(rows).toContain("+12% | UP's sales growth over a year, while DOWN's sales shrank 6%.");
    expect(rows).toContain("20¢ | UP's operating profit on each sales dollar, while DOWN loses money running its business.");
  });

  it("says it plainly when both names lose money", () => {
    const a: ScreenerRow = { symbol: "A", op_margin: -4 };
    const b: ScreenerRow = { symbol: "B", op_margin: -20 };
    const [row] = describeDifferences([a, b]);
    expect(row).toMatchObject({ topic: "Profit", figure: "−4%" });
    expect(row!.text).toBe("A's operating margin, against −20% for B. Both lose money running the business.");
  });
});

describe("call card figures and chart returns", () => {
  it("says what a call card's figure is, from its own sentence", () => {
    expect(figureLabel("Advanced Micro Devices' sales grew 42% over the past year, and its report on Nov 3 beat profit forecasts by 9.5%.", "42%")).toBe("sales growth, past year");
    expect(figureLabel("NVIDIA fell 13% over the past five trading days while other chip stocks rose 5.8%.", "\u221213%")).toBe("in five trading days");
    expect(figureLabel("It pays a 2.2% dividend.", "2.2%")).toBeNull();
  });

  it("takes the table's returns from the chart's lines when the chart runs to the price day", () => {
    const ranges = [
      { key: "1Y", endDate: "2026-11-11", series: [{ symbol: "NVDA", pct: -9.84 }] },
      { key: "6M", endDate: "2026-11-11", series: [{ symbol: "NVDA", pct: 3 }] },
    ];
    const row: ScreenerRow = { symbol: "NVDA", ret_1y: -9.78, price_at: "2026-11-11T20:59:00Z" };
    expect(withChartReturns([row, null], ranges)[0]?.ret_1y).toBe(-9.84);
    // A chart a day behind the price keeps the row's own figure.
    expect(withChartReturns([{ ...row, price_at: "2026-11-12T20:59:00Z" }], ranges)[0]?.ret_1y).toBe(-9.78);
  });
});
