import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

type PositionType = "holding" | "watchlist";

type BatchItem = {
  instrument_id: string;
  position_type: PositionType;
};

type BatchLogLevel = "info" | "warn" | "error";

function batchLog(traceId: string, level: BatchLogLevel, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ svc: "api-watchlist-batch", trace_id: traceId, msg, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

function normalizeItems(rawItems: unknown): BatchItem[] {
  if (!Array.isArray(rawItems)) return [];
  const dedup = new Map<string, PositionType>();
  for (const raw of rawItems) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const instrumentId = typeof item?.instrument_id === "string" ? item.instrument_id.trim().toUpperCase() : "";
    if (!INSTRUMENT_ID_RE.test(instrumentId)) continue;
    const positionType: PositionType = item?.position_type === "holding" ? "holding" : "watchlist";
    dedup.set(instrumentId, positionType);
  }
  return [...dedup.entries()].map(([instrument_id, position_type]) => ({ instrument_id, position_type }));
}

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const items = normalizeItems(body?.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "empty_items" }, { status: 400 });
  }
  if (items.length > 300) {
    return NextResponse.json({ error: "too_many_items" }, { status: 400 });
  }

  const existing = await getUserDoc(session.uid);
  if (!existing) {
    return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  }
  const isSubscribed = resolveIsSubscribed(existing);
  if (!isSubscribed && items.length > FREE_RADAR_TRACK_LIMIT) {
    return NextResponse.json(
      { error: "free_tier_limit_reached", limit: FREE_RADAR_TRACK_LIMIT, reason: "Free Radar supports up to 3 stocks." },
      { status: 409 },
    );
  }

  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();
  const mutationToken = new Date().toISOString();
  const userRef = adminFirestore.collection("users").doc(session.uid);
  const eventRef = userRef.collection("watchlist_events").doc(clientMutationId);

  const nextTracked = items.map((i) => i.instrument_id);
  const nextPositions = Object.fromEntries(items.map((i) => [i.instrument_id, i.position_type])) as Record<string, PositionType>;

  let sourceVersion = Number(existing.watchlist_version ?? 0);
  let addedIds: string[] = [];
  let removedIds: string[] = [];

  await adminFirestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const dedupeSnap = await tx.get(eventRef);
    if (dedupeSnap.exists) {
      sourceVersion = Number(dedupeSnap.data()?.version ?? userData?.watchlist_version ?? 0);
      return;
    }

    const currentTracked = Array.isArray(userData?.tracked_stocks) ? (userData?.tracked_stocks as string[]) : [];
    const currentSet = new Set(currentTracked);
    const nextSet = new Set(nextTracked);
    addedIds = nextTracked.filter((id) => !currentSet.has(id));
    removedIds = currentTracked.filter((id) => !nextSet.has(id));

    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: nextTracked,
        watchlist_positions: nextPositions,
        watchlist_updated_at: mutationToken,
        watchlist_version: sourceVersion,
        last_tracked_at: new Date().toISOString(),
      },
      { merge: true },
    );

    for (const instrumentId of addedIds) {
      const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
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

    for (const instrumentId of removedIds) {
      const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
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
      kind: "BATCH_SET_POSITIONS",
      version: sourceVersion,
      created_at: mutationToken,
      added_count: addedIds.length,
      removed_count: removedIds.length,
      total_count: nextTracked.length,
    });
  });

  for (const instrumentId of addedIds) {
    await maybeQueueOnDemandNews(session.uid, instrumentId).catch(() => false);
  }

  await adminFirestore
    .collection("tm_watchlist_view_refresh_control")
    .doc(session.uid)
    .set(
      {
        last_source_version: sourceVersion,
        last_requested_at: new Date().toISOString(),
        requested_by: "batch_submit",
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    )
    .catch((error) => {
      batchLog(traceId, "warn", "refresh_queue_write_failed", {
        uid: session.uid,
        source_version: sourceVersion,
        error: String(error),
      });
    });

  batchLog(traceId, "info", "batch_update_ok", {
    uid: session.uid,
    source_version: sourceVersion,
    next_count: nextTracked.length,
    added_count: addedIds.length,
    removed_count: removedIds.length,
  });

  return NextResponse.json({
    ok: true,
    source_version: sourceVersion,
    tracked_count: nextTracked.length,
    added_count: addedIds.length,
    removed_count: removedIds.length,
    refresh_queued: true,
  });
}
