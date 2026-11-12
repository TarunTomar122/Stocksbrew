import { describe, expect, it } from "vitest";

import { flagDayWords, flaggedMove, flagStepWords, flagWords } from "./example-check";

const view = (over: Record<string, unknown> = {}) =>
  ({
    id: "examplebigmove",
    ask: "",
    day: "2026-11-10",
    when: "",
    ranAt: "",
    decision: "notify",
    outcome: "",
    checked: "",
    findings: [{ ticker: "NVDA", headline: "", detail: "", source: "", url: null, at: "2026-11-10", change_pct: -5.47 }],
    more: 0,
    decided: "",
    next: null,
    stocks: [],
    flagged: ["NVDA"],
    ...over,
  }) as never;

describe("the example's flagged move", () => {
  it("is the one stock a check flagged with a move, while it is recent", () => {
    expect(flaggedMove({ featured: view(), others: [] }, "2026-11-11")).toEqual({ ticker: "NVDA", pct: -5.47, day: "2026-11-10" });
    expect(flaggedMove({ featured: view(), others: [] }, "2026-11-20")).toBeNull();
    expect(flaggedMove({ featured: view({ decision: "nothing" }), others: [] }, "2026-11-11")).toBeNull();
    expect(flaggedMove({ featured: view({ more: 2 }), others: [] }, "2026-11-11")).toBeNull();
    expect(flaggedMove(null)).toBeNull();
  });

  it("says the day as a person would, never a past weekday that reads as the coming one", () => {
    expect(flagDayWords("2026-11-11", "2026-11-11")).toBe("today");
    expect(flagDayWords("2026-11-10", "2026-11-11")).toBe("yesterday");
    expect(flagDayWords("2026-11-09", "2026-11-12")).toBe("on Monday");
    // Last Friday, said on a Thursday: the date, not "on Friday".
    expect(flagDayWords("2026-11-06", "2026-11-12")).toBe("on Nov 6");
    expect(flagWords({ ticker: "NVDA", pct: -5.47, day: "2026-11-10" }, "2026-11-11")).toBe("Your agent flagged its 5.5% drop yesterday.");
  });

  it("ties the flag to the next report when it is close, else to the call", () => {
    const report = (day: string, session = "after the close") => ({ day, when: "on Nov 17", session });
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-17"), usualPct: 3.2, today: "2026-11-11" })).toBe(
      "NVDA reports on Nov 17 after the close, and its usual move on a report is 3.2%. Check our call on it before then.",
    );
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-17"), usualPct: null, today: "2026-11-11" })).toBe("NVDA reports on Nov 17 after the close. Check our call on it before then.");
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-26"), usualPct: 3.2, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-11", "before the open"), usualPct: 3.2, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
    expect(flagStepWords({ ticker: "NVDA", report: null, usualPct: null, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
  });
});
