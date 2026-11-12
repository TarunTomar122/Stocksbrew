import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { nextVisits, readVisits } from "@/lib/since-visit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Records a briefing visit for "Since you last looked" (lib/since-visit.ts): one field, `briefing_visits`
 * ({ last_at, prev_at }), merged into the signed-in person's own user doc, with the uid from the session and never
 * from the request. A visit within half an hour of the last one changes nothing. Nothing else on the doc is touched.
 */
export async function POST() {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const ref = adminFirestore.collection("users").doc(session.uid);
  try {
    const result = await adminFirestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw Object.assign(new Error("profile_not_ready"), { status: 409 });
      const next = nextVisits(readVisits((snap.data() as Record<string, unknown> | undefined)?.briefing_visits), new Date());
      if (!next) return { recorded: false };
      transaction.set(ref, { briefing_visits: next }, { merge: true });
      return { recorded: true };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status === 409 ? 409 : 503;
    if (status === 503) console.warn("[briefing visit] write failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: status === 409 ? "profile_not_ready" : "unavailable" }, { status, headers: NO_STORE });
  }
}
