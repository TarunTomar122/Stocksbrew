import { describe, expect, it } from "vitest";

import { buildMoversRead, buildPolicyRead, buildRedditRead, buildSignalsTodayRead, causeKind, causeCluster, moverTheme, moversHeadline, oneCardPerStock, praisedRecord, recentInsight, redditHeadline, themeCluster, type MoverForRead } from "@/lib/signals-insights";
import type { PolicyPost, RedditName } from "@/lib/signals-shared";

const m = (ticker: string, pct: number, cause: string | null, headline = "", industry: string | null = null): MoverForRead => ({
  ticker, pct, explained: cause !== null, cause, headline, industry,
});

const SPACE = [
  m("FLY", 17, "Government contract opportunity", "Firefly joins NASA lunar program"),
  m("VSAT", 16, "Contract award", "Viasat wins NASA satellite contract"),
  m("LUNR", 15, "Contract win", "NASA selects Intuitive Machines", "Aerospace & Defense"),
  m("PL", 14, "Business expansion", "Planet Labs secures launch", "Aerospace & Defense"),
];
const DROPS = [
  m("IBRX", -17, "Earnings miss", "ImmunityBio slides after earnings miss"),
  m("HIMS", -12, "Earnings", "Hims plunges after surprise loss"),
  m("CEVA", -8, "Earnings miss", "CEVA falls after Q3 miss"),
  m("ACAD", -22, null),
];

describe("movers", () => {
  it("classifies causes from the label first", () => {
    expect(causeKind(m("AMD", 13, "Analyst upgrade and business win"))).toBe("analyst");
    expect(causeKind(m("X", 1, null))).toBeNull();
    expect(causeKind(m("X", 1, "Something", "nothing matches"))).toBe("other");
  });

  it("finds a theme from industry, name or headline", () => {
    expect(moverTheme(SPACE[2]!)).toBe("space");
    expect(moverTheme(m("X", 1, null))).toBeNull();
  });

  it("needs three names for a theme cluster", () => {
    expect(themeCluster(SPACE.slice(0, 2))).toBeNull();
    expect(themeCluster([...SPACE, ...DROPS])?.rows.map((row) => row.ticker)).toEqual(["FLY", "VSAT", "LUNR", "PL"]);
  });

  it("a cause cluster needs two names and a third of the side's reasons", () => {
    expect(causeCluster(DROPS)?.kind).toBe("earnings");
    expect(causeCluster([m("A", 1, "Earnings"), m("B", 1, "FDA approval"), m("C", 1, "Contract")])).toBeNull();
  });

  it("writes the headline from both sides", () => {
    // One sentence on the side the theme leads; the other side's cause is a line under it.
    expect(moversHeadline([...SPACE, ...DROPS])).toBe("Space stocks led the gainers on contracts and deals (FLY, VSAT, LUNR and 1 more).");
    const read = buildMoversRead([...SPACE, ...DROPS])!;
    expect(read.insights.find((insight) => insight.id === "cause-decliners")?.tickers).toEqual(expect.arrayContaining(["IBRX", "HIMS", "CEVA"]));
  });

  it("names companies, not tickers, when it knows the name", () => {
    const named = [
      { ...m("HIMS", -16, "Earnings miss"), name: "Hims & Hers Health, Inc." },
      { ...m("LFVN", -13, "Revenue drops"), name: "LifeVantage Corporation" },
    ];
    expect(moversHeadline(named)).toBe("Earnings reports sent Hims & Hers Health and LifeVantage down.");
  });

  it("falls back to the single biggest move and is null when empty", () => {
    expect(moversHeadline([])).toBeNull();
    expect(moversHeadline([m("UAMY", 23, null), m("X", -2, null)])).toBe("UAMY moved most, +23.0%.");
    expect(buildMoversRead([])).toBeNull();
  });

  it("says mostly misses only when most are misses", () => {
    const read = buildMoversRead([...SPACE, ...DROPS])!;
    const drops = read.insights.find((insight) => insight.id === "cause-decliners")!;
    expect(drops.text).toContain("mostly misses");
    expect(read.insights.find((insight) => insight.id === "unexplained")).toBeUndefined();
  });
});

