import { describe, expect, it } from "vitest";

import {
  hasSufficientOverallData,
  hasSufficientPillarData,
  overallCoverage,
  pillarCoverage,
} from "@/lib/fundamentals-coverage";
import type { StockIntelPillar, StockIntelPro } from "@/lib/types";

function pillar(overrides: Partial<StockIntelPillar> = {}): StockIntelPillar {
  return {
    score: 50,
    verdict: "mixed",
    weight: 0.25,
    metrics: [],
    ...overrides,
  };
}

function intel(overall: StockIntelPro["overall"]): StockIntelPro {
  const emptyPillar = pillar();
  return {
    instrument_id: "US:TEST",
    ticker: "TEST",
    sector_slug: "technology",
    sector_label: "Technology",
    industry_label: "Software",
    pillars: {
      valuation: emptyPillar,
      growth: emptyPillar,
      quality: emptyPillar,
      momentum: emptyPillar,
    },
    overall,
    catalysts: [],
    snapshot_date: "2026-07-17",
    generated_at: "2026-07-17T00:00:00Z",
  };
}

describe("fundamentals coverage", () => {
  it("uses explicit weighted coverage from the scorer", () => {
    const sparse = pillar({ coverage: 0.3 });
    expect(pillarCoverage(sparse)).toBe(0.3);
    expect(hasSufficientPillarData(sparse)).toBe(false);
  });

  it("derives weighted coverage for legacy pillar documents", () => {
    const legacy = pillar({
      metrics: [
        { label: "P/E", value: 20, benchmark: 25, benchmark_label: "Sector", signal: "green", summary: "", score: 80, weight: 25 },
        { label: "Target", value: null, benchmark: 20, benchmark_label: "Price", signal: "na", summary: "", score: null, weight: 75 },
      ],
    });
    expect(pillarCoverage(legacy)).toBe(0.25);
    expect(hasSufficientPillarData(legacy)).toBe(false);
  });

  it("withholds explicitly low-coverage overall scores", () => {
    const sparse = intel({ score: 50, verdict: "insufficient data", stance: "insufficient data", coverage: 0.4 });
    expect(overallCoverage(sparse)).toBe(0.4);
    expect(hasSufficientOverallData(sparse)).toBe(false);
  });

  it("keeps legacy overall documents readable until they are rescored", () => {
    expect(hasSufficientOverallData(intel({ score: 72, verdict: "strong", stance: "strong" }))).toBe(true);
  });
});
