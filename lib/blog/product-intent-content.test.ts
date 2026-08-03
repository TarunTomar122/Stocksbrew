import { describe, expect, it } from "vitest";

import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { productIntentBlogContent } from "@/lib/blog/product-intent-content";

const SLUGS = [
  "best-stock-research-websites-2026",
  "best-stock-watchlist-apps-2026",
  "best-stock-news-apps-2026",
] as const;

describe("commercial-intent stock tool guides", () => {
  it("keeps every comparison substantial, sourced, and indexable", () => {
    for (const slug of SLUGS) {
      const post = allBlogPosts.find((candidate) => candidate.slug === slug);
      const content = productIntentBlogContent[slug];

      expect(post, slug).toBeDefined();
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(content.length, slug).toBeGreaterThan(8_000);
      expect(content, slug).toContain('class="table-scroll"');
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toContain('class="cta-section"');
      expect(content, slug).toMatch(/https:\/\//);
      expect(post?.faqs?.length, slug).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses unique metadata and transparent comparison language", () => {
    const posts = SLUGS.map((slug) => allBlogPosts.find((post) => post.slug === slug));
    expect(new Set(posts.map((post) => post?.seoTitle)).size).toBe(SLUGS.length);
    expect(new Set(posts.map((post) => post?.description)).size).toBe(SLUGS.length);
    expect(posts.every((post) => (post?.description.length ?? 0) <= 160)).toBe(true);
    for (const slug of SLUGS) {
      expect(productIntentBlogContent[slug]).toContain("no affiliate");
    }
  });
});
