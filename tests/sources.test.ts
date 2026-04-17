import { listSourcesForMarket, listTrackedSourcesForMarket } from "@/lib/sources";

describe("source registry", () => {
  it("returns only enabled Indian sources by default", () => {
    const sources = listSourcesForMarket("IN");
    expect(sources.every((source) => source.usageStatus === "enabled")).toBe(true);
    expect(sources.length).toBe(4);
  });

  it("tracks review-required sources separately", () => {
    const tracked = listTrackedSourcesForMarket("IN");
    expect(tracked.some((source) => source.usageStatus === "review_required")).toBe(true);
  });
});
