import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";
import { triggerDispatchLane } from "@/lib/cloud-run-dispatch";

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
  const normalized = normalizeItems(body?.items);
  const items = normalized.items;
  if (normalized.hasInvalidHolding) {
    return NextResponse.json({ error: "invalid_holding_values" }, { status: 400 });
  }
  if (items.length === 0) {
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
  if (!isSubscribed && items.length > FREE_RADAR_TRACK_LIMIT) {
    return NextResponse.json(
      { error: "free_tier_limit_reached", limit: FREE_RADAR_TRACK_LIMIT, reason: "Free Radar supports up to 3 stocks." },
      { status: 409 },
    );
  }

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

  await adminFirestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const dedupeSnap = await tx.get(eventRef);
    if (dedupeSnap.exists) {
      sourceVersion = Number(dedupeSnap.data()?.version ?? userData?.watchlist_version ?? 0);
      return;
    }

    const currentTracked = Array.isArray(userData?.tracked_stocks) ? (userData?.tracked_stocks as string[]) : [];
    const currentSet = new Set(currentTracked);
    const nextSet = new Set(nextTracked);
    addedIds = nextTracked.filter((id) => !currentSet.has(id));
    removedIds = currentTracked.filter((id) => !nextSet.has(id));

    sourceVersion = Number(userData?.watchlist_version ?? 0) + 1;
    tx.set(
      userRef,
      {
        tracked_stocks: nextTracked,
        watchlist_positions: nextPositions,
        watchlist_holdings: nextHoldings,
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

  let queuedOnDemandCount = 0;
  for (const instrumentId of addedIds) {
    const queued = await maybeQueueOnDemandNews(session.uid, instrumentId).catch(() => false);
    if (queued) queuedOnDemandCount += 1;
  }
  if (queuedOnDemandCount > 0) {
    await triggerDispatchLane({
      lane: "on_demand_news",
      market: "US",
      limit: Math.min(Math.max(queuedOnDemandCount, 3), 12),
      extraArgs: ["--per-stock-cap", "6"],
    }).catch((error) => {
      batchLog(traceId, "warn", "on_demand_news_dispatch_failed", {
        uid: session.uid,
        queued_count: queuedOnDemandCount,
        error: String(error),
      });
    });
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

  return NextResponse.json({
    ok: true,
    source_version: sourceVersion,
    tracked_count: nextTracked.length,
    added_count: addedIds.length,
    removed_count: removedIds.length,
    on_demand_news_queued_count: queuedOnDemandCount,
    refresh_queued: true,
  });
}
