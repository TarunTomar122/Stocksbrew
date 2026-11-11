import { NextRequest, NextResponse } from "next/server";

import { askModel } from "@/lib/ask-llm";
import { consumeMeter, getViewer, peekMeter } from "@/lib/entitlements-server";
import { STEP_LOADERS } from "@/lib/research/gather";
import { runResearch } from "@/lib/research/run";
import { researchStore, runningItem } from "@/lib/research/store";
import { cleanTicker, type ResearchEvent } from "@/lib/research/types";
import { writeReport } from "@/lib/research/write";
import { getStockSummary } from "@/lib/stock";

/**
 * Full research on one stock.
 *
 * GET ?ticker=NVDA: the person's allowance and their saved reports on that stock.
 * POST { ticker }: run a report. The response is NDJSON, one ResearchEvent per
 * line, so the page can show each step as it finishes. The run keeps going if
 * the page is closed; the report is saved either way and the page picks it up.
 *
 * Limits: signed in only; the monthly meter in lib/entitlements.ts
 * (deep_research), checked before and counted only after a report is saved;
 * one run at a time per person; a few runs at a time per server instance.
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
  const body = (await req.json().catch(() => null)) as { ticker?: unknown } | null;
  const ticker = cleanTicker(body?.ticker);
  if (!ticker) return json(400, { code: "bad_request", message: "Pick a stock first." });

  const viewer = await getViewer();
  if (!viewer.uid) return json(401, { code: "sign_in", message: "Sign in to run a long research report. It is free to start." });

  const llm = askModel();
  if (!llm || llm.via === "offline") return json(503, { code: "not_configured", message: "The research writer is not set up on this server yet." });

  const summary =
    (await getStockSummary(ticker, "US").catch(() => null)) ?? (ticker.includes(".") ? await getStockSummary(ticker.replace(/\./g, "-"), "US").catch(() => null) : null);
  if (!summary) return json(404, { code: "not_found", message: `We do not cover ${ticker} yet, so there is nothing to research.` });

  const meter = await peekMeter(FEATURE, viewer.plan, viewer.uid);
  if (meter && !meter.allowed) {
    return json(429, { code: "limit", plan: viewer.plan, limit: meter.limit, used: meter.used, message: `That is all ${meter.limit} reports for this month. Your saved reports stay open.` });
  }

  const items = await researchStore.list(viewer.uid).catch(() => []);
  const running = runningItem(items);
  if (running) {
    return json(409, { code: "running", ticker: running.ticker, key: running.key, message: `Your report on ${running.ticker} is still being written. One at a time.` });
  }
  if (runningUids.has(viewer.uid)) return json(409, { code: "running", message: "Your report is still being written. One at a time." });
  if (activeRuns >= MAX_RUNS_PER_INSTANCE) return json(503, { code: "busy", message: "A lot of reports are being written right now. Try again in a minute." });

  const uid = viewer.uid;
  const plan = viewer.plan;
  const encoder = new TextEncoder();
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
        try {
          await runResearch(
            { uid, isPro: viewer.isSubscribed, ticker, name: summary.name || ticker },
            {
              loaders: STEP_LOADERS,
              write: writeReport,
              save: (report) => researchStore.save(report),
              consume: (key) => consumeMeter(FEATURE, plan, uid, new Date(), key),
              log: (event, data) => console.log(event, JSON.stringify(data)),
            },
            emit,
          );
        } finally {
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
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
