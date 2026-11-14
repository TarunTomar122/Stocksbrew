import { describe, expect, it } from "vitest";
import { crawlerOf, crawlerVerdict, isFilterView, takeCrawlToken } from "./crawler-guard";

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
    expect(crawlerOf(PERPLEXITY)).toEqual({ family: "perplexity", kind: "search" });
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

  it("treats an unknown self-declared bot as a slow crawler", () => {
    expect(crawlerOf("Mozilla/5.0 (compatible; NewThingBot/2.0; +https://example.com/bot)")).toEqual({ family: "newthingbot", kind: "ai" });
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
