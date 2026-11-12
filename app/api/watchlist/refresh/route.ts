import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc } from "@/lib/watchlist";
import { requestWatchlistViewRebuild } from "@/lib/watchlist-view-rebuild";

/**
 * POST /api/watchlist/refresh
 *
 * Rebuilds the authenticated user's view and answers when it is saved. Called
 * by the browser after a save (the batch modal, the Follow button). Every
 * write to the person's stocks also queues the same rebuild on the server
 * (lib/radar-mutations.ts); when that one is already running and has read a
 * book at least this new, this request waits for it instead of building twice
 * (lib/watchlist-view-rebuild.ts).
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
  const sourceVersion = Number(userDoc.watchlist_version ?? 0);

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
    await requestWatchlistViewRebuild(session.uid, sourceVersion);
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
