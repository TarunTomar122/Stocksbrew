import { describe, expect, it } from "vitest";

import { buildPortfolioBook } from "@/lib/portfolio-book";
import {
  buildRebalancePlanFromData,
  getRebalanceStrategy,
  type RebalanceUniverseCandidate,
} from "@/lib/portfolio-organize";
import type { WatchlistRow } from "@/lib/watchlist-view";

function mockRow(
  overrides: Partial<WatchlistRow> & Pick<WatchlistRow, "instrument_id" | "ticker">,
): WatchlistRow {
  return {
    instrument_name: overrides.ticker,
    logo_url: null,
    position_type: "holding",
    market: "US",
    sector_label: "Technology",
    industry_label: "Software",
    currency: "USD",
    price: 100,
    day_change_pct: 0,
    day_change_abs: 0,
    scores: {
      overall: 75,
      verdict: "solid",
      valuation: 70,
      growth: 75,
      quality: 72,
      momentum: 70,
    },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "test", vibe: "up", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: true,
    ...overrides,
  };
}

function mockCandidate(
  overrides: Partial<RebalanceUniverseCandidate> & Pick<RebalanceUniverseCandidate, "instrument_id" | "ticker" | "name">,
): RebalanceUniverseCandidate {
  return {
    logo_url: null,
    sector_label: "Healthcare",
    industry_label: "Biotech",
    price: 100,
    day_change_pct: 0,
    market_cap: 100_000_000_000,
    pe_ttm: 20,
    verdict: "solid",
    directive_text: null,
    scores: {
      overall: 80,
      valuation: 72,
      growth: 78,
      quality: 82,
      momentum: 75,
    },
    ...overrides,
  };
}

describe("getRebalanceStrategy", () => {
  it("falls back to balanced for unknown ids", () => {
    expect(getRebalanceStrategy("made_up").id).toBe("balanced");
  });
});

describe("buildRebalancePlanFromData", () => {
  it("surfaces overweight sectors and outside-universe opportunities", () => {
    const rows = buildPortfolioBook([
      mockRow({
        instrument_id: "US_NVDA",
        ticker: "NVDA",
        sector_label: "Technology",
        industry_label: "Semiconductors",
        holding: { portfolio_weight_pct: 42 },
        scores: { overall: 90, verdict: "strong", valuation: 58, growth: 94, quality: 88, momentum: 92 },
      }),
      mockRow({
        instrument_id: "US_SMCI",
        ticker: "SMCI",
        sector_label: "Technology",
        industry_label: "Computer Hardware",
        holding: { portfolio_weight_pct: 28 },
        scores: { overall: 58, verdict: "mixed", valuation: 42, growth: 66, quality: 52, momentum: 54 },
      }),
      mockRow({
        instrument_id: "US_MSFT",
        ticker: "MSFT",
        sector_label: "Technology",
        industry_label: "Software",
        holding: { portfolio_weight_pct: 18 },
        scores: { overall: 86, verdict: "strong", valuation: 64, growth: 85, quality: 90, momentum: 80 },
      }),
      mockRow({
        instrument_id: "US_UNH",
        ticker: "UNH",
        sector_label: "Healthcare",
        industry_label: "Healthcare Plans",
        holding: { portfolio_weight_pct: 12 },
        scores: { overall: 72, verdict: "solid", valuation: 70, growth: 58, quality: 78, momentum: 62 },
      }),
    ]);

    const plan = buildRebalancePlanFromData({
      rows,
      universeCandidates: [
        mockCandidate({
          instrument_id: "US_LLY",
          ticker: "LLY",
          name: "Eli Lilly",
          sector_label: "Healthcare",
          industry_label: "Drug Manufacturers",
          scores: { overall: 88, valuation: 52, growth: 92, quality: 86, momentum: 84 },
        }),
        mockCandidate({
          instrument_id: "US_CAT",
          ticker: "CAT",
          name: "Caterpillar",
          sector_label: "Industrials",
          industry_label: "Farm & Heavy Machinery",
          scores: { overall: 81, valuation: 68, growth: 72, quality: 83, momentum: 74 },
        }),
      ],
      sectorRegimes: {
        semiconductors: {
          market: "US",
          sector: "Semiconductors",
          sector_slug: "semiconductors",
          regime: "momentum",
          conviction: 78,
          narrative: "Semis are still leading, but the tape is crowded.",
        },
        healthcare_plans: {
          market: "US",
          sector: "Healthcare Plans",
          sector_slug: "healthcare_plans",
          regime: "recovering",
          conviction: 64,
          narrative: "Healthcare is stabilizing after a weak stretch.",
        },
        industrials: {
          market: "US",
          sector: "Industrials",
          sector_slug: "industrials",
          regime: "expanding",
          conviction: 71,
          narrative: "Industrials still have breadth and clean relative strength.",
        },
      },
      strategyId: "balanced",
    });

    expect(plan.sectors[0]?.weight_pct).toBe(42);
    expect(plan.trim_focus.holdings.some((holding) => holding.ticker === "SMCI")).toBe(true);
    expect(plan.opportunities.stocks.map((stock) => stock.ticker)).toContain("CAT");
  });

  it("keeps ai momentum biased toward leadership sectors", () => {
    const rows = buildPortfolioBook([
      mockRow({
        instrument_id: "US_JNJ",
        ticker: "JNJ",
        sector_label: "Healthcare",
        industry_label: "Drug Manufacturers",
        holding: { portfolio_weight_pct: 50 },
        scores: { overall: 72, verdict: "solid", valuation: 72, growth: 48, quality: 84, momentum: 44 },
      }),
      mockRow({
        instrument_id: "US_PEP",
        ticker: "PEP",
        sector_label: "Consumer Staples",
        industry_label: "Beverages",
        holding: { portfolio_weight_pct: 50 },
        scores: { overall: 68, verdict: "solid", valuation: 65, growth: 46, quality: 78, momentum: 42 },
      }),
    ]);

    const plan = buildRebalancePlanFromData({
      rows,
      universeCandidates: [
        mockCandidate({
          instrument_id: "US_NVDA",
          ticker: "NVDA",
          name: "NVIDIA",
          sector_label: "Technology",
          industry_label: "Semiconductors",
          scores: { overall: 94, valuation: 40, growth: 97, quality: 92, momentum: 96 },
        }),
      ],
      sectorRegimes: {
        semiconductors: {
          market: "US",
          sector: "Semiconductors",
          sector_slug: "semiconductors",
          regime: "momentum",
          conviction: 82,
          narrative: "Leadership is still concentrated in semis.",
        },
      },
      strategyId: "ai_momentum",
    });

    expect(plan.opportunities.stocks[0]?.ticker).toBe("NVDA");
    expect(plan.opportunities.summary.toLowerCase()).toContain("semiconductors");
  });
});
