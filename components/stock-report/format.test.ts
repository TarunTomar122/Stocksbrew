import { describe, expect, it } from "vitest";

import { briefFacts, plainBriefLead, shortFact, wordCount } from "./format";

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

describe("shortFact", () => {
  it("keeps a short sentence as it is", () => {
    expect(shortFact("AMD closed at $552.90 yesterday.")).toBe("AMD closed at $552.90 yesterday.");
  });

  it("cuts a long sentence to its main clause, still a whole sentence", () => {
    expect(
      shortFact("AMD is taking server CPU share from Intel, which can increase future data-center revenue and strengthen its position as computing demand expands."),
    ).toBe("AMD is taking server CPU share from Intel.");
    expect(
      shortFact(
        "AMD reported earnings above estimates and is growing revenue and profit faster than comparable companies, giving investors a reason to support its premium.",
      ),
    ).toBe("AMD reported earnings above estimates and is growing revenue and profit faster than comparable companies.");
    expect(
      shortFact("AMD's connection to rising AI infrastructure spending is attracting investor interest and creates room for stronger demand if customers diversify beyond Nvidia."),
    ).toBe("AMD's connection to rising AI infrastructure spending is attracting investor interest.");
  });

  it("never shows a feed-truncated sentence, a plural cut or a hanging quote", () => {
    expect(shortFact("AMD shares rose after the company said demand for its...")).toBe("");
    expect(shortFact("Growth in data center servers and chips was strong across every region this quarter, which lifted margins sharply.")).toBe(
      "Growth in data center servers and chips was strong across every region this quarter.",
    );
    expect(shortFact('Lisa Su said "demand is strong across every segment, which we see continuing into next year and beyond" on the call.')).toBe("");
  });

  it("gives nothing when no clause fits in 15 words", () => {
    const long = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";
    expect(shortFact(long)).toBe("");
    expect(shortFact("")).toBe("");
  });
});

describe("briefFacts", () => {
  const read = {
    reasons: [
      "AMD is taking server CPU share from Intel, which can increase future data-center revenue and strengthen its position as computing demand expands.",
      "AMD reported earnings above estimates and is growing revenue and profit faster than comparable companies, giving investors a reason to support its premium.",
    ],
    sources: [
      { title: "AMD beats earnings estimates as revenue jumps", url: "https://example.com/beat", source: "Yahoo Finance" },
      { title: "Intel keeps losing server CPU share to AMD", url: "https://example.com/share", source: "Reuters" },
    ],
  };

  it("says each development once, at most 15 words, with the story behind it", () => {
    const facts = briefFacts(read, "AMD is gaining server CPU share from Intel while recent coverage highlights a 60% drop in free cash flow.", {
      ticker: "AMD",
      companyName: "Advanced Micro Devices",
    });
    expect(facts.map((fact) => fact.text)).toEqual([
      "AMD is gaining server CPU share from Intel.",
      "AMD reported earnings above estimates and is growing revenue and profit faster than comparable companies.",
    ]);
    expect(facts.every((fact) => wordCount(fact.text) <= 15)).toBe(true);
    expect(facts[0]!.source?.url).toBe("https://example.com/share");
    expect(facts[1]!.source?.url).toBe("https://example.com/beat");
  });

  it("links nothing when no story shares two words with the fact", () => {
    const facts = briefFacts({ reasons: ["Its margins widened last quarter."], sources: read.sources }, "", { ticker: "AMD" });
    expect(facts).toEqual([{ text: "Its margins widened last quarter.", source: null }]);
  });

  it("is empty without a read", () => {
    expect(briefFacts(null, "Anything.")).toEqual([]);
  });
});
