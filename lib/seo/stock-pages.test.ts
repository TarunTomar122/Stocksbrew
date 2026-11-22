import { describe, expect, it } from "vitest";

import {
  FEATURED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  STOCK_DESCRIPTION_MAX,
  STOCK_PRICE_MAX_AGE_DAYS,
  TOP_STOCK_TICKERS,
  getSeoStockPage,
  isFeaturedStockTicker,
  isFresh,
  shortStockName,
  stockHasCall,
  stockIsIndexable,
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
      expect(stockSeoDescription(stock!), ticker).toContain(shortStockName(stock!));
      expect(stockSeoDescription(stock!), ticker).toContain(ticker);
      expect(stockSeoDescription(stock!).length, ticker).toBeLessThanOrEqual(STOCK_DESCRIPTION_MAX);
      expect(isFeaturedStockTicker(ticker)).toBe(true);
    }
    expect(isFeaturedStockTicker("JPM")).toBe(false);
  });

  it("ranks one hundred catalogue stocks, featured ten first", () => {
    expect(TOP_STOCK_TICKERS.length).toBe(100);
    expect(new Set(TOP_STOCK_TICKERS).size).toBe(100);
    for (const ticker of TOP_STOCK_TICKERS) expect(getSeoStockPage(ticker), ticker).not.toBeNull();
    expect(TOP_STOCK_TICKERS.slice(0, 10)).toEqual([...FEATURED_STOCK_TICKERS]);
    expect(stockSeoTitle({ name: "Apple Inc.", ticker: "AAPL" })).toBe("Apple (AAPL) Stock Price, Forecast and Our Call");
  });

  it("indexes a stock page whenever it has a real price from the last month, whatever the call's age", () => {
    const today = "2026-11-10";
    const row = { call: "Add", thesis: "Demand is ahead of supply.", call_at: "2026-11-09T21:40:00+00:00", price: 180.1, price_at: "2026-11-09T20:59:00+00:00" };
    expect(stockIsIndexable(row, today)).toBe(true);
    // The call does not decide indexing any more: no call, no thesis or an old call still index.
    expect(stockIsIndexable({ ...row, call: undefined }, today)).toBe(true);
    expect(stockIsIndexable({ ...row, thesis: "  " }, today)).toBe(true);
    expect(stockIsIndexable({ ...row, call_at: "2026-06-01T00:00:00Z" }, today)).toBe(true);
    // A price outage of a week or two does not flip the page.
    expect(stockIsIndexable({ ...row, price_at: "2026-10-27T20:00:00Z" }, today)).toBe(true);
    expect(stockIsIndexable({ ...row, price_at: "2026-10-11T20:00:00Z" }, today)).toBe(true);
    // A price over a month old, or a missing or broken price, does.
    expect(stockIsIndexable({ ...row, price_at: "2026-10-09T20:00:00Z" }, today)).toBe(false);
    expect(stockIsIndexable({ ...row, price_at: null }, today)).toBe(false);
    expect(stockIsIndexable({ ...row, price: 0 }, today)).toBe(false);
    expect(stockIsIndexable({ ...row, price: Number.NaN }, today)).toBe(false);
    expect(stockIsIndexable(null, today)).toBe(false);
    expect(STOCK_PRICE_MAX_AGE_DAYS).toBe(30);
  });

  it("knows a call only with its thesis", () => {
    expect(stockHasCall({ call: "Add", thesis: "Demand is ahead of supply." })).toBe(true);
    expect(stockHasCall({ call: "Add", thesis: " " })).toBe(false);
    expect(stockHasCall({ call: null, thesis: "x" })).toBe(false);
    expect(stockHasCall(null)).toBe(false);
  });

  it("shortens company names without breaking them", () => {
    expect(shortStockName({ name: "NVIDIA Corporation", ticker: "NVDA" })).toBe("NVIDIA");
    expect(shortStockName({ name: "Coca-Cola Company", ticker: "KO" })).toBe("Coca-Cola");
    expect(shortStockName({ name: "The Coca-Cola Company", ticker: "KO" })).toBe("Coca-Cola");
    expect(shortStockName({ name: "Alphabet Inc.", ticker: "GOOGL" })).toBe("Alphabet");
    expect(shortStockName({ name: "JPMorgan Chase & Co.", ticker: "JPM" })).toBe("JPMorgan Chase");
    expect(shortStockName({ name: "Berkshire Hathaway Inc.", ticker: "BRK.B" })).toBe("Berkshire Hathaway");
    expect(shortStockName({ name: "ZETA", ticker: "ZETA" })).toBe("ZETA");
    expect(stockSeoTitle({ name: "ZETA", ticker: "ZETA" })).toBe("ZETA Stock Price, Forecast and Our Call");
  });

  it("writes each stock its own snippet from today's row, every part whole and within the limit", () => {
    const today = "2026-11-22";
    const nvda = { name: "NVIDIA Corporation", ticker: "NVDA" };
    const row = {
      price: 125.79,
      price_at: "2026-11-21T20:59:00Z",
      call: "Add",
      call_at: "2026-11-20T21:18:00Z",
      thesis: "NVIDIA’s growth is proven; demand quality and leadership now decide the next leg.",
      target: 232.59,
      upside: 84.9,
      earnings_date: "2027-02-25",
    };
    const text = stockSeoDescription(nvda, row, today);
    expect(text).toBe(
      "NVIDIA (NVDA) stock at $125.79. Our call: Buy more. NVIDIA’s growth is proven; demand quality and leadership now decide the next leg. Earnings Feb 25.",
    );
    expect(text.length).toBeLessThanOrEqual(STOCK_DESCRIPTION_MAX);
    // A short thesis leaves room for the analysts' target and the next report.
    expect(stockSeoDescription(nvda, { ...row, thesis: "Demand still beats supply." }, today)).toBe(
      "NVIDIA (NVDA) stock at $125.79. Our call: Buy more. Demand still beats supply. Analysts' average target $232.59 (+85%). Earnings Feb 25.",
    );
    // A thesis that names a price level is left out (levels are not public on every stock).
    expect(stockSeoDescription(nvda, { ...row, thesis: "We'd buy below $110 and trim above $150." }, today)).not.toContain("$110");
    // A price more than five days old is not quoted.
    expect(stockSeoDescription(nvda, { ...row, thesis: "Short.", price_at: "2026-11-10T20:00:00Z" }, today)).toMatch(
      /^NVIDIA \(NVDA\) stock price and forecast\. Our call: Buy more\./,
    );
    // A call older than the snippet limit is not quoted.
    expect(stockSeoDescription(nvda, { ...row, call_at: "2026-08-01T00:00:00Z" }, today)).not.toContain("Our call");
    // Thesis sentences that hold a price level, or say nothing, are left out.
    for (const thesis of [
      "Worth adding near 178.60 on weakness.",
      "Support at 172.50 holds the story.",
      "Buy more under 175.",
      "Analyst target 240 looks stretched.",
      "NVDA coverage is quiet.",
    ]) {
      expect(stockSeoDescription(nvda, { ...row, thesis }, today), thesis).not.toContain(thesis.slice(0, 12));
    }
    // A percentage is not a level.
    expect(stockSeoDescription(nvda, { ...row, thesis: "Sales grew 93% in a year." }, today)).toContain("Sales grew 93% in a year.");
    // A past report date is not shown.
    expect(stockSeoDescription(nvda, { ...row, thesis: "Short.", earnings_date: "2026-11-01" }, today)).not.toContain("Earnings");
    // No call: the price, the target and what the page holds.
    expect(stockSeoDescription(nvda, { price: 10, target: 12, upside: 20 }, today)).toBe(
      "NVIDIA (NVDA) stock at $10.00. Analysts' average target $12.00 (+20%). Forecast, financials and news.",
    );
    // No row: what the page holds.
    expect(stockSeoDescription(nvda, null, today)).toContain("NVIDIA (NVDA) stock price, forecast and our buy or sell call");
    // Every catalogue stock stays within the limit, with the longest thesis we would write.
    const longThesis = "A".repeat(80) + " grows. " + "B".repeat(200) + ".";
    for (const stock of SEO_STOCK_PAGES) {
      expect(stockSeoDescription(stock, { ...row, thesis: longThesis }, today).length, stock.ticker).toBeLessThanOrEqual(STOCK_DESCRIPTION_MAX);
      expect(stockSeoDescription(stock).length, stock.ticker).toBeLessThanOrEqual(STOCK_DESCRIPTION_MAX + 40);
    }
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