function name(ticker: string, mentions: number, stance: RedditName["stance"], dayPct: number | null, last24h = 0, baseline = 0): RedditName {
  const ratio = baseline > 0 ? last24h / baseline : null;
  return {
    ticker, company: null, mentions, stance, stanceRead: stance !== "neutral", summary: null, catalysts: [], latestPostAt: null, subreddits: [], dayPct,
    velocity: { daily: [], last24h, baselinePerDay: baseline, ratio, state: "steady" },
  };
}

describe("reddit", () => {
  const names = [name("NVDA", 11, "bearish", -4.3, 4, 1.17), name("SPY", 7, "bearish", 2.4), name("QQQ", 5, "bearish", 3.4), name("AMD", 4, "bearish", 13.4), name("MU", 2, "mixed", 6.3, 2, 0.33), name("BABA", 2, "bullish", -3.7)];

  it("names the President's posts in the Today read's source when one of its cards is about them", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const posts = [...Array(3)].map((_, i) => post(`p${i}`, "2026-11-09T00:00:00Z", "neutral", []));
    const read = buildSignalsTodayRead([], names, posts, now, null)!;
    const policy = read.insights.find((insight) => insight.id === "recent");
    expect(policy?.text).toMatch(/^The President's market posts this week were mostly neither positive nor negative\./);
    expect(read.source).toBe("From 31 stock mentions on Reddit and the President's posts");
    expect(buildSignalsTodayRead([], names, [], now, null)!.source).toBe("From 31 stock mentions on Reddit");
  });

  it("skips funds when naming the loudest stock and flags crowd-vs-price splits", () => {
    const read = buildRedditRead(names)!;
    // One idea, one number (owner rule 8); the base goes in the source line.
    expect(read.headline).toBe("87% of Reddit's stock mentions expect prices to fall.");
    expect(read.source).toBe("From 31 stock mentions on Reddit");
    // The most-mentioned stock is the first line under it, not part of the headline.
    expect(read.headline).not.toContain("NVDA");
    expect(read.insights[0]!.text).toMatch(/^NVDA is the stock Reddit talks about most: 11 of 31 mentions \(35%\), 3\.4x/);
    expect(read.insights[1]!.text).toContain("AMD");
  });

  it("is null with no names", () => {
    expect(buildRedditRead([])).toBeNull();
  });

  it("never puts the loudest stock on the disagreement card too", () => {
    // NVDA is loudest and also against its price; the disagreement card tells the next one (RKLB) instead.
    const read = buildRedditRead([name("NVDA", 10, "bearish", 4.3), name("RKLB", 3, "bearish", 7.6), name("AMD", 2, "bullish", 1)])!;
    const tickers = read.insights.flatMap((insight) => insight.tickers ?? []);
    expect(tickers.filter((ticker) => ticker === "NVDA")).toHaveLength(1);
    expect(read.insights[1]!.text).toContain("RKLB");
    expect(read.insights[1]!.text).not.toContain("NVDA");
  });

  it("says a split crowd with one number", () => {
    expect(redditHeadline({ bullish: 13, bearish: 17, total: 50 })).toBe("Reddit leans slightly toward a fall, with 34% of stock mentions expecting one.");
    expect(redditHeadline({ bullish: 10, bearish: 10, total: 50 })).toBe("Reddit is split evenly: 20% of stock mentions expect a rise, and as many a fall.");
    expect(redditHeadline({ bullish: 0, bearish: 0, total: 50 })).toBe("Reddit is talking about stocks without leaning either way.");
  });
});

