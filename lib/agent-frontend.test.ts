import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getBlogContent } from "@/lib/blog";
import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";

const AGENT_BLOGS = [
  "how-to-connect-ai-agent-stock-market-data-mcp",
  "stock-research-prompts-for-ai-agents",
  "hermes-agent-stock-market-data-watchlist",
  "openclaw-stock-alerts-telegram-whatsapp-discord",
  "ai-agent-stock-watchlist-radar-alerts",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("agent access frontend launch surfaces", () => {
  it("keeps the primary conversion surfaces connected to the agent story", () => {
    expect(source("components/public-home-page.tsx")).not.toContain("AgentAccessLandingSection");
    expect(source("app/agents/page.tsx")).toContain("Let your agent keep up with your stocks");
    expect(source("components/pro-plan-picker.tsx")).toContain("Current stock context for your AI");
    expect(source("lib/subscribe-benefits.ts")).toContain("Current stock context for your AI");
    expect(source("app/profile/page.tsx")).toContain('id="agent-access"');
  });

  it("publishes an indexable agent page without replacing the investor-first primary navigation", () => {
    expect(source("components/header.tsx")).not.toContain('href: "/agents"');
    expect(source("components/footer.tsx")).toContain('href: "/agents"');
    expect(source("app/sitemap.xml/route.ts")).toContain('"/agents"');
    expect(source("app/agents/page.tsx")).toContain('"@type": "WebAPI"');
    expect(source("app/agents/page.tsx")).toContain('"@type": "FAQPage"');
    expect(source("components/terminal-landing-hero-copy.tsx")).not.toContain("AI agent access");
  });

  it("uses an outcome-led explanation and a real missing-research flow", () => {
    expect(source("components/agent-access-marketing.tsx")).toContain("AgentSetupPrompt");
    expect(source("components/agent-access-marketing.tsx")).not.toContain('bg-[#07110c]');
    expect(source("components/agent-access-marketing.tsx")).toContain("Let your agent keep up with your stocks");
    expect(source("app/agents/page.tsx")).toContain("Research any stock");
    expect(source("app/developers/page.tsx")).toContain("Stock detail, market context, Watchlist and alerts for your agent");
    expect(source("app/developers/page.tsx")).toContain("Connect with one prompt");
    expect(source("components/agent-access-card.tsx")).toContain("Connect Stocksbrew");
  });

  it("makes the full Watchlist and alert workflow explicit", () => {
    expect(source("components/agent-access-marketing.tsx")).toContain("Watchlist");
    expect(source("lib/agent-setup-prompt.ts")).toContain("Watchlist");
    expect(source("app/developers/page.tsx")).toContain("add_to_radar");
    expect(source("app/developers/page.tsx")).toContain("create_alert");
  });

  it("ships a safe, copyable setup prompt that agents can act on", () => {
    const prompt = source("lib/agent-setup-prompt.ts");
    expect(prompt).toContain("https://www.stocksbrew.online/api/mcp");
    expect(prompt).toContain("Use OAuth");
    expect(prompt).toContain("get_explore");
    expect(prompt).toContain("get_market_history");
    expect(prompt).toContain("get_stock_detail");
    expect(prompt).toContain("get_screens");
    expect(prompt).toContain("not enough current evidence");
    expect(prompt).toContain("Never ask me to paste an access token into chat");
  });

  it("targets the intended AI stock search language with useful visible sections", () => {
    const agents = source("app/agents/page.tsx");
    expect(agents).toContain("AI Stock Agent for Research, Watchlist, and Alerts");
    expect(agents).toContain("stock market MCP server");
    expect(agents).toContain("Hermes stock research");
    expect(agents).toContain("OpenClaw stock research");
    expect(agents).toContain("Telegram stock research bot");
    expect(agents).toContain("Claude Code stock analysis");
    const indexNow = source("lib/seo/indexnow.ts");
    expect(indexNow).toContain('"/agents"');
    expect(indexNow).toContain('"/developers"');
    expect(indexNow).toContain('"/blog/how-to-connect-ai-agent-stock-market-data-mcp"');
    expect(indexNow).toContain('"/blog/stock-research-prompts-for-ai-agents"');
    expect(indexNow).toContain('"/blog/hermes-agent-stock-market-data-watchlist"');
    expect(indexNow).toContain('"/blog/openclaw-stock-alerts-telegram-whatsapp-discord"');
  });

  it("ships the complete, indexable agent SEO collection", () => {
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
    expect(logos).toContain("Hermes");
    expect(logos).toContain("OpenClaw");
    expect(logos).toContain("Telegram");
  });
});
