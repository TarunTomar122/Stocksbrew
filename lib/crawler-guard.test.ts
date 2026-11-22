import { describe, expect, it } from "vitest";
import { GET as robotsTxt } from "@/app/robots.txt/route";
import {
  BLOCKED_ROBOTS_NAMES,
  SIGNED_IN_RATE,
  VISITOR_KEYS_MAX,
  VISITOR_RATE,
  crawlerOf,
  crawlerVerdict,
  isFilterView,
  isForgedReferer,
  isRouterFetch,
  takeCrawlToken,
  takeVisitorToken,
  visitorKey,
} from "./crawler-guard";
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

  it("names the crawlers from the Nov 18 logs that leave no URL", () => {
    expect(crawlerOf("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ShapBot/0.1.0")).toEqual({ family: "parallel", kind: "ai" });
    expect(crawlerOf("Lightpanda/1.0 ShapBot/0.1.0")).toEqual({ family: "parallel", kind: "ai" });
    expect(
      crawlerOf(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))",
      ),
    ).toEqual({ family: "meta", kind: "ai" });
    expect(crawlerOf("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; AzureAI-SearchBot/1.0;")).toEqual({ family: "other", kind: "ai" });
    // Still people: an old Internet Explorer and a phone whose model name ends in "bot".
    expect(crawlerOf("Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)")).toBeNull();
    expect(crawlerOf("Mozilla/5.0 (Linux; Android 9; CUBOT/X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")).toBeNull();
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

