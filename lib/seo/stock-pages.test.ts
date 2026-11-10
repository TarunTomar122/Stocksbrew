import { describe, expect, it } from "vitest";

import {
  FEATURED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  STOCK_PRICE_MAX_AGE_DAYS,
  STOCK_READ_MAX_AGE_DAYS,
  TOP_STOCK_TICKERS,
  getSeoStockPage,
  isFeaturedStockTicker,
  isFresh,
  stockHasCurrentRead,
  stockSeoDescription,
  stockSeoTitle,
} from "@/lib/seo/stock-pages";

describe("indexable US stock pages", () => {
  it("covers the broad US company catalogue without duplicate tickers", () => {
    // 501 when the index was curated, 544 after the research themes added names
    // (August and September 2026). The catalogue may grow; it must not shrink.
    expect(SEO_STOCK_PAGES.length).toBeGreaterThanOrEqual(544);
    expect(new Set(SEO_STOCK_PAGES.map((stock) => stock.ticker)).size).toBe(SEO_STOCK_PAGES.length);
    expect(new Set(SEO_STOCK_PAGES.map((stock) => stock.instrumentId)).size).toBe(SEO_STOCK_PAGES.length);
    expect(SEO_STOCK_PAGES.every((stock) => stock.name && stock.sector && stock.description)).toBe(true);
    expect(SEO_STOCK_PAGES.every((stock) => stock.instrumentId.startsWith("US_"))).toBe(true);
  });

  it("contains the high-intent featured companies with unique metadata", () => {
    expect(FEATURED_STOCK_TICKERS).toEqual([
      "NVDA",
      "MSFT",
      "AAPL",
      "AMZN",
      "GOOGL",
      "META",
      "TSLA",
      "AVGO",
      "AMD",
      "PLTR",
    ]);
    for (const ticker of FEATURED_STOCK_TICKERS) {
      const stock = getSeoStockPage(ticker);
      expect(stock, ticker).toBeDefined();
      expect(stockSeoDescription(stock!), ticker).toContain(stock!.name);
      expect(stockSeoDescription(stock!), ticker).toContain(ticker);
      expect(isFeaturedStockTicker(ticker)).toBe(true);
    }
    expect(isFeaturedStockTicker("JPM")).toBe(false);
  });

  it("ranks one hundred catalogue stocks, featured ten first", () => {
    expect(TOP_STOCK_TICKERS.length).toBe(100);
    expect(new Set(TOP_STOCK_TICKERS).size).toBe(100);
    for (const ticker of TOP_STOCK_TICKERS) expect(getSeoStockPage(ticker), ticker).not.toBeNull();
    expect(TOP_STOCK_TICKERS.slice(0, 10)).toEqual([...FEATURED_STOCK_TICKERS]);
    expect(stockSeoTitle({ name: "Apple Inc.", ticker: "AAPL" })).toBe("Apple Inc. (AAPL) Stock: Our Call, Valuation and Earnings");
  });

  it("indexes a stock page only with a current written read and a recent price", () => {
    const today = "2026-11-10";
    const row = { call: "Add", thesis: "Demand is ahead of supply.", call_at: "2026-11-09T21:40:00+00:00", price: 180.1, price_at: "2026-11-09T20:59:00+00:00" };
    expect(stockHasCurrentRead(row, today)).toBe(true);
    // No read: no call, or no thesis.
    expect(stockHasCurrentRead({ ...row, call: undefined }, today)).toBe(false);
    expect(stockHasCurrentRead({ ...row, thesis: "  " }, today)).toBe(false);
    // A read older than the limit, or a stale or missing price.
    expect(stockHasCurrentRead({ ...row, call_at: "2026-09-10T00:00:00Z" }, today)).toBe(false);
    expect(stockHasCurrentRead({ ...row, call_at: "2026-09-11T12:00:00Z" }, today)).toBe(true);
    expect(stockHasCurrentRead({ ...row, price_at: "2026-10-01T20:00:00Z" }, today)).toBe(false);
    expect(stockHasCurrentRead({ ...row, price: 0 }, today)).toBe(false);
    expect(stockHasCurrentRead({ ...row, price: Number.NaN }, today)).toBe(false);
    expect(stockHasCurrentRead(null, today)).toBe(false);
    expect(STOCK_PRICE_MAX_AGE_DAYS).toBeLessThan(STOCK_READ_MAX_AGE_DAYS);
  });

  it("reads freshness in whole days and refuses non-dates", () => {
    expect(isFresh("2026-11-10", "2026-11-10", 0)).toBe(true);
    expect(isFresh("2026-11-11T03:00:00Z", "2026-11-10", 5)).toBe(true);
    expect(isFresh("2026-11-13", "2026-11-10", 5)).toBe(false);
    expect(isFresh("2026-11-01", "2026-11-10", 9)).toBe(true);
    expect(isFresh("2026-10-31", "2026-11-10", 9)).toBe(false);
    expect(isFresh("yesterday", "2026-11-10", 9)).toBe(false);
    expect(isFresh(undefined, "2026-11-10", 9)).toBe(false);
  });

  it("does not treat an arbitrary ticker route as indexable", () => {
    expect(getSeoStockPage("NOTAREALTICKER")).toBeNull();
  });

  it("indexes supported long-tail companies but excludes macro symbols", () => {
    expect(getSeoStockPage("HDB")?.name).toContain("HDFC");
    expect(getSeoStockPage("ASO")?.name).toContain("Academy");
    expect(getSeoStockPage("SPX")).toBeNull();
  });
});
