import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { seenAtFromBody } from "@/lib/inbox/seen";
import { markInboxSeen } from "@/lib/inbox/server";

export const dynamic = "force-dynamic";

/**
 * Marks the inbox read up to a time: `{ at }` from the browser (the newest item it showed, sent after the list has
 * been in view or when an item is followed), or now with no body ("Mark all read"). Never later than now, and the
 * mark only moves forward. One field, `inbox_seen_at`, merged into the signed-in person's own user doc; nothing else
 * on the doc is touched.
 */
export async function POST(request: Request) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    const seenAt = await markInboxSeen(session.uid, seenAtFromBody(body));
    return NextResponse.json({ ok: true, seenAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status === 409 ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? "profile_not_ready" : "unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
