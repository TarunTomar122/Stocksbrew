/**
 * Which cached pages a pipeline write makes stale, and how to refresh them.
 *
 * The pipeline (backend/scripts/trigger_web_revalidate.py, called by the
 * dispatcher after each lane) posts to /api/revalidate with the kinds of data
 * it just wrote ("prices", "briefs", ...), optionally the tickers it touched,
 * or explicit page paths. This module turns that into:
 *  - `pages`: exact public paths ("/news", "/stock/NVDA");
 *  - `families`: whole groups of pages ("stock" = every /stock/<T> page);
 *  - `tags`: shared data caches (`unstable_cache` tags) to drop.
 * and from those, what each Next instance revalidates (`nextPaths`, `nextTags`)
 * and the one Varnish ban that drops the cached HTML (`varnishBanPattern`).
 *
 * Pure functions: no Next imports, so the mapping is tested on its own.
 */

export type RevalidateFamily = "stock" | "markets" | "sectors" | "themes" | "compare" | "calendar" | "insiders" | "follow" | "movers";

export type RevalidatePlan = {
  pages: string[];
  families: RevalidateFamily[];
  tags: string[];
};

type KindTargets = { pages: string[]; families: RevalidateFamily[]; tags: string[] };

/**
 * What each kind of write shows up on. Signed-in pages are rendered live, so
 * only the pages and data caches that are shared across visitors are listed.
 */
export const REVALIDATE_KINDS: Readonly<Record<string, KindTargets>> = {
  // Quotes, moves and the home dashboard (price_core_* lanes, the post-close run).
  prices: {
    pages: ["/", "/briefing", "/explore", "/screener", "/portfolio", "/markets", "/sectors", "/themes", "/premarket"],
    families: ["stock", "markets", "sectors", "themes", "compare"],
    tags: ["markets"],
  },
  // AI briefs, calls and levels, mover reasons (tracked_open_briefs, open_anomalies, contrarian_calls).
  briefs: {
    pages: ["/", "/briefing", "/explore", "/portfolio"],
    families: ["stock"],
    tags: [],
  },
  // Headlines (on_demand_news every 5 minutes, tracked_news_prep). Stock pages only for the tickers given.
  news: { pages: ["/news", "/briefing"], families: [], tags: [] },
  // Earnings reads and the earnings calendar (earnings_intel, pre_earnings_intel).
  earnings: { pages: ["/calendar", "/explore"], families: ["calendar"], tags: [] },
  // SEC filings, IR releases, insider and fund holdings (radar_official_sources).
  filings: { pages: ["/filings", "/insiders", "/follow"], families: ["insiders", "follow"], tags: [] },
  // Reddit and the President's posts (reddit_buzz, trump_logic).
  signals: { pages: ["/signals"], families: [], tags: [] },
  // Market events and the calendar (market_events).
  calendar: { pages: ["/calendar"], families: ["calendar"], tags: [] },
  // Theme research (research_themes).
  themes: { pages: ["/themes"], families: ["themes"], tags: [] },
  // The pre-market read (premarket_pipeline).
  premarket: { pages: ["/premarket", "/briefing"], families: [], tags: ["premarket-US", "premarket-opening"] },
};

/**
 * Each family's address prefix, and the Next routes whose cached copies hold
 * it, as Next tags them: the page file's path with its route group
 * (`_N_T_/(app)/anon/[v]/stock/[symbol]/page` on every /anon/1/stock/<T> copy).
 */
const FAMILIES: Readonly<Record<RevalidateFamily, { prefix: string; nextRoutes: string[] }>> = {
  stock: { prefix: "/stock", nextRoutes: ["/(app)/anon/[v]/stock/[symbol]"] },
  markets: { prefix: "/markets", nextRoutes: [] },
  sectors: { prefix: "/sectors", nextRoutes: [] },
  themes: { prefix: "/themes", nextRoutes: [] },
  compare: { prefix: "/compare", nextRoutes: [] },
  calendar: { prefix: "/calendar", nextRoutes: [] },
  insiders: { prefix: "/insiders", nextRoutes: [] },
  follow: { prefix: "/follow", nextRoutes: [] },
  movers: { prefix: "/movers", nextRoutes: [] },
};

const MAX_PAGES = 500;
const SAFE_PATH = /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,80}(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,80}){0,5})?$/;
const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;

