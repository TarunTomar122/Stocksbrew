import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { buildPortfolioBook } from "@/lib/portfolio-book";
import {
  currentMixWeek,
  deriveResearchMix,
  sanitizeMixWeights,
  type MixWeights,
  type PortfolioMixSnapshot,
} from "@/lib/portfolio-mix";
import { loadRadarRowsForUser } from "@/lib/radar-rows";

export const runtime = "nodejs";

const COLLECTION = "tm_watchlist_mix";

type StoredMix = {
  weights?: MixWeights;
  research_snapshot?: PortfolioMixSnapshot;
};

async function readMix(uid: string, rows: ReturnType<typeof buildPortfolioBook>) {
  const ref = adminFirestore.collection(COLLECTION).doc(uid);
  const snap = await ref.get();
  const stored = (snap.exists ? snap.data() : {}) as StoredMix;
  const weekKey = currentMixWeek();
  const hasCurrentSnapshot = stored.research_snapshot?.week_key === weekKey;
  const hasOutOfScopeSnapshot = Object.keys(stored.research_snapshot?.weights ?? {}).some(
    (instrumentId) => !rows.some((row) => row.instrument_id === instrumentId),
  );

  if ((!hasCurrentSnapshot || hasOutOfScopeSnapshot) && rows.length > 0) {
    const research = deriveResearchMix(rows);
    await ref.set({ research_snapshot: research, updated_at: new Date().toISOString() }, { merge: true });
    return { weights: sanitizeMixWeights(rows, stored.weights), research };
  }

  return {
    weights: sanitizeMixWeights(rows, stored.weights),
    research: stored.research_snapshot ?? null,
  };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const payload = await loadRadarRowsForUser(session.uid);
  const rows = buildPortfolioBook(payload?.rows ?? []).filter((row) => row.position_type === "holding");
  return NextResponse.json(await readMix(session.uid, rows));
}

export async function PUT(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const payload = await loadRadarRowsForUser(session.uid);
  const rows = buildPortfolioBook(payload?.rows ?? []).filter((row) => row.position_type === "holding");
  if (rows.length === 0) return NextResponse.json({ error: "watchlist_empty" }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const weights = sanitizeMixWeights(rows, body?.weights);
  const research = (await readMix(session.uid, rows)).research ?? deriveResearchMix(rows);
  const updatedAt = new Date().toISOString();

  await adminFirestore.collection(COLLECTION).doc(session.uid).set(
    { weights, research_snapshot: research, updated_at: updatedAt },
    { merge: true },
  );

  return NextResponse.json({ weights, research });
}
