/**
 * Keeps crawlers from taking the site down (Nov 14: GPTBot and PerplexityBot fetched ~13,000 pages an hour, nearly all
 * of them filter combinations like /news?ticker=NU&topic=product and /calendar?day=2030-07-18&view=list; every one
 * was a fresh server render, and the box ran out of memory).
 *
 * Runs in middleware.ts, before anything is rendered:
 * - SEO-tool scrapers that send nobody to the site are refused (403).
 * - Every other crawler is refused filter views: a page address with a query string, other than the few the sitemap
 *   lists (robots.txt says the same, but crawlers re-read it only about once a day).
 * - Each crawler family gets a token bucket per web instance; past it, 429 with Retry-After, which they back off on.
 * Link previews (Slack, X, WhatsApp...) and fetches a person asked for (ChatGPT-User, Perplexity-User) are not
 * crawlers here: they are someone reading a page.
 */

export type CrawlerKind = "search" | "ai" | "blocked";
export type Crawler = { family: string; kind: CrawlerKind };

/** Someone is behind these: a link preview or a fetch a person asked an assistant for. */
const PERSON_FETCHERS =
  /ChatGPT-User|Perplexity-User|Claude-User|Claude-Web|facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|redditbot|Pinterestbot|SkypeUriPreview|Embedly|Iframely|Google-PageRenderer|vercel-screenshot|Mastodon/i;

const KNOWN: Array<[RegExp, string, CrawlerKind]> = [
  // Search and answer engines: they send people to the pages they read.
  [/Googlebot|GoogleOther|Google-InspectionTool|AdsBot-Google|Storebot-Google/i, "google", "search"],
  [/bingbot|BingPreview|msnbot/i, "bing", "search"],
  [/Applebot/i, "apple", "search"],
  [/DuckDuckBot|DuckAssistBot/i, "duckduckgo", "search"],
  [/YandexBot/i, "yandex", "search"],
  [/OAI-SearchBot/i, "oai-search", "search"],
  [/Claude-SearchBot/i, "claude-search", "search"],
  // Model training and other AI crawlers: welcome, slower, and sharing one allowance between them.
  // (PerplexityBot answers questions with links, but alone it fetched 5,600 pages an hour on Nov 14.)
  [/PerplexityBot/i, "perplexity", "ai"],
  [/GPTBot/i, "gptbot", "ai"],
  [/ClaudeBot|anthropic-ai/i, "claudebot", "ai"],
  [/CCBot/i, "ccbot", "ai"],
  [/Amazonbot/i, "amazonbot", "ai"],
  [/meta-externalagent|meta-externalfetcher|FacebookBot/i, "meta", "ai"],
  // SEO tools and scrapers: nothing in it for the site. Bytespider is known to ignore robots.txt.
  [/Bytespider/i, "bytespider", "blocked"],
  [/MJ12bot/i, "mj12bot", "blocked"],
  [/Semrush/i, "semrush", "blocked"],
  [/Ahrefs/i, "ahrefs", "blocked"],
  [/DotBot/i, "dotbot", "blocked"],
  [/DataForSeoBot/i, "dataforseo", "blocked"],
  [/PetalBot/i, "petalbot", "blocked"],
  [/BLEXBot/i, "blexbot", "blocked"],
  [/serpstatbot/i, "serpstat", "blocked"],
  [/barkrowler/i, "barkrowler", "blocked"],
];

/** The SEO scrapers robots.txt shuts out, by their robots.txt names. */
export const BLOCKED_ROBOTS_NAMES = [
  "Bytespider",
  "MJ12bot",
  "SemrushBot",
  "AhrefsBot",
  "DotBot",
  "DataForSeoBot",
  "PetalBot",
  "BLEXBot",
  "serpstatbot",
  "barkrowler",
];

/** Which crawler sent this request, or null for a person (or a link preview). */
export function crawlerOf(userAgent: string | null | undefined): Crawler | null {
  const ua = userAgent ?? "";
  if (!ua || PERSON_FETCHERS.test(ua)) return null;
  for (const [pattern, family, kind] of KNOWN) {
    if (pattern.test(ua)) return { family, kind };
  }
  // Any other self-declared crawler: they name themselves (...bot, ...spider) and leave a URL. The URL check keeps
  // phones whose model name ends in "bot" (CUBOT) out; the name is looked for outside the URL ("/robot/site-audit"
  // is a path, not a name). They all share one allowance, so made-up names cannot buy more pages.
  if (/https?:\/\/|\+http|@/i.test(ua)) {
    const name = ua.replace(/\+?https?:\/\/[^\s;)]*/gi, " ");
    if (/[a-z0-9_.-]*(?:bot|spider|crawler)\b/i.test(name)) return { family: "other", kind: "ai" };
  }
  return null;
}

