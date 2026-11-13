import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { replayDraft, unknownTickers } from "@/lib/basket-agent/data";
import { replayAllowed, tooManyReplays } from "@/lib/basket-agent/limit";
import { parseBasketDraft } from "@/lib/basket-agent/model";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Replay a basket over the last four weeks with no hindsight: each day sees only what was dated on or before it.
 * Reads only, writes nothing.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json(
      { error: "Sign in to replay an idea." },
      { status: 401 },
    );
  const parsed = parseBasketDraft(await req.json().catch(() => null));
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const unknown = await unknownTickers(
    parsed.draft.lines.map((line) => line.ticker),
  );
  if (unknown.length > 0)
    return NextResponse.json(
      {
        error: `We don't follow ${unknown.join(", ")} yet, so the agent couldn't check ${unknown.length === 1 ? "it" : "them"}. Take ${unknown.length === 1 ? "it" : "them"} out to go on.`,
      },
      { status: 400 },
    );
  const allowed = replayAllowed(session.uid);
  if (!allowed.ok) {
    const refused = tooManyReplays(allowed.retryAfterSec);
    return NextResponse.json(refused.body, refused.init);
  }
  const replay = await replayDraft(parsed.draft);
  return NextResponse.json(
    { ok: true, replay },
    { headers: { "cache-control": "no-store" } },
  );
}
