import { NextRequest, NextResponse } from "next/server";

import { BRIEFING_ITEM_STATUSES, type BriefingItemStatus } from "@/lib/briefing";
import { BriefingStateError, writeBriefingItemState } from "@/lib/briefing-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Save what the signed-in person did with one briefing item: "dismissed"
 * (Got it), "kept" (Keep watching) or "open" (undo). The document is the
 * person's own, `tm_briefing_state/{uid}__{day}`, with the uid taken from the
 * session and never from the request.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to save this." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { day?: unknown; item_id?: unknown; status?: unknown } | null;
  const status = body?.status as BriefingItemStatus;
  if (
    typeof body?.day !== "string" ||
    typeof body?.item_id !== "string" ||
    !BRIEFING_ITEM_STATUSES.includes(status)
  ) {
    return NextResponse.json({ error: "Missing day, item or status." }, { status: 400 });
  }
  try {
    const items = await writeBriefingItemState({ uid: session.uid, day: body.day, itemId: body.item_id, status });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof BriefingStateError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
