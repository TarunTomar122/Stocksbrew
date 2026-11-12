import { describe, expect, it } from "vitest";

import { callHref, exampleAgentRuns, flaggedMove, flagReportStep, flagStepWords, flagWords } from "./example-check";

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

  it("says the flag with the close's own date, word for word on the briefing and in the inbox", () => {
    expect(flagWords({ ticker: "NVDA", pct: -5.47, day: "2026-11-10" })).toBe("Your agent flagged NVDA's 5.5% drop on Nov 10.");
    expect(flagWords({ ticker: "AMD", pct: 6.04, day: "2026-11-09" })).toBe("Your agent flagged AMD's 6.0% jump on Nov 9.");
    expect(flagReportStep("NVDA")).toBe("Check our call on NVDA before the report.");
  });

  it("ties the flag to the next report when it is close, else to the call", () => {
    const report = (day: string, session = "after the close") => ({ day, when: "on Nov 17", session });
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-17"), usualPct: 3.2, today: "2026-11-11" })).toBe(
      "NVDA reports on Nov 17 after the close, and a report usually moves it about 3.2%. Check our call on it before then.",
    );
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-17"), usualPct: null, today: "2026-11-11" })).toBe("NVDA reports on Nov 17 after the close. Check our call on it before then.");
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-26"), usualPct: 3.2, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
    expect(flagStepWords({ ticker: "NVDA", report: report("2026-11-11", "before the open"), usualPct: 3.2, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
    expect(flagStepWords({ ticker: "NVDA", report: null, usualPct: null, today: "2026-11-11" })).toBe("Check our call on NVDA before you act on the move.");
  });
});

describe("the example's agents as the log's Agents row", () => {
  it("counts the newest day's runs and chips the stocks they flagged with the move each found", () => {
    const flagged = view({ ranAt: "2026-11-11T11:19:00Z", day: "2026-11-11" });
    const quiet = view({ id: "examplefilings", ranAt: "2026-11-11T11:18:00Z", day: "2026-11-11", decision: "nothing", findings: [], flagged: [] });
    const old = view({ id: "exampleearnings", ranAt: "2026-11-10T11:18:00Z", day: "2026-11-10", decision: "nothing", findings: [], flagged: [] });
    expect(exampleAgentRuns({ featured: flagged, others: [quiet, old] })).toEqual({
      at: "2026-11-11T11:19:00Z",
      runs: 2,
      found: 1,
      stocks: [{ ticker: "NVDA", pct: -5.47 }],
      href: "/portfolio",
    });
    expect(exampleAgentRuns(null)).toBeNull();
    expect(callHref("BRK.B")).toBe("/stock/BRK.B#call");
  });
});
