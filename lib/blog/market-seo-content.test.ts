import { describe, expect, it } from "vitest";

import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { marketSeoBlogContent } from "@/lib/blog/market-seo-content";

const TARGET_SLUGS = [
  "semiconductor-stocks-analysis-guide",
  "earnings-report-analysis-template",
  "fundamental-stock-analysis-framework",
  "analyst-ratings-price-targets-explained",
  "stock-news-catalyst-analysis",
] as const;

describe("market SEO topic cluster", () => {
  it("keeps every guide substantial, sourced, and indexable", () => {
    for (const slug of TARGET_SLUGS) {
      const post = allBlogPosts.find((candidate) => candidate.slug === slug);
      const content = marketSeoBlogContent[slug];

      expect(post, slug).toBeDefined();
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(content.length, slug).toBeGreaterThan(6_000);
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toMatch(/https:\/\/(www\.)?(sec\.gov|investor\.gov|finra\.org)/);
      expect(post?.faqs?.length, slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses distinct search intent and metadata", () => {
    const posts = TARGET_SLUGS.map((slug) => allBlogPosts.find((post) => post.slug === slug));
    expect(new Set(posts.map((post) => post?.seoTitle ?? post?.title)).size).toBe(TARGET_SLUGS.length);
    expect(new Set(posts.map((post) => post?.description)).size).toBe(TARGET_SLUGS.length);
  });
});
