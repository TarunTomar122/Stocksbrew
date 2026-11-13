import { NextRequest, NextResponse } from "next/server";

import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { loadDashboard, parseRange } from "@/lib/analytics/dashboard";
import { analyticsNamespace } from "@/lib/analytics/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/** The dashboard's numbers for one range. Admin cookie only (lib/analytics/admin-auth.ts). */
export async function GET(request: NextRequest) {
  if (!adminConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: PRIVATE });
  if (!verifyAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE });
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const data = await loadDashboard(analyticsNamespace(request.headers.get("host")), range);
    return NextResponse.json(data, { headers: PRIVATE });
  } catch (error) {
    console.warn("[analytics] dashboard load failed:", (error as Error)?.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502, headers: PRIVATE });
  }
}