describe("one card per stock", () => {
  it("drops a later card about a stock an earlier card told", () => {
    const cards = oneCardPerStock([
      { id: "a", tone: "flat", text: "a", tickers: ["NVDA"] },
      { id: "b", tone: "flat", text: "b" },
      { id: "c", tone: "flat", text: "c", tickers: ["RKLB", "NVDA"] },
      { id: "d", tone: "flat", text: "d", tickers: ["AMD"] },
    ]);
    expect(cards.map((card) => card.id)).toEqual(["a", "b", "d"]);
  });
});

function post(id: string, publishedAt: string, stance: PolicyPost["stance"], names: Array<[string, number]>, market = 1): PolicyPost {
  return {
    id, publishedAt, summary: "s", stance, url: "", archiveUrl: null,
    names: names.map(([ticker, pct]) => ({ ticker, company: ticker, since: { pct, fromDate: "2026-10-01", toDate: "2026-11-09" } })),
    market: { pct: market, fromDate: "2026-10-01", toDate: "2026-11-09" },
  };
}

describe("policy", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("keeps the latest praise per stock and compares with the market", () => {
    const record = praisedRecord([post("a", "2026-10-01T00:00:00Z", "bullish", [["BA", -5]]), post("b", "2026-10-20T00:00:00Z", "bullish", [["BA", 3]])], now);
    expect(record).toEqual([{ ticker: "BA", pct: 3, vsMarket: 2, at: "2026-10-20T00:00:00Z" }]);
  });

  it("says praised stocks trailed when most did", () => {
    const posts = [
      post("1", "2026-10-01T00:00:00Z", "bullish", [["BA", -7]]),
      post("2", "2026-10-02T00:00:00Z", "bullish", [["NVDA", -10]]),
      post("3", "2026-10-03T00:00:00Z", "bullish", [["F", -2]]),
      post("4", "2026-10-04T00:00:00Z", "bullish", [["GM", 8]]),
    ];
    expect(buildPolicyRead(posts, now)!.headline).toBe("Stocks the President praised have mostly trailed the market since.");
  });

  it("is null with no posts", () => {
    expect(buildPolicyRead([], now)).toBeNull();
  });

  it("says the week's tone as one figure, not two counts", () => {
    const posts = [
      post("1", "2026-11-09T00:00:00Z", "bullish", []),
      post("2", "2026-11-08T00:00:00Z", "bullish", []),
      post("3", "2026-11-07T00:00:00Z", "bearish", []),
      post("4", "2026-11-06T00:00:00Z", "neutral", []),
      post("5", "2026-10-30T00:00:00Z", "neutral", []),
    ];
    const recent = recentInsight(posts, now)!;
    expect(recent.text).toBe("The President posted about the market 4 times in the last 7 days (1 the week before). None named a listed company.");
    expect(recent.figure).toEqual({ value: "50%", label: "positive", tone: "up" });
    // 4 against 3 of 10 is a split, said in words with no tone figure.
    const split = recentInsight(
      [...Array(4)].map((_, i) => post(`p${i}`, "2026-11-09T00:00:00Z", "bullish", [])).concat([...Array(3)].map((_, i) => post(`n${i}`, "2026-11-09T00:00:00Z", "bearish", [])), [...Array(3)].map((_, i) => post(`z${i}`, "2026-11-09T00:00:00Z", "neutral", []))),
      now,
    )!;
    // The figure has the count, so the sentence does not say it again.
    expect(split.text).toBe("The President's market posts this week were split between positive and negative. None named a listed company.");
    expect(split.figure).toEqual({ value: "10", label: "posts this week" });
    const busier = recentInsight([...Array(3)].map((_, i) => post(`p${i}`, "2026-11-09T00:00:00Z", "neutral", [])).concat([post("old", "2026-11-01T00:00:00Z", "neutral", [])]), now)!;
    expect(busier.text).toBe("The President posted about the market 3 times in the last 7 days, mostly neither positive nor negative. None named a listed company.");
    expect(busier.figure).toEqual({ value: "+2", label: "on the week before" });
  });
});
