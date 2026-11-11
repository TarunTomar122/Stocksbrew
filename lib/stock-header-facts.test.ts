import { describe, expect, it } from "vitest";

import { consistentFundamentals, dividendYieldPct, pastYearRange } from "./stock-header-facts";

function closes(count: number, from: string, start: number, step: number) {
  const out: Array<{ date: string; close: number }> = [];
  let at = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push({ date: new Date(at).toISOString().slice(0, 10), close: start + i * step });
    at += 86_400_000;
  }
  return out;
}

describe("pastYearRange", () => {
  it("works the range out from the year's closes plus today's price", () => {
    // 300 daily closes from 70 rising to ~85, then today's price of 96.90 above all of them.
    const series = closes(300, "2026-01-15", 70, 0.05);
    const range = pastYearRange(series, 96.9, "2026-11-11", { low: 65.35, high: 84.04 });
    expect(range).toEqual({ low: 70, high: 96.9 });
  });

  it("ignores closes older than a year", () => {
    const old = closes(30, "2024-01-01", 10, 0);
    const recent = closes(200, "2026-04-01", 50, 0.1);
    const range = pastYearRange([...old, ...recent], 60, "2026-11-11");
    expect(range?.low).toBe(50);
  });

  it("drops a stored range the price has already left, and keeps one it sits inside", () => {
    expect(pastYearRange([], 96.9, "2026-11-11", { low: 65.35, high: 84.04 })).toBeNull();
    expect(pastYearRange(null, 80, "2026-11-11", { low: 65.35, high: 84.04 })).toEqual({ low: 65.35, high: 84.04 });
  });
});

describe("dividendYieldPct", () => {
  it("is the annual dividend over today's price, in percent", () => {
    expect(dividendYieldPct(2.12, 96.9)).toBeCloseTo(2.188, 3);
    expect(dividendYieldPct(1, 168.79)).toBeCloseTo(0.592, 3);
    expect(dividendYieldPct(0, 100)).toBeNull();
    expect(dividendYieldPct(1, null)).toBeNull();
  });
});

describe("consistentFundamentals", () => {
  it("replaces the stale range and sets the yield, leaving the rest alone", () => {
    const out = consistentFundamentals(
      { week_52_high: 84.04, week_52_low: 65.35, dividend_yield: 0.0261, pe_ttm: 25.6 },
      { closes: closes(300, "2026-01-15", 70, 0.05), price: 96.9, today: "2026-11-11", annualDividend: 2.12 },
    );
    expect(out?.week_52_high).toBe(96.9);
    expect(out?.pe_ttm).toBe(25.6);
    expect(out?.dividend_yield_pct).toBeCloseTo(2.188, 3);
  });

  it("drops a stale range when there are no closes to replace it", () => {
    const out = consistentFundamentals({ week_52_high: 84.04, week_52_low: 65.35 }, { closes: null, price: 96.9, today: "2026-11-11", annualDividend: null });
    expect(out?.week_52_high).toBeUndefined();
    expect(out?.dividend_yield_pct).toBeUndefined();
  });
});
