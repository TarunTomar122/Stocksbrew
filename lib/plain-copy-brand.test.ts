import { describe, expect, it } from "vitest";

import { headlineCase, mixedCase } from "@/lib/plain-copy";
import { headlineNamesStock } from "@/lib/wire-headline-tone";
import { newsRank } from "@/lib/briefing-news";

const NAMES = ["Target Corporation", "Block, Inc.", "Best Buy Co., Inc."];

describe("brand words used as ordinary words (ship 33 QA)", () => {
  it("lowers price Target, will Block and Gap up even when the brand is on the page", () => {
    expect(headlineCase("Nvidia Gets Price Target Hike From Morgan Stanley", "NVIDIA Corporation", NAMES)).toBe("Nvidia gets price target hike from Morgan Stanley");
    expect(mixedCase("Microsoft will Block rival bid", "", NAMES)).toBe("Microsoft will block rival bid");
    expect(mixedCase("Apple shares Gap up", "", [])).toBe("Apple shares gap up");
  });

  it("keeps the brand when it is the company", () => {
    expect(mixedCase("Target shares jump after the report", "", NAMES)).toBe("Target shares jump after the report");
    expect(mixedCase("Best Buy raises its outlook", "", NAMES)).toBe("Best Buy raises its outlook");
  });
});

describe("headline names a stock", () => {
  it("knows Super Micro, J&J, P&G and a two-letter ticker that opens the headline", () => {
    expect(headlineNamesStock("Super Micro jumps on new orders", "SMCI", "Super Micro Computer, Inc.")).toBe(true);
    expect(headlineNamesStock("J&J wins talc ruling", "JNJ", "Johnson & Johnson")).toBe(true);
    expect(headlineNamesStock("P&G raises its outlook", "PG", "The Procter & Gamble Company")).toBe(true);
    expect(headlineNamesStock("GM beats on earnings", "GM", "General Motors Company")).toBe(true);
    expect(headlineNamesStock("AI chips lead the market", "AI", "C3.ai, Inc.")).toBe(false);
  });
});

describe("newsRank and extended hours", () => {
  it("keeps a story about the after-the-bell move even when it runs against the day", () => {
    const stock = { ticker: "NVDA", name: "NVIDIA Corporation", day_change_pct: 2.9, price_as_of: "2026-11-11" };
    expect(newsRank({ title: "Nvidia shares slide after the bell as it guides lower", summary: "Nvidia fell in late trading after its outlook.", published_at: "2026-11-11T10:00:00Z" }, stock)).not.toBeNull();
  });
});
