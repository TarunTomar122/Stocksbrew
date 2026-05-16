import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side image proxy so client-side html-to-image can inline external
 * logo URLs (Finnhub, Clearbit, Google Favicons) without CORS canvas taint.
 *
 * Usage: /api/logo-proxy?url=<encoded-url>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  // Only allow image-ish hosts we actually use
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const allowed = [
    "static2.finnhub.io",
    "logo.clearbit.com",
    "www.google.com",
    "financialmodelingprep.com",
    "cdn.brandfetch.io",
  ];
  if (!allowed.some((h) => parsed.hostname === h || parsed.hostname.endsWith("." + h))) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "tikrr-logo-proxy/1.0" },
      // 3 s timeout — logos are small
      signal: AbortSignal.timeout(3000),
    });

    if (!upstream.ok) {
      return new NextResponse("Upstream error", { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "image/png";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Cache aggressively — logos don't change often
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Proxy fetch failed", { status: 502 });
  }
}
