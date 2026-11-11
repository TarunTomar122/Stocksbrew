import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { MAX_THESES_PER_USER, mergeTheses, readTheses, removeTheses, validateRemoveIds, validateThesisItems, type Thesis } from "@/lib/thesis";

/**
 * GET  /api/thesis: the signed-in person's reasons, by instrument id, and the
 *      stocks they mark as owned (`held`).
 * POST /api/thesis: { items: [{ instrument_id, kind, reason }] } saves one
 *      reason per stock. Only stocks the person tracks are accepted.
 * DELETE /api/thesis: { instrument_ids: [...] } removes those reasons and
 *      keeps every other one. Removing a reason that is not there is fine.
 *
 * Reasons live on the person's own user doc as the additive `theses` map.
 * LocalDB's merge replaces a top-level map, so the whole map is read and
 * written back inside one transaction and no other stock's reason is lost.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tracked(data: Record<string, unknown>): Set<string> {
  return new Set(Array.isArray(data.tracked_stocks) ? data.tracked_stocks.filter((id): id is string => typeof id === "string") : []);
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const snap = await adminFirestore.collection("users").doc(session.uid).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const ids = tracked(data);
  const theses = Object.fromEntries(Object.entries(readTheses(data.theses)).filter(([id]) => ids.has(id)));
  // The stocks the person owns, so a page can ask "why do you own it?" only about those.
  const positions = (data.watchlist_positions ?? {}) as Record<string, unknown>;
  const held = [...ids].filter((id) => positions[id] === "holding");
  return NextResponse.json({ theses, held }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const valid = validateThesisItems(body?.items);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const result = await adminFirestore.runTransaction(
    async (tx): Promise<{ ok: true; theses: Record<string, Thesis> } | { ok: false; status: number; error: string; ids?: string[] }> => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { ok: false, status: 409, error: "profile_not_ready" };
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const ids = tracked(data);
      const untracked = valid.items.filter((item) => !ids.has(item.instrument_id)).map((item) => item.instrument_id);
      if (untracked.length > 0) return { ok: false, status: 409, error: "not_tracked", ids: untracked };
      const theses = mergeTheses(data.theses, valid.items, new Date());
      if (Object.keys(theses).length > MAX_THESES_PER_USER) return { ok: false, status: 400, error: "too_many" };
      tx.set(userRef, { theses, theses_updated_at: new Date().toISOString() }, { merge: true });
      return { ok: true, theses };
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.ids ? { ids: result.ids } : {}) }, { status: result.status });
  const saved = Object.fromEntries(valid.items.map((item) => [item.instrument_id, result.theses[item.instrument_id]]));
  return NextResponse.json({ ok: true, theses: saved });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { instrument_ids?: unknown } | null;
  const ids = validateRemoveIds(body?.instrument_ids);
  if (!ids) return NextResponse.json({ error: "invalid_items" }, { status: 400 });

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const result = await adminFirestore.runTransaction(async (tx): Promise<{ ok: true; removed: string[] } | { ok: false; status: number; error: string }> => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { ok: false, status: 409, error: "profile_not_ready" };
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const before = readTheses(data.theses);
    const removed = ids.filter((id) => id in before);
    if (removed.length === 0) return { ok: true, removed };
    // update, not set with merge: Firestore deep-merges maps on set, so a removed key would survive there.
    tx.update(userRef, { theses: removeTheses(data.theses, removed), theses_updated_at: new Date().toISOString() });
    return { ok: true, removed };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, removed: result.removed });
}
