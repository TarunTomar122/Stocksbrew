import { describe, expect, it } from "vitest";

import { resultWord, surprisePctOf, summarizeReports, type EarningsItem } from "@/lib/calendar-shared";
import { surpriseOf } from "@/lib/calendar-insights";

type Item = Parameters<typeof resultWord>[0];

const item = (over: Partial<Item>): Item => ({ epsActual: 1.2, epsEstimate: 1.1, surprisePct: null, surpriseLabel: null, ...over });

describe("resultWord", () => {
  it("says nothing before the report", () => {
    expect(resultWord(item({ epsActual: null, surprisePct: 12, surpriseLabel: "beat" }))).toBeNull();
  });

  it("lets the two EPS figures decide over a stored label from another basis", () => {
    // $1.08 against $1.17 is a miss whatever the stored label says.
    expect(resultWord(item({ epsActual: 1.08, epsEstimate: 1.17, surpriseLabel: "beat", surprisePct: 9 }))).toEqual({ tone: "down", word: "Missed" });
    expect(resultWord(item({ epsActual: 1.2, epsEstimate: 1.1, surpriseLabel: "miss" }))).toEqual({ tone: "up", word: "Beat" });
    // Within 1% either way is in line, the backend's surprise_label band.
    expect(resultWord(item({ epsActual: 1.005, epsEstimate: 1 }))).toEqual({ tone: "flat", word: "In line" });
    expect(resultWord(item({ epsActual: 1.01, epsEstimate: 1 }))?.word).toBe("Beat");
    expect(resultWord(item({ epsActual: 0.99, epsEstimate: 1 }))?.word).toBe("Missed");
    // A loss smaller than expected is a beat: the estimate's size is the base.
    expect(resultWord(item({ epsActual: -0.1, epsEstimate: -0.2 }))?.word).toBe("Beat");
  });

  it("falls back to the stored label, then the stored surprise, without an estimate", () => {
    expect(resultWord(item({ epsEstimate: null, surpriseLabel: "in-line", surprisePct: 5 }))).toEqual({ tone: "flat", word: "In line" });
    expect(resultWord(item({ epsEstimate: null, surprisePct: 0.3 }))?.word).toBe("In line");
    expect(resultWord(item({ epsEstimate: null, surprisePct: -1 }))?.word).toBe("Missed");
    expect(resultWord(item({ epsEstimate: 0, surprisePct: 2 }))?.word).toBe("Beat");
  });

  it("returns null when nothing can judge it", () => {
    expect(resultWord(item({ epsEstimate: null }))).toBeNull();
    expect(resultWord(item({ epsEstimate: 0, surpriseLabel: "reported" }))).toBeNull();
  });

  it("agrees with the calendar read's count", () => {
    const rows = [
      item({ epsActual: 1.08, epsEstimate: 1.17, surpriseLabel: "beat", surprisePct: 9 }),
      item({ epsActual: 1.005, epsEstimate: 1, surpriseLabel: "beat" }),
      item({ epsActual: 1.3, epsEstimate: 1.1 }),
      item({ epsActual: 2, epsEstimate: null, surpriseLabel: "miss" }),
    ];
    for (const row of rows) {
      const word = resultWord(row);
      const label = surpriseOf(row)?.label;
      expect(label).toBe(word?.tone === "up" ? "beat" : word?.tone === "down" ? "miss" : "in-line");
    }
  });
});

describe("surprisePctOf", () => {
  it("prints the figures' surprise, not a stale stored one", () => {
    expect(surprisePctOf({ epsActual: 1.08, epsEstimate: 1.2, surprisePct: 9 })).toBeCloseTo(-10);
    expect(surprisePctOf({ epsActual: 1.08, epsEstimate: null, surprisePct: 9 })).toBe(9);
    expect(surprisePctOf({ epsActual: null, epsEstimate: null, surprisePct: null })).toBeNull();
  });
});

describe("summarizeReports", () => {
  it("counts beats and misses with resultWord", () => {
    const base = { kind: "earnings", ticker: "X", date: "2026-08-01", reaction: null } as unknown as EarningsItem;
    const rows = [
      { ...base, date: "2026-05-01", epsActual: 1.08, epsEstimate: 1.17, surpriseLabel: "beat", surprisePct: 9 },
      { ...base, date: "2026-08-01", epsActual: 1.3, epsEstimate: 1.1, surpriseLabel: null, surprisePct: null },
    ] as EarningsItem[];
    const summary = summarizeReports(rows, "2026-11-10");
    expect(summary.beats).toBe(1);
    expect(summary.misses).toBe(1);
  });
});
