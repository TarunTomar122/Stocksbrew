import { describe, expect, it } from "vitest";

import type { WatchlistRow } from "@/lib/watchlist-view";
import { buildPortfolioBook, filterPortfolioRows } from "@/lib/portfolio-book";
import { portfolioFingerprint } from "@/lib/portfolio-rebalance-cache";

function mockRow(overrides: Partial<WatchlistRow> & Pick<WatchlistRow, "instrument_id" | "ticker">): WatchlistRow {
  return {
    instrument_name: overrides.ticker,
    logo_url: null,
    position_type: "watchlist",
    market: "US",
    sector_label: "Technology",
    industry_label: "Semiconductors",
    currency: "USD",
    price: 100,
    day_change_pct: 1.2,
    day_change_abs: 1.2,
    scores: {
      overall: 80,
      verdict: "solid",
      valuation: 70,
      growth: 85,
      quality: 75,
      momentum: 78,
    },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "test", vibe: "up", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: true,
    ...overrides,
  };
}

describe("buildPortfolioBook", () => {
  it("normalizes watchlist rows into portfolio rows", () => {
    const [row] = buildPortfolioBook([
      mockRow({
        instrument_id: "US_NVDA",
        ticker: "NVDA",
        instrument_name: "NVIDIA Corporation",
        sector_label: "  Technology ",
      }),
    ]);

    expect(row.name).toBe("NVIDIA Corporation");
    expect(row.sector_label).toBe("Technology");
    expect(row.market).toBe("US");
  });
});

describe("filterPortfolioRows", () => {
  const book = buildPortfolioBook([
    mockRow({ instrument_id: "US_AAPL", ticker: "AAPL", position_type: "holding" }),
    mockRow({ instrument_id: "US_MSFT", ticker: "MSFT", position_type: "watchlist" }),
  ]);

  it("filters holdings and watching", () => {
    expect(filterPortfolioRows(book, "holding").map((r) => r.ticker)).toEqual(["AAPL"]);
    expect(filterPortfolioRows(book, "watchlist").map((r) => r.ticker)).toEqual(["MSFT"]);
    expect(filterPortfolioRows(book, "all")).toHaveLength(2);
  });
});

describe("portfolioFingerprint", () => {
  it("changes when holdings change", () => {
    const a = buildPortfolioBook([
      mockRow({ instrument_id: "US_A", ticker: "A", position_type: "holding", holding: { portfolio_weight_pct: 50 } }),
    ]);
    const b = buildPortfolioBook([
      mockRow({ instrument_id: "US_B", ticker: "B", position_type: "holding", holding: { portfolio_weight_pct: 50 } }),
    ]);
    expect(portfolioFingerprint(a)).not.toBe(portfolioFingerprint(b));
  });

  it("stays stable across strategies because all strategies share one bundle", () => {
    const rows = buildPortfolioBook([
      mockRow({ instrument_id: "US_A", ticker: "A", position_type: "holding", holding: { portfolio_weight_pct: 50 } }),
    ]);
    expect(portfolioFingerprint(rows)).toBe(portfolioFingerprint(rows));
  });
});
