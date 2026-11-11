/**
 * The cached logged-out copy of a few public pages.
 *
 * A visitor with no session cookie is served the same page from an internal
 * address under ANON_PREFIX (app/anon/[v], app/(app)/anon/[v]). Those copies
 * are built on the first request and kept by the CDN for a minute
 * (`dynamic = "force-static"`, so `cookies()` and `headers()` read as empty
 * there and every page renders its signed-out view), instead of being
 * rendered again on every request. middleware.ts picks the copy; signed-in
 * requests never see it.
 *
 * The `[v]` segment only exists so that nothing is built with the deployment
 * (each page's generateStaticParams returns no paths): a copy built during
 * the build could hold a failed read and would be served until it expires.
 *
 * Pure functions only: this module runs in the middleware (edge), on the
 * server and in the browser.
 */

const ANON_ROOT = "/anon";
/** Where the copies live: "/anon/1/stock/NVDA" stands for "/stock/NVDA". */
export const ANON_PREFIX = `${ANON_ROOT}/1`;

/**
 * One stock page at its canonical address: /stock/NVDA or /stock/BRK.B, not
 * /stock/NVDA/earnings. Upper case and the characters a ticker can carry
 * (lib/stock.ts normalizeStockSymbolParam), so made-up or lower-case
 * addresses go to the live page instead of each getting a cached copy.
 */
const STOCK_PAGE_RE = /^\/stock\/[A-Z0-9][A-Z0-9.-]{0,15}$/;

/**
 * The cached pages, with the query keys that change their signed-out view.
 * The cached copy is built without a query string, so a request carrying one
 * of these keys gets the live page. Stock pages, /explore,
 * and the home page read no search params at all, so tracking
 * tags (utm_*, gclid, ref) and the router's `_rsc` never matter. A page that starts reading a
 * search param must list it here.
 *
 * Not cached: /screener. Its filters live in the query, and the first filter
 * moves from the cached copy to the live route, which remounts the page and
 * drops focus from the search box mid-typing.
 */
const CACHED_PAGES = new Map<string, readonly string[]>([
  ["/briefing", ["day"]],
  ["/explore", []],
  // Signed out, My stocks is the example portfolio: the same page for everyone. Its other tabs (?tab=holdings,
  // watching, alerts) and ?reasons=1 are live pages.
  ["/portfolio", ["tab", "reasons"]],
]);

/**
 * Pages whose signed-out view changes with the visitor's country: the home
 * page's plans block offers "3 days free" only outside India
 * (lib/entitlements-server.ts trialMarket). The cached copy is the
 * outside-India view, so visitors from India get the live page there. (The
 * stock page's locks ask a signed-out visitor to sign in, whatever the country.)
 */
const COUNTRY_PAGES = new Set(["/"]);

export type AnonViewRequest = {
  pathname: string;
  searchParams: URLSearchParams;
  /** The visitor's country code (x-vercel-ip-country), when known. */
  country: string | null;
};

/**
 * The internal address of the cached copy for a signed-out request, or null
 * when the live page must answer. The caller has already checked that there
 * is no session cookie and that this is a GET or HEAD for HTML.
 */
export function anonViewPath({ pathname, searchParams, country }: AnonViewRequest): string | null {
  if (COUNTRY_PAGES.has(pathname) && country?.toUpperCase() === "IN") return null;
  if (pathname === "/") {
    // `?home=1` only matters to someone signed in, so any query is fine here.
    return ANON_PREFIX;
  }
  const liveKeys = CACHED_PAGES.get(pathname);
  if (liveKeys) {
    if (liveKeys.some((key) => searchParams.has(key))) return null;
    return `${ANON_PREFIX}${pathname}`;
  }
  if (STOCK_PAGE_RE.test(pathname)) return `${ANON_PREFIX}${pathname}`;
  return null;
}

/** Whether a path is one of the internal cached copies (never linked, never indexed). */
export function isAnonViewPath(pathname: string): boolean {
  return pathname === ANON_ROOT || pathname.startsWith(`${ANON_ROOT}/`);
}

/**
 * The public address a cached copy stands for: "/anon/1/stock/NVDA" is
 * "/stock/NVDA", "/anon/1" is "/". Any other path is returned as it is.
 */
export function publicPathname(pathname: string): string {
  if (!isAnonViewPath(pathname)) return pathname;
  // Drop "/anon" and the segment after it.
  const rest = pathname.slice(ANON_ROOT.length).replace(/^\/[^/]*/, "");
  return rest || "/";
}
