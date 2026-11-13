import { NextRequest, NextResponse } from "next/server";

import { getViewer } from "@/lib/entitlements-server";
import { RecipeError, recipeContext, resolveSubject, saveRecipe } from "@/lib/agent-recipes/server";

export const dynamic = "force-dynamic";

const PRIVATE = { "cache-control": "private, no-store" };

function failed(error: unknown) {
  if (error instanceof RecipeError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE });
  throw error;
}

function size(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The recipes for a page's subject (`?subject=stock:NVDA`), which already stand, and the plan's room. Reads only. */
export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewer();
    const subject = await resolveSubject(req.nextUrl.searchParams.get("subject"), viewer.uid);
    return NextResponse.json({ ok: true, ...(await recipeContext(subject, viewer)) }, { headers: PRIVATE });
  } catch (error) {
    return failed(error);
  }
}

/** Switch a recipe on: saved as a standing job for the signed-in person, paused when the plan has no room. */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.uid) return NextResponse.json({ error: "Sign in to switch on an agent." }, { status: 401, headers: PRIVATE });
  const body = (await req.json().catch(() => null)) as { subject?: unknown; recipe?: unknown; size?: unknown } | null;
  try {
    const subject = await resolveSubject(body?.subject, viewer.uid);
    const saved = await saveRecipe(subject, String(body?.recipe ?? ""), size(body?.size), viewer.uid, viewer.plan);
    return NextResponse.json({ ok: true, ...saved }, { headers: PRIVATE });
  } catch (error) {
    return failed(error);
  }
}
