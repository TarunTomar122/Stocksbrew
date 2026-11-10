import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getMarketsData } from "@/lib/markets";
import { applyFollowChange, isMarketAssetId, normalizeFollowedIds } from "@/lib/markets-shared";

export const dynamic = "force-dynamic";

/** The field on the signed-in user's own doc. Nothing else on the doc is touched. */
const FIELD = "followed_market_assets";

function userRef(uid: string) {
  return adminFirestore.collection("users").doc(uid);
}

async function readFollowed(uid: string): Promise<string[]> {
  const snap = await userRef(uid).get();
  return normalizeFollowedIds(snap.exists ? (snap.data() ?? {})[FIELD] : []);
}

/** The signed-in user's watched market assets. Signed-out callers get an empty list. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ authenticated: false, ids: [] });
  try {
    return NextResponse.json({ authenticated: true, ids: await readFollowed(session.uid) });
  } catch (error) {
    console.error("markets_watch_read_failed", error);
    return NextResponse.json({ error: "Could not read your watched markets" }, { status: 500 });
  }
}

/** Body: `{ id: "btc", watch: true }`. Adds or removes one asset on the caller's own doc. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to watch a market" }, { status: 401 });

  let body: { id?: unknown; watch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!isMarketAssetId(id) || typeof body.watch !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Only assets and prediction markets we actually cover can be watched.
  if (body.watch) {
    const data = await getMarketsData();
    const known = data.assets.some((asset) => asset.id === id) || data.predictions.some((market) => market.id === id);
    if (!known) return NextResponse.json({ error: "Unknown market" }, { status: 404 });
  }

  try {
    const ref = userRef(session.uid);
    const snap = await ref.get();
    // A watch never creates a user doc: sign-up owns that.
    if (!snap.exists) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const next = applyFollowChange(normalizeFollowedIds((snap.data() ?? {})[FIELD]), id, body.watch);
    await ref.set({ [FIELD]: next }, { merge: true });
    return NextResponse.json({ ok: true, ids: next });
  } catch (error) {
    console.error("markets_watch_write_failed", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
