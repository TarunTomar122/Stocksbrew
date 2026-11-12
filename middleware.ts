import { NextRequest, NextResponse } from "next/server";
import { appendVaryAccept, preferredType } from "@/lib/accept";
import { anonViewPath, isAnonViewPath, publicPathname } from "@/lib/anon-view";
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
  // (/portfolio?tab=holdings). Only the cookie's presence is checked here (the
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
    // Their holdings first (owner, Nov 12: "when I go to stocksbrew.online I should land on /portfolio?tab=holdings
    // if I'm signed in").
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/portfolio";
    homeUrl.search = "?tab=holdings";
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
      appendVaryAccept(response.headers);
      return response;
    }
    const response = NextResponse.next();
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
