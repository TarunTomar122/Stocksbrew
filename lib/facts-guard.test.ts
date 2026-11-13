import { describe, expect, it } from "vitest";

import { amountsInOtherCurrency, growthOutsideFiscalYears, guardFacts } from "./facts-guard";
import type { StockFacts } from "./stock";

const honeywellHistory = [
  { period: "TTM", revenue: 37_743e6 },
  { period: "FY 2025", revenue: 37_442e6 },
  { period: "FY 2024", revenue: 34_717e6 },
];

function facts(over: Partial<StockFacts>): StockFacts {
  return { instrument_id: "US_HON", market: "US", ticker: "HON", ...over };
}

describe("growthOutsideFiscalYears", () => {
  it("rules out Honeywell's +80% beside +7.8% fiscal growth", () => {
    expect(growthOutsideFiscalYears(37_743e6, 79.64, honeywellHistory)).toBe(true);
    expect(growthOutsideFiscalYears(37_743e6, 1.5, honeywellHistory)).toBe(false);
  });

  it("says nothing without two consecutive fiscal years", () => {
    expect(growthOutsideFiscalYears(100, 500, [{ period: "FY 2025", revenue: 90 }])).toBe(false);
    expect(growthOutsideFiscalYears(100, 500, [{ period: "FY 2025", revenue: 90 }, { period: "FY 2023", revenue: 80 }])).toBe(false);
    expect(growthOutsideFiscalYears(null, 500, honeywellHistory)).toBe(false);
  });
});

describe("guardFacts", () => {
  it("takes out a growth its own fiscal years rule out, on a doc the writer did not check", () => {
    const raw = facts({ financials: { revenue: 37_743e6, revenue_growth_yoy_pct: 79.64 }, financial_history: honeywellHistory });
    const out = guardFacts(raw);
    expect(out.financials?.revenue_growth_yoy_pct).toBeNull();
    expect(out.financials?.revenue).toBe(37_743e6);
    expect(raw.financials?.revenue_growth_yoy_pct).toBe(79.64);
  });

  it("trusts what the writer checked, and never passes the withheld list on", () => {
    const checked = facts({
      financials: { revenue: 2.74e6, revenue_growth_yoy_pct: -95.73, revenue_growth_basis: "quarters" },
      financial_history: [{ period: "FY 2025", revenue: 31.5e6 }, { period: "FY 2024", revenue: 37e6 }],
      withheld: [{ field: "financials.eps_diluted", reason: "for us" }],
    });
    const out = guardFacts(checked);
    expect(out.financials?.revenue_growth_yoy_pct).toBe(-95.73);
    expect("withheld" in out).toBe(false);
  });

  it("takes out amounts in another currency, keeping growth and margins", () => {
    const tsmc = facts({
      financials: { revenue: 4.94e12, revenue_growth_yoy_pct: 30, eps_diluted: 97.48 },
      financial_history: [{ period: "TTM", revenue: 4.94e12, gross_margin_pct: 60 }],
      balance: { net_cash: 2e12 },
      quick_stats: { market_cap: 1.95e12 },
      valuation: { price_to_sales: 10.9 },
    });
    expect(amountsInOtherCurrency(tsmc)).toBe(true);
    const out = guardFacts(tsmc);
    expect(out.financials?.revenue).toBeNull();
    expect(out.financials?.eps_diluted).toBeNull();
    expect(out.financials?.revenue_growth_yoy_pct).toBe(30);
    expect(out.financial_history?.[0]?.gross_margin_pct).toBe(60);
    expect(out.balance?.net_cash).toBeNull();
    expect(amountsInOtherCurrency(facts({ financials: { revenue: 4.67e11 }, quick_stats: { market_cap: 4.97e12 }, valuation: { price_to_sales: 10.6 } }))).toBe(false);
  });

  it("passes null through", () => {
    expect(guardFacts(null)).toBeNull();
  });
});
