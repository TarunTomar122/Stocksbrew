import { describe, expect, it } from "vitest";

import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { financialMetricsBlogContent } from "@/lib/blog/financial-metrics-content";

const TARGET_SLUGS = [
  "what-is-a-good-pe-ratio",
  "free-cash-flow-vs-net-income",
  "gross-margin-vs-operating-margin-vs-net-margin",
] as const;

describe("financial metrics SEO cluster", () => {
  it("publishes substantial, sourced articles for each search intent", () => {
    for (const slug of TARGET_SLUGS) {
      const post = allBlogPosts.find((candidate) => candidate.slug === slug);
      const content = financialMetricsBlogContent[slug];

      expect(post, slug).toBeDefined();
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(content.length, slug).toBeGreaterThan(9_000);
      expect(content, slug).toContain('class="article-summary"');
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toContain('class="cta-section"');
      expect(content, slug).toMatch(/https:\/\/(www\.)?(sec\.gov|investor\.gov|cfainstitute\.org)/);
      expect(post?.faqs?.length, slug).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps titles, descriptions, and primary targets distinct", () => {
    const posts = TARGET_SLUGS.map((slug) => allBlogPosts.find((post) => post.slug === slug));

    expect(new Set(posts.map((post) => post?.seoTitle)).size).toBe(TARGET_SLUGS.length);
    expect(new Set(posts.map((post) => post?.description)).size).toBe(TARGET_SLUGS.length);
    expect(posts.every((post) => (post?.description.length ?? 0) <= 160)).toBe(true);
  });

  it("cross-links the topic cluster and stock catalogue", () => {
    expect(financialMetricsBlogContent["what-is-a-good-pe-ratio"]).toContain('/blog/free-cash-flow-vs-net-income');
    expect(financialMetricsBlogContent["free-cash-flow-vs-net-income"]).toContain('href="/stocks"');
    expect(financialMetricsBlogContent["gross-margin-vs-operating-margin-vs-net-margin"]).toContain('/blog/what-is-a-good-pe-ratio');
    expect(financialMetricsBlogContent["gross-margin-vs-operating-margin-vs-net-margin"]).toContain('/blog/free-cash-flow-vs-net-income');
  });
});
