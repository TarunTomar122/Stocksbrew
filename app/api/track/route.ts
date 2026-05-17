import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { FREE_RADAR_TRACK_LIMIT, canTrackMore } from "@/lib/pro-features";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";

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

const ON_DEMAND_QUEUE_DEDUPE_MS = 90 * 1000;
const WATCHLIST_REFRESH_DEDUPE_MS = 45 * 1000;

async function shouldRunImmediateRefresh(uid: string, sourceVersion: number): Promise<boolean> {
  const ref = adminFirestore.collection("tm_watchlist_view_refresh_control").doc(uid);
  const nowIso = new Date().toISOString();
  let shouldRun = false;
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() || {}) : {};
    const lastVersion = Number(current.last_source_version ?? 0);
    const lastRequestedAtRaw = String(current.last_requested_at ?? "");
    const lastRequestedAt = Date.parse(lastRequestedAtRaw);
    const recentlyRequested =
      Number.isFinite(lastRequestedAt) && Date.now() - lastRequestedAt < WATCHLIST_REFRESH_DEDUPE_MS;
    if (lastVersion >= sourceVersion && recentlyRequested) {
      tx.set(
        ref,
        {
          last_seen_version: sourceVersion,
          updated_at: nowIso,
        },
        { merge: true },
      );
      shouldRun = false;
      return;
    }
    tx.set(
      ref,
      {
        last_source_version: sourceVersion,
        last_requested_at: nowIso,
        updated_at: nowIso,
      },
      { merge: true },
    );
    shouldRun = true;
  });
  return shouldRun;
}

async function refreshUserRadarNow(traceId: string, uid: string, sourceVersion: number): Promise<void> {
  const shouldRun = await shouldRunImmediateRefresh(uid, sourceVersion);
  if (!shouldRun) {
    trackApiLog(traceId, "info", "watchlist_refresh_deduped", {
      uid,
      source_version: sourceVersion,
    });
    return;
  }
  const fresh = await getUserDoc(uid);
  const tracked = Array.isArray(fresh?.tracked_stocks) ? fresh.tracked_stocks : [];
  const isSubscribed = resolveIsSubscribed(fresh);
  const positions =
    fresh?.watchlist_positions && typeof fresh.watchlist_positions === "object"
      ? fresh.watchlist_positions
      : {};
  await rebuildAndSaveWatchlistView(uid, tracked, positions, isSubscribed, sourceVersion, {
    preserveBriefIfFallback: true,
    preserveDirectivesIfMissing: true,
    preserveActivityIfThin: true,
  });
  trackApiLog(traceId, "info", "watchlist_refresh_ok", {
    uid,
    source_version: sourceVersion,
    tracked_count: tracked.length,
  });
}

async function parseTrackPayload(req: NextRequest): Promise<{
  instrumentId: string;
  positionType: "holding" | "watchlist";
  skipRefresh: boolean;
} | null> {
  try {
    const body = await req.json();
    const raw = typeof body?.instrument_id === "string" ? body.instrument_id : "";
    if (!INSTRUMENT_ID_RE.test(raw)) return null;
    return {
      instrumentId: raw,
      positionType: body?.position_type === "holding" ? "holding" : "watchlist",
      skipRefresh: body?.skip_refresh === true,
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

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
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
  const { instrumentId, positionType, skipRefresh } = payload;
  const mutationToken = new Date().toISOString();
  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();

  trackApiLog(traceId, "info", "post_track_request", {
    uid: session.uid,
    instrument_id: instrumentId,
    position_type: positionType,
  });

  const existing = await getUserDoc(session.uid);
  const isSubscribed = existing ? resolveIsSubscribed(existing) : false;
  if (!existing) {
    trackApiLog(traceId, "warn", "post_user_missing", { uid: session.uid, instrument_id: instrumentId });
    return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  }

  const current = Array.isArray(existing.tracked_stocks) ? existing.tracked_stocks : [];
  if (!current.includes(instrumentId) && !canTrackMore(isSubscribed, current.length)) {
      await recordLifecycleEvent({
        uid: session.uid,
        email: session.email ?? null,
        type: "track_blocked_subscription_required",
        payload: {
          instrument_id: instrumentId,
          position_type: positionType,
          free_tier_limit: FREE_RADAR_TRACK_LIMIT,
        },
      }).catch(() => undefined);
      trackApiLog(traceId, "warn", "post_free_tier_limit", {
        uid: session.uid,
        instrument_id: instrumentId,
        limit: FREE_RADAR_TRACK_LIMIT,
      });
      return NextResponse.json(
        { error: "free_tier_limit_reached", limit: FREE_RADAR_TRACK_LIMIT, reason: "Free Radar supports up to 3 stocks." },
        { status: 409 },
      );
  }

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const eventRef = userRef.collection("watchlist_events").doc(clientMutationId);
  const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
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
    if (!alreadyTracked) {
      tx.set(
        trackedRef,
        {
          instrument_id: instrumentId,
          market: marketFromInstrumentId(instrumentId),
          tracked_count: FieldValue.increment(1),
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
    }
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
  if (!skipRefresh) {
    await refreshUserRadarNow(traceId, session.uid, sourceVersion).catch((error) => {
      trackApiLog(traceId, "warn", "watchlist_refresh_failed", {
        uid: session.uid,
        instrument_id: instrumentId,
        error: String(error),
      });
    });
  } else {
    trackApiLog(traceId, "info", "watchlist_refresh_skipped_by_client", {
      uid: session.uid,
      instrument_id: instrumentId,
      source_version: sourceVersion,
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
  const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
  let sourceVersion = Number(existing?.watchlist_version ?? 0);
  let wasTrackedInTxn = false;
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
    wasTrackedInTxn = tracked.includes(instrumentId);
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
    if (wasTrackedInTxn) {
      tx.set(
        trackedRef,
        {
          instrument_id: instrumentId,
          market: marketFromInstrumentId(instrumentId),
          tracked_count: FieldValue.increment(-1),
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
    }
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
    was_tracked: wasTrackedInTxn,
  });
  await refreshUserRadarNow(traceId, session.uid, sourceVersion).catch((error) => {
    trackApiLog(traceId, "warn", "watchlist_refresh_failed", {
      uid: session.uid,
      instrument_id: instrumentId,
      error: String(error),
    });
  });

  trackApiLog(traceId, "info", "delete_untrack_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true });
}
