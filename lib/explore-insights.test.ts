import { describe, expect, it } from "vitest";

import { buildGiantsRead, callLeads, deskHeadline, marketTodayRead, withCallNext } from "@/lib/explore-insights";
import { SECTOR_IDS } from "@/lib/markets-insights";
import type { MarketAsset, MarketsData } from "@/lib/markets-shared";
import type { Insight } from "@/lib/insights";

describe("buildGiantsRead", () => {
  const giant = (symbol: string, cap: number, day: number) => ({ symbol, name: symbol, cap, day });
  it("weights the biggest companies by size and names the one that pulled hardest", () => {
    const read = buildGiantsRead([giant("AAPL", 5, -0.6), giant("NVDA", 4.6, -5.5), giant("GOOGL", 4.2, -0.3), giant("MSFT", 2.9, -2.2), giant("AMZN", 2.4, 1.5)])!;
    expect(read.line).toBe("The 5 biggest companies lost 1.7% of their combined value; 1 of the 5 rose.");
    expect(read.insight.text).toBe("The 5 biggest companies lost 1.7% together, and 1 of them rose. NVDA (−5.5%) did the most to pull down the group.");
    expect(read.insight.tickers).toEqual(["NVDA"]);
  });
  it("says so when the weighted move and the count disagree", () => {
    const read = buildGiantsRead([giant("AAPL", 5, 0.2), giant("NVDA", 4.6, -5.5), giant("GOOGL", 4.2, 0.1), giant("MSFT", 2.9, 0.3), giant("AMZN", 2.4, 0.2)])!;
    expect(read.line).toBe("The 5 biggest companies lost 1.2% of their combined value, even though 4 of them rose.");
    expect(read.insight.text).toMatch(/^The 5 biggest companies lost 1\.2% together, even though 4 of them rose\. /);
  });
  it("needs five companies", () => {
    expect(buildGiantsRead([giant("AAPL", 5, 1)])).toBeNull();
  });
  it("says nothing when its prices are from an earlier session than the market read", () => {
    const rows = [giant("AAPL", 5, -0.6), giant("NVDA", 4.6, -5.5), giant("GOOGL", 4.2, -0.3), giant("MSFT", 2.9, -2.2), giant("AMZN", 2.4, 1.5)];
    expect(buildGiantsRead(rows, { day: "2026-11-10", session: "2026-11-11" })).toBeNull();
    expect(buildGiantsRead(rows, { day: "2026-11-11", session: "2026-11-11" })).not.toBeNull();
    // No session to compare against: the rows stand.
    expect(buildGiantsRead(rows, { day: "2026-11-10", session: null })).not.toBeNull();
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

describe("deskHeadline", () => {
  const asset = (id: string, d1: number | null) =>
    ({ id, change: { d1, w1: null, m1: null, ytd: null, y1: null }, as_of: "2026-11-11T21:00:00Z" }) as unknown as MarketAsset;
  const desk = (spx: number | null, moves: number[]): MarketsData => ({
    as_of: null,
    assets: [asset("sp500", spx), ...SECTOR_IDS.map((id, index) => asset(id, moves[index] ?? 0))],
    predictions: [],
    treasury: null,
    volCurve: null,
  });
  const NOW = new Date("2026-11-11T22:00:00Z");

  it("leads with one number and says the sectors in words", () => {
    expect(deskHeadline(desk(1.31, [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1]), NOW)).toBe("The S&P 500 gained 1.31% today, with sectors split.");
    expect(deskHeadline(desk(0.8, Array(11).fill(0.5)), NOW)).toBe("The S&P 500 gained 0.80% today, with every sector up.");
    expect(deskHeadline(desk(0.4, [1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1]), NOW)).toBe("The S&P 500 gained 0.40% today, even though most sectors fell.");
    expect(deskHeadline(desk(-1.2, [-1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 1]), NOW)).toBe("The S&P 500 lost 1.20% today, with most sectors down.");
  });

  it("calls a 0.00% day flat and is null without the index", () => {
    expect(deskHeadline(desk(0.001, [1, -1]), NOW)).toBe("The S&P 500 was flat today.");
    expect(deskHeadline(desk(null, []), NOW)).toBeNull();
  });

  it("leaves the sectors out when too few are priced", () => {
    const thin: MarketsData = { as_of: null, assets: [asset("sp500", 0.5), asset(SECTOR_IDS[0]!, 1)], predictions: [], treasury: null, volCurve: null };
    expect(deskHeadline(thin, NOW)).toBe("The S&P 500 gained 0.50% today.");
  });
});

describe("withCallNext", () => {
  const card = (id: string, tickers: string[], soWhat?: string): Insight => ({ id, tone: "flat", text: `${tickers[0]} moved.`, tickers, soWhat });
  const read = { headline: "h", insights: [card("a", ["CRWV"], "CRWV is up 24.9% today."), card("b", ["NVDA"], "Watch next: NVDA reports on Nov 17."), card("c", ["AMD", "MU"]), card("report", ["CSCO"])] };
  const calls = new Map([["CRWV", "Buy more"], ["NVDA", "Keep"], ["AMD", "Buy more"], ["CSCO", "Keep"]]);

  it("asks only for the lead stocks of cards with no report to watch", () => {
    expect(callLeads(read)).toEqual(["CRWV", "AMD"]);
    expect(callLeads(read, { singleStock: true })).toEqual(["CRWV"]);
  });

  it("ends a card with our call on its stock and opens the stock, never on a card that already has its report", () => {
    const out = withCallNext(read, calls).insights;
    expect(out[0]!.soWhat).toBe("CRWV is up 24.9% today. Our call on CRWV: Buy more.");
    expect(out[0]!.action).toEqual({ label: "Our call on CRWV", href: "/stock/CRWV" });
    expect(out[1]!.soWhat).toBe("Watch next: NVDA reports on Nov 17.");
    expect(out[2]!.soWhat).toBe("Our call on AMD: Buy more.");
    expect(out[3]!.soWhat).toBe("Our call going into it: Keep.");
    // News and Signals: only a card about one stock.
    expect(withCallNext(read, calls, { singleStock: true }).insights[2]!.soWhat).toBeUndefined();
  });

  it("adds nothing without a call", () => {
    expect(withCallNext(read, new Map())).toBe(read);
  });
});
