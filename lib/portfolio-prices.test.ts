import { describe, expect, it } from "vitest";

import { datedPrice, onOneDay, pricesWords } from "./portfolio-prices";

describe("datedPrice", () => {
  it("prefers the screener snapshot, the price the stock page and screener show", () => {
    const price = datedPrice({
      snapshot: { price: 168.79, day_pct: -5.53, price_at: "2026-11-10T20:59:00+00:00" },
      market: { price: 170, change: { d1: -4 }, as_of: "2026-11-10T21:00:00+00:00" },
      quote: { captured_at: "2026-11-10T20:59:00+00:00", quote: { current: 168.79, day_change_pct: -5.53 } },
    });
    expect(price).toEqual({ price: 168.79, dayPct: -5.53, at: "2026-11-10T20:59:00+00:00", source: "snapshot" });
  });

  it("falls back to the markets page for a fund the snapshot does not carry, then to the latest quote", () => {
    expect(datedPrice({ snapshot: null, market: { price: 689.5, change: { d1: -0.34 }, as_of: "2026-11-10T21:00:00+00:00" } })?.source).toBe("market");
    expect(datedPrice({ quote: { captured_at: "2026-11-10T20:59:00+00:00", quote: { current: 533.42, day_change_pct: -2.16 } } })).toEqual({
      price: 533.42,
      dayPct: -2.16,
      at: "2026-11-10T20:59:00+00:00",
      source: "quote",
    });
  });

  it("takes the newest session when a snapshot is a day behind the latest quote", () => {
    const price = datedPrice({
      snapshot: { price: 178.67, day_pct: 1, price_at: "2026-11-09T20:59:00+00:00" },
      quote: { captured_at: "2026-11-10T20:59:00+00:00", quote: { current: 168.79, day_change_pct: -5.53 } },
    });
    expect(price).toMatchObject({ price: 168.79, source: "quote" });
  });

  it("skips a source without a time or a positive price, and gives nothing rather than a guess", () => {
    expect(datedPrice({ snapshot: { price: 100, day_pct: 1 } })).toBeNull();
    expect(datedPrice({ snapshot: { price: 0, price_at: "2026-11-10T20:59:00+00:00" } })).toBeNull();
    expect(datedPrice({})).toBeNull();
    expect(datedPrice({ snapshot: { price: 100, price_at: "2026-11-10T20:59:00+00:00" } })?.dayPct).toBeNull();
  });
});

describe("onOneDay", () => {
  it("takes the day most prices are from and drops the day's move of any from another session", () => {
    const { day, prices } = onOneDay(
      new Map([
        ["NVDA", { price: 168.79, dayPct: -5.53, at: "2026-11-10T20:59:00+00:00", source: "snapshot" as const }],
        ["MSFT", { price: 533.42, dayPct: -2.16, at: "2026-11-10T20:59:00+00:00", source: "snapshot" as const }],
        ["VOO", { price: 694.33, dayPct: 2.7, at: "2026-11-09T21:00:00+00:00", source: "market" as const }],
      ]),
    );
    expect(day).toBe("2026-11-10");
    expect(prices.get("NVDA")?.dayPct).toBe(-5.53);
    expect(prices.get("VOO")).toMatchObject({ price: 694.33, dayPct: null });
  });

  it("has no day for an empty set", () => {
    expect(onOneDay(new Map()).day).toBeNull();
  });
});

describe("pricesWords", () => {
  it("says the close for a finished session and 'during trading' while today's is open", () => {
    // 3 PM New York on Nov 11.
    const midSession = Date.parse("2026-11-11T20:00:00Z");
    expect(pricesWords("2026-11-10", midSession)).toBe("yesterday's close");
    expect(pricesWords("2026-11-11", midSession)).toBe("today, while the market is open");
    // Before the open that day's close has not happened; at weekends there is no session running.
    expect(pricesWords("2026-11-11", Date.parse("2026-11-11T12:00:00Z"))).toBe("today, before the open");
    expect(pricesWords("2026-11-14", Date.parse("2026-11-14T17:00:00Z"))).toBe("today's close");
    expect(pricesWords("2026-11-11", Date.parse("2026-11-11T22:00:00Z"))).toBe("today's close");
    expect(pricesWords(null)).toBeNull();
  });

  it("names the close by its weekday within the week and by its date before", () => {
    // Monday Nov 16, 8 AM New York: Friday's close.
    expect(pricesWords("2026-11-13", Date.parse("2026-11-16T13:00:00Z"))).toBe("Friday's close");
    expect(pricesWords("2026-11-03", Date.parse("2026-11-16T13:00:00Z"))).toBe("the Nov 3 close");
    expect(pricesWords("not a day", Date.parse("2026-11-16T13:00:00Z"))).toBeNull();
  });
});
