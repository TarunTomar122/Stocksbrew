import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { isLaunchAITier } from "@/lib/ai-launch-tier";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";
import { getActiveUniverse } from "@/lib/firestore";

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
const ON_DEMAND_DISPATCH_EVENT = "process_on_demand_news";
const ON_DEMAND_DISPATCH_DEDUPE_MS = 90 * 1000;

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

type EnqueueResult = {
  market: "US" | "IN";
  universe: string;
  shouldDispatch: boolean;
};

function parseRepoConfig(raw?: string): { owner: string; repo: string } | null {
  if (!raw) return null;
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function triggerOnDemandNewsDispatch(
  payload: {
    instrumentId: string;
    market: "US" | "IN";
    universe: string;
    requestedBy: string;
  },
  traceId: string,
) {
  const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
  const parsed =
    parseRepoConfig(process.env.GITHUB_DISPATCH_REPO) ??
    parseRepoConfig(process.env.GITHUB_REPOSITORY);
  if (!token || !parsed) {
    trackApiLog(traceId, "warn", "github_dispatch_skipped_missing_config", {
      has_token: Boolean(token),
      has_repo: Boolean(parsed),
    });
    console.warn(
      "[api/track] missing GitHub dispatch config; skipping on-demand workflow trigger",
    );
    return;
  }

  const res = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: ON_DEMAND_DISPATCH_EVENT,
        client_payload: {
          instrument_id: payload.instrumentId,
          market: payload.market,
          universe_id: payload.universe,
          requested_by: payload.requestedBy,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    trackApiLog(traceId, "error", "github_dispatch_http_error", {
      status: res.status,
      body_snippet: body.slice(0, 300),
    });
    throw new Error(
      `dispatch failed (${res.status}) ${body.slice(0, 200)}`,
    );
  }
  trackApiLog(traceId, "info", "github_dispatch_ok", {
    status: res.status,
    instrument_id: payload.instrumentId,
    market: payload.market,
    universe: payload.universe,
  });
}

async function enqueueOnDemandNewsJob(
  uid: string,
  instrumentId: string,
): Promise<EnqueueResult> {
  const market = marketFromInstrumentId(instrumentId);
  const universe = await getActiveUniverse(market);
  const ref = adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId);
  let shouldDispatch = true;
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const status = String(existing?.status || "");
    const updatedAtRaw = String(existing?.updated_at || "");
    const updatedAt = Date.parse(updatedAtRaw);
    const queueRecentlyTouched =
      status === "queued" &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < ON_DEMAND_DISPATCH_DEDUPE_MS;
    if (status === "running") {
      tx.set(ref, {
        requested_by: FieldValue.arrayUnion(uid),
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
      shouldDispatch = false;
      return;
    }
    if (queueRecentlyTouched) {
      tx.set(ref, {
        requested_by: FieldValue.arrayUnion(uid),
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
      shouldDispatch = false;
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
  return { market, universe, shouldDispatch };
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
  traceId: string,
  newlyTrackedInstrumentId?: string,
) {
  (async () => {
    if (newlyTrackedInstrumentId) {
      const queued = await enqueueOnDemandNewsJob(uid, newlyTrackedInstrumentId);
      if (queued.shouldDispatch) {
        trackApiLog(traceId, "info", "on_demand_dispatch_triggering", {
          instrument_id: newlyTrackedInstrumentId,
          market: queued.market,
          universe: queued.universe,
        });
        await triggerOnDemandNewsDispatch(
          {
            instrumentId: newlyTrackedInstrumentId,
            market: queued.market,
            universe: queued.universe,
            requestedBy: uid,
          },
          traceId,
        );
      } else {
        trackApiLog(traceId, "info", "on_demand_dispatch_skipped_dedupe_or_running", {
          instrument_id: newlyTrackedInstrumentId,
          market: queued.market,
          universe: queued.universe,
        });
      }
    }
    await rebuildAndSaveWatchlistView(uid, trackedStocks, positions);
    trackApiLog(traceId, "info", "watchlist_view_rebuild_complete", {
      tracked_count: trackedStocks.length,
    });
  })().catch((err) => {
    trackApiLog(traceId, "error", "background_coverage_or_rebuild_failed", {
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    console.error("[api/track] background coverage/rebuild failed:", err);
  });
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

  trackApiLog(traceId, "info", "post_track_request", {
    uid: session.uid,
    instrument_id: instrumentId,
    position_type: positionType,
  });

  const existing = await getUserDoc(session.uid);
  if (!existing || !resolveIsSubscribed(existing)) {
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
  }, traceId, current.includes(instrumentId) ? undefined : instrumentId);

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

  trackApiLog(traceId, "info", "delete_untrack_request", {
    uid: session.uid,
    instrument_id: instrumentId,
  });

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

  kickRebuild(session.uid, nextTracked, nextPositions, traceId);

  trackApiLog(traceId, "info", "delete_untrack_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true });
}
