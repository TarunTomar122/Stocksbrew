import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HERO_HEADLINE, HERO_SUBHEAD } from "@/lib/brand-copy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("product language", () => {
  it("keeps the approved first impression exact", () => {
    expect(HERO_HEADLINE).toBe("Analyse and track US stocks with AI");
    expect(HERO_SUBHEAD).toBe("Search any US stock for financials, news and market context.");
    expect(source("components/terminal-landing-hero-copy.tsx")).toContain("HERO_HEADLINE");
    expect(source("components/terminal-landing-hero-copy.tsx")).toContain("HERO_SUBHEAD");
  });

  it("keeps technical agent positioning off the main homepage", () => {
    const home = source("components/public-home-page.tsx");
    expect(home).not.toContain("AgentAccessLandingSection");
    expect(home).not.toContain("LandingSectorHeatStream");
  });
});
