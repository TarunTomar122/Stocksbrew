import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { afterResponse } from "@/lib/after-response";
import { adminFirestore } from "@/lib/firebase-admin";
import { coverageAfterTrackChange, effectiveCovered, type CoverageWrite } from "@/lib/entitlements-coverage";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";
import { syncAlertPauses } from "@/lib/stock-alerts";
import { resolveIsSubscribed } from "@/lib/watchlist";
import { requestWatchlistViewRebuild } from "@/lib/watchlist-view-rebuild";

export type RadarPositionType = "holding" | "watchlist";

/**
 * Kept for callers that still catch it. Tracking is unlimited on every plan
 * (lib/entitlements.ts: tracked_stocks), so nothing throws this any more; the
 * limit that remains is coverage (lib/entitlements-coverage.ts).
 */
export class FollowLimitError extends Error {
  constructor(
    public readonly code: "free_tier_limit_reached" | "swap_limit_reached",
    public readonly reason: string,
    public readonly nextAt: string | null = null,
  ) {
    super(code);
    this.name = "FollowLimitError";
  }
}

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

/**
 * Rebuild the person's view after the response, so the briefing, emails, Ask and MCP see the change without waiting
 * for the next weekday build (lib/watchlist-view-rebuild.ts). Skipped when the browser calls /api/watchlist/refresh
 * itself (skip_refresh on /api/track).
 */
function rebuildAfterWrite(uid: string, sourceVersion: number, skip: boolean | undefined) {
  if (skip) return;
  afterResponse("watchlist_view_rebuild", requestWatchlistViewRebuild(uid, sourceVersion));
}

/**
 * Follow a stock. "Add to watchlist" on a stock you already hold leaves it a holding with its shares and cost: only an
 * explicit `move` (the row menu's "Move to Watching") turns a holding into a watched stock, and that drops the
 * holding's numbers, as the batch modal does. Adding a watched stock as a holding marks it held (nothing is lost).
 */
