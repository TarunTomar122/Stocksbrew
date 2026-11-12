import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { askModel } from "@/lib/ask-llm";
import { ruleFor } from "@/lib/entitlements";
import { METER_UNAVAILABLE_MESSAGE, consumeMeter, getViewer, peekMeter } from "@/lib/entitlements-server";
import { STEP_LOADERS } from "@/lib/research/gather";
import { runResearch } from "@/lib/research/run";
import { SAVE_FAILED_MESSAGE, handOver, limitMessage, waitForRun, type DoneEvent, type HandOver } from "@/lib/research/handover";
import { claimRun, lookupSharedReport, putSharedReport, releaseRun } from "@/lib/research/shared";
import { researchStore, runningItem } from "@/lib/research/store";
import { chooseSharedPath } from "@/lib/research/freshness";
import { cleanTicker, initialSteps, reportHref, type ResearchEvent } from "@/lib/research/types";
import { writeReport } from "@/lib/research/write";
import { getStockSummary } from "@/lib/stock";

/**
 * Full research on one stock.
 *
 * GET ?ticker=NVDA: the person's allowance and their saved reports on that stock.
 * POST { ticker, fresh? }: get a report. The response is NDJSON, one
 * ResearchEvent per line, so the page can show each step as it finishes.
 *
 * - When the stock's shared report (lib/research/shared.ts) is still fresh
 *   (lib/research/freshness.ts), it is saved as this person's own report and
 *   handed over at once: no new run. `fresh: true` ("Run it again") takes it
 *   only when it is newer than every report on the stock they already hold
 *   (chooseSharedPath); otherwise it writes a new one.
 * - When someone else's run on the same stock is under way, this request waits
 *   for it and hands over its report, so two people asking at once pay for one run.
 * - Otherwise a new run is written, and once it is saved it becomes the stock's
 *   shared report. The run keeps going if the page is closed; the report is
 *   saved either way and the page picks it up.
 *
 * Limits: signed in only; the monthly meter in lib/entitlements.ts
 * (deep_research), checked before and counted only after a report is saved,
 * a handed-over report included; one run at a time per person; a few runs at a
 * time per server instance.
 */

export const dynamic = "force-dynamic";
// Evidence takes 10 to 30 seconds and the writer up to about two minutes.
export const maxDuration = 300;

const FEATURE = "deep_research" as const;
const MAX_RUNS_PER_INSTANCE = 4;
let activeRuns = 0;
// A double click reaches here twice before either run has saved its "running" doc.
const runningUids = new Set<string>();

/**
 * On Vercel, a closed tab ends the response; without this the run behind it
 * could be frozen before the report is saved. The platform's request context
 * (what @vercel/functions' waitUntil wraps) is used when it exists; elsewhere
 * the process simply keeps running.
 */
function keepAlive(promise: Promise<unknown>): void {
  const holder = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }
    | undefined;
  try {
    holder?.get?.()?.waitUntil?.(promise.catch(() => undefined));
  } catch {
    // no platform context: nothing to extend
  }
}

const NDJSON_HEADERS = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" };

function log(event: string, data: Record<string, unknown>) {
  console.log(event, JSON.stringify(data));
}

type Plan = Awaited<ReturnType<typeof getViewer>>["plan"];

/** A refused hand-over as the route's usual answers. */
function refused(result: Extract<HandOver, { ok: false }>, plan: Plan): Response {
  if (result.code === "limit") return json(429, { code: "limit", plan, limit: result.limit, used: result.used, message: limitMessage(result.limit) });
  if (result.code === "unavailable") return json(503, { code: "unavailable", message: METER_UNAVAILABLE_MESSAGE });
  return json(503, { code: "save_failed", message: SAVE_FAILED_MESSAGE });
}

