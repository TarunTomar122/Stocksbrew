import { NextRequest, NextResponse } from "next/server";

import { agentMarketDay } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import { getBasket } from "@/lib/basket-agent/data";
import { readState, removeThesisLines, saveThesis } from "@/lib/thesis-monitor/data";
import { changedLines, parseThesisDraft, thesisHref } from "@/lib/thesis-monitor/model";
import { linesFit, saveAllowed } from "@/lib/thesis-monitor/validate";

import { companyNames, firstCheck, refused, tooMany } from "../shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = { error: "That thesis does not exist." };

/** One of the person's theses and its latest check. Another person's id, or a basket with no thesis, is not found. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const basket = await getBasket(session.uid, params.id);
  if (!basket?.thesis) return NextResponse.json(NOT_FOUND, { status: 404 });
  const state = await readState(session.uid, basket.id).catch(() => null);
  return NextResponse.json(
    { id: basket.id, name: basket.name, enabled: basket.enabled, thesis: basket.thesis, state, href: thesisHref(basket.id) },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Save the thesis on one of the person's baskets: lines for an idea basket ("Add lines", `version` 0), or an edit of a
 * thesis over the version the editor opened. Only new or changed lines are checked against the stored figures.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseThesisDraft(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const version = typeof body?.version === "number" && Number.isInteger(body.version) ? body.version : null;
  if (version === null) return NextResponse.json({ error: "Send the version of the thesis you edited." }, { status: 400 });
  const current = await getBasket(session.uid, params.id);
  if (!current) return NextResponse.json(NOT_FOUND, { status: 404 });
  const allowed = saveAllowed(session.uid);
  if (!allowed.ok) return tooMany(allowed.retryAfterSec);
  const fit = await linesFit(parsed.draft.lines, changedLines(current.thesis ?? null, parsed.draft.lines), agentMarketDay());
  if (!fit.ok) return NextResponse.json({ error: fit.error }, { status: fit.status });
  try {
    const names = await companyNames(parsed.draft.lines.map((line) => line.ticker));
    const basket = await saveThesis(session.uid, current.id, parsed.draft, version, names);
    const state = await firstCheck(basket);
    return NextResponse.json({ ok: true, id: basket.id, href: thesisHref(basket.id), state });
  } catch (error) {
    return refused(error);
  }
}

/**
 * Remove the thesis: an idea basket loses its lines and keeps everything else; a thesis over holdings is archived
 * like any basket (its records stay in the store).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await removeThesisLines(session.uid, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
