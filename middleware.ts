import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const waitlist = process.env.NEXT_PUBLIC_WAITLIST_MODE === "true";
  if (!waitlist) return NextResponse.next();

  const { pathname } = request.nextUrl;

  const allowed =
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  if (allowed) return NextResponse.next();

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
