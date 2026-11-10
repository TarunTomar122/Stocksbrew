import { describe, expect, it } from "vitest";

import {
  bestIndex,
  buildCompareTable,
  compareHref,
  describeDifferences,
  legacyCompareSymbols,
  parseCompareSymbols,
  tallyWins,
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
  it("writes each sentence from two stored numbers", () => {
    const text = describeDifferences([NVDA, AMD]).map((item) => item.text);
    expect(text).toContain("NVDA is worth $4.60T, 14 times AMD at $340B.");
    expect(text).toContain("NVDA is growing revenue fastest, +83.4% over the last year against +21.0% for AMD.");
    expect(text).toContain("NVDA is the cheapest on next year's expected earnings at 15.4×; AMD trades at 31.0×.");
    expect(text).toContain("NVDA keeps the most of each dollar of sales, a 65.2% operating margin against 9.5% for AMD.");
    expect(text).toContain("NVDA holds $23.6B more cash than debt; AMD owes $1.20B more than it holds.");
    expect(text).toContain("AMD is up 40.00% over the last year; NVDA is down 0.80%.");
    expect(text).toContain("AMD swings the most, 58% annualised volatility over the last 90 sessions against 46% for NVDA.");
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
    const text = describeDifferences([grower, shrinker]).map((item) => item.text);
    expect(text).toContain("UP grew revenue +12.0% over the last year while DOWN's revenue shrank 6.0%.");
    expect(text).toContain("UP earns a 20.0% operating margin; DOWN loses money at the operating line (−8.0%).");
  });
});
