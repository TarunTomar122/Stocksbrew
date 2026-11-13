import { timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { copyRouteOf, nextTargets, planRevalidation, varnishBanPattern, type RevalidatePlan } from "@/lib/revalidate-targets";

/**
 * Refresh the cached pages that show data the pipeline just wrote.
 *
 * POST, header `x-revalidate-token: <REVALIDATE_TOKEN>`, body
 * `{ kinds?: string[], symbols?: string[], paths?: string[], tags?: string[], force?: boolean }`
 * (lib/revalidate-targets.ts). On the VPS the app runs as two instances, each
 * with its own copy of Next's cache state, behind Varnish:
 *
 *  1. the instance that receives the call forwards it to every instance in
 *     REVALIDATE_PEERS (itself included) with `x-revalidate-scope: local`;
 *  2. each instance drops its cached signed-out copies and data caches for the
 *     plan (`revalidatePath` / `revalidateTag`: the next request for them
 *     renders afresh instead of being served the old copy); the copies of
 *     pages in COPY_ROUTES (/briefing) are dropped through their own route and
 *     built again by the instance itself before it answers, so a signed-out
 *     visitor gets a built copy and a signed-in one keeps its warm caches;
 *  3. once they have answered, one BAN to Varnish (VARNISH_BAN_URL, localhost
 *     only) drops the cached HTML for the same pages, so the next visitor gets
 *     the new page and it is cached again.
 *
 * Without REVALIDATE_PEERS (local dev, Vercel) step 1 is skipped and the
 * receiving instance refreshes itself; without VARNISH_BAN_URL step 3 is.
 * A page refreshed in the last DEDUPE_MS on an instance is skipped there
 * (`force: true` overrides), which rate-limits callers that write in bursts.
 */

const DEDUPE_MS = 30_000;
const PEER_TIMEOUT_MS = 10_000;
const BAN_TIMEOUT_MS = 5_000;
const SCOPE_HEADER = "x-revalidate-scope";

const revalidateState = globalThis as typeof globalThis & {
  __tikrrRevalidateLast?: Map<string, number>;
};

type LocalResult = { revalidated: string[]; skipped: string[]; warmed?: string[] };

function peers(): string[] {
  return (process.env.REVALIDATE_PEERS || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter((item) => /^https?:\/\/[^/\s]+$/.test(item));
}

/**
 * How long one page's rebuild may take before the refresh goes on without it. With WARM_STAGGER_MS it stays well
 * inside PEER_TIMEOUT_MS, and the whole call inside the pipeline's 20 s (backend/scripts/trigger_web_revalidate.py).
 */
const WARM_TIMEOUT_MS = 5_000;
/**
 * The second instance starts its rebuild this much later: both write the same files in the shared .next cache, and
 * Node's writeFile is not atomic.
 */
const WARM_STAGGER_MS = 1_200;

/**
 * This instance's own port (the systemd unit sets PORT; tikrr-web@3000 and @3001), or null when unknown. Asked for at
 * `localhost`, as REVALIDATE_PEERS does: the unit's HOSTNAME, so the page's rewrite to its cached copy stays inside.
 */
function ownPort(): string | null {
  const port = (process.env.PORT || "").trim();
  return /^\d{2,5}$/.test(port) ? port : null;
}

/**
 * Build this instance's signed-out copy of each page again, right after it was dropped (lib/revalidate-targets.ts
 * COPY_ROUTES), by asking for it the way a signed-out visitor would: no cookie, HTML. The copy is stored once its
 * render finishes, so the whole body is read. Returns the pages that came back 200; a page that fails or runs long is
 * left for the next visitor to build, as before.
 */
async function warmHere(pages: string[]): Promise<string[]> {
  const port = ownPort();
  if (!port || pages.length === 0) return [];
  // This instance's place among the peers (0 when it is not listed): the first rebuilds at once, the next a little later.
  const place = Math.max(0, peers().findIndex((peer) => new URL(peer).port === port));
  if (place > 0) await new Promise((resolve) => setTimeout(resolve, place * WARM_STAGGER_MS));
  const built = await Promise.all(
    pages.map(async (page) => {
      try {
        const response = await fetch(`http://localhost:${port}${page}`, {
          headers: { accept: "text/html" },
          signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
          cache: "no-store",
        });
        await response.arrayBuffer();
        return response.ok ? page : null;
      } catch {
        return null;
      }
    }),
  );
  return built.filter((page): page is string => page !== null);
}

/** Refresh this instance's copies. Called inside the route handler, where revalidatePath/Tag work. */
function revalidateHere(plan: RevalidatePlan, force: boolean): LocalResult & { warm: string[] } {
  const now = Date.now();
  const lastByKey = revalidateState.__tikrrRevalidateLast ?? new Map<string, number>();
  revalidateState.__tikrrRevalidateLast = lastByKey;
  const { paths, routes, tags, warm } = nextTargets(plan);
  const revalidated: string[] = [];
  const skipped: string[] = [];
  const dropped = new Set<string>();
  const run = (key: string, action: () => void) => {
    if (!force && now - (lastByKey.get(key) || 0) < DEDUPE_MS) {
      skipped.push(key);
      return;
    }
    action();
    lastByKey.set(key, now);
    revalidated.push(key);
  };
  for (const path of paths) {
    // The tag every render of the address carries, its cached signed-out copy included (lib/revalidate-targets.ts).
    run(`path:${path}`, () => revalidatePath(path));
  }
  for (const route of routes)
    run(`route:${route}`, () => {
      revalidatePath(route, "page");
      dropped.add(route);
    });
  for (const tag of tags) run(`tag:${tag}`, () => revalidateTag(tag));
  // Only the copies this call dropped (a refresh skipped inside the window left the copy as it was).
  return { revalidated, skipped, warm: warm.filter((page) => dropped.has(copyRouteOf(page) ?? "")) };
}

/** Refresh this instance, then build again the copies it dropped. */
async function refreshHere(plan: RevalidatePlan, force: boolean): Promise<LocalResult> {
  const { warm, ...result } = revalidateHere(plan, force);
  return { ...result, warmed: await warmHere(warm) };
}

async function forwardToPeers(
  origins: string[],
  token: string,
  body: unknown,
): Promise<Array<{ peer: string; ok: boolean; revalidated: number; warmed?: number; error?: string }>> {
  return Promise.all(
    origins.map(async (peer) => {
      try {
        const response = await fetch(`${peer}/api/revalidate`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-revalidate-token": token, [SCOPE_HEADER]: "local" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as { revalidated?: unknown[]; warmed?: unknown[] };
        return {
          peer,
          ok: response.ok,
          revalidated: Array.isArray(payload.revalidated) ? payload.revalidated.length : 0,
          // How many dropped copies it built again (the pipeline log shows it).
          ...(Array.isArray(payload.warmed) ? { warmed: payload.warmed.length } : {}),
        };
      } catch (error) {
        // An instance that is restarting (a rolling deploy) starts with an empty cache anyway.
        return { peer, ok: false, revalidated: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

/** One BAN for every cached URL of the plan. Best effort: a failed ban leaves pages to expire on their own. */
async function banVarnish(plan: RevalidatePlan): Promise<string> {
  const base = (process.env.VARNISH_BAN_URL || "").trim().replace(/\/+$/, "");
  const pattern = varnishBanPattern(plan);
  if (!base || !pattern) return "off";
  try {
    const response = await fetch(`${base}/`, {
      method: "BAN",
      headers: { "x-ban-url": pattern },
      signal: AbortSignal.timeout(BAN_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok ? "ok" : `failed ${response.status}`;
  } catch (error) {
    return `failed ${error instanceof Error ? error.message : String(error)}`;
  }
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token") || "";
  const expected = process.env.REVALIDATE_TOKEN || "";
  if (!expected || !sameToken(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = body && typeof body === "object" ? body : {};
  const plan = planRevalidation(payload);
  if (!plan) return NextResponse.json({ ok: false, error: "nothing to revalidate" }, { status: 400 });
  const force = payload.force === true;

  if (req.headers.get(SCOPE_HEADER) === "local") {
    return NextResponse.json({ ok: true, ...(await refreshHere(plan, force)) });
  }

  const origins = peers();
  let revalidatedCount = 0;
  let local: LocalResult | null = null;
  let peerResults: Awaited<ReturnType<typeof forwardToPeers>> = [];
  if (origins.length) {
    peerResults = await forwardToPeers(origins, token, payload);
    revalidatedCount = peerResults.reduce((sum, item) => sum + item.revalidated, 0);
  }
  if (!peerResults.some((item) => item.ok)) {
    // No peers set, or none answered (a wrong REVALIDATE_PEERS): at least this instance is refreshed.
    local = await refreshHere(plan, force);
    revalidatedCount = local.revalidated.length;
  }
  // Every instance skipped it (refreshed seconds ago): the cached HTML was dropped then too.
  // A peer that did not answer (timed out while rebuilding a copy, or restarting) may well have refreshed: ban anyway,
  // since a missed ban leaves the old pages in Varnish for minutes and an extra one costs a rebuild at most.
  const unsure = peerResults.some((item) => !item.ok);
  const ban = revalidatedCount > 0 || force || unsure ? await banVarnish(plan) : "skipped";
  return NextResponse.json({
    ok: true,
    plan,
    ...(local ?? { revalidated: [], skipped: [] }),
    peers: peerResults,
    ban,
  });
}
