import { NextRequest, NextResponse } from "next/server";

import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { parseJobDraft } from "@/lib/agent-jobs";
import { AgentJobError, createJob, listJobs, listRuns } from "@/lib/agent-jobs-data";
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
    const job = await createJob(session.uid, parsed.draft, new Date(), runLimit);
    // Past the plan's limit the job is saved switched off, never thrown away.
    return NextResponse.json({
      ok: true,
      job,
      paused: job.enabled ? null : { feature: "agents", limit: runLimit, message: `Saved and paused. Your plan runs ${runLimit} agents at a time: pause another to run this one.` },
    });
  } catch (error) {
    if (error instanceof AgentJobError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
