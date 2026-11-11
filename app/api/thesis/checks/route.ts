import { NextRequest, NextResponse } from "next/server";

import { getViewer } from "@/lib/entitlements-server";
import { checkReasons } from "@/lib/thesis-watch/server";
import { getUserDoc } from "@/lib/watchlist";

/**
 * GET /api/thesis/checks[?ids=US_NVDA,US_KO]: the reason watcher's latest
 * check on each of the signed-in person's reasons (all of them, or the ids
 * asked for). Stocks this plan does not check come back in `locked` with
 * nothing computed about them. Writes only the person's own
 * tm_thesis_checks documents (lib/thesis-watch/store.ts).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^(US|IN)_[A-Z0-9_]{1,12}$/;

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("ids");
  const only = raw
    ? raw
        .split(",")
        .map((id) => id.trim().toUpperCase())
        .filter((id) => ID.test(id))
        .slice(0, 50)
    : undefined;
  if (raw && only && only.length === 0) return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  let userDoc;
  try {
    userDoc = await getUserDoc(viewer.uid);
  } catch {
    // A failed read is not "no reasons": the page keeps what it shows.
    return NextResponse.json({ error: "read_failed" }, { status: 503 });
  }
  try {
    const result = await checkReasons(viewer, userDoc, { only, word: true });
    return NextResponse.json(
      { checks: result.checks, locked: result.locked, unchecked: result.unchecked, plan: viewer.plan },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.warn("[thesis-checks] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "check_failed" }, { status: 500 });
  }
}
