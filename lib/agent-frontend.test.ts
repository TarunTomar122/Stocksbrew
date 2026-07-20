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

  it("uses a documentation-led agent experience instead of nested terminal cards", () => {
    expect(source("components/agent-access-marketing.tsx")).toContain("AgentResearchWalkthrough");
    expect(source("components/agent-access-marketing.tsx")).toContain("AgentSetupPrompt");
    expect(source("components/agent-access-marketing.tsx")).not.toContain('bg-[#07110c]');
    expect(source("app/agents/page.tsx")).toContain("Agent guide");
    expect(source("app/agents/page.tsx")).toContain("From one question to a decision brief");
    expect(source("app/developers/page.tsx")).toContain("Stocksbrew docs");
    expect(source("app/developers/page.tsx")).toContain("The one-prompt setup");
    expect(source("components/agent-access-card.tsx")).toContain("Connect with one prompt");
  });

  it("ships a safe, copyable setup prompt that agents can act on", () => {
    const prompt = source("lib/agent-setup-prompt.ts");
    expect(prompt).toContain("https://www.stocksbrew.online/api/mcp");
    expect(prompt).toContain("Use OAuth");
    expect(prompt).toContain("Do not ask me to paste a personal access token into chat");
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
