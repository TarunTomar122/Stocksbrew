import { describe, expect, it } from "vitest";

import { identifyAiReferrer } from "@/lib/seo/ai-referral";

describe("identifyAiReferrer", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://www.perplexity.ai/search/example", "perplexity"],
    ["https://copilot.microsoft.com/", "microsoft_copilot"],
    ["https://gemini.google.com/app", "google_gemini"],
    ["https://claude.ai/new", "claude"],
  ])("classifies %s", (referrer, expected) => {
    expect(identifyAiReferrer(referrer)).toBe(expected);
  });

  it("does not label normal search or malformed referrers as AI traffic", () => {
    expect(identifyAiReferrer("https://www.google.com/search?q=aapl")).toBeNull();
    expect(identifyAiReferrer("not a url")).toBeNull();
    expect(identifyAiReferrer(null)).toBeNull();
  });
});
