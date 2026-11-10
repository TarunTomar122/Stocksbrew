import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("homepage live proof movers", () => {
  it("filters researched anomalies before considering the labelled price fallback", () => {
    // The movers card moved from oa-landing.tsx into the landing sections.
    const grid = source("components/oa/landing/track-grid.tsx");
    const hero = source("components/oa/landing/hero-briefing.tsx");

    expect(grid).toContain("(anomaliesDoc?.anomalies ?? []).filter(hasResearchBackedNarrative)");
    expect(grid).toContain("explained.length === 0 ? buildLandingPriceMovers(");
    expect(hero).toContain("resolveLandingHeroFeatured(anomalies)");
    for (const file of [grid, hero, source("components/oa/oa-landing.tsx")]) {
      expect(file).not.toContain("const movers = anomaliesDoc?.anomalies ?? [];");
    }
  });
});
