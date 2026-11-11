import { describe, expect, it } from "vitest";

import { uncoveredPosition, withMarketIndexFigures } from "@/lib/briefing-inputs";

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
    expect(out[0]).toEqual({ name: "S&P 500", price: 6801.2, change_pct: -0.38 });
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
