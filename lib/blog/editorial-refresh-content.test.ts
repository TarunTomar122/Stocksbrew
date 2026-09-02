import { describe, expect, it } from "vitest";

import { getBlogContent } from "@/lib/blog";
import { allBlogPosts, indexableBlogPosts, isIndexableBlogPost, REVIEWED_BLOG_SLUGS } from "@/lib/blog-data";

const REWRITTEN = [
  "watchlist-vs-portfolio-tracker",
  "earnings-season-watchlist-playbook",
  "track-stock-news-for-your-portfolio",
] as const;

describe("editorial indexing gate", () => {
  it("indexes only articles that passed editorial review", () => {
    expect(indexableBlogPosts).toHaveLength(REVIEWED_BLOG_SLUGS.size);
    expect(REVIEWED_BLOG_SLUGS.size).toBe(29);
    expect(allBlogPosts.length).toBeGreaterThan(REVIEWED_BLOG_SLUGS.size);
    for (const post of indexableBlogPosts) {
      expect(REVIEWED_BLOG_SLUGS.has(post.slug), post.slug).toBe(true);
      expect(getBlogContent(post.slug), post.slug).not.toContain("Content coming soon");
    }
    expect(isIndexableBlogPost("stock-market-information-overload")).toBe(false);
  });

  it("keeps the rewritten intent guides substantial and visibly sourced", () => {
    for (const slug of REWRITTEN) {
      const content = getBlogContent(slug);
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(content.length, slug).toBeGreaterThan(5_000);
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toContain('class="cta-section"');
      expect(content, slug).toMatch(/https:\/\/(?:www\.)?(?:sec\.gov|investor\.gov|finra\.org)/);
    }
  });
});
