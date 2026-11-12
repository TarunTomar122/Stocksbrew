import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { proposalCards, syncProposals } from "@/lib/proposals-server";

export const dynamic = "force-dynamic";

/** GET: the signed-in person's agent proposals that wait for an answer, as cards. Private, never cached. */
export async function GET(req: Request) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  // Outside production, ?refresh=1 works the proposals out now instead of waiting for the throttle.
  const force = process.env.NODE_ENV !== "production" && new URL(req.url).searchParams.get("refresh") === "1";
  try {
    // Bounded: a store that does not answer is "unavailable", never a hung request.
    const sync = await Promise.race([
      syncProposals(session.uid, { force }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
    ]);
    const cards = await proposalCards(sync.waiting);
    return NextResponse.json({ ok: true, proposals: cards, complete: sync.complete, synced: !sync.skipped }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.warn("[proposals] list failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
