import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";
import { PROPOSAL_ID_RE } from "@/lib/proposals";
import { decideProposal, type Decision } from "@/lib/proposals-actions";
import { resetProposalSync } from "@/lib/proposals-server";

export const dynamic = "force-dynamic";

/**
 * POST { decision: "accept" | "dismiss" }: decide one of the signed-in person's agent proposals. Accept runs the
 * proposal's one safe action through the app's own write paths with the person's plan (lib/proposals-actions.ts);
 * accepting twice is a no-op. Never trades, never sends an email.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!PROPOSAL_ID_RE.test(params.id)) return NextResponse.json({ ok: false, error: "That proposal does not exist." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
  const decision = body?.decision;
  if (decision !== "accept" && decision !== "dismiss") {
    return NextResponse.json({ ok: false, error: "Say accept or dismiss." }, { status: 400 });
  }
  const viewer = await getViewer();
  let outcome: Awaited<ReturnType<typeof decideProposal>>;
  try {
    outcome = await decideProposal({ actor: { uid: session.uid, email: session.email, plan: viewer.plan }, id: params.id, decision: decision as Decision });
  } catch (error) {
    // The claim itself could not be read or written: nothing was applied.
    console.warn("[proposals] decide failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "That didn't go through. Try again in a minute." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // The next page load may offer the next proposal now that this one is answered.
  if (outcome.body.ok) await resetProposalSync(session.uid);
  return NextResponse.json(outcome.body, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
}
