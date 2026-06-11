import { describe, expect, it } from "vitest";

import { buildRebalanceImpactView } from "@/lib/portfolio-rebalance-impact";
import type { PortfolioRebalancePlan } from "@/lib/portfolio-organize-types";

function basePlan(overrides: Partial<PortfolioRebalancePlan> = {}): PortfolioRebalancePlan {
  return {
    strategy: { id: "balanced", label: "Balanced", summary: "test" },
    headline: "test",
    summary: "test",
    diagnostics: [{ id: "diversification", label: "Diversification", value: "72/100", detail: "", tone: "neutral" }],
    sectors: [],
    core_focus: { headline: "", summary: "", holdings: [] },
    trim_focus: { headline: "", summary: "", holdings: [] },
    opportunities: { headline: "", summary: "", missing_sectors: [], stocks: [] },
    source: "rules",
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildRebalanceImpactView", () => {
  it("splits keep/remove/add and projects sector shifts", () => {
    const plan = basePlan({
      sectors: [
        {
          sector: "Semiconductors",
          weight_pct: 45,
          count: 2,
          summary: "",
          holdings: [
            {
              instrument_id: "US_NVDA",
              ticker: "NVDA",
              name: "Nvidia",
              logo_url: null,
              sector_label: "Technology",
              industry_label: "Semiconductors",
              price: 100,
              day_change_pct: 1,
              weight_pct: 28,
              role: "core",
              reason: "keep",
              fit_score: 88,
              verdict: null,
              directive_text: null,
              scores: { overall: 88, valuation: 70, growth: 80, quality: 80, momentum: 75 },
            },
            {
              instrument_id: "US_TSM",
              ticker: "TSM",
              name: "TSMC",
              logo_url: null,
              sector_label: "Technology",
              industry_label: "Semiconductors",
              price: 100,
              day_change_pct: -1,
              weight_pct: 17,
              role: "trim",
              reason: "trim",
              fit_score: 54,
              verdict: null,
              directive_text: null,
              scores: { overall: 54, valuation: 50, growth: 55, quality: 52, momentum: 50 },
            },
          ],
        },
        {
          sector: "Software",
          weight_pct: 55,
          count: 1,
          summary: "",
          holdings: [
            {
              instrument_id: "US_MSFT",
              ticker: "MSFT",
              name: "Microsoft",
              logo_url: null,
              sector_label: "Technology",
              industry_label: "Software",
              price: 100,
              day_change_pct: 0.5,
              weight_pct: 55,
              role: "core",
              reason: "keep",
              fit_score: 90,
              verdict: null,
              directive_text: null,
              scores: { overall: 90, valuation: 75, growth: 85, quality: 88, momentum: 80 },
            },
          ],
        },
      ],
      opportunities: {
        headline: "Adds",
        summary: "",
        missing_sectors: ["Consumer"],
        stocks: [
          {
            instrument_id: "US_BKNG",
            ticker: "BKNG",
            name: "Booking",
            logo_url: null,
            sector_label: "Consumer",
            industry_label: "Consumer",
            price: 100,
            day_change_pct: 0,
            market_cap: null,
            pe_ttm: null,
            fit_score: 82,
            verdict: null,
            directive_text: null,
            reason: "add",
            why_now: "add",
            scores: { overall: 82, valuation: 70, growth: 75, quality: 78, momentum: 72 },
          },
        ],
      },
    });

    const impact = buildRebalanceImpactView(plan);
    expect(impact.keep.map((h) => h.ticker)).toEqual(["MSFT", "NVDA"]);
    expect(impact.remove.map((h) => h.ticker)).toEqual(["TSM"]);
    expect(impact.add.map((s) => s.ticker)).toEqual(["BKNG"]);
    expect(impact.sector_shifts.some((s) => s.sector === "Semiconductors")).toBe(true);
    expect(impact.diversification_after).toBeGreaterThanOrEqual(impact.diversification_before);
  });
});
