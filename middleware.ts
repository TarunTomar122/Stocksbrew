import { NextRequest, NextResponse } from "next/server";
import { appendVaryAccept, preferredType } from "@/lib/accept";
import { anonViewPath, isAnonViewPath, publicPathname } from "@/lib/anon-view";
import { EDGE_CACHE_HEADER, edgeCacheHeaderFor, isRouterRequest } from "@/lib/edge-cache-policy";
import { parsePairSlug } from "@/lib/seo/pair-slug";
import { getMarketSessionState } from "@/lib/market-session";

/** Same name as app/api/auth/session/route.ts and lib/auth-server.ts. */
const SESSION_COOKIE_NAME = "tikrr_session";

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (hostname === "tikrr.online" || hostname === "www.tikrr.online") {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https";
    canonicalUrl.hostname = "www.stocksbrew.online";
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // Stock-against-stock pages live at one address: lower case, tickers in
  // alphabetical order. /compare/NVDA-vs-AMD and /compare/nvda-vs-amd go to
  // /compare/amd-vs-nvda in one hop. Whether the pair has a page is the page's call.
  const pairMatch = /^\/compare\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (pairMatch) {
    const parsed = parsePairSlug(pairMatch[1]);
    if (parsed && !parsed.isCanonical) {
      const pairUrl = request.nextUrl.clone();
      pairUrl.pathname = `/compare/${parsed.slug}`;
      const response = NextResponse.redirect(pairUrl, 308);
      appendVaryAccept(response.headers);
      return response;
    }
  }

  // Premarket is a before-the-open read. From the 9:30 ET open (and overnight, on weekends and holidays) it would
  // be the last session's numbers dressed as today's, so the address goes to Market today (owner, Nov 12).
  if (request.nextUrl.pathname === "/premarket" && getMarketSessionState().kind !== "premarket") {
    const todayUrl = request.nextUrl.clone();
    todayUrl.pathname = "/explore";
    todayUrl.search = "";
    return NextResponse.redirect(todayUrl, 307);
  }

  // Signals is Reddit and the President now; its old movers tab was another copy of Market today's list. Done here
  // rather than in next.config.js so the old filters (?tab=movers&show=up) are dropped instead of carried along.
  if (request.nextUrl.pathname === "/signals" && request.nextUrl.searchParams.get("tab")?.toLowerCase() === "movers") {
    const movesUrl = request.nextUrl.clone();
    movesUrl.pathname = "/explore";
    movesUrl.search = "";
    movesUrl.hash = "moves";
    const response = NextResponse.redirect(movesUrl, 308);
    appendVaryAccept(response.headers);
    return response;
  }

  // Signals is one page since Nov 12 (owner: "You don't need tabs for this"): Reddit, then the President's posts. An
  // old tab address lands on its section, keeping the policy filters (?tab=policy&show=named -> ?show=named#policy).
  // app/(app)/signals/page.tsx redirects the same way (lib/signals-shared.ts legacySignalsHref) if this is bypassed.
  if (request.nextUrl.pathname === "/signals" && request.nextUrl.searchParams.has("tab")) {
    const tab = request.nextUrl.searchParams.get("tab")?.toLowerCase();
    const sectionUrl = request.nextUrl.clone();
    sectionUrl.searchParams.delete("tab");
    sectionUrl.hash = tab === "reddit" || tab === "policy" ? tab : "";
    const response = NextResponse.redirect(sectionUrl, 308);
    appendVaryAccept(response.headers);
    return response;
  }

  const acceptHeader = request.headers.get("accept");
  const chosen = preferredType(acceptHeader);
  if (chosen === "text/markdown") {
    const markdownUrl = request.nextUrl.clone();
    markdownUrl.pathname = `/api/markdown${request.nextUrl.pathname}`;
    const response = NextResponse.rewrite(markdownUrl);
    appendVaryAccept(response.headers);
    return response;
  }
  if (chosen === null && acceptHeader) {
    return new Response("Not Acceptable\n\nAvailable: text/html, text/markdown\n", {
      status: 406,
      headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept" },
    });
  }

  // Signed-in people skip the landing page and go straight to their holdings
  // (/portfolio). Only the cookie's presence is checked here (the
  // edge cannot verify it); a stale cookie just lands on the signed-out view,
  // the example portfolio's. `/?home=1` keeps the landing page reachable for
  // someone who is signed in.
  if (
    request.nextUrl.pathname === "/" &&
    request.method === "GET" &&
    request.cookies.has(SESSION_COOKIE_NAME) &&
    !request.nextUrl.searchParams.has("home") &&
    // A shared "/?try=NVDA,JPM" link shows its cards to anyone who opens it, signed in or not.
    !request.nextUrl.searchParams.has("try")
  ) {
    // Their briefing first (owner, Nov 13: "we can now start sending signed in users to /briefing, it's a good page";
    // before that, Nov 12, it was their holdings on /portfolio).
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/briefing";
    homeUrl.search = "";
    const response = NextResponse.redirect(homeUrl, 307);
    response.headers.set("Cache-Control", "private, no-store");
    appendVaryAccept(response.headers);
    return response;
  }

  // The cached copies are internal addresses. Someone who lands on one
  // directly goes to the page it stands for, so it is never indexed or shared.
  if (isAnonViewPath(request.nextUrl.pathname)) {
    const publicUrl = request.nextUrl.clone();
    publicUrl.pathname = publicPathname(request.nextUrl.pathname);
    const response = NextResponse.redirect(publicUrl, 308);
    appendVaryAccept(response.headers);
    return response;
  }

  const waitlist = process.env.NEXT_PUBLIC_WAITLIST_MODE === "true";
  if (!waitlist) {
    // How long the shared cache (Varnish) may keep this signed-out page (lib/edge-cache-policy.ts). Null for anyone
    // with a session cookie, for client-router requests and for pages not on the public list.
    const edgeCache = edgeCacheHeaderFor({
      method: request.method,
      pathname: request.nextUrl.pathname,
      hasSessionCookie: request.cookies.has(SESSION_COOKIE_NAME),
      isRouterRequest: isRouterRequest(request.headers, request.nextUrl.searchParams),
      country: request.headers.get("x-vercel-ip-country"),
      searchParams: request.nextUrl.searchParams,
    });
    // Signed-out visitors get the cached copy of the busiest public pages
    // (lib/anon-view.ts): the same page, served by the CDN instead of being
    // rendered again. Anyone with a session cookie (even a stale one) gets the
    // live page, so nothing personal is ever cached.
    const anonPath =
      (request.method === "GET" || request.method === "HEAD") && !request.cookies.has(SESSION_COOKIE_NAME)
        ? anonViewPath({
            pathname: request.nextUrl.pathname,
            searchParams: request.nextUrl.searchParams,
            country: request.headers.get("x-vercel-ip-country"),
          })
        : null;
    if (anonPath) {
      const anonUrl = request.nextUrl.clone();
      anonUrl.pathname = anonPath;
      // The copy is built without a query; the browser still sees the full address.
      anonUrl.search = "";
      const response = NextResponse.rewrite(anonUrl);
      response.headers.set("x-stocksbrew-view", "cached");
      if (edgeCache) response.headers.set(EDGE_CACHE_HEADER, edgeCache);
      appendVaryAccept(response.headers);
      return response;
    }
    const response = NextResponse.next();
    if (edgeCache) response.headers.set(EDGE_CACHE_HEADER, edgeCache);
    appendVaryAccept(response.headers);
    return response;
  }

  const { pathname } = request.nextUrl;

  const allowed =
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  if (allowed) {
    const response = NextResponse.next();
    appendVaryAccept(response.headers);
    return response;
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  appendVaryAccept(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|_vercel/|favicon.ico).*)"],
};
