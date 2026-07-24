import { describe, expect, it } from "vitest";

import type { RedditSnapshot } from "@/lib/reddit-cues-shared";
import { socialDataState } from "@/lib/social-data";

function snapshot(overrides: Partial<RedditSnapshot> = {}): RedditSnapshot {
  return {
    market: "US",
    generated_at: "2026-07-24T09:00:00Z",
    post_count: 20,
    raw_post_count: 25,
    deduplicated_post_count: 20,
    duplicate_post_count: 5,
    window_hours: 120,
    coverage_status: "complete",
    fetch_failures: [],
    subreddits: ["stocks"],
    market_mood: "mixed",
    tickers: [
      {
        ticker: "NVDA",
        sentiment: "bullish",
        summary: "Earnings debate",
        mention_count: 4,
        catalysts: [],
      },
    ],
    top_posts: [],
    notable_discussions: [],
    ...overrides,
  };
}

describe("socialDataState", () => {
  it("marks a recent complete five-day snapshot fresh", () => {
    expect(socialDataState(snapshot(), Date.parse("2026-07-24T10:00:00Z"))).toBe("fresh");
  });

  it("exposes fetch failures as partial coverage", () => {
    expect(
      socialDataState(
        snapshot({
          coverage_status: "partial",
          fetch_failures: [{ subreddit: "stocks" }],
        }),
        Date.parse("2026-07-24T10:00:00Z"),
      ),
    ).toBe("partial");
  });

  it("marks snapshots older than their rolling window stale", () => {
    expect(socialDataState(snapshot(), Date.parse("2026-07-30T10:00:00Z"))).toBe("stale");
  });
});
