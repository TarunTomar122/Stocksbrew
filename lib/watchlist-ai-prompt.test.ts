import { describe, expect, it } from "vitest";

import { buildWatchlistAiPrompt } from "@/lib/watchlist-ai-prompt";

describe("buildWatchlistAiPrompt", () => {
  it("includes MCP setup and a stock-specific task", () => {
    const prompt = buildWatchlistAiPrompt("NVDA");

    expect(prompt).toContain("https://www.stocksbrew.online/api/mcp");
    expect(prompt).toContain("NVDA");
    expect(prompt).toContain("not enough current evidence");
  });

  it("creates a Watchlist overview task when no ticker is supplied", () => {
    expect(buildWatchlistAiPrompt()).toContain("Review my Stocksbrew Watchlist");
  });
});
