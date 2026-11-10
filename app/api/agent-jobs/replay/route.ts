import { NextRequest, NextResponse } from "next/server";

import { parseJobDraft } from "@/lib/agent-jobs";
import { replayDraft } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Each ticker is a large price document, so anonymous replays stay small. */
const SIGNED_OUT_MAX_TICKERS = 5;

/**
 * Replay a draft job over the last four weeks. Reads only, writes nothing.
 * Signed out, it works for an explicit list of tickers (there is no watchlist
 * to read), which is what the template demo uses.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  const body = await req.json().catch(() => null);
  const parsed = parseJobDraft(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!session && parsed.draft.scope.kind === "watchlist") {
    return NextResponse.json({ error: "Sign in to replay a job on the names you track, or pick tickers." }, { status: 401 });
  }
  if (!session && parsed.draft.scope.kind === "tickers" && parsed.draft.scope.tickers.length > SIGNED_OUT_MAX_TICKERS) {
    return NextResponse.json(
      { error: `Without an account a replay covers up to ${SIGNED_OUT_MAX_TICKERS} tickers. Sign in for more.` },
      { status: 400 },
    );
  }
  const replay = await replayDraft(session?.uid ?? null, parsed.draft);
  return NextResponse.json({ ok: true, draft: parsed.draft, replay });
}