describe("visitor page rate (scrapers that pass for a browser)", () => {
  const CHROME_152 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
  const visit = (
    url: string,
    visitor: { key: string | null; signedIn?: boolean; routerRequest?: boolean; referer?: string | null; secFetchSite?: string | null; secChUa?: string | null },
    now: number,
    visitorStore: Map<string, { tokens: number; at: number }>,
    ua = CHROME_152,
  ) => {
    const parsed = new URL(url, "https://www.stocksbrew.online");
    return crawlerVerdict(
      {
        userAgent: ua,
        pathname: parsed.pathname,
        searchParams: parsed.searchParams,
        visitor: {
          key: visitor.key,
          signedIn: visitor.signedIn ?? false,
          routerRequest: visitor.routerRequest ?? false,
          referer: visitor.referer,
          secFetchSite: visitor.secFetchSite,
          secChUa: visitor.secChUa,
        },
      },
      now,
      new Map(),
      visitorStore,
    );
  };

  it("keys on CF-Connecting-IP only, IPv6 by its /64", () => {
    expect(visitorKey("203.0.113.7")).toBe("203.0.113.7");
    expect(visitorKey(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(visitorKey("2001:db8:0:12::1")).toBe("2001:db8:0:12::/64");
    expect(visitorKey("2001:0db8:0000:0012:abcd:ef01:2345:6789")).toBe("2001:db8:0:12::/64");
    expect(visitorKey("::1")).toBe("0:0:0:0::/64");
    expect(visitorKey(null)).toBeNull();
    expect(visitorKey("")).toBeNull();
    expect(visitorKey("not-an-ip")).toBeNull();
    expect(visitorKey("1:2:3")).toBeNull();
    expect(visitorKey("1::2::3")).toBeNull();
  });

  it("lets a burst through, then 429s a scraper at 100 pages a minute, and refills", () => {
    const store = new Map();
    const statuses = Array.from({ length: 100 }, (_, i) => visit(`/screener?n=${i}&sector=technology`, { key: "198.51.100.1" }, i * 600, store)?.status ?? 200);
    const served = statuses.filter((status) => status === 200).length;
    // 30 at once, plus 0.25 a second over the minute: 44 of 100.
    expect(served).toBe(VISITOR_RATE.burst + Math.floor((99 * 0.6) * VISITOR_RATE.perSecond));
    expect(statuses.at(-1)).toBe(429);
    // Another address has its own allowance; this one has a page again four seconds on.
    expect(visit("/stock/NVDA", { key: "198.51.100.2" }, 60_000, store)).toBeNull();
    expect(visit("/stock/NVDA", { key: "198.51.100.1" }, 59_400 + 4_000, store)).toBeNull();
  });

  it("tells the client router's fetches from page loads by the headers Next 13.5 leaves for middleware", () => {
    // Next strips RSC, Next-Router-* and _rsc before middleware; Next-Url stays on every router fetch and prefetch.
    expect(isRouterFetch(new Headers({ "next-url": "/screener" }))).toBe(true);
    expect(isRouterFetch(new Headers({ "sec-fetch-dest": "empty" }))).toBe(true);
    expect(isRouterFetch(new Headers({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }))).toBe(false);
    // The scrapers sent no Sec-Fetch headers at all: a page load.
    expect(isRouterFetch(new Headers({ accept: "text/html" }))).toBe(false);
  });

  it("gives a session cookie a bigger allowance, not an unlimited one", () => {
    const store = new Map();
    const statuses = Array.from({ length: 200 }, () => visit("/stock/NVDA", { key: "198.51.100.5", signedIn: true }, 0, store)?.status ?? 200);
    expect(statuses.filter((status) => status === 200).length).toBe(SIGNED_IN_RATE.burst);
    // The signed-out allowance of the same address is its own.
    expect(visit("/stock/NVDA", { key: "198.51.100.5" }, 0, store)).toBeNull();
  });

  it("never counts client-router requests, requests from the box, static files or crawler files", () => {
    const store = new Map();
    for (let i = 0; i < 200; i++) {
      expect(visit("/stock/NVDA", { key: null }, 0, store)).toBeNull();
      expect(visit("/robots.txt", { key: "198.51.100.3" }, 0, store)).toBeNull();
      expect(visit("/founder.jpg", { key: "198.51.100.3" }, 0, store)).toBeNull();
      expect(visit("/fonts/inter.woff2", { key: "198.51.100.3" }, 0, store)).toBeNull();
    }
    expect(store.size).toBe(0);
    // A ticker with a dot is a page.
    expect(visit("/stock/BRK.B", { key: "198.51.100.3" }, 0, store)).toBeNull();
    expect(store.size).toBe(1);
  });

  it("refuses page loads with a made-up Referer (an origin with no path) that no link started", () => {
    // Nov 21 19:10: 377 page loads in two minutes, each from a different address, all sent this way.
    expect(isForgedReferer("https://www.stocksbrew.online", "none")).toBe(true);
    expect(isForgedReferer("http://stocksbrew.online", null)).toBe(true);
    expect(isForgedReferer(" HTTPS://www.stocksbrew.online:443 ", "None")).toBe(true);
    expect(isForgedReferer("https://[::1]:8080", undefined)).toBe(true);
    // What browsers send: a whole URL, so at least "/".
    expect(isForgedReferer("https://www.stocksbrew.online/", "none")).toBe(false);
    expect(isForgedReferer("https://www.google.com/", null)).toBe(false);
    expect(isForgedReferer("https://www.stocksbrew.online/stock/NVDA?tab=news", "none")).toBe(false);
    expect(isForgedReferer("https://x.com?", "none")).toBe(false);
    expect(isForgedReferer("https://a.com, https://b.com", "none")).toBe(false);
    expect(isForgedReferer("android-app://com.google.android.gm", null)).toBe(false);
    expect(isForgedReferer(null, "none")).toBe(false);
    expect(isForgedReferer("", null)).toBe(false);
    // Facebook's Android app sets "http://m.facebook.com" itself; the navigation is marked cross-site.
    expect(isForgedReferer("http://m.facebook.com", "cross-site")).toBe(false);
    expect(isForgedReferer("https://chatgpt.com", "cross-site")).toBe(false);
    expect(isForgedReferer("https://www.stocksbrew.online", "same-origin")).toBe(false);

    const store = new Map();
    const forged = { referer: "https://www.stocksbrew.online", secFetchSite: "none" };
    expect(visit("/stock/IBM", { key: "198.51.100.6", ...forged }, 0, store)?.status).toBe(403);
    // Refused before the address is counted, and even with no address or a session cookie.
    expect(store.size).toBe(0);
    expect(visit("/stock/IBM", { key: null, ...forged }, 0, store)?.status).toBe(403);
    expect(visit("/stock/IBM", { key: "198.51.100.6", signedIn: true, ...forged }, 0, store)?.status).toBe(403);
    // A real Referer, a cross-site app link, a router fetch or a static file goes on as before.
    expect(visit("/stock/IBM", { key: "198.51.100.6", referer: "https://www.stocksbrew.online/", secFetchSite: "none" }, 0, store)).toBeNull();
    expect(visit("/?fbclid=x", { key: "198.51.100.8", referer: "http://m.facebook.com", secFetchSite: "cross-site" }, 0, store)).toBeNull();
    expect(visit("/stock/IBM", { key: "198.51.100.6", routerRequest: true, ...forged }, 0, store)).toBeNull();
    expect(visit("/founder.jpg", { key: "198.51.100.6", ...forged }, 0, store)).toBeNull();
    expect(visit("/robots.txt", { key: "198.51.100.6", ...forged }, 0, store)).toBeNull();
    // Crawlers that send one (DuckDuckBot, GPTBot) keep their own rules.
    const duck = "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)";
    expect(visit("/stock/IBM", { key: "198.51.100.7", referer: "http://www.stocksbrew.online" }, 0, store, duck)).toBeNull();
  });

  it("refuses page loads from a forged browser: hints that contradict the User-Agent, or Lightpanda", () => {
    // Nov 22: ~200 page loads an hour on /news and /calendar/earnings/*, each claiming an old Chrome or Firefox
    // while the browser's own hints said Chrome 146.
    const hints146 = '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"';
    const oldChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
    const chrome146 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    const store = new Map();
    expect(visit("/news", { key: "198.51.100.20", secChUa: hints146 }, 0, store, oldChrome)?.status).toBe(403);
    expect(visit("/news", { key: "198.51.100.21", secChUa: hints146 }, 0, store, firefox)?.status).toBe(403);
    expect(visit("/news", { key: null }, 0, store, "Lightpanda/1.0")?.status).toBe(403);
    expect(store.size).toBe(0);
    // The real thing passes, and so does a browser that sends no hints (Firefox, Safari) or a router fetch.
    expect(visit("/news", { key: "198.51.100.22", secChUa: hints146 }, 0, store, chrome146)).toBeNull();
    expect(visit("/news", { key: "198.51.100.23" }, 0, store, firefox)).toBeNull();
    expect(visit("/news", { key: "198.51.100.20", routerRequest: true, secChUa: hints146 }, 0, store, oldChrome)).toBeNull();
    // Parallel's agent names itself and keeps its crawler rules.
    expect(visit("/news", { key: "198.51.100.24" }, 0, store, "Lightpanda/1.0 ShapBot/0.1.0")).toBeNull();
  });

  it("leaves self-declared crawlers to their own rules", () => {
    const store = new Map();
    expect(visit("/news?ticker=NU", { key: "198.51.100.4" }, 0, store, GPTBOT)?.status).toBe(403);
    expect(store.size).toBe(0);
  });

  it("drops the least recently seen busy address, not the first one seen", () => {
    const store = new Map<string, { tokens: number; at: number }>();
    takeVisitorToken("early-and-busy", 0, store);
    for (let i = 1; i < VISITOR_KEYS_MAX; i++) takeVisitorToken(`other-${i}`, 0, store);
    takeVisitorToken("early-and-busy", 1, store);
    takeVisitorToken("newcomer", 2, store);
    expect(store.has("early-and-busy")).toBe(true);
    expect(store.has("other-1")).toBe(false);
  });

  it("keeps its memory bounded, dropping idle addresses first", () => {
    const store = new Map<string, { tokens: number; at: number }>();
    for (let i = 0; i < VISITOR_KEYS_MAX; i++) takeVisitorToken(`idle-${i}`, 0, store);
    takeVisitorToken("busy", 1_000_000, store);
    expect(store.size).toBe(1);
    for (let i = 0; i < VISITOR_KEYS_MAX * 2; i++) takeVisitorToken(`busy-${i}`, 1_000_000, store);
    expect(store.size).toBeLessThanOrEqual(VISITOR_KEYS_MAX);
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
