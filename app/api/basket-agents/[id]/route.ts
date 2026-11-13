import { NextRequest, NextResponse } from "next/server";

import { AgentJobError } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import {
  getBasket,
  listBasketRuns,
  replayDraft,
  replaySummary,
  unknownTickers,
  updateBasket,
} from "@/lib/basket-agent/data";
import { replayAllowed, tooManyReplays } from "@/lib/basket-agent/limit";
import { parseBasketDraft } from "@/lib/basket-agent/model";
import { getViewer } from "@/lib/entitlements-server";

export const dynamic = "force-dynamic";

function failure(error: unknown, plan?: string) {
  if (error instanceof AgentJobError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.feature ? { feature: error.feature, plan } : {}),
      },
      { status: error.status },
    );
  }
  throw error;
}

/** One of the person's baskets and its dated run record. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const basket = await getBasket(session.uid, params.id);
  if (!basket)
    return NextResponse.json(
      { error: "That basket does not exist." },
      { status: 404 },
    );
  const runs = await listBasketRuns(session.uid, basket.id);
  return NextResponse.json(
    { basket, runs },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Edit the basket (name, idea, companies and their reasons), or switch it on or off. Switching on checks the plan's
 * running limit on agents, jobs and baskets together.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    enabled?: unknown;
    basket?: unknown;
    version?: unknown;
  } | null;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : undefined;
  const parsed =
    body?.basket !== undefined ? parseBasketDraft(body.basket) : null;
  if (parsed && !parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const unknown = parsed?.ok
    ? await unknownTickers(parsed.draft.lines.map((line) => line.ticker))
    : [];
  if (unknown.length > 0)
    return NextResponse.json(
      {
        error: `We don't follow ${unknown.join(", ")} yet, so the agent couldn't check ${unknown.length === 1 ? "it" : "them"}. Take ${unknown.length === 1 ? "it" : "them"} out to go on.`,
      },
      { status: 400 },
    );
  if (enabled === undefined && !parsed)
    return NextResponse.json(
      { error: "Send the edited basket, or whether it should run." },
      { status: 400 },
    );
  const version = typeof body?.version === "number" ? body.version : undefined;
  if (parsed?.ok && version === undefined)
    return NextResponse.json(
      { error: "Send the version of the basket you edited." },
      { status: 400 },
    );
  const plan = (await getViewer()).plan;
  try {
    // New companies or kinds get a new replay, kept with the basket; a new name or idea keeps the one it has.
    let replay: ReturnType<typeof replaySummary> | null | undefined;
    if (parsed?.ok) {
      const current = await getBasket(session.uid, params.id);
      const shape = (lines: Array<{ ticker: string; kind: string }>) =>
        lines.map((line) => `${line.ticker}:${line.kind}`).join(",");
      if (current && shape(current.lines) !== shape(parsed.draft.lines)) {
        const allowed = replayAllowed(session.uid);
        if (!allowed.ok) {
          const refused = tooManyReplays(allowed.retryAfterSec);
          return NextResponse.json(refused.body, refused.init);
        }
        replay = await replayDraft(parsed.draft)
          .then(replaySummary)
          .catch(() => null);
      }
    }
    const basket = await updateBasket(
      session.uid,
      params.id,
      {
        enabled,
        ...(parsed?.ok
          ? {
              draft: parsed.draft,
              version,
              ...(replay !== undefined ? { replay } : {}),
            }
          : {}),
      },
      plan,
    );
    return NextResponse.json({ ok: true, basket });
  } catch (error) {
    return failure(error, plan);
  }
}

/** Remove a basket. It is archived, not erased, and its run record stays. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await updateBasket(
      session.uid,
      params.id,
      { archived: true },
      (await getViewer()).plan,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
