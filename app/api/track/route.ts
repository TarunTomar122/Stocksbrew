import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { FREE_RADAR_TRACK_LIMIT, canTrackMore } from "@/lib/pro-features";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { addRadarStock, removeRadarStock } from "@/lib/radar-mutations";

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

  const result = await addRadarStock({
    uid: session.uid,
    instrumentId,
    positionType,
    mutationId: clientMutationId,
    requestedBy: skipRefresh ? "track_post_skipped" : "track_post",
  });
  trackApiLog(traceId, "info", "post_track_state_written", {
    uid: session.uid,
    instrument_id: instrumentId,
    watchlist_version: result.source_version,
  });
  trackApiLog(traceId, "info", result.research_queued ? "on_demand_news_queued" : "on_demand_news_not_queued", {
    uid: session.uid,
    instrument_id: instrumentId,
  });

  trackApiLog(traceId, "info", "post_track_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({
    ok: true,
    refresh_queued: true,
    first_stock: !result.already_tracked && current.length === 0,
  });
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
  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();

  trackApiLog(traceId, "info", "delete_untrack_request", {
    uid: session.uid,
    instrument_id: instrumentId,
  });

  const result = await removeRadarStock({
    uid: session.uid,
    instrumentId,
    mutationId: clientMutationId,
    requestedBy: "track_delete",
  });
  trackApiLog(traceId, "info", "delete_track_state_written", {
    uid: session.uid,
    instrument_id: instrumentId,
    watchlist_version: result.source_version,
    was_tracked: result.was_tracked,
  });

  trackApiLog(traceId, "info", "delete_untrack_ok", { uid: session.uid, instrument_id: instrumentId });
  return NextResponse.json({ ok: true, refresh_queued: true });
}
