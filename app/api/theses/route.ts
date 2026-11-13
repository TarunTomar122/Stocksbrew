import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { limitWords } from "@/lib/basket-agent/data";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { createHoldingsThesis, listTheses } from "@/lib/thesis-monitor/data";
import { parseThesisDraft, thesisHref } from "@/lib/thesis-monitor/model";
import { linesFit, saveAllowed } from "@/lib/thesis-monitor/validate";
import { agentMarketDay } from "@/lib/agent-jobs-data";

import { companyNames, firstCheck, refused, tooMany } from "./shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The signed-in person's theses with their latest check. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to see your theses." }, { status: 401 });
  const theses = await listTheses(session.uid);
  return NextResponse.json(
    { theses: theses.map(({ basket, state }) => ({ id: basket.id, name: basket.name, thesis: basket.thesis, enabled: basket.enabled, state, href: thesisHref(basket.id) })) },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Create a thesis over the person's holdings: the statement and, per holding, up to two lines on figures we store.
 * Every line is checked against the store before anything is written; the uid comes from the session. It is one of
 * the person's agents: past the plan's running limit it is saved paused.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to write a thesis." }, { status: 401 });
  const parsed = parseThesisDraft(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const allowed = saveAllowed(session.uid);
  if (!allowed.ok) return tooMany(allowed.retryAfterSec);
  const fit = await linesFit(parsed.draft.lines, parsed.draft.lines, agentMarketDay());
  if (!fit.ok) return NextResponse.json({ error: fit.error }, { status: fit.status });
  const viewer = await getViewer();
  try {
    const names = await companyNames(parsed.draft.lines.map((line) => line.ticker));
    const basket = await createHoldingsThesis(session.uid, parsed.draft, viewer.plan, names);
    const state = await firstCheck(basket);
    return NextResponse.json({
      ok: true,
      id: basket.id,
      href: thesisHref(basket.id),
      state,
      paused: basket.enabled ? null : { feature: "agents", message: `Saved and paused. ${limitWords(limitFor("agents", viewer.plan))}` },
    });
  } catch (error) {
    return refused(error);
  }
}
