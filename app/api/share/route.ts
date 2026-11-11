import { NextRequest, NextResponse } from "next/server";

import { getViewer } from "@/lib/entitlements-server";
import { buildCandidates, pickVariant } from "@/lib/share/cards";
import { loadShareFacts } from "@/lib/share/facts";
import { createShare, listShares } from "@/lib/share/store";
import { isShareKind, type ShareCandidate, type ShareKind } from "@/lib/share/types";
import { mondayOfKey } from "@/lib/memo/week";
import { getUserDoc } from "@/lib/watchlist";

/**
 * Share cards for the signed-in person's own reads.
 *
 * GET  /api/share                          the person's live shares (id, headline, date)
 * POST /api/share { action: "draft", kind, week? }
 *      every card that page can make from their holdings, each variant built
 *      and privacy-checked here; nothing is saved
 * POST /api/share { action: "create", kind, week?, cardId, hideNames, showAmounts, hash }
 *      rebuilds that card from the same loaders and saves it only when it
 *      matches the one the person was shown (`hash`); otherwise 409 with the
 *      new cards, so nothing they did not see is ever shared
 *
 * The browser never sends card text: it names a card and two switches.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A draft runs the page loaders and a create writes with read-back; keep within one generous limit.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };

type Body = { action?: unknown; kind?: unknown; week?: unknown; cardId?: unknown; hideNames?: unknown; showAmounts?: unknown; hash?: unknown };

export async function GET() {
  const viewer = await getViewer();
  if (!viewer.uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const shares = await listShares(viewer.uid).catch(() => null);
  if (!shares) return NextResponse.json({ error: "read_failed" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ shares }, { headers: NO_STORE });
}

async function candidatesFor(kind: ShareKind, week: string | null): Promise<{ candidates: ShareCandidate[]; uid: string } | { error: string; status: number }> {
  const viewer = await getViewer();
  if (!viewer.uid) return { error: "unauthenticated", status: 401 };
  const userDoc = await getUserDoc(viewer.uid).catch(() => null);
  if (!userDoc) return { error: "no_holdings", status: 404 };
  const loaded = await loadShareFacts(kind, { viewer, userDoc, week }).catch((error) => {
    console.warn("[share] facts failed:", kind, error instanceof Error ? error.message : error);
    return undefined;
  });
  if (loaded === undefined) return { error: "read_failed", status: 503 };
  if (!loaded) return { error: "no_holdings", status: 404 };
  return { candidates: buildCandidates(loaded.facts, loaded.asOf), uid: viewer.uid };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !isShareKind(body.kind)) return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  const kind = body.kind;
  const week = typeof body.week === "string" && mondayOfKey(body.week) ? body.week : null;

  if (body.action === "draft") {
    const result = await candidatesFor(kind, week);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    return NextResponse.json({ candidates: result.candidates }, { headers: NO_STORE });
  }

  if (body.action !== "create" || typeof body.cardId !== "string" || typeof body.hash !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  }
  const result = await candidatesFor(kind, week);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  const candidate = result.candidates.find((item) => item.cardId === body.cardId);
  const chosen = candidate ? pickVariant(candidate, { hideNames: body.hideNames === true, showAmounts: body.showAmounts === true }) : null;
  // The numbers moved (new prices, a new filing) or the card is gone: show the new version instead of saving one nobody looked at.
  if (!chosen || chosen.hash !== body.hash) {
    return NextResponse.json({ error: "changed", candidates: result.candidates }, { status: 409, headers: NO_STORE });
  }
  const saved = await createShare(result.uid, chosen.card, chosen.options);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.error === "too_many" ? 429 : 503, headers: NO_STORE });
  return NextResponse.json({ id: saved.id, path: `/s/${saved.id}` }, { status: 201, headers: NO_STORE });
}
