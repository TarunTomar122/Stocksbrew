import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { FREE_RADAR_TRACK_LIMIT, canTrackMore } from "@/lib/pro-features";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";
import { triggerDispatchLane } from "@/lib/cloud-run-dispatch";
import { logEmailSend } from "@/lib/email-log";
import { sendTransactionalEmail, buildFirstRadarItemEmail, firstNameFromEmail } from "@/lib/brevo";

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


async function maybeFireFirstRadarItemEmail(
  traceId: string,
  uid: string,
  email: string,
): Promise<void> {
  const dedupeKey = `first_radar_item:${uid}`;
  const logRef = adminFirestore.collection("tm_lifecycle_email_log").doc(dedupeKey);
  const existing = await logRef.get();
  if (existing.exists) {
    trackApiLog(traceId, "info", "first_radar_item_email_already_sent", { uid });
    return;
  }
  const firstName = firstNameFromEmail(email);
  const { subject, html } = buildFirstRadarItemEmail(firstName);
  const sent = await sendTransactionalEmail(email, subject, html);
  if (sent) {
    await logRef.set({ uid, email, sent_at: new Date().toISOString() });
    await logEmailSend({
      uid,
      email,
      emailType: "subscriber_first_radar",
      dedupeKey,
      subject,
      triggerType: "track_post",
      meta: { source: "first_radar_item" },
    }).catch(() => undefined);
    await recordLifecycleEvent({
      uid,
      email,
      type: "first_radar_item_email_sent",
      payload: { dedup_key: dedupeKey },
    }).catch(() => undefined);
    trackApiLog(traceId, "info", "first_radar_item_email_sent", { uid, email });
  } else {
    trackApiLog(traceId, "warn", "first_radar_item_email_failed", { uid, email });
  }
}

async function queueWatchlistRefresh(
  traceId: string,
  uid: string,
  sourceVersion: number,
  requestedBy: "track_post" | "track_delete" | "track_post_skipped",
): Promise<void> {
  await adminFirestore
    .collection("tm_watchlist_view_refresh_control")
    .doc(uid)
    .set(
      {
        last_source_version: sourceVersion,
        last_requested_at: new Date().toISOString(),
        requested_by: requestedBy,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  trackApiLog(traceId, "info", "watchlist_refresh_queued", {
    uid,
    source_version: sourceVersion,
    requested_by: requestedBy,
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
    const holdings = (
      userData?.watchlist_holdings &&
      typeof userData.watchlist_holdings === "object" &&
      !Array.isArray(userData.watchlist_holdings)
    )
      ? { ...(userData.watchlist_holdings as Record<string, Record<string, unknown>>) }
      : {};
    positions[instrumentId] = positionType;
    if (positionType !== "holding") {
      delete holdings[instrumentId];
    } else if (!holdings[instrumentId]) {
      holdings[instrumentId] = {
        quantity: null,
        market_value: null,
        average_cost: null,
        currency: instrumentId.startsWith("IN_") ? "INR" : "USD",
        source: "unknown",
        updated_at: mutationToken,
      };
    }
    wasAlreadyTrackedInTxn = alreadyTracked;
    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: alreadyTracked ? tracked : [...tracked, instrumentId],
        watchlist_positions: positions,
        watchlist_holdings: holdings,
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
    if (queued) {
      await triggerDispatchLane({
        lane: "on_demand_news",
        market: marketFromInstrumentId(instrumentId),
        limit: 3,
        extraArgs: ["--per-stock-cap", "6"],
      }).catch((error) => {
        trackApiLog(traceId, "warn", "on_demand_news_dispatch_failed", {
          uid: session.uid,
          instrument_id: instrumentId,
          error: String(error),
        });
      });
    }

    if (current.length === 0 && isSubscribed && session.email) {
      maybeFireFirstRadarItemEmail(traceId, session.uid, session.email).catch(() => undefined);
    }
  }
  await queueWatchlistRefresh(
    traceId,
    session.uid,
    sourceVersion,
    skipRefresh ? "track_post_skipped" : "track_post",
  ).catch((error) => {
    trackApiLog(traceId, "warn", "watchlist_refresh_queue_failed", {
      uid: session.uid,
      instrument_id: instrumentId,
      source_version: sourceVersion,
      error: String(error),
    });
  });

  trackApiLog(traceId, "info", "post_track_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true, refresh_queued: true });
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
    const holdings = (
      userData?.watchlist_holdings &&
      typeof userData.watchlist_holdings === "object" &&
      !Array.isArray(userData.watchlist_holdings)
    )
      ? { ...(userData.watchlist_holdings as Record<string, Record<string, unknown>>) }
      : {};
    delete positions[instrumentId];
    delete holdings[instrumentId];
    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: FieldValue.arrayRemove(instrumentId),
        watchlist_positions: positions,
        watchlist_holdings: holdings,
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
  await queueWatchlistRefresh(traceId, session.uid, sourceVersion, "track_delete").catch((error) => {
    trackApiLog(traceId, "warn", "watchlist_refresh_queue_failed", {
      uid: session.uid,
      instrument_id: instrumentId,
      source_version: sourceVersion,
      error: String(error),
    });
  });

  trackApiLog(traceId, "info", "delete_untrack_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true, refresh_queued: true });
}
