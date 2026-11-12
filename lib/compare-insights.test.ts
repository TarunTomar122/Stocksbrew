import { describe, expect, it } from "vitest";

import { buildCompareRead, joinClauses, winnerClauses } from "./compare-insights";
import type { ScreenerRow } from "./screener-shared";

const NVDA: ScreenerRow = { symbol: "NVDA", fwd_pe: 15, rev_growth: 83, op_margin: 65, ret_1y: -4.8, from_hi_pct: -12, call: "Hold", earnings_date: "2026-11-17", earnings_in_days: 7 };
const AMD: ScreenerRow = { symbol: "AMD", fwd_pe: 30, rev_growth: 40, op_margin: 18, ret_1y: 118, from_hi_pct: -1, call: "Add" };
const SPY: ScreenerRow = { symbol: "SPY", ret_1y: 14, day_pct: 1, benchmark: true };

describe("compare read", () => {
  it("leads with the biggest difference as one quantified comparison, then the others", () => {
    const read = buildCompareRead({ rows: [NVDA, AMD], benchmark: SPY });
    expect(read?.headline).toBe("NVDA keeps 65¢ of each sales dollar as operating profit.");
    expect(read?.sub).toBe("AMD keeps 18¢.");
    expect(read?.insights.slice(0, 2).map((item) => item.text)).toEqual([
      "NVDA grows revenue 2x faster than AMD (+83% a year against +40%).",
      "NVDA costs less than AMD for each $1 of next year's expected profit ($15 against $30).",
    ]);
  });

  it("puts the call and the year against the S&P 500 under the differences", () => {
    const read = buildCompareRead({ rows: [NVDA, AMD], benchmark: SPY });
    expect(read?.insights.map((item) => item.id)).toEqual(["diff-growth", "diff-cheap", "calls"]);
    // With no big differences the year has room.
    const close = buildCompareRead({ rows: [{ ...NVDA, fwd_pe: 20, rev_growth: 40, op_margin: 30 }, { ...AMD, fwd_pe: 20, rev_growth: 40, op_margin: 30 }], benchmark: SPY });
    expect(close?.headline).toBe("We'd keep NVDA without adding and buy more AMD.");
    expect(close?.insights.map((item) => item.id)).toEqual(["year", "highs", "earnings"]);
    expect(close?.insights[0]?.text).toBe("Over the past year AMD +118% and NVDA −4.8%, against +14% for the S&P 500.");
    expect(close?.insights[0]?.soWhat).toBe("Only AMD beat the index.");
    // One beat the index and one did not: no green mark on a split.
    expect(close?.insights[0]?.tone).toBe("flat");
  });

  it("marks the year down when none kept up with the index, even if all rose", () => {
    const flat = { fwd_pe: 20, rev_growth: 40, op_margin: 30 };
    const read = buildCompareRead({ rows: [{ ...NVDA, ...flat, ret_1y: 3 }, { ...AMD, ...flat, ret_1y: 5 }], benchmark: SPY });
    const year = read?.insights.find((item) => item.id === "year");
    expect(year?.soWhat).toBe("None of them kept up with the index.");
    expect(year?.tone).toBe("down");
  });

  it("mentions a zone only when the row still has one", () => {
    const flat = { fwd_pe: 20, rev_growth: 40, op_margin: 30 };
    const covered = buildCompareRead({ rows: [{ ...NVDA, ...flat, zone: "add" }, { ...AMD, ...flat }] });
    expect(JSON.stringify(covered)).toContain("NVDA is at a price where we'd buy more");
    const stripped = buildCompareRead({ rows: [NVDA, AMD] });
    expect(JSON.stringify(stripped)).not.toContain("zone");
  });

  it("needs two covered stocks", () => {
    expect(buildCompareRead({ rows: [NVDA, null] })).toBeNull();
  });

  it("writes each kind of difference as a headline with its numbers", () => {
    const lead = (a: ScreenerRow, b: ScreenerRow) => winnerClauses([a, b])[0]?.lead;
    expect(lead({ symbol: "A", rev_growth: 30 }, { symbol: "B", rev_growth: -6 })).toBe("A's sales grew 30% over the past year, while B's shrank.");
    expect(lead({ symbol: "A", fwd_pe: 12 }, { symbol: "B", fwd_pe: 40 })).toBe("A costs $12 for each $1 of next year's expected profit.");
    expect(lead({ symbol: "A", fwd_pe: 20 }, { symbol: "B", fwd_pe: 30 })).toBe("A costs 33% less than B for each $1 of next year's expected profit.");
    expect(lead({ symbol: "A", rev_growth: 30 }, { symbol: "B", rev_growth: 20 })).toBe("A's sales grew 10 points faster than B's over the past year.");
    expect(lead({ symbol: "A", op_margin: 40 }, { symbol: "B", op_margin: 35 })).toBe("A keeps 5¢ more of each sales dollar as operating profit than B.");
    expect(lead({ symbol: "A", rev_growth: 40 }, { symbol: "B", rev_growth: 10 })).toBe("A's sales grew 40% over the past year.");
    expect(lead({ symbol: "A", op_margin: 30 }, { symbol: "B", op_margin: 20 })).toBe("A keeps 30¢ of each sales dollar as operating profit.");
    expect(lead({ symbol: "A", op_margin: 30 }, { symbol: "B", op_margin: 15 })).toBe("A keeps 30¢ of each sales dollar as operating profit.");
    expect(winnerClauses([{ symbol: "A", op_margin: 30 }, { symbol: "B", op_margin: 15 }])[0]?.sub).toBe("B keeps 15¢.");
    expect(winnerClauses([{ symbol: "A", fwd_pe: 12 }, { symbol: "B", fwd_pe: 40 }])[0]?.sub).toBe("B costs $40.");
    expect(winnerClauses([{ symbol: "A", rev_growth: 40 }, { symbol: "B", rev_growth: 10 }])[0]?.sub).toBe("B's grew 10%.");
    expect(lead({ symbol: "A", op_margin: 30 }, { symbol: "B", op_margin: -8 })).toBe("A keeps 30¢ of each sales dollar as operating profit, while B loses money on its day-to-day business.");
  });

  it("ignores differences too small to matter", () => {
    expect(winnerClauses([{ symbol: "A", fwd_pe: 20, rev_growth: 10, op_margin: 30 }, { symbol: "B", fwd_pe: 21, rev_growth: 11, op_margin: 31 }])).toEqual([]);
    expect(joinClauses([{ text: "A is cheaper", symbols: ["A"] }])).toBe("A is cheaper.");
  });

  it("mixes the year, the calls and the next difference on the desk", () => {
    const read = buildCompareRead({ rows: [NVDA, AMD], benchmark: SPY, spread: true });
    expect(read?.headline).toBe("NVDA keeps 65¢ of each sales dollar as operating profit.");
    expect(read?.sub).toBe("AMD keeps 18¢.");
    expect(read?.insights.map((item) => item.id)).toEqual(["year", "calls", "diff-growth"]);
  });

  it("swaps the call for the price against each stock's own past when the calls show on their own", () => {
    const read = buildCompareRead({ rows: [{ ...NVDA, pe_hist_pctile: 0 }, { ...AMD, pe_hist_pctile: 23 }], benchmark: SPY, spread: true, calls: false });
    expect(read?.insights.map((item) => item.id)).toEqual(["year", "history", "diff-growth"]);
    const history = read?.insights[1];
    expect(history?.text).toBe("NVDA is cheaper against its own earnings history than AMD: 0 out of 100, where 0 is the cheapest it has been, against 23.");
    expect(history?.figure).toEqual({ value: "0 of 100" });
  });
});
