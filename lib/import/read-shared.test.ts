import { describe, expect, it } from "vitest";

import { buildPortfolioRead, firstSentence, type ReadFacts, type ReadStock } from "./read-shared";

const stock = (ticker: string, patch: Partial<ReadStock> = {}): ReadStock => ({
  instrument_id: `US_${ticker}`,
  ticker,
  name: ticker,
  sector: "Technology",
  price: 100,
  day_pct: 0,
  price_at: null,
  call: "Hold",
  call_at: "2026-11-09",
  reason: null,
  earnings_date: null,
  earnings_time: null,
  ...patch,
});

const facts = (stocks: ReadStock[], patch: Partial<ReadFacts> = {}): ReadFacts => ({
  stocks,
  today: "2026-11-10",
  as_of: "2026-11-10T20:00:00Z",
  ...patch,
});

describe("helpers", () => {
  it("keeps the first whole sentence and never cuts one", () => {
    expect(firstSentence("Growth is real. Margins must hold.")).toBe("Growth is real.");
    expect(firstSentence("A price of $178.60 holds")).toBe("A price of $178.60 holds");
    expect(firstSentence("  ")).toBeNull();
  });
});

describe("buildPortfolioRead", () => {
  it("weights by value only when every stock has shares", () => {
    const stocks = [stock("NVDA", { price: 100 }), stock("JPM", { price: 100, sector: "Financials" })];
    expect(buildPortfolioRead(facts(stocks), { US_NVDA: 9, US_JPM: 1 }).weighting).toBe("value");
    expect(buildPortfolioRead(facts(stocks), { US_NVDA: 9, US_JPM: 1 }).sectors[0]).toMatchObject({ sector: "Technology", pct: 90 });
    const partial = buildPortfolioRead(facts(stocks), { US_NVDA: 9 });
    expect(partial.weighting).toBe("count");
    expect(partial.sectors.map((s) => s.pct)).toEqual([50, 50]);
  });

  it("lists earnings in the next 30 days, soonest first", () => {
    const stocks = [
      stock("NVDA", { earnings_date: "2026-11-17", earnings_time: "amc" }),
      stock("WMT", { earnings_date: "2026-11-12", sector: "Consumer Staples" }),
      stock("KO", { earnings_date: "2027-02-10", sector: "Consumer Staples" }),
    ];
    const result = buildPortfolioRead(facts(stocks));
    expect(result.upcoming.map((u) => [u.ticker, u.days])).toEqual([
      ["WMT", 2],
      ["NVDA", 7],
    ]);
  });

  it("never carries price zones", () => {
    const result = buildPortfolioRead(facts([stock("NVDA", { call: "Add" })]));
    expect(JSON.stringify(result)).not.toMatch(/add_below|trim_above|zone/i);
  });
});
