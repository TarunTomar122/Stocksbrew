import { NextRequest, NextResponse } from "next/server";

import { buildBasketFromText } from "@/lib/baskets-plain/server";
import { getViewer } from "@/lib/entitlements-server";

export const dynamic = "force-dynamic";

/**
 * GET ?q=<request>. The basket form posts here as a plain GET so it works
 * without scripts. It reads the request, stores the basket and sends the
 * browser to its page; when nothing could be built it sends them back to
 * the form with the reason, and the form page explains it.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const back = (why: string) => {
    const url = new URL("/baskets/new", req.nextUrl.origin);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("why", why);
    return NextResponse.redirect(url, 303);
  };
  if (!q) return NextResponse.redirect(new URL("/baskets/new", req.nextUrl.origin), 303);
  const outcome = await buildBasketFromText(q, await getViewer());
  if (!outcome.ok) return back(outcome.reason);
  // The person's own words ride along in the address, so their page shows what they typed and what we could not use.
  const url = new URL(`/baskets/${outcome.slug}`, req.nextUrl.origin);
  url.searchParams.set("q", q);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
