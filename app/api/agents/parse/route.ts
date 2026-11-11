import { NextRequest, NextResponse } from "next/server";

import { hiddenTemplateIds } from "@/lib/agent-jobs";
import { listJobs } from "@/lib/agent-jobs-data";
import { MAX_JOBS_PER_USER } from "@/lib/agent-jobs";
import { anonymousPlainSubject, consumePlainParse } from "@/lib/agents-plain/limits";
import { plainModelReader } from "@/lib/agents-plain/model";
import { MAX_REQUEST_CHARS, parseByRules, parsePlainRequest } from "@/lib/agents-plain/parse";
import { sameJob } from "@/lib/agents-plain/save";
import { plainCatalog } from "@/lib/agents-plain/server";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";

/**
 * POST /api/agents/parse { text }: a request in a person's own words in, the
 * agents we understood out, as plain sentences plus the drafts to save.
 * Works signed out (nothing is saved here). Rules read the common shapes; a
 * model reads the rest, counted per person per day (lib/agents-plain/limits.ts).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return NextResponse.json({ error: "Type what you want watched, like “tell me if NVDA closes below 150”." }, { status: 400 });
  if (text.length > MAX_REQUEST_CHARS) {
    return NextResponse.json({ error: `Keep it under ${MAX_REQUEST_CHARS} characters. One or two things to watch works best.` }, { status: 400 });
  }

  const viewer = await getViewer();
  const hidden = hiddenTemplateIds();
  const catalog = await plainCatalog();
  const rules = parseByRules(text, catalog, { hidden });
  const reader = rules.confident ? null : plainModelReader();
  const subject = viewer.uid ?? anonymousPlainSubject(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  const meter = await consumePlainParse(viewer.plan, subject, Boolean(reader));
  if (!meter.allowed) {
    return NextResponse.json({ error: "That's a lot of requests for one day. Try again tomorrow." }, { status: 429 });
  }

  const spec = await parsePlainRequest(text, catalog, { hidden, rules, model: meter.model ? reader : null });
  // No model read this time: the rules' reading stands, and the page says why it may be partial.
  // "model" is this person's own daily reads; anything else (the shared ceiling, a counter outage) is "busy".
  const limited = Boolean(reader) && !meter.model ? (meter.reason === "model" ? "model" : "busy") : null;

  let capacity: { running: number; total: number; limit: number; max: number } | null = null;
  // Which of these the person already has, so the page counts only new agents and says so.
  let existing: boolean[] = spec.watches.map(() => false);
  if (viewer.uid) {
    const jobs = await listJobs(viewer.uid).catch(() => null);
    if (jobs) {
      existing = spec.watches.map((watch) => jobs.some((job) => sameJob(job, watch.draft)));
      capacity = {
        running: jobs.filter((job) => job.enabled).length,
        total: jobs.length,
        limit: limitFor("agents", viewer.plan),
        max: MAX_JOBS_PER_USER,
      };
    }
  }

  return NextResponse.json({
    spec,
    limited: limited ?? (spec.limited ? "model" : null),
    existing,
    signedIn: viewer.signedIn,
    plan: viewer.plan,
    tracked: viewer.signedIn ? viewer.tracked.length : null,
    capacity,
  });
}
