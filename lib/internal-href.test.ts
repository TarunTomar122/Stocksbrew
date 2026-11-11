import { describe, expect, it } from "vitest";

import { isInternalHref } from "@/lib/internal-href";

describe("isInternalHref", () => {
  it("accepts app pages, with queries and hashes", () => {
    for (const href of ["/", "/stock/NVDA", "/screener?tab=sectors", "/pricing#price_alerts", "/stock/BRK.B", "/stock/RELIANCE.NS", "/news?ticker=AAPL"]) {
      expect(isInternalHref(href)).toBe(true);
    }
  });

  it("rejects other sites, hashes, API routes and files", () => {
    for (const href of [
      "https://example.com",
      "//cdn.example.com/x",
      "#d-2026-11-11",
      "mailto:a@b.co",
      "/api/screener/export",
      "/api",
      "/feed.xml",
      "/llms.txt",
      "/sitemap.xml",
      "/sitemaps/stocks",
      "/profile/export",
      "/docs/search-index.json",
      "/mcp/authorize",
      "/report.pdf",
      "",
      null,
      undefined,
    ]) {
      expect(isInternalHref(href)).toBe(false);
    }
  });
});
