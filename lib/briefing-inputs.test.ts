import { describe, expect, it } from "vitest";

import { withMarketIndexFigures } from "@/lib/briefing-inputs";

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