export async function addRadarStock(input: {
  uid: string;
  instrumentId: string;
  positionType?: RadarPositionType;
  /** Allow turning a held stock into a watched one (drops its numbers). Without it a holding stays a holding. */
  move?: boolean;
  /** The browser calls /api/watchlist/refresh itself and waits for it, so no server rebuild is queued here. */
  skipRebuild?: boolean;
  mutationId?: string;
  requestedBy?: "track_post" | "track_post_skipped" | "agent";
}) {
  const requestedType: RadarPositionType = input.positionType === "holding" ? "holding" : "watchlist";
  const now = new Date().toISOString();
  const userRef = adminFirestore.collection("users").doc(input.uid);
  const eventRef = userRef.collection("watchlist_events").doc(input.mutationId || randomUUID());
  const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(input.instrumentId);
  let sourceVersion = 0;
  let alreadyTracked = false;
  let newlyCovered = false;
  let positionType: RadarPositionType = requestedType;
  let changed = false;
  let isProAccount = false;

  await adminFirestore.runTransaction(async (tx) => {
    changed = false; // a retried transaction starts over
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(eventRef)]);
    if (!userSnap.exists) throw new Error("profile_not_ready");
    const userData = userSnap.data() || {};
    const tracked = Array.isArray(userData.tracked_stocks) ? userData.tracked_stocks as string[] : [];
    alreadyTracked = tracked.includes(input.instrumentId);
    const positions = userData.watchlist_positions && typeof userData.watchlist_positions === "object" && !Array.isArray(userData.watchlist_positions)
      ? { ...userData.watchlist_positions as Record<string, RadarPositionType> }
      : {};
    const holdings = userData.watchlist_holdings && typeof userData.watchlist_holdings === "object" && !Array.isArray(userData.watchlist_holdings)
      ? { ...userData.watchlist_holdings as Record<string, Record<string, unknown>> }
      : {};
    const currentType: RadarPositionType | null = !alreadyTracked
      ? null
      : positions[input.instrumentId] === "holding" || (positions[input.instrumentId] === undefined && holdings[input.instrumentId])
        ? "holding"
        : "watchlist";
    if (eventSnap.exists) {
      sourceVersion = Number(eventSnap.data()?.version ?? userData.watchlist_version ?? 0);
      positionType = currentType ?? requestedType;
      return;
    }
    // Already followed: marking a watched stock as held goes through (nothing is lost), but a holding only becomes a
    // watched stock on an explicit move, since that drops its shares and cost. Otherwise nothing changes, so nothing is
    // written (no version bump, no rebuild).
    if (currentType && (currentType === requestedType || (currentType === "holding" && !input.move))) {
      sourceVersion = Number(userData.watchlist_version ?? 0);
      positionType = currentType;
      newlyCovered = isProOrCovered(userData, input.instrumentId);
      return;
    }
    // Tracking is unlimited. Coverage follows on the same read the write is based on: a new stock fills an empty
    // covered slot while the account has free fills, and never spends the weekly swap (lib/entitlements-coverage.ts).
    const isPro = resolveIsSubscribed(userData as Parameters<typeof resolveIsSubscribed>[0]);
    isProAccount = isPro;
    const coverage: CoverageWrite | null = alreadyTracked
      ? null
      : coverageAfterTrackChange(userData, isPro, [...tracked, input.instrumentId]);
    newlyCovered = isPro || (coverage?.covered_stocks.includes(input.instrumentId) ?? effectiveCovered(userData, false).includes(input.instrumentId));
    positionType = requestedType;
    changed = true;
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
      ...(coverage ?? {}),
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

  // Research is written for covered stocks. On Free an uncovered stock still gets prices, the call and the
  // earnings date from the shared pipeline, without queueing new research for one account.
  const researchQueued = newlyCovered
    ? await maybeQueueOnDemandNews(input.uid, input.instrumentId, { source: "radar_track" }).catch(() => false)
    : false;
  if (changed) {
    // A stock followed again gets back the alerts its removal paused.
    if (!alreadyTracked) {
      await syncAlertPauses(input.uid, { resume: [input.instrumentId], plan: isProAccount ? "pro" : "free" }).catch(() => undefined);
    }
    await queueWatchlistRefresh(input.uid, sourceVersion, input.requestedBy || "agent").catch(() => undefined);
    rebuildAfterWrite(input.uid, sourceVersion, input.skipRebuild);
  }
  return {
    already_tracked: alreadyTracked,
    /** The stock's kind after this call: an already-followed stock keeps its own unless it was an explicit move. */
    position_type: positionType,
    /** Whether anything was written. */
    changed,
    research_queued: researchQueued,
    source_version: sourceVersion,
    covered: newlyCovered,
  };
}

function isProOrCovered(userData: Record<string, unknown>, instrumentId: string): boolean {
  const isPro = resolveIsSubscribed(userData as Parameters<typeof resolveIsSubscribed>[0]);
  return isPro || effectiveCovered(userData, false).includes(instrumentId);
}

export async function removeRadarStock(input: {
  uid: string;
  instrumentId: string;
  /** The browser calls /api/watchlist/refresh itself and waits for it, so no server rebuild is queued here. */
  skipRebuild?: boolean;
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
    // A stock that is no longer tracked is no longer covered, which frees its slot (uncovering is always free).
    const coverage = wasTracked
      ? coverageAfterTrackChange(
          userData,
          resolveIsSubscribed(userData as Parameters<typeof resolveIsSubscribed>[0]),
          tracked.filter((id) => id !== input.instrumentId),
        )
      : null;
    sourceVersion = Number(userData.watchlist_version ?? 0) + 1;
    tx.set(userRef, {
      ...(coverage ?? {}),
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

  if (wasTracked) {
    // Its alerts stop firing but stay listed (paused), so they can be turned off or come back on a re-add.
    await syncAlertPauses(input.uid, { pause: [input.instrumentId] }).catch(() => undefined);
    await queueWatchlistRefresh(input.uid, sourceVersion, input.requestedBy || "agent").catch(() => undefined);
    rebuildAfterWrite(input.uid, sourceVersion, input.skipRebuild);
  }
  return { was_tracked: wasTracked, source_version: sourceVersion };
}
