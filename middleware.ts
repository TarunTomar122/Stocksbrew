import { NextRequest, NextResponse } from "next/server";
import { appendVaryAccept, preferredType } from "@/lib/accept";

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
