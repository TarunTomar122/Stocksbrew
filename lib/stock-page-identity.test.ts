import { describe, expect, it } from "vitest";

import { presumedStockIdentity, samePresumedStock } from "@/lib/stock-page-identity";

describe("presumedStockIdentity", () => {
  it("builds the id getStockSummary reads first, in the reader's market", () => {
    expect(presumedStockIdentity("NVDA", "US")).toEqual({ market: "US", instrumentId: "US_NVDA", ticker: "NVDA" });
    expect(presumedStockIdentity("nvda", "US")).toEqual({ market: "US", instrumentId: "US_NVDA", ticker: "NVDA" });
    expect(presumedStockIdentity("RELIANCE", "IN")).toEqual({ market: "IN", instrumentId: "IN_RELIANCE", ticker: "RELIANCE" });
    expect(presumedStockIdentity("BRK.B", "US")?.instrumentId).toBe("US_BRK.B");
  });

  it("keys each ticker and market apart", () => {
    expect(presumedStockIdentity("AMD", "US")?.instrumentId).not.toBe(presumedStockIdentity("NVDA", "US")?.instrumentId);
    expect(presumedStockIdentity("NVDA", "IN")?.instrumentId).not.toBe(presumedStockIdentity("NVDA", "US")?.instrumentId);
  });

  it("starts nothing for an address that is not a plain ticker", () => {
    for (const symbol of ["", " NVDA", "NVDA ", "../x", "NV/DA", "%2E", "-NVDA", "A".repeat(17), "NVDA\u0000"]) {
      expect(presumedStockIdentity(symbol, "US")).toBeNull();
    }
  });
});

describe("samePresumedStock", () => {
  const presumed = { market: "US" as const, instrumentId: "US_NVDA", ticker: "NVDA" };

  it("reuses the early reads only for the exact stock", () => {
    expect(samePresumedStock(presumed, { market: "US", instrumentId: "US_NVDA", ticker: "NVDA" })).toBe(true);
  });

  it("starts again when the stock resolved in the other market or under another id or ticker", () => {
    expect(samePresumedStock(presumed, { market: "IN", instrumentId: "US_NVDA", ticker: "NVDA" })).toBe(false);
    expect(samePresumedStock(presumed, { market: "US", instrumentId: "US_NVDA2", ticker: "NVDA" })).toBe(false);
    expect(samePresumedStock(presumed, { market: "US", instrumentId: "US_NVDA", ticker: "NVDA2" })).toBe(false);
    expect(samePresumedStock(null, { market: "US", instrumentId: "US_NVDA", ticker: "NVDA" })).toBe(false);
  });
});
