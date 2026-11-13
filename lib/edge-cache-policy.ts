/**
 * How long the shared cache in front of the app (Varnish, backend/vps/web/varnish.vcl) may keep a signed-out page.
 *
 * Only public pages are listed, and the policy is only ever attached to a
 * request with no session cookie (middleware.ts): the signed-out view of these
 * pages is the same for every visitor. Varnish caches a page only when the
 * request had no `tikrr_session` cookie (other than analytics cookies), the
 * response sets no cookie, and the response carries this header; anything else
 * passes straight through. A page that starts showing something per visitor
 * (by cookie, header, IP or country) must leave this list.
 *
 * The header is `Surrogate-Control`, not `Cache-Control`: Next 13.5 overwrites
 * Cache-Control on every app page (`private, no-store` on dynamic renders,
 * `s-maxage=N, stale-while-revalidate` on the cached /anon copies), so a value
 * set here would be lost. Surrogate-Control is meant for a cache run by the
 * site itself (Varnish strips it before the response leaves), browsers ignore
 * it, and Vercel's CDN does not read it (it does read CDN-Cache-Control, and
 * there it would serve a signed-out copy to signed-in visitors, because that
 * cache does not look at cookies).
 *
 * Times are sized to how often the data under the page changes. The pipeline
 * refreshes these pages on demand after it writes (app/api/revalidate,
 * lib/revalidate-targets.ts), so `maxAge` is the backstop when a refresh is
 * missed, not the normal delay:
 *  - prices land ~10 times a weekday (09:30, 09:50, hourly 10-15, 12:30,
 *    14:30, 16:10 ET), briefs and calls at the open and close, news every 5
 *    minutes on demand: 5 minutes.
 *  - Reddit 4 times a day, the President's posts daily, filings hourly, the
 *    calendar and earnings reads twice a day: 15-30 minutes.
 *  - articles, docs, legal and pricing change with a deploy: an hour.
 * `staleWhileRevalidate` is how long a copy past `maxAge` is still served
 * while one request fetches a new one; `staleIfError` is how long it covers
 * for an app that is down or erroring.
 */

export type EdgeCachePolicy = {
  /** Seconds a copy is fresh. */
  maxAge: number;
  /** Seconds past maxAge a copy is served while it is refetched in the background. */
  staleWhileRevalidate: number;
  /** Seconds past maxAge a copy may be served when the app fails. */
  staleIfError: number;
};

export const EDGE_CACHE_HEADER = "Surrogate-Control";

const MARKET: EdgeCachePolicy = { maxAge: 300, staleWhileRevalidate: 900, staleIfError: 86_400 };
const SLOW: EdgeCachePolicy = { maxAge: 900, staleWhileRevalidate: 3_600, staleIfError: 86_400 };
const DAILY: EdgeCachePolicy = { maxAge: 1_800, staleWhileRevalidate: 3_600, staleIfError: 86_400 };
const CONTENT: EdgeCachePolicy = { maxAge: 3_600, staleWhileRevalidate: 86_400, staleIfError: 604_800 };

/** A path segment a public page can carry: tickers, slugs, dates. */
const SEG = "[A-Za-z0-9][A-Za-z0-9._-]{0,80}";

