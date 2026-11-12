import { describe, expect, it } from "vitest";

import { exampleReports, type ExampleReportStock } from "./example-reports";

const report = (date: string, result: "beat" | "miss" | "in-line" | null, surprisePct: number | null, move: number | null) => ({
  date,
  session: "amc" as const,
  from: "calendar" as const,
  epsEstimate: null,
  epsActual: null,
  result,
  surprisePct,
  move,
  basis: "1d" as const,
});

const stock = (ticker: string, past: ReturnType<typeof report>[], extra: Partial<ExampleReportStock> = {}): ExampleReportStock => ({
  ticker,
  kind: "holding",
  fund: false,
  history: { past, next: null },
  ...extra,
});

describe("exampleReports", () => {
  it("lists each stock by its last report, newest first, and says the shared result once (judges, ship 50)", () => {
    const out = exampleReports(
      [
        stock("MSFT", [report("2026-10-28", "beat", 3.8, -0.16), report("2026-07-29", null, null, 15.5)]),
        stock("JPM", [report("2026-10-13", "miss", -3.2, -0.86)]),
        stock("LLY", [report("2026-10-29", "beat", 39, 6.63)], { kind: "watching" }),
        stock("COST", [report("2026-09-24", null, null, 2.93)], { history: { past: [report("2026-09-24", null, null, 2.93)], next: { date: "2026-12-10", session: "unknown", epsEstimate: 4.87, reported: false, result: null } } }),
        stock("AAPL", [report("2026-11-02", "beat", 3.5, -1.9)]),
        stock("VOO", [], { fund: true }),
        stock("NVDA", [report("2026-08-26", null, null, 8.74)]),
      ],
      ["NVDA"],
      "2026-11-12",
    );
    expect(out?.line).toBe("AAPL, LLY and MSFT beat profit forecasts; JPM missed.");
    expect(out?.cards.map((card) => card.ticker)).toEqual(["AAPL", "LLY", "MSFT", "JPM", "COST"]);
    // Only what is a card's own: the report coming up, a surprise far past the rest. The lone miss is named above.
    expect(Object.fromEntries(out!.cards.map((card) => [card.ticker, card.fact]))).toEqual({ AAPL: null, LLY: "Beat by 39%", MSFT: null, JPM: null, COST: "Reports Dec 10" });
    expect(out?.cards.find((card) => card.ticker === "LLY")?.watching).toBe(true);
  });

  it("is nothing with fewer than two stocks to show, and never counts a report after today", () => {
    expect(exampleReports([stock("AAPL", [report("2026-11-02", "beat", 3.5, -1.9)])], [], "2026-11-12")).toBeNull();
    const out = exampleReports([stock("A", [report("2026-11-20", "beat", 5, 1), report("2026-08-01", "miss", -2, -1)]), stock("B", [report("2026-10-01", "beat", 4, 2)])], [], "2026-11-12");
    expect(out?.cards[0]?.day).toBe("2026-10-01");
    expect(out?.cards[1]?.day).toBe("2026-08-01");
  });

  it("names what the forecasts were when no group before it did, and keeps a miss the line cannot say on its card", () => {
    const met = exampleReports([stock("UNH", [report("2026-10-14", "in-line", 0.4, 1)]), stock("V", [report("2026-10-28", "in-line", 0.2, -1)])], [], "2026-11-12");
    expect(met?.line).toBe("V and UNH met profit forecasts.");
    const misses = ["A", "B", "C", "D"].map((ticker) => stock(ticker, [report("2026-10-01", "miss", -4, -2)]));
    expect(exampleReports(misses, [], "2026-11-12")?.line).toBe("Four missed profit forecasts.");
    // One result only: there is no line, so the miss stays on its card.
    const lone = exampleReports([stock("JPM", [report("2026-10-13", "miss", -3.2, -0.9)]), stock("COST", [report("2026-09-24", null, null, 2.9)])], [], "2026-11-12");
    expect(lone?.line).toBeNull();
    expect(lone?.cards.find((card) => card.ticker === "JPM")?.fact).toBe("Missed by 3.2%");
  });
});
