import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { saveFirstLook } from "@/lib/first-look/server";
import type { FirstLookAction } from "@/lib/first-look/state";
import type { FirstLookState } from "@/lib/first-look/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<FirstLookAction>(["start", "dismiss"]);
const SOURCES = new Set<NonNullable<FirstLookState["source"]>>(["onboarding", "agent", "landing"]);

/**
 * `{ action: "start" | "dismiss", source? }`: opens the agent's first look on /agent (the onboarding's finish, or the
 * one-time offer), or closes it. One field, `first_look`, merged into the signed-in person's own user doc; nothing
 * else on the doc is touched, and a dismissed look is never reopened.
 */
export async function POST(request: Request) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; source?: unknown } | null;
  const action = body?.action as FirstLookAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Say start or dismiss." }, { status: 400 });
  const source = SOURCES.has(body?.source as NonNullable<FirstLookState["source"]>) ? (body!.source as FirstLookState["source"]) : "agent";
  try {
    const state = await saveFirstLook(session.uid, action, source);
    return NextResponse.json({ ok: true, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status === 409 ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? "profile_not_ready" : "unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
