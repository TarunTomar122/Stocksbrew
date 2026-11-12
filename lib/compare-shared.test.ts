import { describe, expect, it } from "vitest";

import {
  bestIndex,
  buildCompareTable,
  buildScoreboard,
  compareHref,
  figureLabel,
  legacyCompareSymbols,
  parseCompareSymbols,
  SCORE_METRICS,
  scoreWinner,
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

describe("where they differ: the scoreboard", () => {
  it("defines which end wins on every row in one table", () => {
    const better = Object.fromEntries(SCORE_METRICS.map((metric) => [metric.id, metric.better]));
    expect(better).toEqual({ size: "neutral", growth: "high", price: "low", margin: "high", cash: "high", year: "high", swing: "low" });
    const words = Object.fromEntries(SCORE_METRICS.filter((metric) => metric.word).map((metric) => [metric.id, metric.word]));
    expect(words).toEqual({ size: "bigger", price: "cheaper", swing: "steadier" });
    // The hover hint stays within eight words.
    for (const metric of SCORE_METRICS) expect(metric.hint.split(/\s+/).length).toBeLessThanOrEqual(8);
  });

  it("scores each row from its own direction and tallies the wins", () => {
    const board = buildScoreboard([NVDA, AMD], { symbol: "SPY", ret_1y: 12.4 })!;
    expect(board.symbols).toEqual(["NVDA", "AMD"]);
    const rows = board.rows.map((row) => `${row.label}: ${row.cells.map((cell) => cell.text).join(" | ")} → ${row.winner < 0 ? "none" : board.symbols[row.winner]}${row.word ? ` (${board.symbols[row.word.index]} ${row.word.text})` : ""}`);
    expect(rows).toEqual([
      "Company size: $4.60T | $340B → none (NVDA bigger)",
      "Sales growth, 1 yr: +83% | +21% → NVDA",
      "Price for $1 of next year's profit: $15 | $31 → NVDA (NVDA cheaper)",
      "Profit per $1 of sales: 65¢ | 10¢ → NVDA",
      "Cash minus debt: +$23.6B | −$1.20B → NVDA",
      "Price change, 1 yr: −0.8% | +40% → AMD",
      "How much the price swings: 46% | 58% → NVDA (NVDA steadier)",
    ]);
    expect(board.wins).toEqual([5, 1]);
    expect(board.scored).toBe(6);
    expect(board.tally).toBe("NVDA leads on 5 of 6");
  });

  it("sizes each side's bar against the row's biggest figure, S&P 500 included", () => {
    const board = buildScoreboard([NVDA, AMD], { symbol: "SPY", ret_1y: 12.4 })!;
    const size = board.rows.find((row) => row.id === "size")!;
    expect(size.cells[0]!.share).toBe(1);
    expect(size.cells[1]!.share).toBeCloseTo(0.0739, 3);
    const year = board.rows.find((row) => row.id === "year")!;
    expect(year.reference).toMatchObject({ label: "S&P 500", text: "+12%" });
    expect(year.reference!.share).toBeCloseTo(0.31, 2);
    expect(board.rows.filter((row) => row.reference).map((row) => row.id)).toEqual(["year"]);
  });

  it("drops a row either side lacks and needs three rows to show at all", () => {
    const a: ScreenerRow = { symbol: "A", rev_growth: 10, op_margin: 15, vol_90d: 30, ret_1y: 5 };
    const b: ScreenerRow = { symbol: "B", rev_growth: 20, op_margin: 12, vol_90d: 40 };
    const board = buildScoreboard([a, b])!;
    expect(board.rows.map((row) => row.id)).toEqual(["growth", "margin", "swing"]);
    expect(buildScoreboard([{ ...a, vol_90d: undefined }, b])).toBeNull();
    expect(buildScoreboard([NVDA])).toBeNull();
    expect(buildScoreboard([NVDA, null])).toBeNull();
  });

  it("falls back to last year's profit, and drops the price row when either side lost money", () => {
    const a: ScreenerRow = { symbol: "A", pe: 20, fwd_pe: -5, rev_growth: 1, op_margin: 1, vol_90d: 20 };
    const b: ScreenerRow = { symbol: "B", pe: 30, fwd_pe: 25, rev_growth: 2, op_margin: 2, vol_90d: 25 };
    expect(buildScoreboard([a, b])!.rows.find((row) => row.id === "price")?.label).toBe("Price for $1 of last year's profit");
    expect(buildScoreboard([{ ...a, pe: -3 }, b])!.rows.find((row) => row.id === "price")).toBeUndefined();
  });

  it("marks nobody when the shown figures read the same, and says an even split plainly", () => {
    expect(scoreWinner([21.04, 21.4], ["+21%", "+21%"], "high")).toBe(-1);
    expect(scoreWinner([5, 9], ["5", "9"], "neutral")).toBe(-1);
    expect(scoreWinner([30, 47], ["30%", "47%"], "low")).toBe(0);
    const a: ScreenerRow = { symbol: "A", rev_growth: 30, op_margin: 5, vol_90d: 40 };
    const b: ScreenerRow = { symbol: "B", rev_growth: 10, op_margin: 25, vol_90d: 40 };
    const board = buildScoreboard([a, b])!;
    expect(board.rows.find((row) => row.id === "swing")).toMatchObject({ winner: -1 });
    expect(board.rows.find((row) => row.id === "swing")!.word).toBeUndefined();
    expect(board.tally).toBe("Even, 1 each of 3");
  });

  it("says losses and debt with a sign", () => {
    const a: ScreenerRow = { symbol: "A", op_margin: -4.4, net_cash: -2e9, rev_growth: -6 };
    const b: ScreenerRow = { symbol: "B", op_margin: -20, net_cash: 0, rev_growth: 12 };
    const board = buildScoreboard([a, b])!;
    expect(board.rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ["−6%", "+12%"],
      ["−4¢", "−20¢"],
      ["−$2.00B", expect.stringMatching(/^\$0/)],
    ]);
    expect(board.rows.map((row) => row.winner)).toEqual([1, 0, 1]);
  });

  it("scores three or more names the same way", () => {
    const c: ScreenerRow = { ...AMD, symbol: "INTC", rev_growth: 90 };
    const board = buildScoreboard([NVDA, AMD, c])!;
    expect(board.rows.find((row) => row.id === "growth")?.winner).toBe(2);
    expect(board.wins).toHaveLength(3);
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