/** Filter views with a page of their own (in the sitemap, or their own canonical address): a crawler may read these.
 * Kept in step with lib/seo/sitemap.ts and the canonicals in app/(app)/calendar and app/(app)/screener (tested). */
const SLUG = /^[a-z0-9-]{1,60}$/;
const LISTED_FILTER_VIEWS: Record<string, Record<string, (value: string) => boolean>> = {
  "/calendar": { type: (value) => ["earnings", "economic", "ipo", "dividend"].includes(value) },
  "/screener": { tab: (value) => value === "sectors", preset: (value) => SLUG.test(value), sector: (value) => SLUG.test(value) },
};

/** Query parameters that only say where a link was shared (or are the client router's own, _rsc): a page with
 * nothing else is the page itself. */
const TRACKING_PARAM = /^(utm_[a-z]+|ref|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|si|_rsc)$/i;

/** True when this address is a filter view a crawler should not fetch (robots.txt says the same). */
export function isFilterView(pathname: string, searchParams: URLSearchParams): boolean {
  const keys = Array.from(searchParams.keys()).filter((key) => !TRACKING_PARAM.test(key));
  if (keys.length === 0) return false;
  if (keys.length === 1) {
    const allowed = LISTED_FILTER_VIEWS[pathname]?.[keys[0]!];
    const values = searchParams.getAll(keys[0]!);
    if (allowed && values.length === 1 && allowed(values[0]!)) return false;
  }
  return true;
}

/** Files a crawler must always be able to read, whatever else happens: refusing robots.txt means "crawl anything". */
export function isCrawlerFile(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/sitemaps/") ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    pathname === "/feed.xml" ||
    pathname === "/manifest.webmanifest" ||
    /^\/(icon|apple-icon|opengraph-image|twitter-image)/.test(pathname)
  );
}

/** Pages per second (and burst) per web instance; there are two instances. Each crawler family has its own
 * allowance, and the AI crawlers also share one between them, so together they stay under ~2 renders a second. */
export const CRAWL_RATE = {
  search: { perSecond: 1, burst: 20 },
  ai: { perSecond: 0.5, burst: 10 },
  allAi: { perSecond: 1, burst: 15 },
} as const;

type Bucket = { tokens: number; at: number };
/** Keys are the known families, "other" and "ai:all": a short, fixed list. */
const buckets = new Map<string, Bucket>();

function refill(store: Map<string, Bucket>, key: string, rate: { perSecond: number; burst: number }, now: number): Bucket {
  const bucket = store.get(key) ?? { tokens: rate.burst, at: now };
  bucket.tokens = Math.min(rate.burst, bucket.tokens + (Math.max(0, now - bucket.at) / 1000) * rate.perSecond);
  bucket.at = Math.max(bucket.at, now);
  store.set(key, bucket);
  return bucket;
}

/** Takes one page from this family's allowance (and, for AI crawlers, the shared one); false when it is spent. */
export function takeCrawlToken(crawler: Crawler, now: number = Date.now(), store: Map<string, Bucket> = buckets): boolean {
  if (crawler.kind === "blocked") return false;
  const own = refill(store, crawler.family, CRAWL_RATE[crawler.kind], now);
  const shared = crawler.kind === "ai" ? refill(store, "ai:all", CRAWL_RATE.allAi, now) : null;
  if (own.tokens < 1 || (shared && shared.tokens < 1)) return false;
  own.tokens -= 1;
  if (shared) shared.tokens -= 1;
  return true;
}

export type CrawlerVerdict = { status: 403 | 429; reason: string } | null;

/** What to do with this request: null lets it through. */
export function crawlerVerdict(
  input: { userAgent: string | null; pathname: string; searchParams: URLSearchParams },
  now: number = Date.now(),
  store: Map<string, Bucket> = buckets,
): CrawlerVerdict {
  if (isCrawlerFile(input.pathname)) return null;
  const crawler = crawlerOf(input.userAgent);
  if (!crawler) return null;
  if (crawler.kind === "blocked") return { status: 403, reason: "This crawler is not allowed here (see /robots.txt)." };
  if (isFilterView(input.pathname, input.searchParams)) {
    return { status: 403, reason: "Filtered views are not for crawling (see /robots.txt); the pages in /sitemap.xml are." };
  }
  if (!takeCrawlToken(crawler, now, store)) return { status: 429, reason: "Too many requests; slow down." };
  return null;
}
