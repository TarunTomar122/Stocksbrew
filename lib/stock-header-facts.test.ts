import { describe, expect, it } from "vitest";

import { consistentFundamentals, currentPe, dividendYieldPct, livePe, pastYearRange } from "./stock-header-facts";

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

  it("works a US stock's P/E out from today's price, not Yahoo's block from when the stock was added", () => {
    const base = { closes: null, price: 37.11, today: "2026-11-13", annualDividend: null, market: "US" as const };
    const usd = { financials: { fiscal_year: "TTM", eps_diluted: 2.48, currency: "USD" }, quick_stats: { pe_ttm: 13.2 } };
    expect(consistentFundamentals({ pe_ttm: 49.56 }, { ...base, facts: usd })?.pe_ttm).toBeCloseTo(14.96, 2);
    // A loss: no P/E at all.
    expect(consistentFundamentals({ pe_ttm: 49.56 }, { ...base, facts: { ...usd, financials: { ...usd.financials, eps_diluted: -0.4 } } })?.pe_ttm).toBeUndefined();
    // EPS not known to be in dollars: the weekly P/E.
    const old = { financials: { fiscal_year: "TTM", eps_diluted: 2.48 }, quick_stats: { pe_ttm: 13.2 } };
    expect(consistentFundamentals({ pe_ttm: 49.56 }, { ...base, facts: old })?.pe_ttm).toBe(13.2);
    // Another market keeps its own.
    expect(consistentFundamentals({ pe_ttm: 49.56 }, { ...base, market: "IN", facts: usd })?.pe_ttm).toBe(49.56);
  });
});

describe("livePe", () => {
  it("needs a four-quarter EPS in dollars", () => {
    expect(livePe({ financials: { fiscal_year: "TTM", eps_diluted: 5, currency: "USD" } }, 50)).toBe(10);
    expect(livePe({ financials: { fiscal_year: "TTM", eps_diluted: 5, currency: "USD", reported_currency: "TWD" } }, 50)).toBeUndefined();
    expect(livePe({ financials: { fiscal_year: "FY 2025", eps_diluted: 5, currency: "USD" } }, 50)).toBeUndefined();
    expect(livePe({ financials: { fiscal_year: "TTM", eps_diluted: 0, currency: "USD" } }, 50)).toBeNull();
    expect(livePe(null, 50)).toBeUndefined();
    // A loss is a loss in any currency.
    expect(livePe({ financials: { fiscal_year: "TTM", eps_diluted: -2 } }, 50)).toBeNull();
  });
});

describe("currentPe", () => {
  it("prefers today's price over EPS, then the weekly P/E, and is null for a loss", () => {
    expect(currentPe({ financials: { fiscal_year: "TTM", eps_diluted: 5, currency: "USD" }, quick_stats: { pe_ttm: 12 } }, 50)).toBe(10);
    expect(currentPe({ financials: { fiscal_year: "TTM", eps_diluted: -1, currency: "USD" }, quick_stats: { pe_ttm: 12 } }, 50)).toBeNull();
    expect(currentPe({ financials: { fiscal_year: "TTM", eps_diluted: 5 }, quick_stats: { pe_ttm: 12 } }, 50)).toBe(12);
    expect(currentPe(null, 50)).toBeNull();
  });

  it("gives a P/E even when the price doc has no Yahoo block", () => {
    const out = consistentFundamentals(null, {
      closes: null,
      price: 50,
      today: "2026-11-13",
      annualDividend: null,
      market: "US",
      facts: { financials: { fiscal_year: "TTM", eps_diluted: 5, currency: "USD" } },
    });
    expect(out?.pe_ttm).toBe(10);
  });
});
