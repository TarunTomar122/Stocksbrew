import type { Plan } from "@/lib/entitlements";
import { METER_UNAVAILABLE_MESSAGE, consumeMeter } from "@/lib/entitlements-server";
import { copyForPerson, lockHeld, lookupSharedReport, readRunLock, type RunLock, type SharedReport } from "@/lib/research/shared";
import { researchStore } from "@/lib/research/store";
import { reportHref, type ResearchEvent } from "@/lib/research/types";

/**
 * Handing a stock's shared report to one more person (lib/research/shared.ts), for POST /api/research: the charge,
 * the copy into their own history, and waiting on someone else's run of the same stock.
 */

const FEATURE = "deep_research" as const;
/** How long a request waits for another person's run on the same stock, at most; the route's maxDuration is 300 s. */
const WAIT_MS = 280_000;
const WAIT_POLL_MS = 2_500;

function log(event: string, data: Record<string, unknown>) {
  console.log(event, JSON.stringify(data));
}

export type DoneEvent = Extract<ResearchEvent, { type: "done" }>;
export type HandOver = { ok: true; done: DoneEvent } | { ok: false; code: "limit" | "unavailable" | "save_failed"; limit?: number; used?: number };

export const SAVE_FAILED_MESSAGE = "We could not save the report to your account just now. Try again in a minute: it will not be counted twice.";
const STALE_MESSAGE = "Something new came out while that report was being written, so it is already out of date. Nothing was counted. Try again for a new one.";

/**
 * Give this person the stock's shared report. Charged first, in the same atomic meter transaction a run's count
 * uses (consumeMeter checks the limit and counts in one step, so two requests at once cannot both slip under it),
 * and saved only when the charge went through. The charge is keyed by the shared report, so a retry after a failed
 * save is not counted twice. The caller must have just checked the copy is fresh (lookupSharedReport).
 */
export async function handOver(shared: SharedReport, uid: string, plan: Plan): Promise<HandOver> {
  const now = new Date();
  // Charged under "TICKER:key", the key its run used (lib/research/run.ts): a person
  // who ran this report themselves, or already paid for this copy, is never counted twice (council, Nov 12).
  const charge = await consumeMeter(FEATURE, plan, uid, now, `${shared.ticker}:${shared.source_key}`).catch(() => null);
  if (!charge || charge.unavailable) return { ok: false, code: "unavailable" };
  if (!charge.allowed) return { ok: false, code: "limit", limit: charge.limit, used: charge.used };
  const copy = copyForPerson(shared, uid, now);
  try {
    await researchStore.save(copy);
  } catch (error) {
    log("research_handover_failed", { ticker: shared.ticker, error: String(error).slice(0, 200) });
    return { ok: false, code: "save_failed" };
  }
  log("research_shared_hit", { ticker: shared.ticker, source_key: shared.source_key, created_at: shared.created_at });
  return { ok: true, done: { type: "done", key: copy.key, href: reportHref(shared.ticker, copy.key), removed: 0, cached: true } };
}

export function limitMessage(limit: number | undefined): string {
  return `That is all ${limit == null ? "your" : limit} reports for this month. Your saved reports stay open.`;
}

export function refusedEvent(result: Extract<HandOver, { ok: false }>): ResearchEvent {
  if (result.code === "limit") return { type: "error", code: "limit", message: limitMessage(result.limit) };
  if (result.code === "unavailable") return { type: "error", code: "unavailable", message: METER_UNAVAILABLE_MESSAGE };
  return { type: "error", code: "save_failed", message: SAVE_FAILED_MESSAGE };
}

/**
 * Wait for another person's run on this stock and hand over what it wrote. Follows the lock if a new run takes it
 * over; gives up when the run fails, its lock runs out, or the wait does. Before every hand-over the shared copy is
 * looked up again and must pass the freshness rule, measured from when its run started: a filing that landed while
 * the run was reading or writing makes it stale, and the waiter is told to ask again instead.
 */
export async function waitForRun(
  ticker: string,
  first: RunLock,
  uid: string,
  plan: Plan,
  emit: (event: ResearchEvent) => void,
  timing: { waitMs?: number; pollMs?: number } = {},
): Promise<void> {
  const until = Date.now() + (timing.waitMs ?? WAIT_MS);
  let lock = first;
  const failed = () =>
    emit({ type: "error", code: "failed", message: "The report someone else started on this stock did not finish. Nothing was counted. Try again." });
  /** True when it answered (handed over, or said why not); false to keep waiting. */
  const tryHandOver = async (): Promise<boolean> => {
    const hit = await lookupSharedReport(ticker).catch(() => undefined);
    if (!hit) return false;
    // Only what the awaited run wrote, or any fresh copy when the claimer found one instead of running.
    const fromThisRun = Date.parse(hit.report.created_at) >= Date.parse(lock.started_at);
    if (!fromThisRun && lock.outcome !== "handover") return false;
    if (!hit.verdict.fresh) {
      emit({ type: "error", code: "stale", message: STALE_MESSAGE });
      return true;
    }
    // They may already hold this very copy (from an earlier hand-over or their own run): open theirs, uncounted. A
    // history we cannot read means "try again", never a second charge for a report they own (council, Nov 12).
    const held = await researchStore.list(uid).catch(() => null);
    if (!held) {
      emit({ type: "error", code: "unavailable", message: "We could not read your reports just now. Nothing was counted. Try again in a minute." });
      return true;
    }
    const theirs = held.find((item) => item.ticker === ticker && item.status === "ready" && item.created_at === hit.report.created_at);
    if (theirs) {
      emit({ type: "done", key: theirs.key, href: reportHref(ticker, theirs.key), removed: 0, cached: true });
      return true;
    }
    const result = await handOver(hit.report, uid, plan);
    emit(result.ok ? result.done : refusedEvent(result));
    return true;
  };
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, timing.pollMs ?? WAIT_POLL_MS));
    if (await tryHandOver()) return;
    // A lock we could not read this time says nothing about the run: look again on the next turn, not give up.
    const current = await readRunLock(ticker).catch(() => undefined);
    if (current === undefined) continue;
    if (current && current.key !== lock.key && lockHeld(current)) {
      lock = current;
      continue;
    }
    if (!current || !lockHeld(current)) {
      if (current && current.key === lock.key) lock = current;
      // The run let go: one more look, since its report may have been stored a moment before the lock was released.
      if (await tryHandOver()) return;
      failed();
      return;
    }
  }
  failed();
}