/** A report that is ready at once: the steps as done, then where it is. */
function readyNow(ticker: string, done: DoneEvent): Response {
  const steps = initialSteps().map((step) => ({ ...step, status: "done" as const }));
  const lines: ResearchEvent[] = [{ type: "start", key: done.key, ticker, steps }, done];
  return new Response(lines.map((line) => JSON.stringify(line)).join("\n") + "\n", { headers: NDJSON_HEADERS });
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  const ticker = cleanTicker(req.nextUrl.searchParams.get("ticker"));
  if (!viewer.uid) return json(200, { signed_in: false, plan: viewer.plan, allowance: null, reports: [] });
  const [meter, items] = await Promise.all([
    peekMeter(FEATURE, viewer.plan, viewer.uid).catch(() => null),
    researchStore.list(viewer.uid).catch(() => []),
  ]);
  return json(200, {
    signed_in: true,
    plan: viewer.plan,
    allowance: meter ? { used: meter.used, limit: meter.limit, remaining: meter.remaining, per: meter.per } : null,
    reports: ticker ? items.filter((item) => item.ticker === ticker) : items,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ticker?: unknown; fresh?: unknown } | null;
  const ticker = cleanTicker(body?.ticker);
  // "Run it again": a new run even when the stored report is still fresh.
  const forceFresh = body?.fresh === true;
  if (!ticker) return json(400, { code: "bad_request", message: "Pick a stock first." });

  const viewer = await getViewer();
  if (!viewer.uid) return json(401, { code: "sign_in", message: "Sign in to run a long research report. It is free to start." });

  const summary =
    (await getStockSummary(ticker, "US").catch(() => null)) ?? (ticker.includes(".") ? await getStockSummary(ticker.replace(/\./g, "-"), "US").catch(() => null) : null);
  if (!summary) return json(404, { code: "not_found", message: `We do not cover ${ticker} yet, so there is nothing to research.` });

  const uid = viewer.uid;
  const plan = viewer.plan;
  const encoder = new TextEncoder();
  // Their own reports decide everything below (what they already hold, whether one is still running, whether a shared
  // copy is newer), so a history we cannot read means "try again", never a guess that could hand over an older copy
  // or start a second run (council, Nov 12).
  const items = await researchStore.list(uid).catch(() => null);
  if (!items) return json(503, { code: "unavailable", message: "We could not read your reports just now. Try again in a minute." });

  // A fresh report someone already ran on this stock. A store we cannot read means a new run.
  const hit = await lookupSharedReport(ticker).catch((error) => {
    log("research_shared_lookup_failed", { ticker, error: String(error).slice(0, 200) });
    return null;
  });
  if (hit && !hit.verdict.fresh) log("research_shared_stale", { ticker, reason: hit.verdict.reason, written_at: hit.report.written_at });
  const fresh = hit?.verdict.fresh ? hit.report : null;
  // "Run it again" still gets the shared copy when it is newer than anything this person holds on the stock.
  const choice = chooseSharedPath({ ticker, forceFresh, shared: fresh, held: items });
  // They already hold this very report: open theirs, nothing saved or counted, even past the monthly limit.
  if (choice.kind === "theirs") return readyNow(ticker, { type: "done", key: choice.key, href: reportHref(ticker, choice.key), removed: 0, cached: true });

  const running = runningItem(items);
  if (running) {
    return json(409, { code: "running", ticker: running.ticker, key: running.key, message: `Your report on ${running.ticker} is still being written. One at a time.` });
  }
  if (runningUids.has(viewer.uid)) return json(409, { code: "running", message: "Your report is still being written. One at a time." });

  // Theirs at once: charged, then saved as this person's own report. Never a run behind a refused charge.
  if (fresh && choice.kind === "handover") {
    runningUids.add(uid);
    const result = await handOver(fresh, uid, plan).finally(() => runningUids.delete(uid));
    return result.ok ? readyNow(ticker, result.done) : refused(result, plan);
  }

  // The run's gate. A hand-over above has its own, inside its atomic charge, which also lets a retry through at the
  // limit when this very report was already paid for and only the save failed.
  const meter = await peekMeter(FEATURE, viewer.plan, viewer.uid);
  // A long report is a real model bill, so a counter we cannot read means "try again", never "run uncounted".
  if (!meter && ruleFor(FEATURE, viewer.plan).kind === "meter") {
    return json(503, { code: "unavailable", message: METER_UNAVAILABLE_MESSAGE });
  }
  if (meter && !meter.allowed) {
    return json(429, { code: "limit", plan: viewer.plan, limit: meter.limit, used: meter.used, message: limitMessage(meter.limit) });
  }

  const llm = askModel();
  if (!llm || llm.via === "offline") return json(503, { code: "not_configured", message: "The research writer is not set up on this server yet." });

  // Checked before the stock's lock is taken, so a refused run never leaves someone waiting on a lock it gives back.
  if (activeRuns >= MAX_RUNS_PER_INSTANCE) return json(503, { code: "busy", message: "A lot of reports are being written right now. Try again in a minute." });

  // One run per stock at a time: a second person asking now waits for the first run instead of paying for another.
  // Fails closed: a lock we cannot take means "try again", never a second paid run beside someone else's.
  const token = randomBytes(8).toString("hex");
  const claim = await claimRun(ticker, token).catch((error) => {
    log("research_lock_failed", { ticker, error: String(error).slice(0, 200) });
    return null;
  });
  if (!claim) return json(503, { code: "busy", message: "We could not start the report just now. Nothing was counted. Try again in a minute." });

  if (claim.claimed) {
    // A run on this stock may have finished between the first look and the claim: take its report instead.
    const again = await lookupSharedReport(ticker).catch(() => null);
    const pick = again?.verdict.fresh ? chooseSharedPath({ ticker, forceFresh, shared: again.report, held: items }) : null;
    if (again && pick && pick.kind !== "run") {
      if (pick.kind === "theirs") {
        await releaseRun(ticker, token, "handover").catch(() => undefined);
        return readyNow(ticker, { type: "done", key: pick.key, href: reportHref(ticker, pick.key), removed: 0, cached: true });
      }
      runningUids.add(uid);
      const result = await handOver(again.report, uid, plan).finally(() => runningUids.delete(uid));
      await releaseRun(ticker, token, "handover").catch(() => undefined);
      return result.ok ? readyNow(ticker, result.done) : refused(result, plan);
    }
  }

  if (!claim.claimed) {
    runningUids.add(uid);
    let open = true;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: ResearchEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false;
          }
        };
        emit({ type: "step", step: { id: "write", label: "Writing the report", status: "running", detail: "Someone else asked for this stock a moment ago. You get the same report." } });
        const work = waitForRun(ticker, claim.lock, uid, plan, emit).finally(() => {
          runningUids.delete(uid);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        });
        keepAlive(work);
        await work;
      },
      cancel() {
        open = false;
      },
    });
    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  activeRuns += 1;
  runningUids.add(uid);
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ResearchEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The page went away. The run carries on and saves the report.
          open = false;
        }
      };
      const work = (async () => {
        let outcome: "ready" | "failed" = "failed";
        try {
          const report = await runResearch(
            { uid, isPro: viewer.isSubscribed, ticker, name: summary.name || ticker },
            {
              loaders: STEP_LOADERS,
              write: writeReport,
              save: (report) => researchStore.save(report),
              consume: (key) => consumeMeter(FEATURE, plan, uid, new Date(), key),
              log,
            },
            emit,
          );
          if (report.status === "ready") {
            outcome = "ready";
            // The next person to ask for this stock gets this report while it is fresh.
            await putSharedReport(report).catch((error) => log("research_shared_save_failed", { ticker, error: String(error).slice(0, 200) }));
          }
        } finally {
          await releaseRun(ticker, token, outcome).catch(() => undefined);
          activeRuns -= 1;
          runningUids.delete(uid);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        }
      })();
      // The page says a person may leave while the report is written: keep the function alive until it is saved.
      keepAlive(work);
      await work;
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}
