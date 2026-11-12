import { describe, expect, it } from "vitest";

import { plainBriefLead } from "./format";

describe("plainBriefLead", () => {
  it("says what happened instead of what the news centers on", () => {
    expect(plainBriefLead("JPMorgan’s fresh news centers on a partnership with OpenAI intended to improve coding efficiency and cybersecurity.")).toBe(
      "JPMorgan has a new partnership with OpenAI to improve coding efficiency and cybersecurity.",
    );
    expect(plainBriefLead("Apple’s current coverage centers on a capital-light AI plan, including Google Gemini support for Siri.")).toBe(
      "Apple has a new capital-light AI plan, including Google Gemini support for Siri.",
    );
  });

  it("drops a sentence that only says the coverage is thin", () => {
    expect(plainBriefLead("Recent company-specific coverage is thin for AA.")).toBeNull();
    expect(plainBriefLead("Coverage is quiet: the latest article only reviews Amphenol’s long-term investment returns and offers no new company-specific development.")).toBeNull();
    expect(plainBriefLead("Today’s coverage contains no Enact-specific development; the two articles discuss European gas inflation.")).toBeNull();
    expect(plainBriefLead("Use the current fundamentals rather than treating stale headlines as a fresh catalyst.")).toBeNull();
  });

  it("leaves any other sentence as it was", () => {
    const plain = "Raymond James initiated American Healthcare REIT coverage with a Strong Buy rating and a $62 target.";
    expect(plainBriefLead(plain)).toBe(plain);
    expect(plainBriefLead("Lockheed Martin’s latest coverage centers on CEO Jim Taiclet’s leadership.")).toBe("Lockheed Martin’s latest coverage centers on CEO Jim Taiclet’s leadership.");
    expect(plainBriefLead("The deal adds no new debt, and the company keeps its dividend.")).toBe("The deal adds no new debt, and the company keeps its dividend.");
    // A thin-coverage sentence that still carries a fact stays.
    expect(plainBriefLead("Coverage is thin, but JPMorgan raised its dividend to $1.50.")).toBe("Coverage is thin, but JPMorgan raised its dividend to $1.50.");
    // Bad news is faced, not had.
    expect(plainBriefLead("Microsoft’s news centers on an antitrust probe in the EU.")).toBe("Microsoft faces an antitrust probe in the EU.");
    expect(plainBriefLead("")).toBeNull();
  });
});
