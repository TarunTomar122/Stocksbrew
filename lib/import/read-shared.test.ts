import { describe, expect, it } from "vitest";

import { buildPortfolioRead, firstSentence, listTickers, type ReadFacts, type ReadStock } from "./read-shared";

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
  market_pct: -0.6,
  sp_weights: { Technology: 30, Financials: 13, Energy: 3 },
  today: "2026-11-10",
  as_of: "2026-11-10T20:00:00Z",
  ...patch,
});

describe("helpers", () => {
  it("lists tickers in plain English", () => {
    expect(listTickers(["A"])).toBe("A");
    expect(listTickers(["A", "B"])).toBe("A and B");
    expect(listTickers(["A", "B", "C"])).toBe("A, B and C");
    expect(listTickers(["A", "B", "C", "D"])).toBe("A, B and 2 more");
  });

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

  it("leads with the trims and compares concentration with the S&P 500", () => {
    const stocks = [stock("NVDA", { call: "Trim", day_pct: -6 }), stock("AAPL", { call: "Add" }), stock("MSFT"), stock("JPM", { sector: "Financials" })];
    const result = buildPortfolioRead(facts(stocks));
    expect(result.read.headline).toBe("Heavy on Technology, and we would sell some NVDA.");
    const [calls, concentration, today] = result.read.insights;
    expect(calls).toMatchObject({ id: "calls", tone: "flat", text: "Of the 4 stocks we have a call on, we would buy more of 1, keep 2 and sell some of 1.", tickers: ["NVDA"] });
    expect(concentration!.text).toBe("75% of this portfolio is in Technology.");
    expect(concentration!.soWhat).toContain("2.5 times its 30% weight in the S&P 500");
    expect(today).toMatchObject({ id: "today", tone: "down", text: "Together these are down 1.5% today, against −0.6% for the S&P 500.", soWhat: "NVDA moved the most, −6.0%." });
  });

  it("lists earnings in the next 30 days, soonest first, and flags this week", () => {
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

  it("says plainly when we have no call on anything", () => {
    const result = buildPortfolioRead(facts([stock("ZZZ", { call: null })]));
    expect(result.read.headline).toBe("We do not have a call on these stocks yet.");
    expect(result.calls.none).toEqual(["ZZZ"]);
  });

  it("never carries price zones", () => {
    const result = buildPortfolioRead(facts([stock("NVDA", { call: "Add" })]));
    expect(JSON.stringify(result)).not.toMatch(/add_below|trim_above|zone/i);
  });
});
