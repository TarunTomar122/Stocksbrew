import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { isLaunchAITier } from "@/lib/ai-launch-tier";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";
import { getActiveUniverse } from "@/lib/firestore";

import { FieldValue } from "firebase-admin/firestore";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

const PERSONAL_TIER_LIMIT = 10;

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

async function enqueueOnDemandNewsJob(uid: string, instrumentId: string) {
  const market = marketFromInstrumentId(instrumentId);
  const universe = await getActiveUniverse(market);
  const ref = adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId);
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const status = String(existing?.status || "");
    if (status === "running") {
      tx.set(ref, {
        requested_by: FieldValue.arrayUnion(uid),
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
      return;
    }
    tx.set(ref, {
      instrument_id: instrumentId,
      market,
      universe_id: universe,
      status: "queued",
      requested_by: FieldValue.arrayUnion(uid),
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });
  });
}

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

// rebuildAndSaveWatchlistView fans out into 20+ Firestore reads (per-stock
// prices, intel, technicals, mentions, alerts, portfolio diagnostics,
// thematic suggestions). Awaiting it inline made every track/untrack feel
// like 1.5–3s of UI freeze. We now fire-and-forget — the next /watchlist
// visit will show the rebuilt view or, in the worst case, lazily rebuild on
// page load (the page has a fallback path for that).
function kickRebuild(
  uid: string,
  trackedStocks: string[],
  positions: Record<string, "watchlist" | "holding">,
  newlyTrackedInstrumentId?: string,
) {
  (async () => {
    if (newlyTrackedInstrumentId) {
      await enqueueOnDemandNewsJob(uid, newlyTrackedInstrumentId);
    }
    await rebuildAndSaveWatchlistView(uid, trackedStocks, positions);
  })().catch((err) => {
    console.error("[api/track] background coverage/rebuild failed:", err);
  });
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

  const nextTracked = current.includes(instrumentId)
    ? current
    : [...current, instrumentId];
  kickRebuild(session.uid, nextTracked, {
    ...(existing.watchlist_positions || {}),
    [instrumentId]: positionType,
  }, current.includes(instrumentId) ? undefined : instrumentId);

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

  // Read once, compute the next state locally, then issue a single write.
  // The previous version did a write then re-read just to feed the rebuild,
  // which doubled the round trips against Firestore.
  const existing = await getUserDoc(session.uid);
  const currentTracked = Array.isArray(existing?.tracked_stocks)
    ? existing!.tracked_stocks!
    : [];
  const nextTracked = currentTracked.filter((id) => id !== instrumentId);
  const nextPositions = { ...(existing?.watchlist_positions || {}) };
  delete nextPositions[instrumentId];

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      tracked_stocks: FieldValue.arrayRemove(instrumentId),
      [`watchlist_positions.${instrumentId}`]: FieldValue.delete(),
    },
    { merge: true },
  );

  kickRebuild(session.uid, nextTracked, nextPositions);

  return NextResponse.json({ ok: true });
}
