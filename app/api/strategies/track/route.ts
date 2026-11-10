import { NextRequest, NextResponse } from "next/server";

import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getStrategy, readTrackedStrategies } from "@/lib/strategies";

export const dynamic = "force-dynamic";

const MAX_TRACKED = 40;

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const doc = await adminFirestore.collection("users").doc(session.uid).get();
  return NextResponse.json({ tracked: readTrackedStrategies(doc.exists ? doc.data() : null) });
}

/** POST { slug, tracked: boolean }. Merges one field, `tracked_strategies`, into the signed-in user's own doc. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: unknown; tracked?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!slug || typeof body?.tracked !== "boolean") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (!(await getStrategy(slug))) return NextResponse.json({ error: "unknown_strategy" }, { status: 404 });

  const ref = adminFirestore.collection("users").doc(session.uid);
  const wanted = body.tracked;
  const planLimit = limitFor("followed_strategies", (await getViewer()).plan);
  // Following is a Pro feature. Stopping is always allowed, so anyone who followed one before keeps the way out.
  if (wanted && planLimit === 0) {
    return NextResponse.json(
      { error: "pro_required", feature: "followed_strategies", message: "Following a strategy is part of Pro." },
      { status: 403 },
    );
  }
  const tracked = await adminFirestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    // The profile doc is created at sign-in. Never create a partial one here.
    if (!snapshot.exists) return null;
    const current = readTrackedStrategies(snapshot.exists ? snapshot.data() : null);
    const without = current.filter((item) => item.slug !== slug);
    if (wanted && !current.some((item) => item.slug === slug) && without.length >= planLimit) return "limit" as const;
    const next = wanted ? [...without, { slug, tracked_at: new Date().toISOString() }].slice(-MAX_TRACKED) : without;
    transaction.set(ref, { tracked_strategies: next }, { merge: true });
    return next;
  });
  if (tracked === null) return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  if (tracked === "limit") {
    return NextResponse.json(
      { error: "plan_limit", feature: "followed_strategies", limit: planLimit, message: `Your plan follows ${planLimit} ${planLimit === 1 ? "strategy" : "strategies"}. Stop following another to follow this one.` },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, tracked });
}
