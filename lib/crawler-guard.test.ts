import { describe, expect, it } from "vitest";
import { GET as robotsTxt } from "@/app/robots.txt/route";
import { BLOCKED_ROBOTS_NAMES, crawlerOf, crawlerVerdict, isFilterView, takeCrawlToken } from "./crawler-guard";
import { CALENDAR_TYPES } from "./calendar-shared";

const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)";
const PERPLEXITY = "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const MJ12 = "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CUBOT_PHONE = "Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

const params = (query: string) => new URLSearchParams(query);
const verdict = (ua: string, url: string, now = 0, store = new Map()) => {
  const parsed = new URL(url, "https://www.stocksbrew.online");
  return crawlerVerdict({ userAgent: ua, pathname: parsed.pathname, searchParams: parsed.searchParams }, now, store);
};

describe("crawlerOf", () => {
  it("names the crawlers from the Nov 14 logs", () => {
    expect(crawlerOf(GPTBOT)).toEqual({ family: "gptbot", kind: "ai" });
    expect(crawlerOf(PERPLEXITY)).toEqual({ family: "perplexity", kind: "ai" });
    expect(crawlerOf(GOOGLEBOT)).toEqual({ family: "google", kind: "search" });
    expect(crawlerOf(MJ12)).toEqual({ family: "mj12bot", kind: "blocked" });
  });

  it("leaves people, link previews and fetches a person asked for alone", () => {
    expect(crawlerOf(CHROME)).toBeNull();
    expect(crawlerOf(CUBOT_PHONE)).toBeNull();
    expect(crawlerOf("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBeNull();
    expect(crawlerOf("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot")).toBeNull();
    expect(crawlerOf("Twitterbot/1.0")).toBeNull();
    expect(crawlerOf(null)).toBeNull();
    expect(crawlerOf("")).toBeNull();
  });

  it("puts every unknown self-declared bot in one slow family, named from outside its URL", () => {
    expect(crawlerOf("Mozilla/5.0 (compatible; NewThingBot/2.0; +https://example.com/info)")).toEqual({ family: "other", kind: "ai" });
    expect(crawlerOf("Mozilla/5.0 (compatible; Something/1.0; +https://example.com/bot.html)")).toBeNull();
    expect(crawlerOf("Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1; +http://ahrefs.com/robot/site-audit)")?.kind).toBe("blocked");
  });

  it("blocks in middleware every scraper robots.txt shuts out", () => {
    for (const name of BLOCKED_ROBOTS_NAMES) {
      expect(crawlerOf(`Mozilla/5.0 (compatible; ${name}/1.0; +https://example.com/)`)?.kind, name).toBe("blocked");
    }
  });
});

describe("isFilterView", () => {
  it("is any query beyond sharing tags and the calendar types the sitemap lists", () => {
    expect(isFilterView("/news", params("ticker=NU&topic=product"))).toBe(true);
    expect(isFilterView("/calendar", params("day=2030-07-18&type=economic&view=list"))).toBe(true);
    expect(isFilterView("/calendar", params("type=ipo&w=2026-11-17"))).toBe(true);
    expect(isFilterView("/calendar", params("type=earnings"))).toBe(false);
    expect(isFilterView("/calendar", params("type=bogus"))).toBe(true);
    expect(isFilterView("/stock/NVDA", params(""))).toBe(false);
    expect(isFilterView("/stock/NVDA", params("utm_source=x&ref=share"))).toBe(false);
    expect(isFilterView("/calendar", params("type=earnings&utm_source=x"))).toBe(false);
    expect(isFilterView("/calendar", params("type=earnings&type=ipo"))).toBe(true);
    expect(isFilterView("/stock/NVDA", params("_rsc=abc&tab=news"))).toBe(true);
  });

  it("lets crawlers read every filter view with a page of its own: the sitemap's and the screener's canonicals", () => {
    for (const type of CALENDAR_TYPES) expect(isFilterView("/calendar", params(`type=${type.id}`)), type.id).toBe(false);
    expect(isFilterView("/screener", params("tab=sectors"))).toBe(false);
    expect(isFilterView("/screener", params("preset=dividend-growers"))).toBe(false);
    expect(isFilterView("/screener", params("sector=technology"))).toBe(false);
    expect(isFilterView("/screener", params("sector=technology&sort=pe"))).toBe(true);
    expect(isFilterView("/screener", params("tab=movers"))).toBe(true);
  });
});

describe("takeCrawlToken", () => {
  it("allows a burst, then refills at the family's rate", () => {
    const store = new Map();
    const gpt = { family: "gptbot", kind: "ai" as const };
    for (let i = 0; i < 10; i += 1) expect(takeCrawlToken(gpt, 0, store)).toBe(true);
    expect(takeCrawlToken(gpt, 0, store)).toBe(false);
    // 0.5 a second: one more page after two seconds, not before.
    expect(takeCrawlToken(gpt, 1_000, store)).toBe(false);
    expect(takeCrawlToken(gpt, 3_000, store)).toBe(true);
    // Another family has its own allowance.
    expect(takeCrawlToken({ family: "claudebot", kind: "ai" }, 3_000, store)).toBe(true);
  });

  it("caps the AI crawlers together, not only one by one", () => {
    const store = new Map();
    let allowed = 0;
    for (const family of ["gptbot", "claudebot", "perplexity", "other"]) {
      for (let i = 0; i < 10; i += 1) if (takeCrawlToken({ family, kind: "ai" }, 0, store)) allowed += 1;
    }
    expect(allowed).toBe(15);
    // Search engines keep their own allowance.
    expect(takeCrawlToken({ family: "google", kind: "search" }, 0, store)).toBe(true);
  });

  it("never lets a clock step back add pages", () => {
    const store = new Map();
    const bot = { family: "x", kind: "ai" as const };
    for (let i = 0; i < 10; i += 1) takeCrawlToken(bot, 10_000, store);
    expect(takeCrawlToken(bot, 0, store)).toBe(false);
  });
});

describe("crawlerVerdict", () => {
  it("refuses the filter combinations GPTBot and PerplexityBot crawled", () => {
    expect(verdict(GPTBOT, "/news?ticker=NU&topic=product")?.status).toBe(403);
    expect(verdict(PERPLEXITY, "/calendar?day=2030-07-18&type=economic&view=list")?.status).toBe(403);
    expect(verdict(GOOGLEBOT, "/calendar?type=dividend")).toBeNull();
  });

  it("refuses SEO scrapers everywhere but robots.txt", () => {
    expect(verdict(MJ12, "/stock/AMD")?.status).toBe(403);
    expect(verdict(MJ12, "/robots.txt")).toBeNull();
  });

  it("rate-limits a crawler on real pages, never a person", () => {
    const store = new Map();
    const results = Array.from({ length: 12 }, () => verdict(GPTBOT, "/stock/AMD", 0, store)?.status ?? 200);
    expect(results.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(results.slice(10)).toEqual([429, 429]);
    expect(verdict(CHROME, "/news?ticker=NU&topic=product", 0, store)).toBeNull();
    // robots.txt and the sitemaps stay readable even when the allowance is spent.
    expect(verdict(GPTBOT, "/robots.txt", 0, store)).toBeNull();
    expect(verdict(GPTBOT, "/sitemaps/stocks.xml", 0, store)).toBeNull();
  });
});

/** RFC 9309 matching, enough for this file: longest rule wins, Allow on a tie; `*` any run, `$` end. */
function robotsAllows(body: string, agent: string, url: string): boolean {
  const groups = body.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    const agents = lines.filter((line) => /^user-agent:/i.test(line)).map((line) => line.split(":")[1]!.trim().toLowerCase());
    const rules = lines
      .filter((line) => /^(allow|disallow):/i.test(line))
      .map((line) => ({ allow: /^allow/i.test(line), path: line.slice(line.indexOf(":") + 1).trim() }));
    return { agents, rules };
  });
  const group = groups.find((entry) => entry.agents.includes(agent.toLowerCase())) ?? groups.find((entry) => entry.agents.includes("*"))!;
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    const pattern = new RegExp(`^${rule.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    if (!pattern.test(url)) continue;
    if (!best || rule.path.length > best.length || (rule.path.length === best.length && rule.allow)) best = { allow: rule.allow, length: rule.path.length };
  }
  return best?.allow ?? true;
}

describe("robots.txt", () => {
  it("keeps pages, listed views, the favicon and share images open, and filter views closed", async () => {
    const body = await robotsTxt().text();
    for (const agent of ["Googlebot", "GPTBot"]) {
      for (const url of ["/stock/NVDA", "/calendar?type=ipo", "/screener?tab=sectors", "/screener?sector=technology", "/icon.svg?abc123", "/api/og/stock/X?v=4&d=2026-11-13", "/calendar/earnings/NU"]) {
        expect(robotsAllows(body, agent, url), `${agent} ${url}`).toBe(true);
      }
      for (const url of ["/news?ticker=NU&topic=product", "/calendar?day=2030-07-18&view=list", "/calendar?type=ipo&w=2026-11-17", "/api/watchlist", "/admin"]) {
        expect(robotsAllows(body, agent, url), `${agent} ${url}`).toBe(false);
      }
    }
    expect(robotsAllows(body, "MJ12bot", "/stock/NVDA")).toBe(false);
  });
});
