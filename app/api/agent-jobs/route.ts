import { NextRequest, NextResponse } from "next/server";

import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { parseJobDraft } from "@/lib/agent-jobs";
import { AgentJobError, createJob, listJobs, listRuns } from "@/lib/agent-jobs-data";
import { PRO_EVENTS_PAUSED, planMayRun } from "@/lib/agent-jobs";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** The signed-in person's jobs and their run log. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to see your jobs." }, { status: 401 });
  const [jobs, runs] = await Promise.all([listJobs(session.uid), listRuns(session.uid)]);
  return NextResponse.json({ jobs, runs });
}

/** Create a job from a template. The uid always comes from the session. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to set up a job." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = parseJobDraft(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const viewer = await getViewer();
    const runLimit = limitFor("agents", viewer.plan);
    const job = await createJob(session.uid, parsed.draft, new Date(), runLimit, viewer.plan);
    // Past the plan's limit, or watching what the plan does not include, the job is saved switched off, never thrown away.
    const blocked = !planMayRun(parsed.draft, viewer.plan);
    return NextResponse.json({
      ok: true,
      job,
      paused: job.enabled
        ? null
        : blocked
          ? { feature: "agent_events", plan: viewer.plan, message: PRO_EVENTS_PAUSED }
          : {
              feature: "agents",
              plan: viewer.plan,
              limit: runLimit,
              message:
                runLimit === 1
                  ? "Saved and paused. Your plan runs one agent at a time: pause the one that is running to run this one."
                  : `Saved and paused. Your plan runs ${runLimit} agents at a time: pause another to run this one.`,
            },
    });
  } catch (error) {
    if (error instanceof AgentJobError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
