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
    expect(source("components/public-home-page.tsx")).toContain("AgentAccessLandingStrip");
    expect(source("components/pro-plan-picker.tsx")).toContain("Current stock context for your AI");
    expect(source("lib/subscribe-benefits.ts")).toContain("Current stock context for your AI");
    expect(source("app/profile/page.tsx")).toContain('id="agent-access"');
  });

  it("publishes an indexable agent page without replacing the investor-first primary navigation", () => {
    expect(source("components/header.tsx")).not.toContain('href: "/agents"');
    expect(source("components/footer.tsx")).toContain('href: "/agents"');
    expect(source("app/sitemap.xml/route.ts")).toContain('"/agents"');
    expect(source("app/agents/page.tsx")).toContain('"@type": "WebAPI"');
    expect(source("app/agents/page.tsx")).not.toContain('"@type": "FAQPage"');
    expect(source("components/terminal-landing-hero-copy.tsx")).not.toContain("AI agent access");
  });

  it("uses a concise before-and-after explanation instead of a fake terminal", () => {
    expect(source("components/agent-access-marketing.tsx")).toContain("AgentResearchWalkthrough");
    expect(source("components/agent-access-marketing.tsx")).toContain("AgentSetupPrompt");
    expect(source("components/agent-access-marketing.tsx")).not.toContain('bg-[#07110c]');
    expect(source("components/agent-access-marketing.tsx")).toContain("Give your AI current stock context");
    expect(source("components/agent-research-walkthrough.tsx")).toContain("Without a data connection");
    expect(source("components/agent-research-walkthrough.tsx")).toContain("With Stocksbrew connected");
    expect(source("app/agents/page.tsx")).toContain("Same question. Better context.");
    expect(source("app/developers/page.tsx")).toContain("Stocksbrew docs");
    expect(source("app/developers/page.tsx")).toContain("Connect with one prompt");
    expect(source("components/agent-access-card.tsx")).toContain("Connect Stocksbrew");
  });

  it("keeps Radar out of the primary agent pitch", () => {
    expect(source("components/agent-access-marketing.tsx")).not.toContain("Radar");
    expect(source("components/agent-research-walkthrough.tsx")).not.toContain("Radar");
    expect(source("lib/agent-setup-prompt.ts")).not.toContain("Radar");
  });

  it("ships a safe, copyable setup prompt that agents can act on", () => {
    const prompt = source("lib/agent-setup-prompt.ts");
    expect(prompt).toContain("https://www.stocksbrew.online/api/mcp");
    expect(prompt).toContain("Use OAuth");
    expect(prompt).toContain("Never ask me to paste an access token into chat");
  });

  it("targets the intended AI stock search language with useful visible sections", () => {
    const agents = source("app/agents/page.tsx");
    expect(agents).toContain("AI agent for stock analysis");
    expect(agents).toContain("Current stock data for AI");
    expect(agents).toContain("Stock market MCP server");
    expect(agents).toContain("Structured stock data API");
    expect(agents).toContain("ChatGPT stock analysis with a data layer");
    expect(agents).toContain("Claude, Cursor, and Codex stock research");
    const indexNow = source("lib/seo/indexnow.ts");
    expect(indexNow).toContain('"/agents"');
    expect(indexNow).toContain('"/developers"');
    expect(indexNow).toContain('"/blog/how-to-connect-ai-agent-stock-market-data-mcp"');
    expect(indexNow).toContain('"/blog/stock-research-prompts-for-ai-agents"');
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
