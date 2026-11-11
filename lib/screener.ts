import { unstable_cache } from "next/cache";
import { cache } from "react";

import { dayDiff, todayET } from "@/lib/calendar-shared";
import { adminFirestore } from "@/lib/firebase-admin";
import { resolveSector } from "@/lib/gics-sector";
import type { ScreenerMeta, ScreenerRow } from "@/lib/screener-shared";

/**
 * The screening dataset: one flat row per covered US stock, precomputed by
 * `backend/agentdata/screener.py` into `tm_screener_snapshot`. The screener,
 * the idea baskets and the compare desk all read it from here, so none of
 * them scans a collection at request time.
 *
 * The snapshot is split into shards of 150 rows so each cache entry stays
 * well under the data-cache size limit. Shards are cached under the
 * snapshot's `generated_at`, so a new run of the job replaces them as soon as
 * the (short-lived) meta entry notices it.
 */

const COLLECTION = "tm_screener_snapshot";

export type ScreenerSnapshot = {
  meta: ScreenerMeta;
  /** Covered stocks, sorted by symbol. */
  rows: ScreenerRow[];
  /** Benchmarks (SPY, QQQ, IWM) and basket lines outside coverage: price and returns only. */
  extras: ScreenerRow[];
};

async function readMeta(market: string): Promise<ScreenerMeta | null> {
  const doc = await adminFirestore.collection(COLLECTION).doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as Partial<ScreenerMeta>;
  if (typeof data.generated_at !== "string" || !Array.isArray(data.shards)) return null;
  return {
    market,
    universe_id: data.universe_id,
    generated_at: data.generated_at,
    as_of_day: data.as_of_day,
    price_history_to: data.price_history_to ?? null,
    row_count: typeof data.row_count === "number" ? data.row_count : 0,
    shards: data.shards.filter((id): id is string => typeof id === "string"),
    extra_shard: typeof data.extra_shard === "string" ? data.extra_shard : undefined,
    coverage: data.coverage,
    sources: data.sources,
  };
}

async function readShard(shardId: string, _generatedAt: string): Promise<ScreenerRow[]> {
  const doc = await adminFirestore.collection(COLLECTION).doc(shardId).get();
  if (!doc.exists) return [];
  const rows = (doc.data() as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ScreenerRow => Boolean(row) && typeof (row as ScreenerRow).symbol === "string");
}

const getMetaCached = unstable_cache(readMeta, ["screener-meta-v1"], { revalidate: 300 });
// Keyed by shard id and generated_at, so an entry never goes stale: a new snapshot is a new key.
const getShardCached = unstable_cache(readShard, ["screener-shard-v1"], { revalidate: 24 * 3600 });

/**
 * The stored sector is wrong for some stocks (Amgen filed as Technology); the
 * industry label is right, so the sector is derived from it (lib/gics-sector.ts).
 * Done after the cache read so snapshots cached before the fix are corrected too.
 */
export function withResolvedSector(row: ScreenerRow): ScreenerRow {
  const sector = resolveSector(row) ?? undefined;
  if (sector === row.sector) return row;
  const next = { ...row, sector };
  if (sector === undefined) delete next.sector;
  return next;
}

/**
 * `earnings_in_days` is counted when the job runs (03:30 UTC, still the evening before in New York), so it reads a
 * day short for the rest of the day. Recount it from the date against New York's today, the boundary the rest of
 * the site uses, and drop it once the report has passed.
 */
export function withFreshEarningsGap(row: ScreenerRow, today: string): ScreenerRow {
  if (!row.earnings_date) return row;
  const gap = dayDiff(today, row.earnings_date);
  if (gap === row.earnings_in_days) return row;
  const next = { ...row };
  if (gap === null || gap < 0) delete next.earnings_in_days;
  else next.earnings_in_days = gap;
  return next;
}

// React's request cache only exists in the server-components build. Outside it
// (route handlers under test, scripts) the snapshot is simply read each time.
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/** The whole snapshot, or null when the job has never run. Deduped per request. */
export const getScreenerSnapshot = perRequest(async (market: "US" = "US"): Promise<ScreenerSnapshot | null> => {
  const meta = await getMetaCached(market).catch(() => null);
  if (!meta || meta.shards.length === 0) return null;
  const [shards, extras] = await Promise.all([
    Promise.all(meta.shards.map((id) => getShardCached(id, meta.generated_at).catch(() => [] as ScreenerRow[]))),
    meta.extra_shard ? getShardCached(meta.extra_shard, meta.generated_at).catch(() => [] as ScreenerRow[]) : Promise.resolve([]),
  ]);
  const today = todayET();
  const rows = shards.flat().map((row) => withFreshEarningsGap(withResolvedSector(row), today));
  if (rows.length === 0) return null;
  // Benchmarks and basket lines carry an earnings gap too; recount it the same way.
  return { meta, rows, extras: extras.map((row) => withFreshEarningsGap(row, today)) };
});

