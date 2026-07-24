import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("compare stocks experience", () => {
  it("leads with a concise decision prompt instead of a long explainer", () => {
    const interactive = source("components/compare-stocks-interactive.tsx");
    expect(interactive).toContain("Pick two.");
    expect(interactive).toContain("See the trade-off.");
    expect(interactive).toContain("One clean read across quality, valuation, momentum and returns.");
    expect(interactive).not.toContain("How comparing stocks works here");
  });

  it("uses distinct desktop and mobile comparison views instead of a scrolling table", () => {
    const interactive = source("components/compare-stocks-interactive.tsx");
    expect(interactive).toContain('className="hidden md:block"');
    expect(interactive).toContain("md:hidden");
    expect(interactive).not.toContain("overflow-x-auto");
    expect(interactive).not.toContain("<table");
  });

  it("groups secondary metrics behind accessible category tabs", () => {
    const interactive = source("components/compare-stocks-interactive.tsx");
    expect(interactive).toContain('role="tablist"');
    expect(interactive).toContain('role="tab"');
    expect(interactive).toContain('aria-selected={category === key}');
    expect(interactive).toContain("Quick read");
    expect(interactive).toContain("Fundamentals");
    expect(interactive).toContain("Momentum");
  });

  it("keeps motion purposeful and respects reduced-motion preferences", () => {
    const interactive = source("components/compare-stocks-interactive.tsx");
    expect(interactive).toContain('from "motion/react"');
    expect(interactive).toContain("useReducedMotion()");
    expect(interactive).toContain("Building the matchup");
    expect(interactive).toContain("<ScoreBar");
  });

  it("keeps supporting SEO copy compact and collapsed", () => {
    const landing = source("components/compare-stocks-landing-sections.tsx");
    expect(landing).toContain("<details");
    expect(landing).toContain("Compare once. Track what changes.");
    expect(landing).not.toContain("Recommended free stack");
    expect(landing).not.toContain("How it works");
  });
});
