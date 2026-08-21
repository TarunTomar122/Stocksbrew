import { describe, expect, it } from "vitest";

import { buildPortfolioBook } from "@/lib/portfolio-book";
import { currentMixWeek, deriveResearchMix, mixTotal, sanitizeMixWeights } from "@/lib/portfolio-mix";
import type { WatchlistRow } from "@/lib/watchlist-view";

function row(instrument_id: string, ticker: string, overall: number, stance?: "accumulate" | "trim"): WatchlistRow {
  return {
    instrument_id,
    ticker,
    instrument_name: ticker,
    logo_url: null,
    position_type: "watchlist",
    market: "US",
    sector_label: "Technology",
    industry_label: "Software",
    currency: "USD",
    price: 100,
    day_change_pct: 0,
    day_change_abs: 0,
    scores: { overall, verdict: null, valuation: null, growth: null, quality: null, momentum: null },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "test", vibe: "wild", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: false,
    directive_v2: stance ? { stance } : undefined,
  };
}

describe("portfolio mix", () => {
  const rows = buildPortfolioBook([row("US_A", "AAA", 80, "accumulate"), row("US_B", "BBB", 60, "trim")]);

  it("keeps saved weights bounded and scoped to tracked names", () => {
    const weights = sanitizeMixWeights(rows, { US_A: 90, US_B: 50, US_UNKNOWN: 100 });
    expect(weights.US_UNKNOWN).toBeUndefined();
    expect(mixTotal(weights)).toBeLessThanOrEqual(100);
    expect(weights.US_A).toBeGreaterThan(weights.US_B);

    const rounded = sanitizeMixWeights(rows, { US_A: 39, US_B: 81 });
    expect(rounded).toEqual({ US_A: 33, US_B: 67 });
  });

  it("creates a deterministic weekly research snapshot from current signals", () => {
    const snapshot = deriveResearchMix(rows, new Date("2026-08-14T12:00:00.000Z"));
    expect(snapshot.week_key).toBe(currentMixWeek(new Date("2026-08-14T12:00:00.000Z")));
    expect(mixTotal(snapshot.weights)).toBe(100);
    expect(snapshot.weights.US_A).toBeGreaterThan(snapshot.weights.US_B);
  });
});
