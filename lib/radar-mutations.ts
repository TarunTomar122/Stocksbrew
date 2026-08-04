import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase-admin";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";

export type RadarPositionType = "holding" | "watchlist";

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

async function queueWatchlistRefresh(
  uid: string,
  sourceVersion: number,
  requestedBy: "track_post" | "track_delete" | "track_post_skipped" | "agent",
) {
  const now = new Date().toISOString();
  await adminFirestore.collection("tm_watchlist_view_refresh_control").doc(uid).set({
    last_source_version: sourceVersion,
    last_requested_at: now,
    requested_by: requestedBy,
    updated_at: now,
  }, { merge: true });
}

export async function addRadarStock(input: {
  uid: string;
  instrumentId: string;
  positionType?: RadarPositionType;
  mutationId?: string;
  requestedBy?: "track_post" | "track_post_skipped" | "agent";
}) {
  const positionType = input.positionType === "holding" ? "holding" : "watchlist";
  const now = new Date().toISOString();
  const userRef = adminFirestore.collection("users").doc(input.uid);
  const eventRef = userRef.collection("watchlist_events").doc(input.mutationId || randomUUID());
  const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(input.instrumentId);
  let sourceVersion = 0;
  let alreadyTracked = false;

  await adminFirestore.runTransaction(async (tx) => {
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(eventRef)]);
    if (!userSnap.exists) throw new Error("profile_not_ready");
    const userData = userSnap.data() || {};
    const tracked = Array.isArray(userData.tracked_stocks) ? userData.tracked_stocks as string[] : [];
    alreadyTracked = tracked.includes(input.instrumentId);
    if (eventSnap.exists) {
      sourceVersion = Number(eventSnap.data()?.version ?? userData.watchlist_version ?? 0);
      return;
    }
    const positions = userData.watchlist_positions && typeof userData.watchlist_positions === "object" && !Array.isArray(userData.watchlist_positions)
      ? { ...userData.watchlist_positions as Record<string, RadarPositionType> }
      : {};
    const holdings = userData.watchlist_holdings && typeof userData.watchlist_holdings === "object" && !Array.isArray(userData.watchlist_holdings)
      ? { ...userData.watchlist_holdings as Record<string, Record<string, unknown>> }
      : {};
    positions[input.instrumentId] = positionType;
    if (positionType === "watchlist") delete holdings[input.instrumentId];
    else holdings[input.instrumentId] ||= {
      quantity: null,
      market_value: null,
      average_cost: null,
      currency: marketFromInstrumentId(input.instrumentId) === "IN" ? "INR" : "USD",
      source: "unknown",
      updated_at: now,
    };
    sourceVersion = Number(userData.watchlist_version ?? 0) + 1;
    tx.set(userRef, {
      tracked_stocks: alreadyTracked ? tracked : [...tracked, input.instrumentId],
      watchlist_positions: positions,
      watchlist_holdings: holdings,
      watchlist_updated_at: now,
      watchlist_version: sourceVersion,
      last_tracked_at: now,
    }, { merge: true });
    if (!alreadyTracked) tx.set(trackedRef, {
      instrument_id: input.instrumentId,
      market: marketFromInstrumentId(input.instrumentId),
      tracked_count: FieldValue.increment(1),
      updated_at: now,
    }, { merge: true });
    tx.set(eventRef, {
      kind: "SET_POSITION",
      instrument_id: input.instrumentId,
      position_type: positionType,
      version: sourceVersion,
      created_at: now,
    });
  });

  const researchQueued = await maybeQueueOnDemandNews(input.uid, input.instrumentId, {
    source: "radar_track",
  }).catch(() => false);
  await queueWatchlistRefresh(input.uid, sourceVersion, input.requestedBy || "agent").catch(() => undefined);
  return { already_tracked: alreadyTracked, research_queued: researchQueued, source_version: sourceVersion };
}

export async function removeRadarStock(input: {
  uid: string;
  instrumentId: string;
  mutationId?: string;
  requestedBy?: "track_delete" | "agent";
}) {
  const now = new Date().toISOString();
  const userRef = adminFirestore.collection("users").doc(input.uid);
  const eventRef = userRef.collection("watchlist_events").doc(input.mutationId || randomUUID());
  const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(input.instrumentId);
  let sourceVersion = 0;
  let wasTracked = false;

  await adminFirestore.runTransaction(async (tx) => {
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(eventRef)]);
    if (!userSnap.exists) throw new Error("profile_not_ready");
    const userData = userSnap.data() || {};
    if (eventSnap.exists) {
      sourceVersion = Number(eventSnap.data()?.version ?? userData.watchlist_version ?? 0);
      return;
    }
    const tracked = Array.isArray(userData.tracked_stocks) ? userData.tracked_stocks as string[] : [];
    wasTracked = tracked.includes(input.instrumentId);
    const positions = userData.watchlist_positions && typeof userData.watchlist_positions === "object" && !Array.isArray(userData.watchlist_positions)
      ? { ...userData.watchlist_positions as Record<string, RadarPositionType> }
      : {};
    const holdings = userData.watchlist_holdings && typeof userData.watchlist_holdings === "object" && !Array.isArray(userData.watchlist_holdings)
      ? { ...userData.watchlist_holdings as Record<string, Record<string, unknown>> }
      : {};
    delete positions[input.instrumentId];
    delete holdings[input.instrumentId];
    sourceVersion = Number(userData.watchlist_version ?? 0) + 1;
    tx.set(userRef, {
      tracked_stocks: FieldValue.arrayRemove(input.instrumentId),
      watchlist_positions: positions,
      watchlist_holdings: holdings,
      watchlist_updated_at: now,
      watchlist_version: sourceVersion,
    }, { merge: true });
    if (wasTracked) tx.set(trackedRef, {
      instrument_id: input.instrumentId,
      market: marketFromInstrumentId(input.instrumentId),
      tracked_count: FieldValue.increment(-1),
      updated_at: now,
    }, { merge: true });
    tx.set(eventRef, {
      kind: "REMOVE_POSITION",
      instrument_id: input.instrumentId,
      version: sourceVersion,
      created_at: now,
    });
  });

  await queueWatchlistRefresh(input.uid, sourceVersion, input.requestedBy || "agent").catch(() => undefined);
  return { was_tracked: wasTracked, source_version: sourceVersion };
}
