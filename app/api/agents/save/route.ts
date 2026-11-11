import { NextRequest, NextResponse } from "next/server";

import { MAX_JOBS_PER_USER, hiddenTemplateIds, parseJobDraft, type AgentJob, type AgentJobDraft } from "@/lib/agent-jobs";
import { AgentJobError, createJob, listJobs } from "@/lib/agent-jobs-data";
import { PRO_EVENTS_PAUSED, planMayRun } from "@/lib/agent-jobs";
import { MAX_WATCHES } from "@/lib/agents-plain/parse";
import { sameJob } from "@/lib/agents-plain/save";
import { getSessionUser } from "@/lib/auth-server";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";

/**
 * POST /api/agents/save { drafts }: save the agents a plain-English request
 * was read into. Each draft goes through parseJobDraft and createJob, the
 * same path as POST /api/agent-jobs, so the runner treats them like any
 * other agent. Only new jobs are written, each under a fresh id: an agent
 * the person already has is skipped, never overwritten. Past the plan's
 * limit new agents are saved paused, as everywhere else.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Sign in to save your agent." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { drafts?: unknown } | null;
  const raw = Array.isArray(body?.drafts) ? body.drafts : [];
  if (raw.length === 0) return NextResponse.json({ error: "There is nothing to save yet." }, { status: 400 });
  if (raw.length > MAX_WATCHES) return NextResponse.json({ error: `One request can set up at most ${MAX_WATCHES} agents.` }, { status: 400 });

  const hidden = hiddenTemplateIds();
  const drafts: AgentJobDraft[] = [];
  for (const entry of raw) {
    const parsed = parseJobDraft(entry, { hidden });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!drafts.some((draft) => sameJob(draft, parsed.draft))) drafts.push(parsed.draft);
  }

  try {
    const existing = await listJobs(session.uid);
    const fresh = drafts.filter((draft) => !existing.some((job) => sameJob(job, draft)));
    const already = drafts.filter((draft) => !fresh.includes(draft)).map((draft) => draft.name);
    // Check room for all of them first, so a request is never half saved.
    if (existing.length + fresh.length > MAX_JOBS_PER_USER) {
      const room = Math.max(0, MAX_JOBS_PER_USER - existing.length);
      return NextResponse.json(
        {
          error:
            room === 0
              ? `You have ${MAX_JOBS_PER_USER} agents, the most one account can keep. Remove one to add another.`
              : `This would make ${existing.length + fresh.length} agents, and one account can keep ${MAX_JOBS_PER_USER}. Remove ${existing.length + fresh.length - MAX_JOBS_PER_USER} or ask for fewer things at once.`,
        },
        { status: 409 },
      );
    }
    const viewer = await getViewer();
    const runLimit = limitFor("agents", viewer.plan);
    const saved: AgentJob[] = [];
    const failed: string[] = [];
    // One at a time: createJob counts what is running to decide whether the next one starts on or paused.
    for (const draft of fresh) {
      if (failed.length > 0) {
        failed.push(draft.name);
        continue;
      }
      try {
        saved.push(await createJob(session.uid, draft, new Date(), runLimit, viewer.plan));
      } catch (error) {
        if (error instanceof AgentJobError) throw error;
        console.error("plain agent save failed", error instanceof Error ? error.message : "unknown");
        failed.push(draft.name);
      }
    }
    // Nothing saved at all is an error; some saved is a result the page can show, with what is left to retry.
    if (saved.length === 0 && failed.length > 0) return NextResponse.json({ error: "That didn't save. Try again in a moment." }, { status: 503 });
    const paused = saved.filter((job) => !job.enabled).length;
    // Filing and news agents the plan does not include are saved paused too; say so rather than blame the count.
    const proOnly = saved.filter((job) => !job.enabled && !planMayRun(job, viewer.plan)).length;
    return NextResponse.json({
      ok: true,
      jobs: saved,
      already,
      failed,
      paused: paused > 0 ? { count: paused, limit: runLimit, ...(proOnly > 0 ? { pro_only: proOnly, message: PRO_EVENTS_PAUSED } : {}) } : null,
    });
  } catch (error) {
    if (error instanceof AgentJobError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
