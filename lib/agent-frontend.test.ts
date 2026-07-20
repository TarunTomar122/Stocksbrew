import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getBlogContent } from "@/lib/blog";
import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";

const AGENT_BLOGS = [
  "how-to-connect-ai-agent-stock-market-data-mcp",
  "stock-research-prompts-for-ai-agents",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("agent access frontend launch surfaces", () => {
  it("keeps the primary conversion surfaces connected to the agent story", () => {
    expect(source("app/page.tsx")).toContain("AgentAccessLandingSection");
    expect(source("components/pro-plan-picker.tsx")).toContain("AgentClientLogos");
    expect(source("components/subscribe-pricing.tsx")).toContain("Agent access");
    expect(source("components/stock-page-stream.tsx")).toContain("StockAgentAccessCta");
    expect(source("app/profile/page.tsx")).toContain('id="agent-access"');
  });

  it("publishes an indexable agent page without replacing the investor-first primary navigation", () => {
    expect(source("components/header.tsx")).not.toContain('href: "/agents"');
    expect(source("components/footer.tsx")).toContain('href: "/agents"');
    expect(source("app/sitemap.xml/route.ts")).toContain('"/agents"');
    expect(source("app/agents/page.tsx")).toContain('"@type": "FAQPage"');
    expect(source("components/terminal-landing-hero-copy.tsx")).not.toContain("AI agent access");
  });

  it("ships two complete, indexable SEO articles", () => {
    for (const slug of AGENT_BLOGS) {
      expect(allBlogPosts.some((post) => post.slug === slug)).toBe(true);
      expect(isIndexableBlogPost(slug)).toBe(true);
      const content = getBlogContent(slug);
      expect(content).not.toContain("Content coming soon");
      expect(content.length).toBeGreaterThan(5_000);
      expect(content).toContain('href="/agents"');
    }
  });

  it("shows the requested client names in the shared logo strip", () => {
    const logos = source("components/agent-client-logos.tsx");
    expect(logos).toContain("Claude Code");
    expect(logos).toContain("Cursor");
    expect(logos).toContain("Codex");
    expect(logos).toContain("Your agent");
  });
});
