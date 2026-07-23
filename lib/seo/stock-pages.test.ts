import { describe, expect, it } from "vitest";

import {
  FEATURED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  getSeoStockPage,
  stockSeoDescription,
} from "@/lib/seo/stock-pages";

describe("indexable US stock pages", () => {
  it("contains exactly the curated core 100 without duplicate tickers", () => {
    expect(SEO_STOCK_PAGES).toHaveLength(100);
    expect(new Set(SEO_STOCK_PAGES.map((stock) => stock.ticker)).size).toBe(100);
  });

  it("contains the high-intent featured companies with unique metadata", () => {
    for (const ticker of FEATURED_STOCK_TICKERS) {
      const stock = getSeoStockPage(ticker);
      expect(stock, ticker).toBeDefined();
      expect(stockSeoDescription(stock!), ticker).toContain(stock!.name);
      expect(stockSeoDescription(stock!), ticker).toContain(ticker);
    }
  });

  it("does not treat an arbitrary ticker route as indexable", () => {
    expect(getSeoStockPage("NOTAREALTICKER")).toBeNull();
  });
});
