import { describe, expect, it } from "vitest";

import { getBlogContent } from "@/lib/blog";
import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { alternativesBlogContent } from "@/lib/blog/alternatives-content";
import { getBlogCompareLinks } from "@/lib/seo/compare-links";

const ALTERNATIVES = ["cnbc-alternatives", "marketwatch-alternatives", "seeking-alpha-alternatives", "yahoo-finance-alternatives", "stocksbrew-alternatives"] as const;

/** Posts whose titles and descriptions were rewritten for the queries they rank on (Search Console, Nov 2026). */
const REFRESHED = [
  "best-stock-watchlist-apps-2026",
  "best-stock-news-apps-2026",
  "best-stock-research-websites-2026",
  "best-stock-analysis-apps-2026",
  "finviz-vs-tradingview-vs-stocksbrew",
  "analyst-ratings-price-targets-explained",
  "gross-margin-vs-operating-margin-vs-net-margin",
] as const;

const post = (slug: string) => allBlogPosts.find((candidate) => candidate.slug === slug);
const words = (text: string) => text.trim().split(/\s+/).length;
/** The article opens on a plain answer paragraph: no label, no summary card above it. */
const opensOnAnswer = (html: string) => {
  const first = html.trimStart();
  return first.startsWith("<p>") && !first.startsWith("<p><strong>") && !html.includes('class="article-summary"');
};

describe("alternatives guides", () => {
  it("are indexable, substantial, sourced and free of affiliate links", () => {
    for (const slug of ALTERNATIVES) {
      const meta = post(slug);
      const content = alternativesBlogContent[slug];
      expect(meta, slug).toBeDefined();
      expect(meta?.category, slug).toBe("comparison");
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(getBlogContent(slug), slug).toBe(content);
      expect(content.length, slug).toBeGreaterThan(6_000);
      expect(content, slug).toContain('class="table-scroll"');
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toContain('class="cta-section"');
      expect(content, slug).toContain("no affiliate links");
      expect(meta?.faqs?.length, slug).toBeGreaterThanOrEqual(4);
    }
  });

  it("open on the answer, then link to related posts and a product page", () => {
    for (const slug of ALTERNATIVES) {
      const content = alternativesBlogContent[slug];
      expect(opensOnAnswer(content), slug).toBe(true);
      const internal = [...content.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);
      const blogLinks = new Set(internal.filter((href) => href.startsWith("/blog/") && href !== `/blog/${slug}`));
      expect(blogLinks.size, slug).toBeGreaterThanOrEqual(2);
      for (const href of blogLinks) expect(isIndexableBlogPost(href.slice("/blog/".length)), href).toBe(true);
      expect(internal.some((href) => /^\/(screener|stock\/|follow|portfolio|briefing|news|compare)/.test(href)), slug).toBe(true);
    }
  });

  it("never interpolates an undefined value or uses an em dash", () => {
    for (const slug of ALTERNATIVES) {
      const content = alternativesBlogContent[slug];
      expect(content, slug).not.toMatch(/undefined|NaN|\$\{/);
      expect(content, slug).not.toContain("—");
    }
  });

  it("each points its footer at the matching comparison pages", () => {
    for (const slug of ALTERNATIVES) {
      expect(getBlogCompareLinks(slug).length, slug).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("search metadata for the alternatives and refreshed posts", () => {
  it("keeps titles and descriptions inside what Google shows, and unique", () => {
    const slugs = [...ALTERNATIVES, ...REFRESHED];
    const metas = slugs.map((slug) => post(slug));
    for (const [index, meta] of metas.entries()) {
      const slug = slugs[index];
      expect(meta, slug).toBeDefined();
      expect((meta?.seoTitle ?? "").length, slug).toBeGreaterThan(0);
      expect((meta?.seoTitle ?? "").length, slug).toBeLessThanOrEqual(60);
      expect(meta?.description.length ?? 0, slug).toBeLessThanOrEqual(155);
      // Owner rule: an on-page title is at most ten words.
      expect(words(meta?.title ?? ""), slug).toBeLessThanOrEqual(10);
      // The line under the on-page title stays one short line.
      expect(meta?.lede, slug).toBeDefined();
      expect(words(meta?.lede ?? ""), slug).toBeLessThanOrEqual(15);
      expect(`${meta?.title} ${meta?.seoTitle} ${meta?.description}`, slug).not.toContain("—");
    }
    expect(new Set(metas.map((meta) => meta?.seoTitle)).size).toBe(slugs.length);
    expect(new Set(metas.map((meta) => meta?.description)).size).toBe(slugs.length);
  });

  it("puts the query's words first in the search title", () => {
    expect(post("cnbc-alternatives")?.seoTitle).toMatch(/CNBC Alternatives/);
    expect(post("marketwatch-alternatives")?.seoTitle).toMatch(/MarketWatch Alternatives/);
    expect(post("stocksbrew-alternatives")?.seoTitle).toMatch(/^stocksbrew Alternatives/);
    expect(post("finviz-vs-tradingview-vs-stocksbrew")?.seoTitle).toMatch(/^Finviz vs TradingView/);
    expect(post("best-stock-watchlist-apps-2026")?.seoTitle).toMatch(/Stock Watchlist Apps in 2026/);
  });

  it("opens every refreshed post with a direct answer", () => {
    for (const slug of REFRESHED) {
      expect(opensOnAnswer(getBlogContent(slug)), slug).toBe(true);
      expect(post(slug)?.updated, slug).toBe("2026-11-22");
    }
  });
});
