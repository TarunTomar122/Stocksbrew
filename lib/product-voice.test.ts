import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HERO_FOOTNOTE,
  HERO_HEADLINE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
  MEDIUM_DESCRIPTION,
  SHORT_DESCRIPTION,
} from "@/lib/brand-copy";
import { FREE_COVERED_STOCKS } from "@/lib/entitlements";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("product language", () => {
  it("keeps the approved first impression exact", () => {
    expect(HERO_HEADLINE).toBe("Your stocks, explained every day, with sources.");
    expect(`${HERO_HEADLINE_LEAD} ${HERO_HEADLINE_EMPHASIS}`).toBe(HERO_HEADLINE);
    expect(HERO_SUBHEAD).toBe("Buy more, Keep or Sell some on each one: why, and what would change it.");
    // No promise to tell people what to buy: it overpromises and reads as advice.
    expect(HERO_HEADLINE.toLowerCase()).not.toContain("what to buy");
    const landing = source("components/oa/oa-landing.tsx");
    expect(landing).toContain("{HERO_HEADLINE_LEAD}");
    expect(landing).toContain("{HERO_HEADLINE_EMPHASIS}");
    expect(landing).toContain("{HERO_SUBHEAD}");
  });

  it("keeps the first impression inside the voice rules", () => {
    // docs/product-voice.md, "What we avoid".
    const avoided = [
      "ai-powered",
      "actionable intelligence",
      "institutional-grade",
      "stay ahead of the market",
      "cut through the noise",
      "not just",
    ];
    for (const copy of [HERO_HEADLINE, HERO_SUBHEAD, HERO_FOOTNOTE, SHORT_DESCRIPTION, MEDIUM_DESCRIPTION]) {
      expect(copy).not.toContain(String.fromCodePoint(0x2014));
      for (const phrase of avoided) expect(copy.toLowerCase(), copy).not.toContain(phrase);
    }
  });

  it("states the real free limit in the site description", () => {
    // Tracking is unlimited; the limit is how many get the full report (five, or three with PAYWALL_V2).
    const word = FREE_COVERED_STOCKS === 3 ? "three" : "five";
    expect(MEDIUM_DESCRIPTION).toContain(`full report on ${word} you pick`);
    expect(MEDIUM_DESCRIPTION).toContain("as many stocks as you like");
  });
});
