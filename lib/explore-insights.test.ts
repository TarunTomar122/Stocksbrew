import { describe, expect, it } from "vitest";

import { followTakeaway, mergeDeskRead, screensTakeaway, strategiesTakeaway } from "@/lib/explore-insights";
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
