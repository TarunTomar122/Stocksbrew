import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { coverageAfterTrackChange, effectiveCovered, type CoverageWrite } from "@/lib/entitlements-coverage";
import { emptySaveAllowed } from "@/lib/holding-drafts";
import { keepHoldingDates } from "@/lib/holding-dates";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";
import { captureServerEventSafe } from "@/lib/posthog-server-capture";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

type PositionType = "holding" | "watchlist";

type BatchItem = {
  instrument_id: string;
  position_type: PositionType;
  holding?: {
    quantity?: number | null;
    market_value?: number | null;
    average_cost?: number | null;
    currency?: string;
    source?: "manual" | "screenshot" | "unknown";
  };
};

type BatchLogLevel = "info" | "warn" | "error";

function batchLog(traceId: string, level: BatchLogLevel, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ svc: "api-watchlist-batch", trace_id: traceId, msg, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

function normalizeHoldingNumber(value: unknown, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

function normalizeHolding(raw: unknown): BatchItem["holding"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const quantity = normalizeHoldingNumber(obj.quantity, 1_000_000_000);
  const marketValue = normalizeHoldingNumber(obj.market_value, 1_000_000_000_000);
  const averageCost = normalizeHoldingNumber(obj.average_cost, 1_000_000_000);
  const currencyRaw = typeof obj.currency === "string" ? obj.currency.trim().toUpperCase() : "";
  const sourceRaw = typeof obj.source === "string" ? obj.source.trim().toLowerCase() : "";
  const source: "manual" | "screenshot" | "unknown" =
    sourceRaw === "manual" || sourceRaw === "screenshot" || sourceRaw === "unknown"
      ? sourceRaw
      : "unknown";
  const currency = currencyRaw || undefined;

  if (quantity === undefined && marketValue === undefined && averageCost === undefined && !currencyRaw) {
    return undefined;
  }
  return {
    quantity,
    market_value: marketValue,
    average_cost: averageCost,
    currency,
    source,
  };
}

function holdingHasInvalidNumbers(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  const checks: Array<[unknown, number]> = [
    [obj.quantity, 1_000_000_000],
    [obj.market_value, 1_000_000_000_000],
    [obj.average_cost, 1_000_000_000],
  ];
  for (const [value, max] of checks) {
    if (value === undefined || value === null || value === "") continue;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max) return true;
  }
  return false;
}

function normalizeItems(rawItems: unknown): { items: BatchItem[]; hasInvalidHolding: boolean } {
  if (!Array.isArray(rawItems)) return { items: [], hasInvalidHolding: false };
  let hasInvalidHolding = false;
  const dedup = new Map<string, BatchItem>();
  for (const raw of rawItems) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const instrumentId = typeof item?.instrument_id === "string" ? item.instrument_id.trim().toUpperCase() : "";
    if (!INSTRUMENT_ID_RE.test(instrumentId)) continue;
    if (holdingHasInvalidNumbers(item?.holding)) {
      hasInvalidHolding = true;
      continue;
    }
    const positionType: PositionType = item?.position_type === "holding" ? "holding" : "watchlist";
    dedup.set(instrumentId, {
      instrument_id: instrumentId,
      position_type: positionType,
      holding: normalizeHolding(item?.holding),
    });
  }
  return { items: [...dedup.values()], hasInvalidHolding };
}

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // The list version the sheet opened with. Without it (older clients) the save goes through as before.
  const baseVersion = typeof body?.base_version === "number" && Number.isFinite(body.base_version) ? body.base_version : null;
  let staleVersion: number | null = null;
  const normalized = normalizeItems(body?.items);
  const items = normalized.items;
  if (normalized.hasInvalidHolding) {
    return NextResponse.json({ error: "invalid_holding_values" }, { status: 400 });
  }
  // An empty list is a save when it was sent on purpose: every stock removed in Add or edit stocks.
  if (!emptySaveAllowed(body?.items, items.length)) {
    return NextResponse.json({ error: "empty_items" }, { status: 400 });
  }
  if (items.length > 300) {
    return NextResponse.json({ error: "too_many_items" }, { status: 400 });
  }

  const existing = await getUserDoc(session.uid);
  if (!existing) {
    return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  }
  const isSubscribed = resolveIsSubscribed(existing);
  // Tracking is unlimited on every plan. Coverage is recomputed inside the transaction below.
  const clientMutationId = req.headers.get("x-client-mutation-id") || randomUUID();
  const mutationToken = new Date().toISOString();
  const userRef = adminFirestore.collection("users").doc(session.uid);
  const eventRef = userRef.collection("watchlist_events").doc(clientMutationId);

  const nextTracked = items.map((i) => i.instrument_id);
  const nextPositions = Object.fromEntries(items.map((i) => [i.instrument_id, i.position_type])) as Record<string, PositionType>;
  const nextHoldings = Object.fromEntries(
    items
      .filter((i) => i.position_type === "holding" && i.holding)
      .map((i) => [
        i.instrument_id,
        {
          quantity: i.holding?.quantity ?? null,
          market_value: i.holding?.market_value ?? null,
          average_cost: i.holding?.average_cost ?? null,
          currency: i.holding?.currency || (marketFromInstrumentId(i.instrument_id) === "IN" ? "INR" : "USD"),
          source: i.holding?.source || "unknown",
          updated_at: mutationToken,
        },
      ]),
  );

  let sourceVersion = Number(existing.watchlist_version ?? 0);
  let addedIds: string[] = [];
  let removedIds: string[] = [];
  let coveredAfter: string[] = [];

  await adminFirestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const dedupeSnap = await tx.get(eventRef);
    if (dedupeSnap.exists) {
      sourceVersion = Number(dedupeSnap.data()?.version ?? userData?.watchlist_version ?? 0);
      return;
    }
    // This save replaces the whole list. If the list changed since the sheet was opened (a stock added in another tab),
    // saving would quietly undo that change, so nothing is written and the sheet asks for a reload.
    const storedVersion = Number(userData?.watchlist_version ?? 0);
    if (baseVersion !== null && storedVersion !== baseVersion) {
      staleVersion = storedVersion;
      return;
    }

    const currentTracked = Array.isArray(userData?.tracked_stocks) ? (userData?.tracked_stocks as string[]) : [];
    const currentSet = new Set(currentTracked);
    const nextSet = new Set(nextTracked);
    addedIds = nextTracked.filter((id) => !currentSet.has(id));
    removedIds = currentTracked.filter((id) => !nextSet.has(id));

    // Removed stocks leave coverage; added ones fill empty covered slots while free fills last (never a swap).
    const txPro = resolveIsSubscribed(userData as Parameters<typeof resolveIsSubscribed>[0]);
    const coverage: CoverageWrite | null = coverageAfterTrackChange(userData, txPro, nextTracked);
    coveredAfter = txPro ? nextTracked : coverage?.covered_stocks ?? effectiveCovered({ ...userData, tracked_stocks: nextTracked }, false);

    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        ...(coverage ?? {}),
        tracked_stocks: nextTracked,
        watchlist_positions: nextPositions,
        // Unchanged holdings keep their date (Ideas and Taxes read it as the buy date) and any field the sheet doesn't send.
        watchlist_holdings: keepHoldingDates(nextHoldings, userData?.watchlist_holdings),
        watchlist_updated_at: mutationToken,
        watchlist_version: sourceVersion,
        last_tracked_at: new Date().toISOString(),
      },
      { merge: true },
    );

    for (const instrumentId of addedIds) {
      const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
      tx.set(
        trackedRef,
        {
          instrument_id: instrumentId,
          market: marketFromInstrumentId(instrumentId),
          tracked_count: FieldValue.increment(1),
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    for (const instrumentId of removedIds) {
      const trackedRef = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
      tx.set(
        trackedRef,
        {
          instrument_id: instrumentId,
          market: marketFromInstrumentId(instrumentId),
          tracked_count: FieldValue.increment(-1),
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    tx.set(eventRef, {
      kind: "BATCH_SET_POSITIONS",
      version: sourceVersion,
      created_at: mutationToken,
      added_count: addedIds.length,
      removed_count: removedIds.length,
      total_count: nextTracked.length,
      holdings_count: Object.keys(nextHoldings).length,
      position_aware_count: Object.values(nextHoldings).filter(
        (h) =>
          typeof h === "object" &&
          h !== null &&
          ((typeof h.quantity === "number" && h.quantity > 0) || (typeof h.market_value === "number" && h.market_value > 0)),
      ).length,
    });
  });

  if (staleVersion !== null) {
    batchLog(traceId, "info", "batch_update_stale", { uid: session.uid, base_version: baseVersion, stored_version: staleVersion });
    return NextResponse.json({ error: "stale_list", version: staleVersion }, { status: 409 });
  }

  let queuedOnDemandCount = 0;
  // Research is queued for covered stocks only, so unlimited tracking on Free never means unlimited research.
  for (const instrumentId of addedIds.filter((id) => isSubscribed || coveredAfter.includes(id))) {
    const queued = await maybeQueueOnDemandNews(session.uid, instrumentId, {
      source: "watchlist_batch",
    }).catch(() => false);
    if (queued) queuedOnDemandCount += 1;
  }

  await adminFirestore
    .collection("tm_watchlist_view_refresh_control")
    .doc(session.uid)
    .set(
      {
        last_source_version: sourceVersion,
        last_requested_at: new Date().toISOString(),
        requested_by: "batch_submit",
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    )
    .catch((error) => {
      batchLog(traceId, "warn", "refresh_queue_write_failed", {
        uid: session.uid,
        source_version: sourceVersion,
        error: String(error),
      });
    });

  batchLog(traceId, "info", "batch_update_ok", {
    uid: session.uid,
    source_version: sourceVersion,
    next_count: nextTracked.length,
    added_count: addedIds.length,
    removed_count: removedIds.length,
    on_demand_news_queued_count: queuedOnDemandCount,
  });

  if (addedIds.length > 0 || removedIds.length > 0) {
    // One event per batch: the activation funnel reads tracked_count (docs/analytics.md).
    const before = nextTracked.length - addedIds.length + removedIds.length;
    await captureServerEventSafe(session.uid, addedIds.length > 0 ? "stock_tracked" : "stock_untracked", {
      via: "batch",
      added_count: addedIds.length,
      removed_count: removedIds.length,
      tracked_count: nextTracked.length,
      first: addedIds.length > 0 && before === 0,
      ticker: addedIds.length === 1 ? addedIds[0]!.replace(/^(US|IN)_/, "").replace(/_/g, ".") : undefined,
      $insert_id: `batch:${session.uid}:${clientMutationId}`,
    });
  }

  return NextResponse.json({
    ok: true,
    source_version: sourceVersion,
    tracked_count: nextTracked.length,
    covered: coveredAfter,
    added_count: addedIds.length,
    removed_count: removedIds.length,
    on_demand_news_queued_count: queuedOnDemandCount,
    refresh_queued: true,
  });
}
