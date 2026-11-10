import { describe, expect, it } from "vitest";

import { buildPortfolioReads, type PortfolioInsightInput } from "./portfolio-insights";
import { buildPortfolio, type PortfolioRowInput } from "./portfolio-shared";

const TODAY = "2026-11-10";

function row(ticker: string, kind: "holding" | "watchlist", dayPct: number | null, extra: Partial<PortfolioRowInput> = {}): PortfolioRowInput {
  return { instrument_id: `US_${ticker}`, ticker, name: ticker, sector: "Technology", kind, price: 100, day_change_pct: dayPct, stance: null, ...extra };
}

function input(rows: PortfolioRowInput[], extra: Partial<PortfolioInsightInput> = {}, holdings: Record<string, { quantity?: number; average_cost?: number }> = {}): PortfolioInsightInput {
  return {
    portfolio: buildPortfolio({ rows, holdings, today: TODAY }),
    today: TODAY,
    quoteDay: TODAY,
    marketPct: 0.6,
    sectorOf: {},
    spSectorWeights: { Technology: 33, Financials: 13, "Health Care": 10, Energy: 4 },
    sectorMoves: {},
    zones: {},
    callChanges: [],
    ...extra,
  };
}

describe("buildPortfolioReads", () => {
  it("is all null for an empty portfolio", () => {
    const reads = buildPortfolioReads(input([]));
    expect(reads.positions).toBeNull();
    expect(reads.watching).toBeNull();
    expect(reads.analytics).toBeNull();
    expect(reads.alerts).toBeNull();
  });

  it("leads Positions with the day against the S&P 500 and who did it", () => {
    const reads = buildPortfolioReads(
      input([row("ASTS", "holding", 8), row("CBRS", "holding", 4), row("NVDA", "holding", -1), row("MSFT", "holding", 0.2)]),
    );
    expect(reads.positions?.headline).toBe("Your 4 holdings rose 2.8% on average today, against +0.6% for the S&P 500.");
    const contributors = reads.positions?.insights.find((item) => item.id === "contributors");
    expect(contributors?.text).toBe("ASTS (+8.0%) and CBRS (+4.0%) led the move; the rest of your stocks held it back.");
    expect(contributors?.soWhat).toBe("NVDA pulled the other way, −1.0%.");
  });

  it("uses value weights when shares are entered", () => {
    const reads = buildPortfolioReads(
      input([row("AAA", "holding", 10), row("BBB", "holding", 0)], {}, { US_AAA: { quantity: 1 }, US_BBB: { quantity: 9 } }),
    );
    // 10% of the book moved 10%: a little under +1% on yesterday's value.
    expect(reads.positions?.headline).toMatch(/^Your holdings rose 0\.9% today/);
    expect(reads.positions?.source).toBeUndefined();
  });

  it("credits two leaders with their share when the rest roughly nets out", () => {
    const reads = buildPortfolioReads(input([row("ASTS", "holding", 8), row("CBRS", "holding", 2), row("NVDA", "holding", 1), row("MSFT", "holding", 1)]));
    expect(reads.positions?.insights[0]?.text).toBe("ASTS (+8.0%) and CBRS (+2.0%) did 83% of that move.");
  });

  it("works with a single holding", () => {
    const reads = buildPortfolioReads(input([row("NVDA", "holding", -4.3, { earnings_date: "2026-11-17" })]));
    expect(reads.positions?.headline).toContain("Your 1 holding fell 4.3%");
    const earnings = reads.positions?.insights.find((item) => item.id === "earnings");
    expect(earnings?.text).toContain("NVDA reports Nov 17");
    expect(earnings?.text).toContain("1 of your 1 holdings");
  });

  it("names holdings inside the add zone, only from the zones it is given", () => {
    const rows = [row("AVGO", "holding", 1, { price: 90 }), row("CEG", "holding", 1, { price: 80 }), row("TSLA", "holding", 1, { price: 80 })];
    const reads = buildPortfolioReads(
      input(rows, { zones: { US_AVGO: { addBelow: 95, trimAbove: 130 }, US_CEG: { addBelow: 85, trimAbove: null } } }),
    );
    const zones = reads.positions?.insights.find((item) => item.id === "zones");
    expect(zones?.text).toBe("2 holdings are inside the add zone: AVGO and CEG.");
    // An uncovered stock (no zone passed) is never mentioned with a level.
    expect(JSON.stringify(reads)).not.toContain("TSLA is");
  });

  it("keeps the zone count and the names in agreement past four names", () => {
    const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE"];
    const rows = tickers.map((ticker) => row(ticker, "holding", -1, { price: 90 }));
    const zones = Object.fromEntries(tickers.map((ticker) => [`US_${ticker}`, { addBelow: 95, trimAbove: 130 }]));
    const zone = buildPortfolioReads(input(rows, { zones })).positions?.insights.find((item) => item.id === "zones");
    expect(zone?.text).toBe("5 holdings are inside the add zone: AAA, BBB, CCC, DDD and 1 more.");
    expect(zone?.tickers).toEqual(["AAA", "BBB", "CCC", "DDD"]);
  });

  it("says 'at its add level' instead of 0.0% above", () => {
    const reads = buildPortfolioReads(input([row("NVDA", "holding", 0.01, { price: 100.2 })], { zones: { US_NVDA: { addBelow: 100, trimAbove: 150 } } }));
    expect(JSON.stringify(reads.positions)).toContain("NVDA sits right at its add level ($100).");
  });

  it("compares the biggest sector with the S&P 500", () => {
    const rows = [row("A", "holding", 1), row("B", "holding", 1), row("C", "holding", 1), row("D", "holding", 1, { sector: "Energy" })];
    const reads = buildPortfolioReads(input(rows));
    expect(reads.analytics?.headline).toBe("75% of your money is in Technology, against 33% of the S&P 500.");
    expect(reads.analytics?.insights.find((item) => item.id === "missing")?.text).toBe(
      "You own nothing in Financials and Health Care, 23% of the S&P 500 between them.",
    );
  });

  it("reads Watching: zones first, then the widest gap against the sector", () => {
    const rows = [
      row("NVDA", "holding", 1),
      row("AMD", "watchlist", 6, { price: 120 }),
      row("SMCI", "watchlist", -3),
      row("PLTR", "watchlist", 1, { price: 100 }),
    ];
    const reads = buildPortfolioReads(input(rows, { sectorMoves: { Technology: 1 }, zones: { US_PLTR: { addBelow: 97, trimAbove: 140 } } }));
    expect(reads.watching?.headline).toContain("PLTR is 3.1% above its add level ($97), the closest of your watched names.");
    const movers = reads.watching?.insights.find((item) => item.id === "movers");
    expect(movers?.text).toBe("AMD rose 6.0% today while Technology rose 1.0%, the widest gap among your watched names.");
    expect(movers?.soWhat).toBe("SMCI went the other way: −3.0% against +1.0% for Technology.");
  });

  it("reports recent call changes on holdings", () => {
    const reads = buildPortfolioReads(
      input([row("NVDA", "holding", 0), row("AVGO", "holding", 0)], { callChanges: [{ ticker: "NVDA", from: "Add", to: "Hold", date: "2026-11-09" }] }),
    );
    expect(JSON.stringify(reads.positions)).toContain("We changed our call on 1 holding this week: NVDA to Hold (was Add).");
  });

  it("finds the nearest price alert", () => {
    const reads = buildPortfolioReads(
      input([row("NVDA", "holding", 0), row("TSM", "holding", 0)], {
        alerts: [
          { ticker: "NVDA", instrument_id: "US_NVDA", condition: "below", target_price: 90, kind: "price_threshold" },
          { ticker: "TSM", instrument_id: "US_TSM", condition: "above", target_price: 104, kind: "price_threshold" },
        ],
      }),
    );
    expect(reads.alerts?.headline).toBe("Your nearest alert: TSM above $104, 4.0% away.");
  });

  it("skips the alerts read for the example", () => {
    const reads = buildPortfolioReads(input([row("NVDA", "holding", 1)], { example: true }));
    expect(reads.alerts).toBeNull();
    expect(reads.positions?.headline).toMatch(/^These holdings rose/);
  });
});
