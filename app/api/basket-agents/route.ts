import { NextRequest, NextResponse } from "next/server";

import { AgentJobError } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import {
  createBasket,
  limitWords,
  listBasketRuns,
  listBaskets,
  replayDraft,
  replaySummary,
  runBasket,
  unknownTickers,
} from "@/lib/basket-agent/data";
import { replayAllowed, tooManyReplays } from "@/lib/basket-agent/limit";
import { parseBasketDraft } from "@/lib/basket-agent/model";
import { limitFor, lockCopy } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How long the first check may take before the answer goes back without it (it is not written then). */
const FIRST_RUN_MS = 12_000;

/** The signed-in person's idea baskets and their run record. */
export async function GET() {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json(
      { error: "Sign in to see your idea baskets." },
      { status: 401 },
    );
  const [baskets, runs] = await Promise.all([
    listBaskets(session.uid),
    listBasketRuns(session.uid),
  ]);
  return NextResponse.json(
    { baskets, runs },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Save a basket as an agent. The four-week replay runs here, on the server, before it switches on, and is kept with
 * it. Past the plan's running limit it is saved paused. The uid always comes from the session.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json(
      { error: "Sign in to watch an idea." },
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
  const viewer = await getViewer();
  try {
    const replay = await replayDraft(parsed.draft);
    const basket = await createBasket(
      session.uid,
      parsed.draft,
      replaySummary(replay),
      viewer.plan,
    );
    // Its first check when it is switched on, dated the last settled session so the nightly check after today's close
    // still runs (and writes over it if it is the same day). A slow check is left for the nightly run.
    const first = basket.enabled
      ? await Promise.race([
          runBasket(basket, new Date(), { provisional: true }).catch(
            () => null,
          ),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), FIRST_RUN_MS),
          ),
        ])
      : null;
    const limit = limitFor("agents", viewer.plan);
    return NextResponse.json({
      ok: true,
      basket,
      run: first?.run ?? null,
      paused: basket.enabled
        ? null
        : {
            feature: "agents",
            plan: viewer.plan,
            limit,
            title: lockCopy("agents").title,
            message: `Saved and paused. ${limitWords(limit)}`,
          },
    });
  } catch (error) {
    if (error instanceof AgentJobError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
