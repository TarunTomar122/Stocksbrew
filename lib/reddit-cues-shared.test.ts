import { describe, expect, it } from "vitest";

import { hasRedditBrief, type RedditTicker } from "@/lib/reddit-cues-shared";

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
