import { NextRequest, NextResponse } from "next/server";

import { getJob, runJob } from "@/lib/agent-jobs-data";
import { PRO_EVENTS_PAUSED, planMayRun } from "@/lib/agent-jobs";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";

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
  // A filing or news agent on a plan without them stays saved but does not run (lib/entitlements.ts agent_events).
  const plan = (await getViewer()).plan;
  if (!planMayRun(job, plan)) {
    return NextResponse.json({ error: PRO_EVENTS_PAUSED, feature: "agent_events", plan }, { status: 409 });
  }
  const outcome = await runJob(job);
  return NextResponse.json({ ok: true, ...outcome });
}
