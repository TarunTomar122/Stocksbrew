import { labelSentiment, scoreSentiment } from "@/lib/sentiment";

describe("sentiment scoring", () => {
  it("scores bearish headlines below zero", () => {
    const score = scoreSentiment("Bank stocks tumble as outflows and war fears deepen the slump");
    expect(score).toBeLessThan(0);
    expect(labelSentiment(score)).toBe("bearish");
  });

  it("scores constructive headlines above zero", () => {
    const score = scoreSentiment("Company shares rally after dividend approval and strong buyback update");
    expect(score).toBeGreaterThan(0);
    expect(["constructive", "bullish"]).toContain(labelSentiment(score));
  });
});
