import { unstable_cache } from "next/cache";
import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
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

/** The whole snapshot, or null when the job has never run. Deduped per request. */
export const getScreenerSnapshot = cache(async (market: "US" = "US"): Promise<ScreenerSnapshot | null> => {
  const meta = await getMetaCached(market).catch(() => null);
  if (!meta || meta.shards.length === 0) return null;
  const [shards, extras] = await Promise.all([
    Promise.all(meta.shards.map((id) => getShardCached(id, meta.generated_at).catch(() => [] as ScreenerRow[]))),
    meta.extra_shard ? getShardCached(meta.extra_shard, meta.generated_at).catch(() => [] as ScreenerRow[]) : Promise.resolve([]),
  ]);
  const rows = shards.flat();
  if (rows.length === 0) return null;
  return { meta, rows, extras };
});

/** Rows for a set of symbols, covered stocks first, then benchmarks and uncovered basket lines. */
export async function getScreenerRows(symbols: readonly string[]): Promise<Map<string, ScreenerRow>> {
  const snapshot = await getScreenerSnapshot();
  const out = new Map<string, ScreenerRow>();
  if (!snapshot) return out;
  const wanted = new Set(symbols.map((symbol) => symbol.trim().toUpperCase()));
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
