import { describe, expect, it } from "vitest";

import { positionFromRow, uncoveredPosition, withMarketIndexFigures } from "@/lib/briefing-inputs";
import type { WatchlistRow } from "@/lib/watchlist-view";

describe("withMarketIndexFigures", () => {
  const snapshot = [
    { name: "S&P 500", price: 6800, change_pct: -0.37 },
    { name: "Nasdaq 100", price: 25000, change_pct: -0.5 },
  ];
  const assets = [
    { id: "sp500", price: 6801.2, change: { d1: -0.38 }, as_of: "2026-11-10T21:05:00Z" },
    { id: "nasdaq100", price: 0, change: { d1: -0.6 }, as_of: "2026-11-10T21:05:00Z" },
  ];

  it("uses the markets feed's figure, the one Market today shows", () => {
    const out = withMarketIndexFigures(snapshot, assets, "2026-11-10");
    // The figure carries the feed's own time, so the briefing never labels it with another source's.
    expect(out[0]).toEqual({ name: "S&P 500", price: 6801.2, change_pct: -0.38, as_of: "2026-11-10T21:05:00Z" });
    // No usable price: the snapshot's figure stays.
    expect(out[1]).toEqual(snapshot[1]);
  });

  it("keeps the snapshot's figure when the feed is from another day or has nothing", () => {
    expect(withMarketIndexFigures(snapshot, assets, "2026-11-11")).toEqual(snapshot);
    expect(withMarketIndexFigures(snapshot, [])).toEqual(snapshot);
  });
});

describe("uncoveredPosition", () => {
  it("keeps the price, the move and the call word, and drops every level", () => {
    const out = uncoveredPosition({
      instrument_id: "US_TSLA",
      ticker: "TSLA",
      name: "Tesla",
      relation: "holding",
      price: 210,
      day_change_pct: -5.1,
      price_as_of: null,
      stance: "accumulate",
      call_summary: "Demand is holding up. The add level is $182.40 (50-day average).",
      watch_out: "A miss on deliveries would change the call.",
      add_below: 182.4,
      breakout_above: 260,
      trim_above: 300,
      earnings_date: "2026-11-20",
      earnings_time: "amc",
      pre_earnings_headline: "Deliveries have to beat 480k",
    });
    expect(out).toMatchObject({
      price: 210,
      day_change_pct: -5.1,
      stance: "accumulate",
      earnings_date: "2026-11-20",
      call_summary: "Demand is holding up.",
      watch_out: null,
      add_below: null,
      breakout_above: null,
      trim_above: null,
      pre_earnings_headline: null,
      covered: false,
    });
  });
});

describe("positionFromRow price and move", () => {
  // Only what positionFromRow reads; the rest of a view row does not matter here.
  const row = { instrument_id: "US_AMD", ticker: "AMD", position_type: "holding", price: 240, day_change_pct: -3.2 } as unknown as WatchlistRow;

  it("takes the price and the move from one quote", () => {
    const out = positionFromRow(row, { quote: { price: 251.5, day_change_pct: 4.8, as_of: "2026-11-12T20:59:00Z" } });
    expect(out).toMatchObject({ price: 251.5, day_change_pct: 4.8, price_as_of: "2026-11-12T20:59:00Z" });
  });

  it("never pairs the quote's price with the row's move", () => {
    const out = positionFromRow(row, { quote: { price: 251.5, day_change_pct: null, as_of: "2026-11-12T20:59:00Z" } });
    expect(out).toMatchObject({ price: 251.5, day_change_pct: null });
  });

  it("falls back to the row's own pair when the quote has no price", () => {
    const out = positionFromRow(row, { quote: { price: null, day_change_pct: 4.8, as_of: "2026-11-12T20:59:00Z" } });
    expect(out).toMatchObject({ price: 240, day_change_pct: -3.2, price_as_of: null });
  });
});
