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
 * - Scrapers that pass for a browser: each signed-out visitor address gets a page-load bucket per instance (VISITOR_RATE).
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

/** Page loads per second (and burst) per visitor address per web instance, for visitors who are not signed in and do
 * not call themselves crawlers. Nov 15-16: two scrapers with plain Chrome user agents (from Hong Kong and Korea) took
 * ~27,000 uncached pages a day, up to 100 a minute each, walking every screener, news and calendar filter. A person
 * reading pages stays far under this; the client router's own requests (a tab, a sort, a prefetch) are not counted. */
export const VISITOR_RATE = { perSecond: 0.25, burst: 30 } as const;
/** Anyone with a session cookie: middleware cannot check the cookie, so a made-up one buys a bigger allowance, not
 * an unlimited one. */
export const SIGNED_IN_RATE = { perSecond: 1, burst: 120 } as const;
/** Addresses remembered per instance; past this, idle (refilled) ones are dropped first, then the oldest. */
export const VISITOR_KEYS_MAX = 5000;
const visitorBuckets = new Map<string, Bucket>();

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)) ? groups : null;
}

/** The visitor's address as Cloudflare reports it (CF-Connecting-IP), or null when there is none: a request from this
 * box (deploy warm-up, a load test against Caddy) is never limited. Forms Cloudflare never sends (IPv4-mapped IPv6,
 * zone ids) also give null. IPv6 visitors are one network (/64), since one
 * device can rotate through its prefix. Never X-Forwarded-For: behind Cloudflare its first entry is Cloudflare's. */
export function visitorKey(cfConnectingIp: string | null | undefined): string | null {
  const ip = cfConnectingIp?.trim() ?? "";
  if (/^(\d{1,3})(\.\d{1,3}){3}$/.test(ip)) return ip;
  if (!ip.includes(":") || ip.length > 45) return null;
  const groups = expandIpv6(ip.toLowerCase());
  return groups ? `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64` : null;
}

function forgetIdleVisitors(store: Map<string, Bucket>, now: number): void {
  if (store.size < VISITOR_KEYS_MAX) return;
  const fullAfterMs = Math.max(SIGNED_IN_RATE.burst / SIGNED_IN_RATE.perSecond, VISITOR_RATE.burst / VISITOR_RATE.perSecond) * 1000;
  for (const [key, bucket] of store) if (now - bucket.at >= fullAfterMs) store.delete(key);
  // Still full of busy addresses: drop the least recently seen (takeVisitorToken moves each address to the end).
  for (const key of store.keys()) {
    if (store.size < VISITOR_KEYS_MAX * 0.9) break;
    store.delete(key);
  }
}

/** Takes one page load from this visitor's allowance; false when it is spent. */
export function takeVisitorToken(
  key: string,
  now: number = Date.now(),
  store: Map<string, Bucket> = visitorBuckets,
  rate: { perSecond: number; burst: number } = VISITOR_RATE,
): boolean {
  const seen = store.get(key);
  if (seen) store.delete(key); // re-added below, so the Map's order is least recently seen first
  else forgetIdleVisitors(store, now);
  if (seen) store.set(key, seen);
  const bucket = refill(store, key, rate, now);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export type CrawlerVerdict = { status: 403 | 429; reason: string } | null;

/** Public files the middleware also sees (images, fonts, the manifest): a page pulls several, so they are not page
 * loads. /stock/BRK.B is a page, so this goes by file type, not by any dot. */
const STATIC_FILE = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|woff2?|ttf|otf|txt|xml|json|webmanifest|mp4|webm|pdf)$/i;

/** A visitor who is not a self-declared crawler. Only page loads count: never the client router's fetches. */
export type VisitorInput = { key: string | null; signedIn: boolean; routerRequest: boolean };

/** True for the client router's own fetches (navigation, prefetch, refresh). Next 13.5 strips RSC, Next-Router-*
 * and _rsc before middleware sees the request, so this goes by what is left: the router sends Next-Url on every
 * fetch, and a browser marks a fetch() as Sec-Fetch-Dest: empty. A page load is "document" (or has no such header,
 * from a non-browser client). A scraper could send these headers to skip the count; the two from Nov 15-16 did not. */
export function isRouterFetch(headers: Headers): boolean {
  if (headers.has("next-url")) return true;
  const dest = headers.get("sec-fetch-dest");
  return dest !== null && dest !== "document";
}

/** What to do with this request: null lets it through. */
export function crawlerVerdict(
  input: { userAgent: string | null; pathname: string; searchParams: URLSearchParams; visitor?: VisitorInput },
  now: number = Date.now(),
  store: Map<string, Bucket> = buckets,
  visitorStore: Map<string, Bucket> = visitorBuckets,
): CrawlerVerdict {
  if (isCrawlerFile(input.pathname)) return null;
  const crawler = crawlerOf(input.userAgent);
  if (!crawler) {
    const visitor = input.visitor;
    if (!visitor?.key || visitor.routerRequest || STATIC_FILE.test(input.pathname)) return null;
    const allowed = visitor.signedIn
      ? takeVisitorToken(`session ${visitor.key}`, now, visitorStore, SIGNED_IN_RATE)
      : takeVisitorToken(visitor.key, now, visitorStore);
    return allowed ? null : { status: 429, reason: "Too many pages too fast; wait a few seconds and try again." };
  }
  if (crawler.kind === "blocked") return { status: 403, reason: "This crawler is not allowed here (see /robots.txt)." };
  if (isFilterView(input.pathname, input.searchParams)) {
    return { status: 403, reason: "Filtered views are not for crawling (see /robots.txt); the pages in /sitemap.xml are." };
  }
  if (!takeCrawlToken(crawler, now, store)) return { status: 429, reason: "Too many requests; slow down." };
  return null;
}
