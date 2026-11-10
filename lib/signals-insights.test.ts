import { describe, expect, it } from "vitest";

import { buildMoversRead, buildPolicyRead, buildRedditRead, causeKind, causeCluster, moverTheme, moversHeadline, praisedRecord, themeCluster, type MoverForRead } from "@/lib/signals-insights";
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
    expect(moversHeadline([...SPACE, ...DROPS])).toBe("Space stocks led the gainers on contracts and deals (FLY, VSAT, LUNR and 1 more); earnings sank IBRX, HIMS and CEVA.");
  });

  it("falls back to the single biggest move and is null when empty", () => {
    expect(moversHeadline([])).toBeNull();
    expect(moversHeadline([m("UAMY", 23, null), m("X", -2, null)])).toBe("UAMY moved most, +23.0%, with no confirmed reason yet.");
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

  it("skips funds when naming the loudest stock and flags crowd-vs-price splits", () => {
    const read = buildRedditRead(names)!;
    expect(read.headline).toMatch(/^Reddit leans worried/);
    expect(read.headline).toContain("NVDA");
    expect(read.insights[0]!.text).toMatch(/^NVDA is the stock Reddit talks about most: 11 of 31 mentions \(35%\), 3\.4x/);
    expect(read.insights[1]!.text).toContain("AMD");
  });

  it("is null with no names", () => {
    expect(buildRedditRead([])).toBeNull();
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
});
