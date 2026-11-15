import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../components/oa/oa-landing.tsx", import.meta.url), "utf8");
// The H1 is the hero headline's own component (a client component for its hover cards, still rendered on the server
// with the sentence as its text: the cards only exist while open).
const headline = readFileSync(new URL("../components/oa/landing/hero-headline.tsx", import.meta.url), "utf8");

describe("homepage agent readiness", () => {
  it("keeps the homepage server-rendered with a meaningful H1", () => {
    expect(page).not.toContain('"use client"');
    expect(landing).not.toContain('"use client"');
    expect(landing).toContain("<HeroHeadline");
    expect(headline).toContain("<h1");
    expect(landing.length).toBeGreaterThan(500);
  });
});
