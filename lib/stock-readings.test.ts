import { describe, expect, it } from "vitest";

import {
  balanceReading,
  businessHeadline,
  cashFlowReading,
  growthReading,
  marginReading,
  ownershipHeadline,
  rangeReading,
  rsiReading,
  trendReading,
  valuationHeadline,
  valuationRows,
} from "@/lib/stock-readings";
import type { StockFacts } from "@/lib/stock";

const facts = {
  instrument_id: "US_NVDA",
  market: "US",
  ticker: "NVDA",
  financials: { fiscal_year: "TTM", revenue: 302_970_000_000, revenue_growth_yoy_pct: 83.38 },
  // Stored newest first.
  financial_history: [
    { period: "TTM", revenue: 302_970_000_000, operating_margin_pct: 65.21, free_cash_flow: 127_006_000_000 },
    { period: "FY 2026", revenue: 215_938_000_000, operating_margin_pct: 60.38, free_cash_flow: 96_676_000_000 },
    { period: "FY 2022", revenue: 26_914_000_000, operating_margin_pct: 37.3, free_cash_flow: 8_132_000_000 },
  ],
  balance: { cash_and_investments: 62_469_000_000, total_debt: 38_860_000_000, net_cash: 23_609_000_000 },
} as StockFacts;

describe("business readings", () => {
  it("writes each sentence from the stored figures", () => {
    expect(growthReading(facts)?.statement).toBe("Revenue grew 83% from a year earlier, to $303.0B in the last twelve months.");
    expect(marginReading(facts)?.statement).toBe("It keeps 65 cents of every revenue dollar as operating profit, up from 37 cents in FY 2022.");
    expect(cashFlowReading(facts)?.statement).toBe("It turned 42% of revenue into free cash flow: $127.0B in the last twelve months.");
    expect(balanceReading(facts)?.statement).toBe(
      "It holds $62.5B in cash and investments against $38.9B of debt, which leaves $23.6B of net cash.",
    );
    expect(businessHeadline(facts)).toBe("Revenue is up 83% in a year, and 65 cents of every dollar becomes operating profit.");
  });

  it("says nothing when the inputs are missing", () => {
    const empty = { instrument_id: "US_X", market: "US", ticker: "X" } as StockFacts;
    expect(growthReading(empty)).toBeNull();
    expect(marginReading(empty)).toBeNull();
    expect(cashFlowReading(empty)).toBeNull();
    expect(balanceReading(empty)).toBeNull();
    expect(businessHeadline(empty)).toBeNull();
    expect(growthReading(null)).toBeNull();
  });

  it("handles losses, cash burn and net debt", () => {
    const loss = {
      ...facts,
      financials: { revenue: 100_000_000, revenue_growth_yoy_pct: -12 },
      financial_history: [{ period: "TTM", revenue: 100_000_000, operating_margin_pct: -30, free_cash_flow: -40_000_000 }],
      balance: { cash_and_investments: 10_000_000, total_debt: 90_000_000 },
    } as StockFacts;
    expect(growthReading(loss)?.tone).toBe("bad");
    expect(marginReading(loss)?.statement).toBe("It loses 30 cents on every revenue dollar at the operating line.");
    expect(cashFlowReading(loss)?.statement).toBe("It burned $40.0M of free cash in the last twelve months.");
    expect(balanceReading(loss)?.statement).toContain("net debt is $80.0M");
    expect(balanceReading(loss)?.tone).toBe("bad");
    // A moderate debt to equity beside it keeps the chip from saying "Heavy debt"; a high or negative one does not.
    expect(balanceReading({ ...loss, quality: { debt_to_equity: 0.72 } } as StockFacts)?.verdict).toBe("Some debt");
    expect(balanceReading({ ...loss, quality: { debt_to_equity: 3.1 } } as StockFacts)?.verdict).toBe("Heavy debt");
    expect(balanceReading({ ...loss, quality: { debt_to_equity: -2 } } as StockFacts)?.verdict).toBe("Heavy debt");
  });
});

