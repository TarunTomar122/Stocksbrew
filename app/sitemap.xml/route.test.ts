import { describe, expect, it } from "vitest";

import { GET } from "@/app/sitemap.xml/route";
import { GET as GET_FAMILY } from "@/app/sitemaps/[family]/route";
import { isIndexableBlogPost } from "@/lib/blog-data";
import { SITEMAP_FAMILIES, sitemapEntries } from "@/lib/seo/sitemap";
import { getCoverage, indexableStockSymbols } from "@/lib/seo/family-data";

type Redirect = { source: string; destination: string; permanent: boolean };

async function redirects(): Promise<Redirect[]> {
  const config = require("../../next.config.js") as { redirects: () => Promise<Redirect[]> };
  return config.redirects();
}

/** Whether a redirect rule would catch this path. Mirrors how the rules are written: exact, or a prefix before the first parameter. */
function matcher(rules: Redirect[]) {
  const exact = new Set(rules.filter((rule) => !rule.source.includes(":")).map((rule) => rule.source));
  const prefixes = rules.filter((rule) => rule.source.includes(":")).map((rule) => rule.source.slice(0, rule.source.indexOf(":")));
  return (path: string) => exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * A family built from the screener snapshot throws when the snapshot cannot be
 * read (so a live family sitemap answers 500, not an empty list). The test run
 * has no Next cache, so those families read as empty here.
 */
async function entries(family: Parameters<typeof sitemapEntries>[0]) {
  return sitemapEntries(family).catch((error: unknown) => {
    if (error instanceof Error && error.message === "coverage_unavailable") return [];
    throw error;
  });
}

async function allPaths(): Promise<string[]> {
  const lists = await Promise.all(SITEMAP_FAMILIES.map((family) => entries(family)));
  return lists.flat().map((entry) => entry.path);
}

/** Pages that are signed-in, noindex or closed to crawlers in robots.txt. Nothing may redirect to them. */
const CLOSED = ["/watchlist", "/profile", "/dev", "/api", "/mcp/authorize"];

describe("public sitemap", { timeout: 90_000 }, () => {
  it("is an index of one file per family", async () => {
    const xml = await (await GET()).text();
    const files = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    expect(xml).toContain("<sitemapindex");
    expect(new Set(files).size).toBe(files.length);
    // Families that do not depend on the store are always present. Stocks now follow the
    // stored reads (stockHasCurrentRead), so that family can be empty when the store cannot be read.
    for (const family of ["pages", "docs", "blog", "themes"]) {
      expect(files).toContain(`https://www.stocksbrew.online/sitemaps/${family}.xml`);
    }
    for (const file of files) {
      expect(file).toMatch(/^https:\/\/www\.stocksbrew\.online\/sitemaps\/[a-z]+\.xml$/);
    }
  });

  it("serves each family as a urlset and refuses anything else", async () => {
    const response = await GET_FAMILY(new Request("https://www.stocksbrew.online/sitemaps/blog.xml"), { params: { family: "blog.xml" } });
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://www.stocksbrew.online/blog</loc>");
    for (const family of ["nope.xml", "blog", "../blog.xml"]) {
      const missing = await GET_FAMILY(new Request("https://www.stocksbrew.online/sitemaps/x"), { params: { family } });
      expect(missing.status, family).toBe(404);
    }
  });

  it("lists each address once, stays under the per-file limit and lists exactly the indexable stock pages", async () => {
    const paths = await allPaths();
    expect(new Set(paths).size).toBe(paths.length);
    for (const family of SITEMAP_FAMILIES) expect((await entries(family)).length, family).toBeLessThanOrEqual(50_000);
    // The stocks family and the stock page's robots tag apply the same rule (stockHasCurrentRead) to the same snapshot.
    const coverage = await getCoverage().catch(() => null);
    if (coverage) {
      expect((await entries("stocks")).map((entry) => entry.path)).toEqual(indexableStockSymbols(coverage).map((ticker) => `/stock/${ticker}`));
    }
    for (const place of ["/", "/briefing", "/calendar", "/screener", "/follow", "/agents", "/pricing", "/docs", "/blog", "/themes", "/strategies", "/markets"]) {
      expect(paths).toContain(place);
    }
  });

  it("only gives a date it holds: a plain day, never in the future", async () => {
    const today = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    for (const family of SITEMAP_FAMILIES) {
      for (const entry of await entries(family)) {
        if (entry.lastmod === undefined) continue;
        expect(entry.lastmod, entry.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.lastmod <= today, entry.path).toBe(true);
      }
    }
  });

  it("never lists an address that only redirects, or one that is closed to crawlers", async () => {
    const caught = matcher(await redirects());
    for (const path of await allPaths()) {
      const bare = path.split("?")[0]!;
      expect(caught(bare), path).toBe(false);
      expect(CLOSED.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`)), path).toBe(false);
    }
  });
});

describe("redirect map", () => {
  it("has one rule per source", async () => {
    const sources = (await redirects()).map((rule) => rule.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("never chains: no destination is itself redirected", async () => {
    const rules = await redirects();
    const caught = matcher(rules);
    for (const rule of rules) {
      // A destination that carries a parameter (/stock/:ticker) is checked by its fixed part.
      const bare = rule.destination.split("?")[0]!;
      const fixed = bare.includes(":") ? bare.slice(0, bare.indexOf(":")) : bare;
      expect(caught(fixed), `${rule.source} -> ${rule.destination}`).toBe(false);
    }
  });

  it("never lands on a page that is noindex or closed to crawlers", async () => {
    for (const rule of await redirects()) {
      const bare = rule.destination.split("?")[0]!;
      const label = `${rule.source} -> ${rule.destination}`;
      expect(CLOSED.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`)), label).toBe(false);
      // Blog posts that have not been reviewed are noindex.
      const post = /^\/blog\/([^/:]+)$/.exec(bare);
      if (post) expect(isIndexableBlogPost(post[1]!), label).toBe(true);
      // Per-ticker destinations decide indexing from their own data. Only these two families may carry a parameter.
      if (bare.includes(":")) {
        expect(/^\/(stock|calendar\/earnings)\/:ticker$|^\/docs\/compare\/stocksbrew-vs-:tool$/.test(bare), label).toBe(true);
      }
    }
  });

  it("keeps the specific sector and use-case rules ahead of their catch-alls", async () => {
    const sources = (await redirects()).map((rule) => rule.source);
    for (const [specific, general] of [
      ["/sector/semiconductors", "/sector/:slug"],
      ["/use-cases/earnings-season", "/use-cases/:path*"],
    ] as const) {
      expect(sources.indexOf(specific)).toBeGreaterThanOrEqual(0);
      expect(sources.indexOf(specific)).toBeLessThan(sources.indexOf(general));
    }
  });
});
