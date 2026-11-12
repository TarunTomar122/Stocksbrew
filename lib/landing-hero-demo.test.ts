import { describe, expect, it } from "vitest";

import { fitWhy, levelIsNear, rankStandOut, sparkGeometry, threeMonthCloses, wordCount } from "@/lib/landing-hero-demo";

describe("landing hero demo", () => {
  it("keeps a reason inside fifteen words, dropping only a trailing comparison", () => {
    expect(fitWhy("AMD's sales rose 42% over the last four quarters, to $45.4B.")).toBe("AMD's sales rose 42% over the last four quarters, to $45.4B.");
    expect(fitWhy("NVDA fell 13% in the five trading days to Nov 11, while the S&P 500 fell 0.9%.")).toBe("NVDA fell 13% in the five trading days to Nov 11.");
    expect(fitWhy("NVDA's sales rose 83% over the last four quarters, to $303B, faster than its 65% growth in fiscal 2026.")).toBe(
      "NVDA's sales rose 83% over the last four quarters, to $303B.",
    );
    // No clause that can go: dropped, never cut mid-sentence.
    expect(fitWhy("In its Oct 21 report, TSLA's earnings per share of $0.20 missed the $0.22 analysts expected by a lot.")).toBeNull();
    expect(fitWhy("")).toBeNull();
    for (const text of ["MSFT's sales rose 18% over the last four quarters, to $346B, about the same as its 18% growth in fiscal 2026."]) {
      expect(wordCount(fitWhy(text) ?? "")).toBeLessThanOrEqual(15);
    }
  });

  it("takes three months of closes by date and ends at today's price", () => {
    const history = Array.from({ length: 200 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000);
      return { date: day.toISOString().slice(0, 10), close: 100 + i };
    });
    const closes = threeMonthCloses(history, 500);
    const last = history[history.length - 1]!;
    expect(closes[closes.length - 1]).toBe(500);
    expect(closes.length).toBeGreaterThan(85);
    expect(closes.length).toBeLessThan(95);
    expect(closes[closes.length - 2]).toBe(last.close);
    expect(threeMonthCloses(history.slice(0, 5), 100)).toEqual([]);
  });

  it("draws the level only when it sits near the line", () => {
    const closes = [100, 104, 102, 108, 110];
    expect(sparkGeometry(closes, 101).levelY).not.toBeNull();
    expect(sparkGeometry(closes, 40).levelY).toBeNull();
    expect(sparkGeometry(closes, null).points.split(" ")).toHaveLength(5);
    expect(levelIsNear(509, 552.96)).toBe(true);
    expect(levelIsNear(200, 552.96)).toBe(false);
  });

  it("puts an explained move first, then the bigger move", () => {
    const moves: Record<string, number> = { NVDA: 2.9, AMD: 7.3, MSFT: -2.2, AAPL: 0.4 };
    expect(rankStandOut(["NVDA", "AMD", "MSFT", "AAPL"], (t) => moves[t] ?? null, (t) => t === "MSFT")).toEqual(["MSFT", "AMD", "NVDA", "AAPL"]);
  });
});