describe("valuation", () => {
  const sectorMetrics = [
    { label: "P/E TTM", value: 29.36, benchmark: 25.92, benchmark_label: "Sector avg" },
    { label: "Forward P/E", value: 15.33, benchmark: 17.33, benchmark_label: "Sector avg" },
    { label: "PEG", value: 0.34, benchmark: 1, benchmark_label: "Fair value <1" },
  ];

  it("pairs a multiple with its sector average only when one is stored", () => {
    const rows = valuationRows({ pe: 29.1, forwardPe: 15.3, priceToSales: 14.9, priceToFcf: null, evToEbitda: -3, sectorMetrics });
    expect(rows.map((row) => row.key)).toEqual(["pe", "fpe", "ps"]);
    expect(rows[0]).toMatchObject({ value: 29.36, sector: 25.92 });
    expect(rows[0]!.gapPct).toBeCloseTo(13.27, 1);
    expect(rows[1]!.gapPct).toBeLessThan(0);
    expect(rows[2]).toMatchObject({ value: 14.9, sector: null, gapPct: null });
  });

  it("falls back to the plain multiple without sector data and drops empty rows", () => {
    expect(valuationRows({ pe: 12 })).toEqual([{ key: "pe", label: "P/E (trailing)", value: 12, sector: null, gapPct: null }]);
    expect(valuationRows({})).toEqual([]);
  });

  it("writes the headline from what exists", () => {
    expect(valuationHeadline({ ticker: "NVDA", price: 177.25, pe: 29.36, sectorPe: 25.92, targetMid: 315 })).toBe(
      "NVDA trades at 29.4 times earnings, 13.3% above its sector average, and the middle analyst target sits 78% above today's price.",
    );
    expect(valuationHeadline({ ticker: "X", price: 10, priceToSales: 4 })).toBe("X has no earnings to price against and trades at 4.0 times sales.");
    expect(valuationHeadline({ ticker: "X", price: 10 })).toBeNull();
  });
});

describe("technical readings", () => {
  it("places the price against its averages", () => {
    const averages = { sma_20: 211, sma_50: 219, sma_200: 193 };
    expect(trendReading(177, { moving_averages: averages })?.statement).toBe("The price is below its 20-day, 50-day and 200-day averages.");
    expect(trendReading(230, { moving_averages: averages })?.tone).toBe("good");
    expect(trendReading(200, { moving_averages: averages })?.statement).toBe(
      "The price is above its 200-day average and below its 20-day and 50-day.",
    );
    expect(trendReading(200, { moving_averages: { sma_50: null } })).toBeNull();
    expect(trendReading(0, { moving_averages: averages })).toBeNull();
  });

  it("reads RSI against the 30 and 70 lines", () => {
    expect(rsiReading({ rsi_14: { value: 75.2 } })?.statement).toContain("overbought");
    expect(rsiReading({ rsi_14: { value: 22 } })?.statement).toContain("oversold");
    expect(rsiReading({ rsi_14: { value: 30.76 } })?.statement).toContain("inside the 30 to 70 band");
    expect(rsiReading({ rsi_14: { value: 140 } })).toBeNull();
    expect(rsiReading(null)).toBeNull();
  });

  it("states the distance from the 52-week high and low", () => {
    expect(rangeReading({ distance: { from_52w_high_pct: -21.08, from_52w_low_pct: 13.78 } })?.statement).toBe(
      "It is 21% below its 52-week high and 13.8% above the low.",
    );
    expect(rangeReading({ distance: { from_52w_high_pct: 0, from_52w_low_pct: 80 } })?.statement).toContain("at its 52-week high");
    expect(rangeReading({ distance: { from_52w_high_pct: null, from_52w_low_pct: 5 } })).toBeNull();
  });
});

describe("ownershipHeadline", () => {
  it("combines institutions and Congress", () => {
    expect(
      ownershipHeadline({ ticker: "NVDA", institutionalPct: 79.65, congressBuys: 0, congressSells: 3, congressOther: 0, windowDays: 365, hasCongressFeed: true }),
    ).toBe("Institutions hold 80% of NVDA. Congress disclosed 3 sales in the last 365 days.");
    expect(
      ownershipHeadline({ ticker: "X", congressBuys: 0, congressSells: 0, congressOther: 0, windowDays: 365, hasCongressFeed: true }),
    ).toBe("No member of Congress has disclosed a trade in it in the last 365 days.");
    expect(ownershipHeadline({ ticker: "X", congressBuys: 0, congressSells: 0, congressOther: 0, windowDays: 365, hasCongressFeed: false })).toBeNull();
  });
});
