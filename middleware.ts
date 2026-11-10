import { NextRequest, NextResponse } from "next/server";
import { appendVaryAccept, preferredType } from "@/lib/accept";

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

  // Signed-in people skip the landing page and go straight to their portfolio.
  // Only the cookie's presence is checked here (the edge cannot verify it); a
  // stale cookie just lands on /watchlist's signed-out view. `/?home=1` keeps
  // the landing page reachable for someone who is signed in.
  if (
    request.nextUrl.pathname === "/" &&
    request.method === "GET" &&
    request.cookies.has(SESSION_COOKIE_NAME) &&
    !request.nextUrl.searchParams.has("home")
  ) {
    const portfolioUrl = request.nextUrl.clone();
    portfolioUrl.pathname = "/watchlist";
    const response = NextResponse.redirect(portfolioUrl, 307);
    response.headers.set("Cache-Control", "private, no-store");
    appendVaryAccept(response.headers);
    return response;
  }

  const waitlist = process.env.NEXT_PUBLIC_WAITLIST_MODE === "true";
  if (!waitlist) {
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
