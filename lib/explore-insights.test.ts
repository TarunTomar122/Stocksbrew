import { describe, expect, it } from "vitest";

import { buildGiantsRead, followTakeaway, marketTodayRead, mergeDeskRead, screensTakeaway, strategiesTakeaway } from "@/lib/explore-insights";
import type { Insight } from "@/lib/insights";
import type { FollowActivity } from "@/lib/follow-shared";

describe("screensTakeaway", () => {
  it("names the stock in most screens and the best screen", () => {
    const screens = [
      { title: "A", matches: [{ ticker: "MU", changePct: 6 }, { ticker: "X", changePct: 1 }, { ticker: "Y", changePct: 2 }] },
      { title: "B", matches: [{ ticker: "MU", changePct: 6 }, { ticker: "Z", changePct: -1 }, { ticker: "W", changePct: -2 }] },
      { title: "C", matches: [{ ticker: "MU", changePct: 6 }, { ticker: "Q", changePct: 0 }, { ticker: "R", changePct: 0 }] },
    ];
    expect(screensTakeaway(screens)).toBe("MU makes 3 of 3 screens; A had the best day, +3.0% on average.");
  });
  it("is null when there is nothing to say", () => {
    expect(screensTakeaway([])).toBeNull();
    expect(screensTakeaway([{ title: "A", matches: [] }, { title: "B", matches: [] }])).toBeNull();
  });
});

const activity = (items: Array<[string, string]>): FollowActivity => ({
  id: "x", source_id: "s", kind: "congress", type: "ptr", name: "N", person: "N", date: "2026-11-05", headline: "", url: "", source: "",
  items: items.map(([action, ticker]) => ({ action, ticker, name: null })),
});

describe("followTakeaway", () => {
  it("weighs buys against sales and spots a stock on both sides", () => {
    expect(followTakeaway([activity([["buy", "NVDA"], ["buy", "PG"]]), activity([["sell", "NVDA"], ["sell", "CSCO"]])])).toBe(
      "Buying and selling about even: 2 buys, 2 sales in the latest filings; NVDA was bought by one filer and sold by another.",
    );
    expect(followTakeaway([activity([["buy", "A"]])])).toBeNull();
  });
});

describe("strategiesTakeaway", () => {
  const s = (name: string, mine: number | null, bench: number | null) => ({ name, backtest: { strategy: { annualized_return: mine }, benchmark: { annualized_return: bench } } });
  it("counts the winners and names the widest margin", () => {
    expect(strategiesTakeaway([s("Momentum", 0.266, 0.142), s("Calm", 0.116, 0.142)])).toBe("1 of 2 beat their benchmark in backtests. Momentum leads at 26.6% a year against 14.2%.");
  });
  it("needs two tested strategies", () => {
    expect(strategiesTakeaway([s("A", 0.1, 0.05), s("B", null, 0.1)])).toBeNull();
  });
});

describe("mergeDeskRead", () => {
  const line = (id: string, tickers?: string[]): Insight => ({ id, tone: "flat", text: `${id} line`, tickers });
  const news = {
    headline: "Stock news leans positive today",
    insights: [line("balance"), line("theme", ["AAPL", "MSFT"]), line("leader", ["NVDA"])],
    source: "1,103 stories",
  };

  it("folds the most talked-about stock in after the lead, and keeps one read", () => {
    const brief = { headline: "Risk-on Monday", insights: [line("mover", ["VSAT"]), line("calendar", ["CSCO"]), line("market")] };
    const merged = mergeDeskRead(brief, news)!;
    expect(merged.headline).toBe("Risk-on Monday");
    expect(merged.insights.map((insight) => insight.id)).toEqual(["mover", "news-leader", "calendar"]);
  });

  it("skips a news stock the brief already names and takes the next one", () => {
    const brief = { headline: "Risk-on", insights: [line("calendar", ["CSCO"]), line("reddit", ["NVDA"])] };
    expect(mergeDeskRead(brief, news)!.insights.map((insight) => insight.id)).toEqual(["calendar", "news-theme", "reddit"]);
  });

  it("puts stock lines before market-wide ones and lets the tone balance fill a spare slot", () => {
    const brief = { headline: "Quiet day", insights: [line("market")] };
    const onlyBalance = { ...news, insights: [line("balance")] };
    expect(mergeDeskRead(brief, onlyBalance)!.insights.map((insight) => insight.id)).toEqual(["market", "news-balance"]);
    expect(mergeDeskRead(brief, news)!.insights.map((insight) => insight.id)).toEqual(["news-leader", "market", "news-balance"]);
  });

  it("falls back to the news read alone, and to nothing", () => {
    expect(mergeDeskRead(null, news)!.insights.map((insight) => insight.id)).toEqual(["theme", "leader", "balance"]);
    expect(mergeDeskRead(null, null)).toBeNull();
    expect(mergeDeskRead({ headline: "", insights: [] }, { headline: "", insights: [] })).toBeNull();
  });
});

describe("buildGiantsRead", () => {
  const giant = (symbol: string, cap: number, day: number) => ({ symbol, name: symbol, cap, day });
  it("weights the biggest companies by size and names the one that pulled hardest", () => {
    const read = buildGiantsRead([giant("AAPL", 5, -0.6), giant("NVDA", 4.6, -5.5), giant("GOOGL", 4.2, -0.3), giant("MSFT", 2.9, -2.2), giant("AMZN", 2.4, 1.5)])!;
    expect(read.line).toBe("The 5 biggest companies lost 1.7% of their combined value; 1 of the 5 rose.");
    expect(read.insight.text).toContain("NVDA (−5.5%) did the most to pull down the group.");
    expect(read.insight.tickers).toEqual(["NVDA"]);
  });
  it("says so when the weighted move and the count disagree", () => {
    const read = buildGiantsRead([giant("AAPL", 5, 0.2), giant("NVDA", 4.6, -5.5), giant("GOOGL", 4.2, 0.1), giant("MSFT", 2.9, 0.3), giant("AMZN", 2.4, 0.2)])!;
    expect(read.line).toBe("The 5 biggest companies lost 1.2% of their combined value, even though 4 of them rose.");
  });
  it("needs five companies", () => {
    expect(buildGiantsRead([giant("AAPL", 5, 1)])).toBeNull();
  });
});

describe("marketTodayRead", () => {
  const line = (id: string, text: string) => ({ id, tone: "flat" as const, text });
  it("keeps the brief's first three points", () => {
    const brief = { headline: "The S&P 500 lost 0.38%.", insights: [line("a", "A."), line("b", "B."), line("c", "C."), line("d", "D.")] };
    expect(marketTodayRead(brief, null)?.insights.map((insight) => insight.id)).toEqual(["a", "b", "c"]);
  });
  it("falls back to the news lines without the tone lines, under the sector headline", () => {
    const news = { headline: "Stock news leans positive today.", insights: [line("balance", "40% read positive."), line("theme", "The biggest story is chips."), line("disagree", "MSFT: 40% good news.")] };
    const read = marketTodayRead(null, news, "6 of 11 sectors rose.");
    expect(read?.headline).toBe("6 of 11 sectors rose.");
    expect(read?.insights.map((insight) => insight.id)).toEqual(["theme"]);
    expect(marketTodayRead(null, news, null)).toBeNull();
  });
});
