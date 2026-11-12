import { describe, expect, it } from "vitest";

import { fitLine } from "@/lib/fit-line";

describe("fitLine", () => {
  it("keeps a line that already fits", () => {
    expect(fitLine("Intuitive Machines rose after record revenue and backlog.", 80)).toBe("Intuitive Machines rose after record revenue and backlog.");
    expect(fitLine(null, 40)).toBe("");
  });

  it("ends at a clause when one ends early enough, with no ellipsis", () => {
    const text = "Jensen Huang's shock resignation at Nvidia is prompting investors to look for alternatives, as AMD gains share.";
    expect(fitLine(text, 96)).toBe("Jensen Huang's shock resignation at Nvidia is prompting investors to look for alternatives");
  });

  it("never cuts through a word, and drops dangling little words", () => {
    const text = "Jensen Huang's shock resignation at Nvidia is prompting investors to look for alternative chip suppliers";
    const out = fitLine(text, 84);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(85);
    expect(out).not.toMatch(/alternativ…/);
    expect(out).not.toMatch(/\b(?:for|to|the)…$/);
    for (const word of out.replace(/…$/, "").split(" ")) expect(text.split(" ")).toContain(word);
  });

  it("leaves no comma or dash at the cut", () => {
    expect(fitLine("Valero rose after bullish ratings, growth outlook and a strong refining margin this quarter", 40)).not.toMatch(/[,—–-]$/);
  });
});
