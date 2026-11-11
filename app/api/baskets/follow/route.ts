import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { BASKET_SHOWN } from "@/lib/baskets-plain/match";
import { FOLLOWED_FIELD, followEntry, nextFollowed, readFollowedBaskets } from "@/lib/baskets-plain/follow";
import { loadBasket, readStoredBasket } from "@/lib/baskets-plain/server";
import { isEmptySpec, specTitle } from "@/lib/baskets-plain/spec";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST { slug, followed: boolean }. Follows or stops following a plain-English
 * basket on the signed-in user's own doc (one field, `followed_baskets`). The
 * members and their prices are taken on the server from today's snapshot,
 * never from the request, so the record since following cannot be edited.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: unknown; followed?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!slug || typeof body?.followed !== "boolean") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const wanted = body.followed;

  const viewer = await getViewer();
  // GATE: there is no row for followed baskets in lib/entitlements.ts yet. A basket is a saved screen with a
  // backtest, so it borrows the saved-screens count (Free 2, Pro unlimited) until the lead adds its own row.
  const limit = limitFor("saved_screens", viewer.plan);

  let entry = null;
  if (wanted) {
    const stored = await readStoredBasket(slug);
    if (!stored) return NextResponse.json({ error: "unknown_basket" }, { status: 404 });
    const loaded = await loadBasket(stored, viewer.plan, { backtest: false });
    if (!loaded) return NextResponse.json({ error: "unavailable", message: "We could not read today's prices just now. Try again in a minute." }, { status: 503 });
    if (loaded.callDropped && isEmptySpec(loaded.spec)) {
      return NextResponse.json({ error: "pro_required", message: "This basket screens by our call, which is part of Pro." }, { status: 403 });
    }
    entry = followEntry({ slug, title: specTitle(loaded.spec), rows: loaded.match.members.slice(0, BASKET_SHOWN).map((member) => member.row), benchmark: loaded.benchmarkRow, now: new Date() });
    if (entry.members.length === 0) return NextResponse.json({ error: "empty_basket", message: "Nothing fits this basket today, so there is nothing to follow yet." }, { status: 409 });
  }

  const ref = adminFirestore.collection("users").doc(session.uid);
  const outcome = await adminFirestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    // The profile doc is created at sign-in. Never create a partial one here.
    if (!snapshot.exists) return null;
    const current = readFollowedBaskets(snapshot.data());
    const next = entry ? nextFollowed(current, entry, true, limit) : current.filter((item) => item.slug !== slug);
    if (next === "limit") return "limit" as const;
    tx.set(ref, { [FOLLOWED_FIELD]: next }, { merge: true });
    return next;
  });
  if (outcome === null) return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  if (outcome === "limit") {
    return NextResponse.json(
      {
        error: "plan_limit",
        limit,
        message: Number.isFinite(limit)
          ? `Your plan follows ${limit} ${limit === 1 ? "basket" : "baskets"} at a time. Open one you follow and press Following to stop, or go Pro to follow more.`
          : "You follow as many baskets as one account can keep. Open one you follow and press Following to stop.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, followed: outcome.some((item) => item.slug === slug) });
}