/**
 * Whether every shard came back. A shard that failed to load reads as no rows
 * (see getScreenerSnapshot), and anything cached from a partial snapshot would
 * wrongly say "not covered" until it expires.
 */
export function isCompleteSnapshot(snapshot: ScreenerSnapshot | null): snapshot is ScreenerSnapshot {
  // Covered rows only: the extras shard may legitimately be empty, and the meta does not say how many it holds.
  return Boolean(snapshot) && snapshot!.rows.length >= snapshot!.meta.row_count;
}

/**
 * What one stock's pages need from the snapshot, under its own small cache
 * key, so a stock page reads a few kilobytes instead of all ~1.7 MB of shards.
 * Rows are as getScreenerSnapshot returns them (sector resolved).
 */
export type ScreenerSymbolContext = {
  /** The covered stock's row (from `rows`). */
  row: ScreenerRow | null;
  /** The benchmark or basket line (from `extras`), for symbols outside coverage such as SPY. */
  extra: ScreenerRow | null;
  /** How many covered stocks share this stock's industry. */
  industrySize: number;
  priceHistoryTo: string | null;
  generatedAt: string;
};

async function readSymbolContext(symbol: string): Promise<ScreenerSymbolContext> {
  const snapshot = await getScreenerSnapshot();
  // Throwing keeps a missing or partial snapshot out of the cache.
  if (!isCompleteSnapshot(snapshot)) throw new Error("screener_snapshot_unavailable");
  const row = snapshot.rows.find((item) => item.symbol === symbol) ?? null;
  const extra = snapshot.extras.find((item) => item.symbol === symbol) ?? null;
  return {
    row,
    extra,
    industrySize: row?.industry ? snapshot.rows.filter((item) => item.industry === row.industry).length : 0,
    priceHistoryTo: snapshot.meta.price_history_to ?? null,
    generatedAt: snapshot.meta.generated_at,
  };
}

// Same freshness as the meta entry: a new snapshot shows up here within five minutes.
const getSymbolContextCached = unstable_cache(readSymbolContext, ["screener-symbol-v1"], { revalidate: 300 });

/** One stock's slice of the snapshot (see ScreenerSymbolContext). Null when the snapshot is unavailable. Deduped per request. */
export const getScreenerSymbolContext = perRequest(async (symbol: string): Promise<ScreenerSymbolContext | null> => {
  const upper = symbol.trim().toUpperCase();
  if (!upper) return null;
  const context = await getSymbolContextCached(upper).catch(() => null);
  if (!context) return null;
  // The earnings gap counts from New York's today, which can be later than when the entry was cached.
  const today = todayET();
  return {
    ...context,
    row: context.row ? withFreshEarningsGap(context.row, today) : null,
    extra: context.extra ? withFreshEarningsGap(context.extra, today) : null,
  };
});

/** Up to this many symbols are looked up one by one; more read the whole snapshot once. */
const ROW_LOOKUP_LIMIT = 4;

/** Rows for a set of symbols, covered stocks first, then benchmarks and uncovered basket lines. */
export async function getScreenerRows(symbols: readonly string[]): Promise<Map<string, ScreenerRow>> {
  const out = new Map<string, ScreenerRow>();
  const wanted = new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return out;
  if (wanted.size <= ROW_LOOKUP_LIMIT) {
    const contexts = await Promise.all([...wanted].map((symbol) => getScreenerSymbolContext(symbol)));
    if (contexts.every(Boolean)) {
      for (const context of contexts) {
        const row = context!.row ?? context!.extra;
        if (row) out.set(row.symbol, row);
      }
      return out;
    }
  }
  const snapshot = await getScreenerSnapshot();
  if (!snapshot) return out;
  for (const row of [...snapshot.extras, ...snapshot.rows]) {
    if (wanted.has(row.symbol)) out.set(row.symbol, row);
  }
  return out;
}

/** Symbol and name for every covered stock, for the search boxes. */
export async function getScreenerDirectory(): Promise<Array<{ symbol: string; name: string }>> {
  const snapshot = await getScreenerSnapshot();
  return (snapshot?.rows ?? []).map((row) => ({ symbol: row.symbol, name: row.name ?? row.symbol }));
}

/**
 * The same snapshot for a caller that must tell "this stock is not in the
 * screener" from "the store did not answer" (full research, lib/research).
 * Every failed read throws instead of turning into an empty list, so it is
 * never mistaken for a fact. Benchmarks and basket lines (`extras`) are left
 * out; that caller does not use them.
 */
export async function getScreenerSnapshotStrict(market: "US" = "US"): Promise<ScreenerSnapshot | null> {
  const meta = await getMetaCached(market);
  if (!meta || meta.shards.length === 0) return null;
  const shards = await Promise.all(meta.shards.map((id) => getShardCached(id, meta.generated_at)));
  const today = todayET();
  const rows = shards.flat().map((row) => withFreshEarningsGap(withResolvedSector(row), today));
  if (rows.length === 0) return null;
  return { meta, rows, extras: [] };
}
