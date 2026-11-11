import { describe, expect, it } from "vitest";

import { describeJob, triggerLabel, type AgentTrigger } from "@/lib/agent-jobs";

import { checksWhenShort, earningsWhen, tellsShort, watchSummary } from "./summary";

const earnings = { type: "event", event: "earnings_approaching", days_before: 3 } as const;

describe("watchSummary", () => {
  it("names the stocks and says calendar days for the earnings rule", () => {
    expect(watchSummary({ trigger: earnings, scope: { kind: "tickers", tickers: ["NVDA"] } }, { signedIn: false, tracked: 0, title: "Earnings are coming" })).toBe(
      "NVDA: 3 calendar days before earnings",
    );
  });

  it("counts tracked stocks in the singular and plural", () => {
    const move = { type: "price", rule: "moves_pct", pct: 5 } as const;
    expect(watchSummary({ trigger: move, scope: { kind: "watchlist" } }, { signedIn: true, tracked: 1, title: "Big move" })).toBe("Your 1 tracked stock: moves 5% or more in a day");
    expect(watchSummary({ trigger: move, scope: { kind: "watchlist" } }, { signedIn: true, tracked: 12, title: "Big move" })).toBe("Your 12 tracked stocks: moves 5% or more in a day");
    expect(watchSummary({ trigger: move, scope: { kind: "watchlist" } }, { signedIn: false, tracked: 0, title: "Big move" })).toBe("The stocks you track: moves 5% or more in a day");
  });

  it("keeps capitals, lists long ticker lists and handles no tickers", () => {
    const filing = { type: "event", event: "sec_filing" } as const;
    expect(watchSummary({ trigger: filing, scope: { kind: "any" } }, { signedIn: true, tracked: 3, title: "Filings" })).toBe("Any stock: new SEC filing");
    const eightK: AgentTrigger = { type: "event", event: "sec_filing", filings: { forms: ["8-K"], items: ["5.02"] } };
    expect(watchSummary({ trigger: eightK, scope: { kind: "tickers", tickers: ["NVDA"] } }, { signedIn: true, tracked: 0, title: "" })).toBe(`NVDA: ${triggerLabel(eightK)}`);
    expect(watchSummary({ trigger: earnings, scope: { kind: "tickers", tickers: ["A", "B", "C", "D", "E", "F"] } }, { signedIn: true, tracked: 0, title: "" })).toBe(
      "A, B, C, D and 2 more: 3 calendar days before earnings",
    );
    expect(watchSummary({ trigger: earnings, scope: { kind: "tickers", tickers: [] } }, { signedIn: true, tracked: 0, title: "" })).toBe(
      "No stocks picked yet: 3 calendar days before earnings",
    );
  });

  it("goes by the template's name for a schedule agent, so the day is not said twice", () => {
    const weekly = { type: "schedule", cadence: "weekly", weekday: 1 } as const;
    expect(watchSummary({ trigger: weekly, scope: { kind: "watchlist" } }, { signedIn: true, tracked: 2, title: "Weekly review" })).toBe("Your 2 tracked stocks: Weekly review");
    expect(checksWhenShort(weekly, "5:30 PM ET")).toBe("Checks from 5:30 PM ET every Monday.");
  });
});

describe("the earnings timing", () => {
  it("says calendar days and that the warning comes on a market day", () => {
    expect(earningsWhen(earnings)).toBe("It tells you on the first market day within 3 calendar days of the report.");
    expect(earningsWhen({ ...earnings, days_before: 1 })).toContain("1 calendar day of");
    expect(earningsWhen({ type: "price", rule: "moves_pct", pct: 5 })).toBeNull();
    expect(tellsShort({ type: "price", rule: "moves_pct", pct: 5 })).toBe("It emails you when it finds something.");
    expect(describeJob({ trigger: earnings, scope: { kind: "tickers", tickers: ["NVDA"] } })).toBe("Tell me 3 calendar days before NVDA reports earnings.");
  });
});
