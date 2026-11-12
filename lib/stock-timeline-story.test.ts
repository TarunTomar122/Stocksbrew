import { describe, expect, it } from "vitest";

import { analystStoryKey, buildStockTimeline } from "./stock-timeline";

describe("analyst story keys", () => {
  it("reads the same firm's same action however the headline is worded", () => {
    const company = "Advanced Micro Devices, Inc.";
    expect(analystStoryKey("William Blair upgrade boosts AMD amid Nvidia turmoil", "AMD", company)).toBe("up|blair");
    expect(analystStoryKey("William Blair upgrades Advanced Micro Devices to Outperform from market Perform", "AMD", company)).toBe("up|blair");
    expect(analystStoryKey("AMD rises as William Blair upgrades on potential benefit from Nvidia fallout", "AMD", company)).toBe("up|blair");
    expect(analystStoryKey("AMD upgraded by Jefferies on data-center demand", "AMD", company)).toBe("up|jefferies");
    expect(analystStoryKey("AMD downgraded to Hold at Morgan Stanley", "AMD", company)).toBe("down|stanley");
  });

  it("reads Title Case headlines too, never a filler word as the firm", () => {
    expect(analystStoryKey("AMD Gets An Upgrade From Mizuho", "AMD")).toBe("up|mizuho");
    expect(analystStoryKey("AMD Gets An Upgrade From Jefferies", "AMD")).toBe("up|jefferies");
    expect(analystStoryKey("AMD Upgraded By Jefferies To Buy", "AMD")).toBe("up|jefferies");
    expect(analystStoryKey("Mizuho's upgrade lifts AMD", "AMD")).toBe("up|mizuho");
  });

  it("has no key without a rating action or a firm", () => {
    expect(analystStoryKey("AMD rises after record revenue", "AMD")).toBeNull();
    expect(analystStoryKey("AMD upgraded on strong demand", "AMD")).toBeNull();
    expect(analystStoryKey("Analyst Upgrades And Downgrades For Thursday", "AMD")).toBeNull();
    expect(analystStoryKey("Top Wall Street Analyst Upgrades And Downgrades: AMD, Nvidia", "AMD")).toBeNull();
  });
});

describe("what changed keeps one entry per analyst action", () => {
  const now = new Date("2026-11-12T17:00:00Z");
  const news = (id: string, title: string, at: string) => ({ id, title, url: `https://example.com/${id}`, published_at: at, source_name: "Example" });

  it("drops a second telling of the move's upgrade, but keeps another firm's", () => {
    const { items } = buildStockTimeline({
      ticker: "AMD",
      companyName: "Advanced Micro Devices, Inc.",
      now,
      move: { headline: "William Blair upgrade boosts AMD amid Nvidia turmoil", detail: null, dayChangePct: 4.4, asOf: "2026-11-12T16:00:00Z" },
      news: [
        news("a", "William Blair upgrades Advanced Micro Devices to Outperform from market Perform", "2026-11-12T13:00:00Z"),
        news("b", "AMD rises as William Blair upgrades on potential benefit from Nvidia fallout", "2026-11-12T15:00:00Z"),
        news("c", "Jefferies upgrades AMD to Buy on data-center demand", "2026-11-11T15:00:00Z"),
      ],
    } as unknown as Parameters<typeof buildStockTimeline>[0]);
    const titles = items.map((item) => item.title);
    expect(titles.filter((title) => /William Blair/i.test(title))).toHaveLength(1);
    expect(titles.some((title) => /Jefferies/.test(title))).toBe(true);
  });
});
