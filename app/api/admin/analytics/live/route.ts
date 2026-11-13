import { NextRequest, NextResponse } from "next/server";

import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { loadLive } from "@/lib/analytics/dashboard";
import { analyticsNamespace } from "@/lib/analytics/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/** Who is on the site in the last five minutes, from the store (so both web instances' visitors count). Admin only. */
export async function GET(request: NextRequest) {
  if (!adminConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: PRIVATE });
  if (!verifyAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE });
  try {
    return NextResponse.json(await loadLive(analyticsNamespace(request.headers.get("host"))), { headers: PRIVATE });
  } catch (error) {
    console.warn("[analytics] live load failed:", (error as Error)?.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502, headers: PRIVATE });
  }
}
