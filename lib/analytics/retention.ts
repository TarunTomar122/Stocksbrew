import { analyticsDb } from "@/lib/analytics/db";
import { loadRollups } from "@/lib/analytics/dashboard";
import { utcDay } from "@/lib/analytics/visitor";

/**
 * Raw events are kept only as long as the daily rollup needs them: a chunk is
 * deleted once every day it touches is at least RAW_KEEP_DAYS old and that
 * day's rollup is stored as final. The rollups (counts only) stay.
 */

export const RAW_KEEP_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneRawChunks(ns: string, now = Date.now()): Promise<{ deleted: number }> {
  const db = analyticsDb();
  const cutoff = Date.parse(`${utcDay(now)}T00:00:00.000Z`) - RAW_KEEP_DAYS * DAY_MS;
  const old = await db.oldChunks(ns, cutoff);
  if (old.length === 0) return { deleted: 0 };
  const days = Array.from(new Set(old.flatMap((chunk) => chunk.days))).sort();
  // Fold (and store) any day whose final rollup is missing before its raw events go.
  const rollups = await loadRollups(ns, days, now);
  const final = new Set(rollups.filter((rollup) => rollup.complete).map((rollup) => rollup.day));
  const stored = await db.readRollups(ns, days);
  const safe = old.filter((chunk) => chunk.days.length > 0 && chunk.days.every((day) => final.has(day) && stored.get(day)?.complete));
  if (safe.length > 0) await db.deleteChunks(ns, safe.map((chunk) => chunk.id));
  return { deleted: safe.length };
}
