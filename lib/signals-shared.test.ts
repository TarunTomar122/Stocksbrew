import { describe, expect, it } from "vitest";

import { inRedditList, redditHighlight, redditMovesToday, withoutContradictedClause, type RedditName } from "@/lib/signals-shared";

const moves = redditMovesToday([
  { ticker: "NVDA", company: "NVIDIA Corporation", dayPct: 2.9 },
  { ticker: "AMD", company: "Advanced Micro Devices", dayPct: 7.3 },
  { ticker: "INTC", company: "Intel Corporation", dayPct: -1.2 },
]);

describe("withoutContradictedClause", () => {
  it("drops a comparison today's move contradicts", () => {
    expect(withoutContradictedClause("Relative strength while Nvidia declined", moves)).toBe("Relative strength");
    expect(withoutContradictedClause("Gains as Intel rallied on foundry hopes", moves)).toBe("Gains");
  });

  it("keeps a comparison today agrees with, or one about a stock we have no move for", () => {
    expect(withoutContradictedClause("Relative strength while Intel declined", moves)).toBe("Relative strength while Intel declined");
    expect(withoutContradictedClause("Relative strength while Qualcomm declined", moves)).toBe("Relative strength while Qualcomm declined");
    expect(withoutContradictedClause("Relative strength while Nvidia declined")).toBe("Relative strength while Nvidia declined");
  });

  it("runs inside the row's highlight", () => {
    // Cut down to a stub ("Relative strength"), it says nothing whole, so nothing is shown (owner rule 8).
    expect(redditHighlight({ catalysts: ["Relative strength while Nvidia declined."], summary: null }, moves)).toBeNull();
    expect(redditHighlight({ catalysts: ["Holders see relative strength while Nvidia declined."], summary: null }, moves)).toBe("Holders see relative strength.");
  });
});

describe("redditMovesToday and possessives", () => {
  it("matches a possessive company name", () => {
    expect(withoutContradictedClause("Relative strength while Nvidia's stock fell", moves)).toBe("Relative strength");
  });

  it("never keys a generic first word or a word-like ticker", () => {
    const keyed = redditMovesToday([
      { ticker: "ET", company: "Energy Transfer LP", dayPct: 1 },
      { ticker: "AEP", company: "American Electric Power", dayPct: 1 },
      { ticker: "TTD", company: "The Trade Desk", dayPct: 1 },
      { ticker: "AI", company: "C3.ai", dayPct: 1 },
      { ticker: "ON", company: "ON Semiconductor", dayPct: 1 },
    ]);
    for (const key of ["energy", "american", "the", "ai", "on"]) expect(keyed.has(key)).toBe(false);
    expect(keyed.get("ttd")).toBe(1);
    expect(withoutContradictedClause("Gains while American declined", keyed)).toBe("Gains while American declined");
  });

  it("drops a key two stocks share", () => {
    const keyed = redditMovesToday([
      { ticker: "MRVL", company: "Marvell Technology", dayPct: 2 },
      { ticker: "MRVX", company: "Marvell Other", dayPct: -2 },
    ]);
    expect(keyed.has("marvell")).toBe(false);
  });
});

describe("a stock whose ticker is its name", () => {
  it("keeps META keyed when its company is Meta Platforms", () => {
    const keyed = redditMovesToday([{ ticker: "META", company: "Meta Platforms", dayPct: -1.5 }]);
    expect(keyed.get("meta")).toBe(-1.5);
    expect(withoutContradictedClause("Ad pricing holds while Meta rallied", keyed)).toBe("Ad pricing holds");
  });
});

describe("inRedditList", () => {
  const name = (ticker: string, stance: RedditName["stance"], stanceRead = true) =>
    ({ ticker, stance, stanceRead }) as RedditName;

  it("drops a fund or index with no mood, keeps one that leans", () => {
    expect(inRedditList(name("SPY", "neutral"))).toBe(false);
    expect(inRedditList(name("SPY", "mixed" as RedditName["stance"]))).toBe(false);
    expect(inRedditList(name("SPX", "bullish", false))).toBe(false);
    expect(inRedditList(name("QQQ", "bearish"))).toBe(true);
  });

  it("keeps every stock, mood or not", () => {
    expect(inRedditList(name("APLD", "neutral", false))).toBe(true);
    expect(inRedditList(name("NVDA", "bearish"))).toBe(true);
  });
});
