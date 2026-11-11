import { describe, expect, it } from "vitest";

import { isBalanceSheetFinancial } from "@/lib/financial-company";
import { businessHeadline, overviewReadings, payoutReading, returnOnEquityReading } from "@/lib/stock-readings";
import type { StockFacts } from "@/lib/stock";

describe("isBalanceSheetFinancial", () => {
  it("counts banks, brokers, insurers and lenders under either sector name", () => {
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Banks - Diversified", ticker: "JPM" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Capital Markets", ticker: "GS" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Regional Banks", ticker: "FITB" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Property & Casualty Insurance", ticker: "ALL" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Consumer Finance", ticker: "COF" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Credit Services", ticker: "AXP" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Multi-Sector Holdings", ticker: "BRK.B" })).toBe(true);
    // The catch-all industry, or none at all, most likely means a bank or an insurer.
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Financials", ticker: "ABCB" })).toBe(true);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: null, ticker: "XYZQ" })).toBe(true);
  });

  it("leaves fee businesses in the sector alone", () => {
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Credit Services", ticker: "V" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Credit Services", ticker: "MA" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Transaction & Payment Processing Services", ticker: "CPAY" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Financial Exchanges & Data", ticker: "CBOE" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Insurance Brokers", ticker: "AJG" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financial Services", industry: "Asset Management", ticker: "BLK" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Asset Management & Custody Banks", ticker: "BX" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Asset Management & Custody Banks", ticker: "ARES" })).toBe(false);
    // The custody banks in that industry hold deposits.
    expect(isBalanceSheetFinancial({ sector: "Financials", industry: "Asset Management & Custody Banks", ticker: "BK" })).toBe(true);
  });

  it("leaves other sectors alone, health plans included", () => {
    expect(isBalanceSheetFinancial({ sector: "Technology", industry: "Semiconductors", ticker: "NVDA" })).toBe(false);
    expect(isBalanceSheetFinancial({ sector: "Healthcare", industry: "Healthcare Plans", ticker: "UNH" })).toBe(false);
    expect(isBalanceSheetFinancial(null)).toBe(false);
  });
});

// JPMorgan's stored facts on Nov 11, 2026: the 2025 "free cash flow" is the loan book moving, not cash burned.
const jpm = {
  instrument_id: "US_JPM",
  market: "US",
  ticker: "JPM",
  financials: { fiscal_year: "TTM", revenue: 190_733_000_000, revenue_growth_yoy_pct: 14.06, net_income: 64_527_000_000, eps_diluted: 23.81 },
  financial_history: [
    { period: "TTM" },
    { period: "FY 2025", free_cash_flow: -147_782_000_000 },
    { period: "FY 2024", free_cash_flow: -42_012_000_000 },
  ],
  balance: { cash_and_investments: 1_881_474_000_000, net_cash: 555_219_000_000, total_debt: 1_326_255_000_000 },
  quality: { roe_pct: 18.01, debt_to_equity: 3.59 },
  dividends: { annual_dividend: 6.6, yield_pct: 1.97, payout_ratio_pct: 25.83, growth_years: 15 },
} as StockFacts;

describe("readings for a bank", () => {
  it("drops free cash flow and net cash, and reads return on equity and the payout instead", () => {
    const statements = overviewReadings(jpm, "$", true)
      .filter((reading) => reading !== null)
      .map((reading) => reading!.statement);
    expect(statements).toEqual([
      "Revenue grew 14.1% from a year earlier, to $190.7B in the last twelve months.",
      "It earned 18% on shareholders' equity over the last twelve months.",
      "It pays $6.60 a share in dividends, 26% of its earnings, and it has raised it 15 years in a row.",
    ]);
    expect(statements.join(" ")).not.toMatch(/free cash|net cash|burn/i);
  });

  it("keeps the industrial readings when the company is not a bank", () => {
    const statements = overviewReadings(jpm, "$", false).filter(Boolean).map((reading) => reading!.statement);
    expect(statements.some((text) => /free cash/.test(text))).toBe(true);
  });

  it("headlines growth with return on equity, never cash burn", () => {
    expect(businessHeadline(jpm, true)).toBe("Revenue is up 14.1% in a year, and it earns 18% on its equity.");
    expect(businessHeadline(jpm, false)).toMatch(/burning cash/);
  });

  it("says nothing without the figures", () => {
    expect(returnOnEquityReading({ ...jpm, quality: {} } as StockFacts)).toBeNull();
    expect(payoutReading({ ...jpm, dividends: { annual_dividend: 6.6 } } as StockFacts)).toBeNull();
    expect(payoutReading({ ...jpm, dividends: { annual_dividend: 0, payout_ratio_pct: 20 } } as StockFacts)).toBeNull();
  });

  it("grades return on equity and the payout", () => {
    expect(returnOnEquityReading({ ...jpm, quality: { roe_pct: 9 } } as StockFacts)?.verdict).toBe("Fair return");
    expect(returnOnEquityReading({ ...jpm, quality: { roe_pct: -4 } } as StockFacts)?.tone).toBe("bad");
    expect(payoutReading({ ...jpm, dividends: { annual_dividend: 2, payout_ratio_pct: 120, growth_years: 1 } } as StockFacts)).toEqual({
      statement: "It pays $2.00 a share in dividends, 120% of its earnings.",
      tone: "bad",
      verdict: "Stretched payout",
    });
  });
});
