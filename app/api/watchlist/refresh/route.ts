import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";

/**
 * POST /api/watchlist/refresh
 *
 * Triggers a single watchlist-view rebuild for the authenticated user.
 * Called by the client after bulk-tracking multiple stocks in parallel —
 * so each /api/track call can skip its own rebuild (skip_refresh: true)
 * and this endpoint fires exactly once at the end.
 *
 * We bypass the per-call dedupe gate here because this is an explicit,
 * client-initiated refresh, not a redundant side-effect.
 */
export async function POST() {
  const traceId = randomUUID();
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userDoc = await getUserDoc(session.uid);
  if (!userDoc) {
    return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  }

  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks : [];
  const positions =
    userDoc.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? (userDoc.watchlist_positions as Record<string, "holding" | "watchlist">)
      : {};
  const sourceVersion = Number(userDoc.watchlist_version ?? 0);
  const isSubscribed = resolveIsSubscribed(userDoc);

  console.log(
    JSON.stringify({
      svc: "api-watchlist-refresh",
      trace_id: traceId,
      msg: "rebuild_start",
      uid: session.uid,
      tracked_count: tracked.length,
      source_version: sourceVersion,
    }),
  );

  try {
    await rebuildAndSaveWatchlistView(session.uid, tracked, positions, isSubscribed, sourceVersion, {
      preserveBriefIfFallback: true,
      preserveDirectivesIfMissing: true,
      preserveActivityIfThin: true,
    });
    console.log(
      JSON.stringify({
        svc: "api-watchlist-refresh",
        trace_id: traceId,
        msg: "rebuild_ok",
        uid: session.uid,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      JSON.stringify({
        svc: "api-watchlist-refresh",
        trace_id: traceId,
        msg: "rebuild_failed",
        uid: session.uid,
        error: String(err),
      }),
    );
    return NextResponse.json({ error: "rebuild_failed" }, { status: 500 });
  }
}
