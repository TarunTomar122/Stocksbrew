import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase-admin";
import { ON_DEMAND_INTEL_TTL_MS, isOnDemandIntelFresh } from "@/lib/stock-demand-policy";

const ON_DEMAND_QUEUE_DEDUPE_MS = 90 * 1000;
const DEFAULT_PUBLIC_DAILY_CAP = 20;

export type OnDemandTriggerSource =
  | "radar_track"
  | "watchlist_batch"
  | "stock_page_view"
  | "search_selection"
  | "backfill";

type QueueOptions = {
  source?: OnDemandTriggerSource;
  staleAfterMs?: number;
  recordRequester?: boolean;
  publicBudget?: boolean;
  now?: Date;
};

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

async function getActiveAiUniverse(market: "US" | "IN"): Promise<string> {
  const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
  const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};
  const aiKey = `${market}_ai_universe`;
  const priceKey = `${market}_universe`;
  const aiUniverse = String(data[aiKey] || "").trim();
  const priceUniverse = String(data[priceKey] || "").trim();
  if (aiUniverse) return aiUniverse;
  if (priceUniverse) return priceUniverse;
  return market === "IN" ? "in_core_60" : "us_core_100";
}

async function hasFreshExistingIntel(
  instrumentId: string,
  nowMs: number,
  staleAfterMs: number,
): Promise<boolean> {
  const market = marketFromInstrumentId(instrumentId);
  const universe = await getActiveAiUniverse(market);
  const intelSnap = await adminFirestore
    .collection("tm_news_runs")
    .doc(`${market}__${universe}`)
    .collection("stock_intelligence")
    .doc(instrumentId)
    .get();
  if (!intelSnap.exists) return false;
  return isOnDemandIntelFresh(
    (intelSnap.data() || {}) as Record<string, unknown>,
    nowMs,
    staleAfterMs,
  );
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function maybeQueueOnDemandNews(
  requesterId: string,
  instrumentId: string,
  options: QueueOptions = {},
): Promise<boolean> {
  const market = marketFromInstrumentId(instrumentId);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const staleAfterMs = options.staleAfterMs ?? ON_DEMAND_INTEL_TTL_MS;
  const source = options.source ?? "radar_track";
  const recordRequester = options.recordRequester ?? true;
  // The old gate based on tm_tracked_instruments.tracked_count caused false
  // negatives for newly tracked users: "globally tracked" does not mean this
  // stock has fresh AI intel in the active universe.
  const alreadyCovered = await hasFreshExistingIntel(instrumentId, nowMs, staleAfterMs);
  if (alreadyCovered) return false;

  const ref = adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId);
  const utcDay = nowIso.slice(0, 10);
  const budgetRef = adminFirestore
    .collection("tm_on_demand_research_budget")
    .doc(`${market}_${utcDay}`);
  const publicDailyCap = positiveInt(
    process.env.ON_DEMAND_PUBLIC_DAILY_CAP,
    DEFAULT_PUBLIC_DAILY_CAP,
  );
  let queued = false;
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const status = String(existing?.status || "");
    const updatedAtRaw = String(existing?.updated_at || "");
    const updatedAt = Date.parse(updatedAtRaw);
    const recentlyQueued =
      (status === "queued" || status === "retry") &&
      Number.isFinite(updatedAt) &&
      nowMs - updatedAt < ON_DEMAND_QUEUE_DEDUPE_MS;
    if (status === "running" || recentlyQueued) {
      tx.set(
        ref,
        {
          ...(recordRequester && requesterId
            ? { requested_by: FieldValue.arrayUnion(requesterId) }
            : {}),
          trigger_sources: FieldValue.arrayUnion(source),
          request_count: FieldValue.increment(1),
          last_requested_at: nowIso,
        },
        { merge: true },
      );
      return;
    }

    const lastQueuedDay = String(existing?.last_queued_day || "");
    const dailyQueueCount =
      lastQueuedDay === utcDay ? Number(existing?.daily_queue_count || 0) : 0;
    if (dailyQueueCount >= 1) {
      tx.set(
        ref,
        {
          trigger_sources: FieldValue.arrayUnion(source),
          request_count: FieldValue.increment(1),
          last_requested_at: nowIso,
          daily_cap_suppressed_count: FieldValue.increment(1),
        },
        { merge: true },
      );
      return;
    }

    if (options.publicBudget) {
      const budgetSnap = await tx.get(budgetRef);
      const budget = budgetSnap.exists ? budgetSnap.data() || {} : {};
      const used = Number(budget.queued_count || 0);
      if (used >= publicDailyCap) {
        tx.set(
          budgetRef,
          {
            market,
            day: utcDay,
            cap: publicDailyCap,
            suppressed_count: FieldValue.increment(1),
            updated_at: nowIso,
          },
          { merge: true },
        );
        return;
      }
      tx.set(
        budgetRef,
        {
          market,
          day: utcDay,
          cap: publicDailyCap,
          queued_count: FieldValue.increment(1),
          updated_at: nowIso,
        },
        { merge: true },
      );
    }

    tx.set(
      ref,
      {
        instrument_id: instrumentId,
        market,
        status: "queued",
        ...(recordRequester && requesterId
          ? { requested_by: FieldValue.arrayUnion(requesterId) }
          : {}),
        trigger_sources: FieldValue.arrayUnion(source),
        trigger_source: source,
        request_count: FieldValue.increment(1),
        requested_at: nowIso,
        last_requested_at: nowIso,
        queued_at: nowIso,
        runnable_at: nowIso,
        updated_at: nowIso,
        last_queued_day: utcDay,
        daily_queue_count: dailyQueueCount + 1,
        attempts: 0,
        error: "",
      },
      { merge: true },
    );
    queued = true;
  });
  return queued;
}

export async function getOnDemandNewsStatus(instrumentId: string): Promise<{
  status: string;
  requested_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
} | null> {
  const snap = await adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId).get();
  if (!snap.exists) return null;
  const row = snap.data() || {};
  return {
    status: String(row.status || "queued"),
    requested_at: typeof row.requested_at === "string" ? row.requested_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}
