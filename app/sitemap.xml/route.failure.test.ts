import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A family whose read fails must not drop out of the sitemap for a day: the
 * index keeps it, logs the failure and caches for minutes; the family file
 * throws (so the last good copy is served, or a 500 that crawlers retry).
 */

const reads = vi.hoisted(() => ({
  behaviour: {} as Record<string, "ok" | "empty" | "throws" | "short">,
}));

vi.mock("@/lib/seo/sitemap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo/sitemap")>();
  return {
    ...actual,
    sitemapEntries: vi.fn(async (family: string, _today?: string, options?: { onDegraded?: (reason: string) => void }) => {
      const mode = reads.behaviour[family] ?? "ok";
      if (mode === "throws") throw new Error("coverage_unavailable");
      if (mode === "empty") return [];
      if (mode === "short") {
        options?.onDegraded?.("follow sources: store down");
        return [{ path: "/follow" }];
      }
      return [{ path: `/${family}` }];
    }),
  };
});

import { GET } from "@/app/sitemap.xml/route";
import { GET as GET_FAMILY } from "@/app/sitemaps/[family]/route";

afterEach(() => {
  reads.behaviour = {};
  vi.restoreAllMocks();
});

const files = (xml: string) => [...xml.matchAll(/<loc>https:\/\/www\.stocksbrew\.online\/sitemaps\/([a-z]+)\.xml<\/loc>/g)].map((match) => match[1]);

describe("sitemap index when a family cannot be read", () => {
  it("caches for a day when every family reads, and leaves out a family that is truly empty", async () => {
    reads.behaviour = { copy: "empty" };
    const response = await GET();
    const listed = files(await response.text());
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=86400");
    expect(listed).toContain("stocks");
    expect(listed).not.toContain("copy");
  });

  it("keeps a failed or short family in the index, logs it and caches for minutes only", async () => {
    reads.behaviour = { stocks: "throws", funds: "short" };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET();
    const listed = files(await response.text());
    expect(listed).toContain("stocks");
    expect(listed).toContain("funds");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
    const logged = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain('family "stocks"');
    expect(logged).toContain('family "funds"');
  });
});

describe("one family file when its read fails", () => {
  it("throws instead of serving a short list that would be cached for a day", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    reads.behaviour = { funds: "short", stocks: "throws" };
    await expect(GET_FAMILY(new Request("https://www.stocksbrew.online/sitemaps/funds.xml"), { params: { family: "funds.xml" } })).rejects.toThrow(
      "sitemap_family_degraded:funds",
    );
    await expect(GET_FAMILY(new Request("https://www.stocksbrew.online/sitemaps/stocks.xml"), { params: { family: "stocks.xml" } })).rejects.toThrow(
      "coverage_unavailable",
    );
  });

  it("serves a family that read in full", async () => {
    const response = await GET_FAMILY(new Request("https://www.stocksbrew.online/sitemaps/blog.xml"), { params: { family: "blog.xml" } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<loc>https://www.stocksbrew.online/blog</loc>");
  });
});
