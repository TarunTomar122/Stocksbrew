import { describe, expect, it } from "vitest";

import { buildCompareRead, joinClauses, winnerClauses } from "./compare-insights";
import type { ScreenerRow } from "./screener-shared";

const NVDA: ScreenerRow = { symbol: "NVDA", fwd_pe: 15, rev_growth: 83, op_margin: 65, ret_1y: -4.8, from_hi_pct: -12, call: "Hold", earnings_date: "2026-11-17", earnings_in_days: 7 };
const AMD: ScreenerRow = { symbol: "AMD", fwd_pe: 30, rev_growth: 40, op_margin: 18, ret_1y: 118, from_hi_pct: -1, call: "Add" };
const SPY: ScreenerRow = { symbol: "SPY", ret_1y: 14, day_pct: 1, benchmark: true };

describe("compare read", () => {
  it("says who wins on what, folding a repeated subject", () => {
    const read = buildCompareRead({ rows: [NVDA, AMD], benchmark: SPY });
    expect(read?.headline).toBe("AMD has the weakest margins (18% operating against 65%); NVDA grows revenue 2x faster (+83% a year) and is cheaper on earnings (15x against 30x).");
  });

  it("puts the year against the S&P 500 and the calls underneath", () => {
    const read = buildCompareRead({ rows: [NVDA, AMD], benchmark: SPY });
    const ids = read?.insights.map((item) => item.id);
    expect(ids).toEqual(["calls", "year", "highs"]);
    expect(read?.insights[1]?.text).toBe("Over the past year AMD +118% and NVDA −4.8%, against +14% for the S&P 500.");
    expect(read?.insights[1]?.soWhat).toBe("Only AMD beat the index.");
    // One beat the index and one did not: no green mark on a split.
    expect(read?.insights[1]?.tone).toBe("flat");
  });

  it("marks the year down when none kept up with the index, even if all rose", () => {
    const read = buildCompareRead({ rows: [{ ...NVDA, ret_1y: 3 }, { ...AMD, ret_1y: 5 }], benchmark: SPY });
    const year = read?.insights.find((item) => item.id === "year");
    expect(year?.soWhat).toBe("None of them kept up with the index.");
    expect(year?.tone).toBe("down");
  });

  it("mentions a zone only when the row still has one", () => {
    const covered = buildCompareRead({ rows: [{ ...NVDA, zone: "add" }, AMD] });
    expect(JSON.stringify(covered)).toContain("NVDA is inside the add zone");
    const stripped = buildCompareRead({ rows: [NVDA, AMD] });
    expect(JSON.stringify(stripped)).not.toContain("zone");
  });

  it("needs two covered stocks", () => {
    expect(buildCompareRead({ rows: [NVDA, null] })).toBeNull();
  });

  it("ignores differences too small to matter", () => {
    expect(winnerClauses([{ symbol: "A", fwd_pe: 20, rev_growth: 10, op_margin: 30 }, { symbol: "B", fwd_pe: 21, rev_growth: 11, op_margin: 31 }])).toEqual([]);
    expect(joinClauses([{ text: "A is cheaper", symbols: ["A"] }])).toBe("A is cheaper.");
  });
});

