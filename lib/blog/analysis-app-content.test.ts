import { describe, expect, it } from "vitest";

import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { analysisAppBlogContent } from "@/lib/blog/analysis-app-content";

const TARGET_SLUGS = [
  "best-stock-analysis-apps-2026",
  "us-stock-market-analysis-daily-workflow-2026",
  "ai-stock-analysis-comparison",
  "free-stock-market-analysis-tools",
  "stock-analysis-app-checklist",
] as const;

describe("stock analysis app SEO cluster", () => {
  it("keeps all five source-reviewed guides indexable and substantial", () => {
    for (const slug of TARGET_SLUGS) {
      const post = allBlogPosts.find((candidate) => candidate.slug === slug);
      const content = analysisAppBlogContent[slug];

      expect(post, slug).toBeDefined();
      expect(isIndexableBlogPost(slug), slug).toBe(true);
      expect(content.length, slug).toBeGreaterThan(10_000);
      expect(content, slug).toContain('class="source-note"');
      expect(content, slug).toContain('<h2 id="faq">Frequently asked questions</h2>');
      expect(content, slug).toMatch(/https:\/\/(www\.)?(sec\.gov|investor\.gov|finra\.org)/);
      expect(post?.faqs?.length, slug).toBeGreaterThanOrEqual(3);
      for (const faq of post?.faqs ?? []) {
        expect(content, `${slug}: ${faq.question}`).toContain(`<h3>${faq.question}</h3>`);
        expect(content, `${slug}: ${faq.answer}`).toContain(`<p>${faq.answer}</p>`);
      }
    }
  });

  it("uses unique titles and descriptions for distinct search intents", () => {
    const posts = TARGET_SLUGS.map((slug) => allBlogPosts.find((post) => post.slug === slug));
    expect(new Set(posts.map((post) => post?.seoTitle ?? post?.title)).size).toBe(TARGET_SLUGS.length);
    expect(new Set(posts.map((post) => post?.description)).size).toBe(TARGET_SLUGS.length);
  });
});
