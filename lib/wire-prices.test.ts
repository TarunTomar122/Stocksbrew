import { describe, expect, it } from "vitest";

import { livePriceOf, withLivePrices } from "@/lib/wire-prices";

// Thu Nov 12 2026, 1:28 PM in New York.
const NOW = Date.parse("2026-11-12T18:28:00Z");

describe("withLivePrices", () => {
  const rows = [
    { ticker: "NVDA", pct: 1.2 },
    { ticker: "AMD", pct: 5.2 },
    { ticker: "MP", pct: 0.7 },
    { ticker: "OLD", pct: 0.1 },
    { ticker: "UNDATED", pct: 2.0 },
    { ticker: "SPCX", pct: 2.3 },
  ];
  const live = new Map([
    ["NVDA", { price: 164.64, pct: -5.2, at: "2026-11-12T18:00:41.123456+00:00" }],
    ["AMD", { price: 578.47, pct: null, at: "2026-11-12T17:00:00Z" }],
    ["MP", { price: 36.72, pct: 0.71, at: "2026-11-11T20:59:00Z" }],
    ["OLD", { price: 12.5, pct: -1, at: "2026-10-20T20:00:00Z" }],
    ["UNDATED", { price: 9.99, pct: 3, at: null }],
  ]);
  const out = Object.fromEntries(withLivePrices(rows, live, NOW).map((row) => [row.ticker, row]));

  it("shows today's quote with its own move, never the snapshot's", () => {
    expect(out.NVDA).toMatchObject({ price: 164.64, pct: -5.2, priceDay: null });
    // Today's quote with no move: the price alone, not the snapshot's +5.2%.
    expect(out.AMD).toMatchObject({ price: 578.47, pct: null, priceDay: null });
  });

  it("shows an earlier day's price with that session's own move and its day, or no price without a move", () => {
    expect(out.MP).toMatchObject({ price: 36.72, pct: 0.71, priceDay: "yesterday" });
    expect(out.OLD).toMatchObject({ price: 12.5, pct: -1, priceDay: "Oct 20" });
    const [bare] = withLivePrices([{ ticker: "TTEK", pct: 0.3 }], new Map([["TTEK", { price: 37.53, pct: null, at: "2026-11-11T20:59:00Z" }]]), NOW);
    expect(bare).toMatchObject({ price: null, pct: 0.3, priceDay: null });
  });

  it("shows no price without a quote or a readable time, keeping the row's move", () => {
    expect(out.UNDATED).toMatchObject({ price: null, pct: 2.0, priceDay: null });
    expect(out.SPCX).toMatchObject({ price: null, pct: 2.3, priceDay: null });
  });
});

describe("withLivePrices with a quote timed ahead of now", () => {
  it("treats a quote more than five minutes in the future as no quote, and allows a little clock drift", () => {
    const live = new Map([
      ["AHEAD", { price: 50, pct: 2, at: "2026-11-12T18:34:00Z" }],
      ["DRIFT", { price: 60, pct: 1, at: "2026-11-12T18:31:00Z" }],
    ]);
    const [ahead, drift] = withLivePrices(
      [
        { ticker: "AHEAD", pct: 0.4 },
        { ticker: "DRIFT", pct: 0.4 },
      ],
      live,
      NOW,
    );
    expect(ahead).toMatchObject({ price: null, pct: 0.4, priceDay: null });
    expect(drift).toMatchObject({ price: 60, pct: 1, priceDay: null });
  });
});

describe("livePriceOf", () => {
  it("keeps only a real price, timed like the stock page", () => {
    expect(livePriceOf({ quote: { current: 36.72, day_change_pct: 0.71 }, captured_at: "2026-11-11T20:59:00Z", updated_at: "2026-11-12T01:00:00Z" })).toEqual({
      price: 36.72,
      pct: 0.71,
      at: "2026-11-11T20:59:00Z",
    });
    expect(livePriceOf({ quote: { current: 36.72 }, updated_at: "2026-11-12T01:00:00Z" })).toEqual({ price: 36.72, pct: null, at: "2026-11-12T01:00:00Z" });
    expect(livePriceOf({ quote: { current: 36.72 } })).toEqual({ price: 36.72, pct: null, at: null });
    expect(livePriceOf({ quote: { current: 0 } })).toBeNull();
    expect(livePriceOf({ quote: { current: Number.NaN } })).toBeNull();
    expect(livePriceOf(null)).toBeNull();
  });
});
