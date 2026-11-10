import { describe, expect, it } from "vitest";

import {
  FEATURED_STOCK_TICKERS,
  INDEXED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  getSeoStockPage,
  isFeaturedStockTicker,
  isIndexedStockTicker,
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

  it("indexes a tier of one hundred catalogue stocks that includes the featured ten", () => {
    expect(INDEXED_STOCK_TICKERS.length).toBe(100);
    expect(new Set(INDEXED_STOCK_TICKERS).size).toBe(100);
    for (const ticker of INDEXED_STOCK_TICKERS) {
      expect(getSeoStockPage(ticker), ticker).not.toBeNull();
      expect(isIndexedStockTicker(ticker)).toBe(true);
    }
    for (const ticker of FEATURED_STOCK_TICKERS) expect(isIndexedStockTicker(ticker), ticker).toBe(true);
    expect(isIndexedStockTicker("NOTAREALTICKER")).toBe(false);
    expect(stockSeoTitle({ name: "Apple Inc.", ticker: "AAPL" })).toBe("Apple Inc. (AAPL) Stock: Our Call, Valuation and Earnings");
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
