import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { isLaunchAITier } from "@/lib/ai-launch-tier";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";

import { FieldValue } from "firebase-admin/firestore";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

type TrackLogLevel = "info" | "warn" | "error";

function trackApiLog(
  traceId: string,
  level: TrackLogLevel,
  msg: string,
  meta?: Record<string, unknown>,
) {
  const line = JSON.stringify({
    svc: "api-track",
    trace_id: traceId,
    msg,
    ...meta,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const PERSONAL_TIER_LIMIT = 10;
const ON_DEMAND_QUEUE_DEDUPE_MS = 90 * 1000;

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

async function maybeQueueOnDemandNews(uid: string, instrumentId: string): Promise<boolean> {
  const coveredSnap = await adminFirestore.collection("tm_tracked_instruments").doc(instrumentId).get();
  const coveredCount = coveredSnap.exists ? Number(coveredSnap.data()?.tracked_count ?? 0) : 0;
  if (Number.isFinite(coveredCount) && coveredCount > 0) return false;

  const ref = adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId);
  let queued = false;
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const status = String(existing?.status || "");
    const updatedAtRaw = String(existing?.updated_at || "");
    const updatedAt = Date.parse(updatedAtRaw);
    const recentlyQueued =
      status === "queued" &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < ON_DEMAND_QUEUE_DEDUPE_MS;
    if (status === "running" || recentlyQueued) {
      tx.set(ref, {
        requested_by: FieldValue.arrayUnion(uid),
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
      return;
    }
    tx.set(ref, {
      instrument_id: instrumentId,
      market: instrumentId.startsWith("IN_") ? "IN" : "US",
      status: "queued",
      requested_by: FieldValue.arrayUnion(uid),
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });
    queued = true;
  });
  return queued;
}

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const session = await getSessionUser();
  if (!session) {
    trackApiLog(traceId, "warn", "post_unauthenticated", {});
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const payload = await parseTrackPayload(req);
  if (!payload) {
    trackApiLog(traceId, "warn", "post_invalid_payload", { uid: session.uid });
    return NextResponse.json({ error: "invalid instrument_id" }, { status: 400 });
  }
  const { instrumentId, positionType } = payload;
  const mutationToken = new Date().toISOString();
  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();

  trackApiLog(traceId, "info", "post_track_request", {
    uid: session.uid,
    instrument_id: instrumentId,
    position_type: positionType,
  });

  const existing = await getUserDoc(session.uid);
  if (!existing || !resolveIsSubscribed(existing)) {
    await recordLifecycleEvent({
      uid: session.uid,
      email: session.email ?? null,
      type: "track_blocked_subscription_required",
      payload: {
        instrument_id: instrumentId,
        position_type: positionType,
      },
    }).catch(() => undefined);
    trackApiLog(traceId, "warn", "post_subscription_required", { uid: session.uid, instrument_id: instrumentId });
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
      trackApiLog(traceId, "warn", "post_tier_limit", {
        uid: session.uid,
        instrument_id: instrumentId,
        limit: PERSONAL_TIER_LIMIT,
      });
      return NextResponse.json(
        { error: "tier_limit_reached", limit: PERSONAL_TIER_LIMIT },
        { status: 409 },
      );
    }
  }

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const eventRef = userRef.collection("watchlist_events").doc(clientMutationId);
  let sourceVersion = Number(existing.watchlist_version ?? 0);
  let wasAlreadyTrackedInTxn = current.includes(instrumentId);
  await adminFirestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const dedupeSnap = await tx.get(eventRef);
    if (dedupeSnap.exists) {
      const v = Number(dedupeSnap.data()?.version ?? userData?.watchlist_version ?? 0);
      sourceVersion = Number.isFinite(v) ? v : 0;
      const tracked = Array.isArray(userData?.tracked_stocks) ? (userData!.tracked_stocks as string[]) : [];
      wasAlreadyTrackedInTxn = tracked.includes(instrumentId);
      return;
    }
    const tracked = Array.isArray(userData?.tracked_stocks) ? (userData!.tracked_stocks as string[]) : [];
    const alreadyTracked = tracked.includes(instrumentId);
    const positions = (
      userData?.watchlist_positions &&
      typeof userData.watchlist_positions === "object" &&
      !Array.isArray(userData.watchlist_positions)
    )
      ? { ...(userData.watchlist_positions as Record<string, "holding" | "watchlist">) }
      : {};
    positions[instrumentId] = positionType;
    wasAlreadyTrackedInTxn = alreadyTracked;
    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: alreadyTracked ? tracked : [...tracked, instrumentId],
        watchlist_positions: positions,
        watchlist_updated_at: mutationToken,
        watchlist_version: sourceVersion,
        last_tracked_at: new Date().toISOString(),
      },
      { merge: true },
    );
    tx.set(eventRef, {
      kind: "SET_POSITION",
      instrument_id: instrumentId,
      position_type: positionType,
      version: sourceVersion,
      created_at: mutationToken,
    });
  });
  trackApiLog(traceId, "info", "post_track_state_written", {
    uid: session.uid,
    instrument_id: instrumentId,
    watchlist_version: sourceVersion,
  });
  if (!wasAlreadyTrackedInTxn) {
    const queued = await maybeQueueOnDemandNews(session.uid, instrumentId).catch(() => false);
    trackApiLog(traceId, "info", queued ? "on_demand_news_queued" : "on_demand_news_not_queued", {
      uid: session.uid,
      instrument_id: instrumentId,
    });
  }

  trackApiLog(traceId, "info", "post_track_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const traceId = randomUUID();
  const session = await getSessionUser();
  if (!session) {
    trackApiLog(traceId, "warn", "delete_unauthenticated", {});
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const payload = await parseTrackPayload(req);
  if (!payload) {
    trackApiLog(traceId, "warn", "delete_invalid_payload", { uid: session.uid });
    return NextResponse.json({ error: "invalid instrument_id" }, { status: 400 });
  }
  const { instrumentId } = payload;
  const mutationToken = new Date().toISOString();
  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();

  trackApiLog(traceId, "info", "delete_untrack_request", {
    uid: session.uid,
    instrument_id: instrumentId,
  });

  const existing = await getUserDoc(session.uid);
  const userRef = adminFirestore.collection("users").doc(session.uid);
  const eventRef = userRef.collection("watchlist_events").doc(clientMutationId);
  let sourceVersion = Number(existing?.watchlist_version ?? 0);
  await adminFirestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const dedupeSnap = await tx.get(eventRef);
    if (dedupeSnap.exists) {
      const v = Number(dedupeSnap.data()?.version ?? userData?.watchlist_version ?? 0);
      sourceVersion = Number.isFinite(v) ? v : 0;
      return;
    }
    const tracked = Array.isArray(userData?.tracked_stocks) ? (userData!.tracked_stocks as string[]) : [];
    const positions = (
      userData?.watchlist_positions &&
      typeof userData.watchlist_positions === "object" &&
      !Array.isArray(userData.watchlist_positions)
    )
      ? { ...(userData.watchlist_positions as Record<string, "holding" | "watchlist">) }
      : {};
    delete positions[instrumentId];
    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: FieldValue.arrayRemove(instrumentId),
        watchlist_positions: positions,
        watchlist_updated_at: mutationToken,
        watchlist_version: sourceVersion,
      },
      { merge: true },
    );
    tx.set(eventRef, {
      kind: "REMOVE_POSITION",
      instrument_id: instrumentId,
      version: sourceVersion,
      created_at: mutationToken,
    });
  });
  trackApiLog(traceId, "info", "delete_track_state_written", {
    uid: session.uid,
    instrument_id: instrumentId,
    watchlist_version: sourceVersion,
  });

  trackApiLog(traceId, "info", "delete_untrack_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true });
}
