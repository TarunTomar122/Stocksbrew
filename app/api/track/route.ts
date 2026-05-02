import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { isLaunchAITier } from "@/lib/ai-launch-tier";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";

import { FieldValue } from "firebase-admin/firestore";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

const PERSONAL_TIER_LIMIT = 10;

async function parseTrackPayload(req: NextRequest): Promise<{
  instrumentId: string;
  positionType: "holding" | "watchlist";
} | null> {
  try {
    const body = await req.json();
    const raw = typeof body?.instrument_id === "string" ? body.instrument_id : "";
    if (!INSTRUMENT_ID_RE.test(raw)) return null;
    return {
      instrumentId: raw,
      positionType: body?.position_type === "holding" ? "holding" : "watchlist",
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const payload = await parseTrackPayload(req);
  if (!payload) {
    return NextResponse.json({ error: "invalid instrument_id" }, { status: 400 });
  }
  const { instrumentId, positionType } = payload;

  const existing = await getUserDoc(session.uid);
  if (!existing || !resolveIsSubscribed(existing)) {
    return NextResponse.json(
      { error: "subscription_required", reason: "Tracking a stock adds it to your personal AI tier, which runs real LLM briefs twice daily." },
      { status: 403 },
    );
  }

  const current = Array.isArray(existing.tracked_stocks) ? existing.tracked_stocks : [];
  // Launch-tier stocks are already covered by the free AI run — adding them
  // to a watchlist costs zero extra LLM, so they don't consume a slot in the
  // personal-tier limit. Only count non-launch stocks against the cap.
  const isLaunch = isLaunchAITier(instrumentId);
  if (!isLaunch && !current.includes(instrumentId)) {
    const personalCount = current.filter((id) => !isLaunchAITier(id)).length;
    if (personalCount >= PERSONAL_TIER_LIMIT) {
      return NextResponse.json(
        { error: "tier_limit_reached", limit: PERSONAL_TIER_LIMIT },
        { status: 409 },
      );
    }
  }

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      tracked_stocks: FieldValue.arrayUnion(instrumentId),
      [`watchlist_positions.${instrumentId}`]: positionType,
      last_tracked_at: new Date().toISOString(),
    },
    { merge: true },
  );

  // Rebuild this user's materialized watchlist view inline so /watchlist
  // reflects the change on next navigation without waiting for the next
  // pre-market run.
  const nextTracked = current.includes(instrumentId)
    ? current
    : [...current, instrumentId];
  try {
    await rebuildAndSaveWatchlistView(session.uid, nextTracked, {
      ...(existing.watchlist_positions || {}),
      [instrumentId]: positionType,
    });
  } catch (err) {
    console.error("[api/track] failed to rebuild watchlist view:", err);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const payload = await parseTrackPayload(req);
  if (!payload) {
    return NextResponse.json({ error: "invalid instrument_id" }, { status: 400 });
  }
  const { instrumentId } = payload;

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      tracked_stocks: FieldValue.arrayRemove(instrumentId),
      [`watchlist_positions.${instrumentId}`]: FieldValue.delete(),
    },
    { merge: true },
  );

  const existing = await getUserDoc(session.uid);
  const current = Array.isArray(existing?.tracked_stocks) ? existing!.tracked_stocks! : [];
  try {
    await rebuildAndSaveWatchlistView(session.uid, current, existing?.watchlist_positions || {});
  } catch (err) {
    console.error("[api/track] failed to rebuild watchlist view:", err);
  }

  return NextResponse.json({ ok: true });
}
