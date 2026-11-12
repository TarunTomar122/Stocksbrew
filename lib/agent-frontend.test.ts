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
    // /agents is the standing jobs page now. The connect-your-own-agent story lives at /developers.
    expect(source("app/(app)/agents/page.tsx")).toContain('import AgentJobsPage from "./jobs/page"');
    expect(source("app/(app)/developers/page.tsx")).toContain("Reads your research and your portfolio. It cannot trade.");
    expect(source("components/pro-plan-picker.tsx")).toContain("Current stock context for your AI");
    expect(source("lib/subscribe-benefits.ts")).toContain("Current stock context for your AI");
    expect(source("app/(app)/profile/page.tsx")).toContain('id="agent-access"');
  });

  it("publishes an indexable agent page without replacing the investor-first primary navigation", () => {
    expect(source("components/footer.tsx")).toContain('href: "/agents"');
    expect(source("lib/seo/sitemap.ts")).toContain('"/agents"');
    // The canonical (/agents) comes from lib/seo/tool-pages.ts; lib/seo/tool-pages.test.ts checks it on the built metadata.
    expect(source("app/(app)/agents/page.tsx")).toContain('toolPageMetadata("/agents")');
    expect(source("app/(app)/developers/page.tsx")).toContain('alternates: { canonical: "/developers" }');
    expect(source("app/(app)/developers/page.tsx")).toContain('"@type": "WebAPI"');
    expect(source("components/terminal-landing-hero-copy.tsx")).not.toContain("AI agent access");
  });

  it("uses an outcome-led explanation and a real missing-research flow", () => {
    expect(source("app/(app)/developers/page.tsx")).toContain("Reads your research and your portfolio. It cannot trade.");
    expect(source("app/(app)/developers/page.tsx")).toContain("Connect with one prompt");
  });

  it("makes the full Watchlist and alert workflow explicit", () => {
    expect(source("lib/agent-setup-prompt.ts")).toContain("Watchlist");
    expect(source("app/(app)/developers/page.tsx")).toContain("add_to_radar");
    expect(source("app/(app)/developers/page.tsx")).toContain("create_alert");
  });

  it("ships a safe, copyable setup prompt that agents can act on", () => {
    const prompt = source("lib/agent-setup-prompt.ts");
    expect(prompt).toContain("https://www.stocksbrew.online/api/mcp");
    expect(prompt).toContain("Use OAuth");
    expect(prompt).toContain("get_explore");
    expect(prompt).not.toContain("get_market_history");
    expect(prompt).toContain("get_stock_detail");
    expect(prompt).toContain("get_screens");
    expect(prompt).toContain("not enough current evidence");
    expect(prompt).toContain("Never ask me to paste an access token into chat");
    expect(prompt).toContain("Your access token stays out of the conversation");
  });

  it("targets the intended AI stock search language with useful visible sections", () => {
    // The search-targeted developer copy moved from /agents to /developers.
    const developers = source("app/(app)/developers/page.tsx");
    expect(developers).toContain("stock market MCP server");
    expect(developers).toContain("AI agent stock API");
    expect(developers).toContain("Connect Claude Code, Codex, Cursor or your own script");
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
});
