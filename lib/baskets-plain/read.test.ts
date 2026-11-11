import { describe, expect, it } from "vitest";

import type { ScreenerRow } from "@/lib/screener-shared";

import { followEntry, nextFollowed, readFollowedBaskets, sinceFollow, type FollowedBasket } from "./follow";
import type { BasketMatch } from "./match";
import { buildBasketRead, pickBacktestMembers, type BacktestSummary } from "./read";

describe("pickBacktestMembers", () => {
  it("starts when most of the basket has prices and names the late listings", () => {
    const firsts = new Map<string, string | null>([
      ["A", "2014-11-10"],
      ["B", "2014-11-10"],
      ["C", "2015-03-02"],
      ["D", "2016-01-04"],
      ["E", "2024-04-02"],
      ["F", null],
    ]);
    const pick = pickBacktestMembers(firsts);
    // Five with history; 80% of five is four, so the start is D's first day and E sits out.
    expect(pick.start).toBe("2016-01-04");
    expect(pick.included).toEqual(["A", "B", "C", "D"]);
    expect(pick.lateStart).toEqual([{ symbol: "E", first: "2024-04-02" }]);
    expect(pick.noHistory).toEqual(["F"]);
  });

  it("keeps everyone when the basket is small", () => {
    const pick = pickBacktestMembers(new Map([["A", "2014-11-10"], ["B", "2020-01-02"]]));
    expect(pick.start).toBe("2020-01-02");
    expect(pick.included).toEqual(["A", "B"]);
  });

  it("has no window with fewer than two priced members", () => {
    expect(pickBacktestMembers(new Map([["A", "2014-11-10"], ["B", null]])).start).toBeNull();
  });
});

const member = (symbol: string, extra: Partial<ScreenerRow> = {}) => ({ row: { symbol, ...extra } as ScreenerRow, topic: null, ties: [], why: "" });

const TEST: BacktestSummary = {
  start: "2016-01-04",
  end: "2026-11-10",
  years: 10.85,
  members: 2,
  basket: { annual: 0.142, total: 3.2, worst: -0.41 },
  benchmark: { annual: 0.128, total: 2.7, worst: -0.34 },
};

describe("buildBasketRead", () => {
  it("leads with the count and the gap to the S&P 500, and labels the test", () => {
    const match: BasketMatch = {
      subjectCount: 9,
      members: [member("VST", { call: "Add" }), member("MOD", { call: "Hold" })],
      funnel: [{ label: "worth less than $50 billion", removed: 7, examples: ["GEV", "NEE", "ETN"] }],
      sectorPe: new Map(),
    };
    const read = buildBasketRead({ match, test: TEST, subjectNoun: "companies that fit the subject", all: [], asOf: null });
    expect(read.headline).toBe("2 companies fit today, and held equally since January 2016, they beat the S&P 500 by 1.4 points a year.");
    expect(read.insights[0]!.text).toBe(
      "Held in equal amounts from January 2016 to November 2026, the 2 members with that much price history returned +14.2% a year against +12.8% for the S&P 500. Its worst fall was 41.0%, deeper than the index's 34.0%.",
    );
    expect(read.insights[0]!.soWhat).toMatch(/^With only 2 companies, one stock's run decides most of this. This puts today's list on the past/);
    expect(read.insights[1]!.text).toBe("The “worth less than $50 billion” condition left out 7 of the 9 companies that fit the subject, including GEV, NEE and ETN.");
  });

  it("says when nothing passes, and which condition did it", () => {
    const match: BasketMatch = { subjectCount: 4, members: [], funnel: [{ label: "P/E 10 or less", removed: 4, examples: ["A"] }], sectorPe: new Map() };
    const read = buildBasketRead({ match, test: null, subjectNoun: "banks", all: [], asOf: null });
    expect(read.headline).toBe("None of the 4 banks passes every condition today.");
    expect(read.insights[0]!.soWhat).toBe("Loosen that one first if the list feels thin.");
  });
});

describe("following", () => {
  const rows = [{ symbol: "A", price: 10 }, { symbol: "B", price: 20 }, { symbol: "C" }] as ScreenerRow[];
  const entry = followEntry({ slug: "a-basket-0123456789", title: "A basket", rows, benchmark: { symbol: "SPY", price: 500 } as ScreenerRow, now: new Date("2026-11-11T00:00:00Z") });

  it("freezes only members with a price", () => {
    expect(entry.members).toEqual([{ symbol: "A", price: 10 }, { symbol: "B", price: 20 }]);
    expect(entry.benchmark_price).toBe(500);
  });

  it("respects the plan count, keeps the first follow date and always lets you stop", () => {
    const other: FollowedBasket = { ...entry, slug: "other-basket-abcdef0123" };
    expect(nextFollowed([other], entry, true, 1)).toBe("limit");
    expect(nextFollowed([entry], { ...entry, followed_at: "later" }, true, 1)).toEqual([entry]);
    expect(nextFollowed([entry, other], entry, false, 0)).toEqual([other]);
  });

  it("measures the equal-amount price change since following against SPY", () => {
    const now = new Map([
      ["A", { symbol: "A", price: 11 } as ScreenerRow],
      ["B", { symbol: "B", price: 18 } as ScreenerRow],
    ]);
    const since = sinceFollow(entry, now, { symbol: "SPY", price: 510 } as ScreenerRow);
    expect(since.pct).toBeCloseTo(0, 6);
    expect(since.benchmarkPct).toBeCloseTo(2, 6);
    expect(since.priced).toBe(2);
  });

  it("reads only well-formed entries from a user doc", () => {
    const list = readFollowedBaskets({ followed_baskets: [entry, { slug: "../x", followed_at: "x" }, null, { slug: entry.slug }] });
    expect(list).toHaveLength(1);
  });
});
