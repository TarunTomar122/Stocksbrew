import { NextRequest, NextResponse } from "next/server";

import { getJob, runJob } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Check one of the person's own jobs now and record the decision. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const job = await getJob(session.uid, params.id);
  if (!job) return NextResponse.json({ error: "That job does not exist." }, { status: 404 });
  // A paused job (including one saved past the plan's limit) stays saved but does not run, by hand either.
  if (!job.enabled) {
    return NextResponse.json(
      { error: "This agent is paused. Switch it on to run it; if your plan's agents are all running, pause another first." },
      { status: 409 },
    );
  }
  const outcome = await runJob(job);
  return NextResponse.json({ ok: true, ...outcome });
}
