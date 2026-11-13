import { describe, expect, it } from "vitest";

import {
  getRedditTickerContext,
  hasRedditBrief,
  resolveRedditContextForSymbol,
  tickerPostCount,
  type RedditSnapshot,
  type RedditTicker,
} from "@/lib/reddit-cues-shared";

function cue(overrides: Partial<RedditTicker> = {}): RedditTicker {
  return {
    ticker: "NVDA",
    sentiment: "neutral",
    summary: "Demand remains strong while investors debate the durability of AI capex.",
    mention_count: 5,
    catalysts: [],
    ...overrides,
  };
}

describe("hasRedditBrief", () => {
  it("keeps synthesized narratives", () => {
    expect(hasRedditBrief(cue())).toBe(true);
    expect(hasRedditBrief(cue({ catalysts: ["A new demand signal emerged."] }))).toBe(true);
  });

  it("rejects heuristic and raw discussion fallbacks", () => {
    expect(hasRedditBrief(cue({ source: "heuristic" }))).toBe(false);
    expect(
      hasRedditBrief(cue({ summary: "Latest discussion: Which three stocks would you buy?" })),
    ).toBe(false);
    expect(hasRedditBrief(cue({ summary: "NVDA mentioned in 4 Reddit posts." }))).toBe(false);
  });
});

function snapshot(overrides: Partial<RedditSnapshot> = {}): RedditSnapshot {
  return {
    market: "US",
    generated_at: "2026-11-12T20:00:00.000Z",
    post_count: 294,
    raw_post_count: 310,
    deduplicated_post_count: 294,
    duplicate_post_count: 16,
    window_hours: 72,
    coverage_status: "complete",
    fetch_failures: [],
    subreddits: ["stocks"],
    market_mood: "neutral",
    tickers: [cue({ ticker: "AMD", mention_count: 7 })],
    top_posts: [{ title: "AMD after the upgrade", subreddit: "stocks", summary: "", tickers: ["AMD"] }],
    notable_discussions: [],
    ...overrides,
  };
}

// Judge 89: the AMD page said "294 Reddit posts about AMD" while Signals showed 7; 294 was the whole scan.
describe("Reddit post counts for one ticker", () => {
  it("counts the ticker's own posts, apart from the scan's total", () => {
    const context = getRedditTickerContext(snapshot(), "amd");
    expect(context?.ticker_post_count).toBe(7);
    expect(context?.scan_post_count).toBe(294);
  });

  it("counts the tagged threads for a name the scan only saw in threads", () => {
    const context = resolveRedditContextForSymbol(snapshot({ tickers: [] }), "AMD");
    expect(context?.ticker_post_count).toBe(1);
    expect(context?.scan_post_count).toBe(294);
  });

  it("reads a missing, broken or negative count as none", () => {
    expect(tickerPostCount(null)).toBe(0);
    expect(tickerPostCount({ mention_count: Number.NaN })).toBe(0);
    expect(tickerPostCount({ mention_count: -3 })).toBe(0);
    expect(tickerPostCount({ mention_count: 1 })).toBe(1);
  });
});