/** First match wins. Paths are matched without the query (the query is part of Varnish's cache key). */
const RULES: ReadonlyArray<readonly [RegExp, EdgeCachePolicy]> = [
  [/^\/$/, MARKET],
  [/^\/briefing$/, MARKET],
  // Signed out, My stocks is the example portfolio: the same for everyone.
  [/^\/portfolio$/, MARKET],
  [/^\/explore$/, MARKET],
  [/^\/news$/, MARKET],
  [/^\/screener$/, MARKET],
  [new RegExp(`^/stock/${SEG}(/(earnings|moves|research))?$`), MARKET],
  [new RegExp(`^/markets(/${SEG})?$`), MARKET],
  [new RegExp(`^/sectors(/${SEG})?$`), MARKET],
  [new RegExp(`^/themes(/${SEG})?$`), MARKET],
  [new RegExp(`^/compare/${SEG}$`), MARKET],
  [new RegExp(`^/movers/${SEG}$`), CONTENT],
  [/^\/signals$/, SLOW],
  [/^\/filings$/, SLOW],
  [new RegExp(`^/insiders(/${SEG})?$`), SLOW],
  [new RegExp(`^/follow(/${SEG})?$`), SLOW],
  [new RegExp(`^/calendar(/earnings(/${SEG})?)?$`), DAILY],
  [new RegExp(`^/best(/${SEG})?$`), DAILY],
  [new RegExp(`^/strategies(/${SEG})?$`), DAILY],
  [/^\/agent$/, DAILY],
  [/^\/pricing$/, CONTENT],
  [new RegExp(`^/blog(/${SEG})?$`), CONTENT],
  [new RegExp(`^/docs(/${SEG}){0,3}$`), CONTENT],
  [new RegExp(`^/legal(/${SEG})?$`), CONTENT],
  [/^\/(about|security|developers)$/, CONTENT],
];

/** The policy for a signed-out GET of `pathname`, or null when the page must not be kept. */
export function edgeCachePolicy(pathname: string): EdgeCachePolicy | null {
  for (const [pattern, policy] of RULES) {
    if (pattern.test(pathname)) return policy;
  }
  return null;
}

/** The header value: `max-age=300, stale-while-revalidate=900, stale-if-error=86400`. */
export function edgeCacheHeaderValue(policy: EdgeCachePolicy): string {
  return `max-age=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}, stale-if-error=${policy.staleIfError}`;
}

export type EdgeCacheRequest = {
  method: string;
  pathname: string;
  /** Whether the request carries the session cookie at all (even an empty or stale one). */
  hasSessionCookie: boolean;
  /** Client-router requests (RSC payloads, prefetches) are never kept: their body depends on the router state. */
  isRouterRequest: boolean;
  /** The visitor's country when a proxy states it (x-vercel-ip-country). */
  country?: string | null;
  /** The query: part of the cache key, and some keys mark a URL as one person's. */
  searchParams?: URLSearchParams;
};

/**
 * Query keys that make a URL one person's (a checkout return, an email link, a sign-in callback). The page may
 * be harmless, but a cache has no business holding a URL with a secret in it.
 */
const PERSONAL_QUERY_KEYS = new Set(["token", "session_id", "subscription_id", "payment_id", "code", "state", "oobcode", "apikey", "email", "uid"]);

/**
 * Pages whose signed-out view changes with the visitor's country (the trial
 * offer and prices, lib/entitlements-server.ts trialMarket, app/(app)/pricing).
 * The cache key has no country in it, so these are only kept when no country
 * is known (self-hosted, Varnish removes any client-sent country header).
 */
const COUNTRY_PAGES = new Set(["/", "/pricing"]);

/**
 * The Surrogate-Control value to attach to this response, or null. Only a
 * cookieless GET or HEAD of a listed page for a full HTML document qualifies.
 */
export function edgeCacheHeaderFor(request: EdgeCacheRequest): string | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.hasSessionCookie || request.isRouterRequest) return null;
  if (request.country && COUNTRY_PAGES.has(request.pathname)) return null;
  if (request.searchParams && Array.from(request.searchParams.keys()).some((key) => PERSONAL_QUERY_KEYS.has(key.toLowerCase()))) return null;
  const policy = edgeCachePolicy(request.pathname);
  return policy ? edgeCacheHeaderValue(policy) : null;
}

/** Whether a request comes from Next's client router (an RSC fetch or prefetch), not a page load. */
export function isRouterRequest(headers: Headers, searchParams: URLSearchParams): boolean {
  return headers.has("rsc") || headers.has("next-router-prefetch") || headers.has("next-router-state-tree") || searchParams.has("_rsc");
}
