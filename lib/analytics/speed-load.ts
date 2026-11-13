import { dayStart, FINAL_AFTER_MS } from "@/lib/analytics/dashboard";
import { buildSpeed, rollupSpeedDay, TREND_DAYS, type DeviceFilter, type SpeedDay, type SpeedRange, type SpeedView } from "@/lib/analytics/speed";
import { speedDb } from "@/lib/analytics/speed-db";
import { utcDay } from "@/lib/analytics/visitor";

/**
 * Loading the Speed tab: finished days are read as one stored rollup each (and kept in memory for the life of
 * the process); today and the last two days are folded from their raw chunks on each load, so late beacons still
 * count, and stored once final, exactly like the visitor rollups (lib/analytics/dashboard.ts loadRollups).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 60 * 1000;

type CacheState = { final: Map<string, SpeedDay>; answers: Map<string, { at: number; value: Promise<SpeedView> }> };

const globalKey = "__sbAnalyticsSpeed" as const;
type GlobalWithCache = typeof globalThis & { [globalKey]?: CacheState };

function cache(): CacheState {
  const g = globalThis as GlobalWithCache;
  if (!g[globalKey]) g[globalKey] = { final: new Map(), answers: new Map() };
  return g[globalKey]!;
}

/** The last `count` UTC days, oldest first, today last. */
export function lastDays(count: number, now: number): string[] {
  const today = dayStart(utcDay(now));
  return Array.from({ length: count }, (_, i) => utcDay(today - (count - 1 - i) * DAY_MS));
}

export async function loadSpeedDays(ns: string, days: readonly string[], now: number): Promise<SpeedDay[]> {
  const c = cache();
  const db = speedDb();
  const key = (day: string) => `${ns}:${day}`;
  const missing = days.filter((day) => !c.final.has(key(day)));
  const stored = missing.length > 0 ? await db.readSpeed(ns, missing) : new Map<string, SpeedDay>();
  const toFold: string[] = [];
  for (const day of missing) {
    const rollup = stored.get(day);
    if (rollup?.complete) c.final.set(key(day), rollup);
    else toFold.push(day);
  }
  const folded: SpeedDay[] = [];
  // A few at a time: on a first load after a long gap this is up to 14 small queries.
  for (let i = 0; i < toFold.length; i += 4) {
    folded.push(
      ...(await Promise.all(
        toFold.slice(i, i + 4).map(async (day) => {
          const final = now >= dayStart(day) + DAY_MS + FINAL_AFTER_MS;
          const chunks = await db.vitalsForDay(ns, day);
          return rollupSpeedDay(day, chunks.flatMap((chunk) => chunk.rows), { complete: final, now });
        }),
      )),
    );
  }
  const finished = folded.filter((day) => day.complete);
  for (const day of finished) c.final.set(key(day.day), day);
  if (finished.length > 0) await db.writeSpeed(ns, finished).catch((error) => console.warn("[analytics] speed rollup write failed:", (error as Error)?.message));
  const fresh = new Map(folded.map((day) => [day.day, day]));
  return days.map((day) => c.final.get(key(day)) ?? fresh.get(day)!);
}

export function loadSpeed(ns: string, range: SpeedRange, device: DeviceFilter, now = Date.now()): Promise<SpeedView> {
  const c = cache();
  const cacheKey = `${ns}:${range}:${device}`;
  const hit = c.answers.get(cacheKey);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = (async () => buildSpeed({ days: await loadSpeedDays(ns, lastDays(TREND_DAYS, now), now), range, device, now }))();
  c.answers.set(cacheKey, { at: now, value });
  value.catch(() => {
    if (c.answers.get(cacheKey)?.value === value) c.answers.delete(cacheKey);
  });
  return value;
}

/** Tests only. */
export function resetSpeedCacheForTests() {
  const g = globalThis as GlobalWithCache;
  delete g[globalKey];
}
