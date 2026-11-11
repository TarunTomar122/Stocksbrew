import { NextRequest, NextResponse } from "next/server";

import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { AgentJobError, updateJob } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** Turn a job on or off. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Say whether the job should be on or off." }, { status: 400 });
  }
  const plan = (await getViewer()).plan;
  try {
    const job = await updateJob(session.uid, params.id, { enabled: body.enabled }, new Date(), limitFor("agents", plan), plan);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    if (error instanceof AgentJobError) {
      return NextResponse.json({ error: error.message, ...(error.feature ? { feature: error.feature, plan } : {}) }, { status: error.status });
    }
    throw error;
  }
}

/** Remove a job. It is archived, not erased, and its run log stays. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await updateJob(session.uid, params.id, { archived: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AgentJobError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
