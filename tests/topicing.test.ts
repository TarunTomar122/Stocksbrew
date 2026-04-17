import { inferTopic } from "@/lib/topicing";

describe("topic inference", () => {
  it("extracts company IPO topics", () => {
    const topic = inferTopic(
      "Tipco Engineering IPO Day 1: Issue booked 1% so far",
      "Muted subscription numbers on opening day.",
    );

    expect(topic.label).toBe("Tipco Engineering IPO");
    expect(topic.kind).toBe("ipo");
  });

  it("falls back to rule-based market themes", () => {
    const topic = inferTopic(
      "Oil prices rise as Brent climbs on supply fears",
      "The crude complex remained volatile.",
    );

    expect(topic.label).toBe("Oil and commodities");
  });
});
