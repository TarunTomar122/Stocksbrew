import { describe, expect, it } from "vitest";

import {
  getLivePremarketQuote,
  isPremarketLive,
  isUsPremarketWindow,
  millisecondsUntilUsMarketOpen,
  type PremarketSnapshotLike,
} from "@/lib/premarket-shared";

const snapshot: PremarketSnapshotLike = {
  market: "US",
  generated_at: "2026-07-31T12:30:00.000Z",
  date: "2026-07-31",
  market_state: "PRE",
  by_ticker: {
    NVDA: {
      pre_market_price: 181.25,
      pre_market_change_pct: 1.75,
      previous_close: 178.13,
    },
  },
};

describe("pre-market session guards", () => {
  it("recognizes the US pre-market window and stops at the opening bell", () => {
    expect(isUsPremarketWindow(new Date("2026-07-31T12:45:00.000Z"))).toBe(true);
    expect(isUsPremarketWindow(new Date("2026-07-31T13:30:00.000Z"))).toBe(false);
  });

  it("calculates the exact time remaining until 9:30 ET", () => {
    expect(
      millisecondsUntilUsMarketOpen(
        new Date("2026-07-31T13:29:45.000Z"),
      ),
    ).toBe(15_000);
  });

  it("rejects yesterday's snapshot and a snapshot after the market opens", () => {
    const premarketTime = new Date("2026-07-31T12:45:00.000Z");
    expect(
      isPremarketLive(
        { ...snapshot, date: "2026-07-30" },
        "US",
        premarketTime,
      ),
    ).toBe(false);
    expect(
      isPremarketLive(
        snapshot,
        "US",
        new Date("2026-07-31T13:30:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("getLivePremarketQuote", () => {
  const premarketTime = new Date("2026-07-31T12:45:00.000Z");

  it("returns today's quote with a case-insensitive ticker lookup", () => {
    expect(
      getLivePremarketQuote(snapshot, "nvda", "US", premarketTime),
    ).toEqual({
      price: 181.25,
      changePct: 1.75,
      generatedAt: snapshot.generated_at,
    });
  });

  it("returns null when the ticker was not part of the quoted candidate set", () => {
    expect(
      getLivePremarketQuote(snapshot, "AAPL", "US", premarketTime),
    ).toBeNull();
  });

  it("returns null for an invalid price", () => {
    const invalid = {
      ...snapshot,
      by_ticker: {
        NVDA: {
          pre_market_price: 0,
          pre_market_change_pct: 1.75,
        },
      },
    };
    expect(
      getLivePremarketQuote(invalid, "NVDA", "US", premarketTime),
    ).toBeNull();
  });
});
