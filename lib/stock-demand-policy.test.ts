import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_STOCK_DEMAND_DAILY_LIMIT,
  SIGNED_IN_STOCK_DEMAND_DAILY_LIMIT,
  isLikelyHumanStockDemand,
  stockDemandDailyLimit,
} from "@/lib/stock-demand-policy";

describe("stock demand policy", () => {
  const browser = {
    origin: "https://www.stocksbrew.online",
    host: "www.stocksbrew.online",
    secFetchSite: "same-origin",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/127 Safari/537.36",
  };

  it("accepts a same-origin browser request", () => {
    expect(isLikelyHumanStockDemand(browser)).toBe(true);
  });

  it("rejects crawlers and cross-site triggers", () => {
    expect(isLikelyHumanStockDemand({ ...browser, userAgent: "Googlebot/2.1" })).toBe(false);
    expect(isLikelyHumanStockDemand({ ...browser, secFetchSite: "cross-site" })).toBe(false);
    expect(isLikelyHumanStockDemand({ ...browser, origin: "https://attacker.example" })).toBe(false);
  });

  it("gives signed-in users a larger but bounded daily allowance", () => {
    expect(stockDemandDailyLimit(false)).toBe(ANONYMOUS_STOCK_DEMAND_DAILY_LIMIT);
    expect(stockDemandDailyLimit(true)).toBe(SIGNED_IN_STOCK_DEMAND_DAILY_LIMIT);
    expect(stockDemandDailyLimit(true)).toBeGreaterThan(stockDemandDailyLimit(false));
  });
});