/** A public page path the cache could hold, or null: plain characters only, no "..", no query. */
export function safePagePath(raw: unknown): string | null {
  const path = String(raw ?? "").trim();
  if (!SAFE_PATH.test(path) || path.includes("..")) return null;
  if (path.startsWith("/api/") || path.startsWith("/anon/") || path === "/anon") return null;
  return path;
}

function list(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/**
 * The plan for a request body `{ kinds?, symbols?, paths?, tags? }`. Unknown
 * kinds, unsafe paths and bad tickers are dropped; an empty body means the
 * home page (the old route's default). Returns null when nothing usable is
 * left of a non-empty request.
 */
export function planRevalidation(body: { kinds?: unknown; symbols?: unknown; paths?: unknown; tags?: unknown }): RevalidatePlan | null {
  const pages = new Set<string>();
  const families = new Set<RevalidateFamily>();
  const tags = new Set<string>();
  let asked = false;
  for (const raw of list(body.kinds)) {
    asked = true;
    const kind = REVALIDATE_KINDS[String(raw)];
    if (!kind) continue;
    kind.pages.forEach((page) => pages.add(page));
    kind.families.forEach((family) => families.add(family));
    kind.tags.forEach((tag) => tags.add(tag));
  }
  for (const raw of list(body.symbols)) {
    asked = true;
    const symbol = String(raw ?? "").trim().toUpperCase();
    if (SYMBOL.test(symbol)) pages.add(`/stock/${symbol}`);
  }
  for (const raw of list(body.paths)) {
    asked = true;
    const path = safePagePath(raw);
    if (path) pages.add(path);
  }
  for (const raw of list(body.tags)) {
    asked = true;
    const tag = String(raw ?? "").trim();
    if (TAG.test(tag)) tags.add(tag);
  }
  if (!asked) pages.add("/");
  // A page inside a family that is refreshed whole adds nothing.
  for (const page of Array.from(pages)) {
    if (Array.from(families).some((family) => page.startsWith(`${FAMILIES[family].prefix}/`))) pages.delete(page);
  }
  if (pages.size === 0 && families.size === 0 && tags.size === 0) return null;
  return {
    pages: Array.from(pages).sort().slice(0, MAX_PAGES),
    families: Array.from(families).sort(),
    tags: Array.from(tags).sort(),
  };
}

/** Data tags the pre-market pages read, which the old route refreshed with them; kept for its callers. */
const LEGACY_PAGE_TAGS: Readonly<Record<string, string[]>> = {
  "/premarket": ["premarket-US", "premarket-opening"],
  "/pulse": ["premarket-US", "premarket-opening"],
};

/**
 * What one Next instance refreshes: each page's public address, the family
 * routes and the data tags. The cached signed-out copy of a page
 * (lib/anon-view.ts, /anon/1/stock/NVDA) is tagged with the public address it
 * was rewritten from (`_N_T_/stock/NVDA`), so `revalidatePath("/stock/NVDA")`
 * drops it, along with every `unstable_cache` entry read while rendering it.
 */
export function nextTargets(plan: RevalidatePlan): { paths: string[]; routes: string[]; tags: string[] } {
  const paths = new Set<string>();
  const tags = new Set(plan.tags);
  for (const page of plan.pages) {
    paths.add(page);
    (LEGACY_PAGE_TAGS[page] || []).forEach((tag) => tags.add(tag));
  }
  const routes = plan.families.flatMap((family) => FAMILIES[family].nextRoutes);
  return { paths: Array.from(paths), routes, tags: Array.from(tags) };
}

/** "." and other regex characters as a bracket class, so the pattern has no backslashes or spaces (VCL ban strings). */
function literal(path: string): string {
  return path.replace(/[.]/g, "[.]");
}

/**
 * One regular expression over Varnish's stored URL (path and query) that
 * matches every cached page of the plan: an exact page with or without a
 * query, and everything under a family's prefix. Null when the plan holds no
 * page (tags only). Characters: letters, digits, `/ _ - [ ] . ( ) ? : | ^ $`.
 */
export function varnishBanPattern(plan: RevalidatePlan): string | null {
  const alternatives: string[] = [];
  if (plan.pages.length) alternatives.push(`(?:${plan.pages.map(literal).join("|")})(?:[?]|$)`);
  if (plan.families.length) {
    const prefixes = plan.families.map((family) => literal(FAMILIES[family].prefix.slice(1)));
    alternatives.push(`/(?:${prefixes.join("|")})(?:/|[?]|$)`);
  }
  if (!alternatives.length) return null;
  return `^(?:${alternatives.join("|")})`;
}
