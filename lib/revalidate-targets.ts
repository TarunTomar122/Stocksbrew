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
 * The data tags name the caches a signed-in /briefing reads that its rebuilt
 * signed-out copy does not refresh (per-stock reads keyed by the person's own
 * stocks), since /briefing is no longer refreshed by its address (COPY_ROUTES).
 */
export const REVALIDATE_KINDS: Readonly<Record<string, KindTargets>> = {
  // Quotes, moves and the home dashboard (price_core_* lanes, the post-close run).
  prices: {
    pages: ["/", "/briefing", "/explore", "/screener", "/portfolio", "/markets", "/sectors", "/themes", "/premarket"],
    families: ["stock", "markets", "sectors", "themes", "compare"],
    tags: ["markets", "daily-series", "extended-quotes", "results"],
  },
  // AI briefs, calls and levels, mover reasons (tracked_open_briefs, open_anomalies, contrarian_calls).
  briefs: {
    pages: ["/", "/briefing", "/explore", "/portfolio"],
    families: ["stock"],
    tags: [],
  },
  // Headlines (on_demand_news every 5 minutes, tracked_news_prep). Stock pages only for the tickers given.
  news: { pages: ["/news", "/briefing"], families: [], tags: ["news-feed"] },
  // Earnings reads and the earnings calendar (earnings_intel, pre_earnings_intel).
  earnings: { pages: ["/calendar", "/explore"], families: ["calendar"], tags: ["results", "earnings-dates"] },
  // SEC filings, IR releases, insider and fund holdings (radar_official_sources).
  filings: { pages: ["/filings", "/insiders", "/follow"], families: ["insiders", "follow"], tags: [] },
  // Reddit and the President's posts (reddit_buzz, trump_logic).
  signals: { pages: ["/signals"], families: [], tags: [] },
  // Market events and the calendar (market_events).
  calendar: { pages: ["/calendar"], families: ["calendar"], tags: ["earnings-dates"] },
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
 * Pages refreshed through their cached signed-out copy's own route (lib/anon-view.ts) instead of their address, and
 * built again right away (`warm`).
 *
 * Revalidating an address marks its tag (`_N_T_/briefing`), and Next checks that tag against every `unstable_cache`
 * entry any later render at that address reads, signed in or not: each counts as missing until it is read again. On
 * /briefing, which a news write refreshed every few minutes, that turned the next view into a cold one (Nov 13, a
 * local copy of the store: ~0.8-1.9 s and ~125-145 store calls signed in, 0.6-1.6 s signed out, against ~0.1-0.2 s and
 * 9-22 calls). The copy's route tag (`_N_T_/(app)/anon/[v]/briefing/page`) is carried only by renders of the copy, so
 * the copy is still dropped and built from fresh reads, while signed-in renders keep their caches. The copy is built
 * again before Varnish's ban (app/api/revalidate), so no visitor waits for it, and that build refreshes the shared
 * reads signed-in views use too; the per-stock reads only a signed-in view makes are dropped by their data tags
 * (REVALIDATE_KINDS). Anything else a signed-in view reads follows its own cache time, served stale once while it
 * is read again (unstable_cache), which only matters for data written without a refresh call.
 */
const COPY_ROUTES: Readonly<Record<string, string>> = {
  "/briefing": "/(app)/anon/[v]/briefing",
};

/** The route a page in COPY_ROUTES is refreshed through, or null for a page refreshed by its address. */
export function copyRouteOf(page: string): string | null {
  return Object.prototype.hasOwnProperty.call(COPY_ROUTES, page) ? COPY_ROUTES[page]! : null;
}

/**
 * What one Next instance refreshes: each page's public address, the family
 * routes and the data tags. The cached signed-out copy of a page
 * (lib/anon-view.ts, /anon/1/stock/NVDA) is tagged with the public address it
 * was rewritten from (`_N_T_/stock/NVDA`), so `revalidatePath("/stock/NVDA")`
 * drops it, along with every `unstable_cache` entry read while rendering it.
 * A page in COPY_ROUTES is refreshed through its copy's route instead and is
 * listed in `warm`: the public addresses to build again once dropped.
 */
export function nextTargets(plan: RevalidatePlan): { paths: string[]; routes: string[]; tags: string[]; warm: string[] } {
  const paths = new Set<string>();
  const routes = new Set<string>();
  const warm = new Set<string>();
  const tags = new Set(plan.tags);
  for (const page of plan.pages) {
    const copy = copyRouteOf(page);
    if (copy) {
      routes.add(copy);
      warm.add(page);
    } else {
      paths.add(page);
    }
    (LEGACY_PAGE_TAGS[page] || []).forEach((tag) => tags.add(tag));
  }
  plan.families.flatMap((family) => FAMILIES[family].nextRoutes).forEach((route) => routes.add(route));
  return { paths: Array.from(paths), routes: Array.from(routes), tags: Array.from(tags), warm: Array.from(warm) };
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
