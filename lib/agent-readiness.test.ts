import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../components/oa/oa-landing.tsx", import.meta.url), "utf8");

describe("homepage agent readiness", () => {
  it("keeps the homepage server-rendered with a meaningful H1", () => {
    expect(page).not.toContain('"use client"');
    expect(landing).not.toContain('"use client"');
    expect(landing).toContain("<h1");
    expect(landing.length).toBeGreaterThan(500);
  });
});
