import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { visitorAddress } from "@/lib/analytics/address";
import { RecipeError, recipeReplayAllowed, replayRecipe, resolveSubject } from "@/lib/agent-recipes/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PRIVATE = { "cache-control": "private, no-store" };

/**
 * A recipe's four-week replay for the page's subject, each day read with only what was dated on or before it. Reads
 * only, writes nothing. Signed out it works too (every recipe names its stocks or its investor outright).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser().catch(() => null);
  if (!recipeReplayAllowed(session?.uid ?? `ip:${visitorAddress(req.headers)}`)) {
    return NextResponse.json({ error: "That's a lot of replays at once. Try again in a few minutes." }, { status: 429, headers: PRIVATE });
  }
  const body = (await req.json().catch(() => null)) as { subject?: unknown; recipe?: unknown; size?: unknown } | null;
  try {
    const subject = await resolveSubject(body?.subject, session?.uid ?? null);
    const value = Number(body?.size);
    const replay = await replayRecipe(subject, String(body?.recipe ?? ""), Number.isFinite(value) && value > 0 ? value : null, session?.uid ?? null);
    return NextResponse.json({ ok: true, replay }, { headers: PRIVATE });
  } catch (error) {
    if (error instanceof RecipeError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE });
    throw error;
  }
}
