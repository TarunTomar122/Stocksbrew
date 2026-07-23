import { describe, expect, it } from "vitest";

import { SEO_SECTOR_PAGES, resolveSeoSectorSlug } from "@/lib/seo/sector-pages";

describe("SEO sector pages", () => {
  it("keeps deterministic sector slugs unique", () => {
    expect(new Set(SEO_SECTOR_PAGES.map((sector) => sector.slug)).size).toBe(SEO_SECTOR_PAGES.length);
  });

  it("routes chip and financial companies to the editorial sector hubs", () => {
    expect(resolveSeoSectorSlug({ candidate: "technology", industry: "Semiconductors" })).toBe("semiconductors");
    expect(resolveSeoSectorSlug({ candidate: "financial-services", sector: "Financial Services" })).toBe("financials");
  });

  it("does not create a sector link for an unmapped category", () => {
    expect(resolveSeoSectorSlug({ candidate: "miscellaneous", sector: "Other" })).toBeNull();
  });
});
