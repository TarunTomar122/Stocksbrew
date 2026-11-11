import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { markInboxSeen } from "@/lib/inbox/server";

export const dynamic = "force-dynamic";

/**
 * "Mark all read": moves `inbox_seen_at` on the signed-in person's own user
 * doc to now. One field, merged; nothing else on the doc is touched.
 */
export async function POST() {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const seenAt = await markInboxSeen(session.uid);
    return NextResponse.json({ ok: true, seenAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status === 409 ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? "profile_not_ready" : "unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
