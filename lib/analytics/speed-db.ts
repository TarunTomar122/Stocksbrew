import type { SpeedDay, VitalsChunk } from "@/lib/analytics/speed";

/**
 * Where real-user page speed lives in LocalDB, next to the rest of the analytics (additive, same namespaces as
 * lib/analytics/db.ts, so local development writes to tm_analytics_dev_*):
 *
 *   tm_analytics_vitals/{id}   one chunk of raw page-load rows per flush (lib/analytics/ingest.ts),
 *                              deleted RAW_KEEP_DAYS after their day once that day's speed rollup is final
 *   tm_analytics_speed/{day}   one rollup per UTC day: histograms per route, device and metric (lib/analytics/speed.ts)
 */

export type SpeedDb = {
  writeVitals(ns: string, id: string, chunk: VitalsChunk): Promise<void>;
  vitalsForDay(ns: string, day: string): Promise<VitalsChunk[]>;
  /** Ids and days of raw chunks whose newest row is before `beforeMs`. */
  oldVitals(ns: string, beforeMs: number): Promise<Array<{ id: string; days: string[] }>>;
  deleteVitals(ns: string, ids: readonly string[]): Promise<void>;
  readSpeed(ns: string, days: readonly string[]): Promise<Map<string, SpeedDay>>;
  writeSpeed(ns: string, days: readonly SpeedDay[]): Promise<void>;
};

type Store = Awaited<typeof import("@/lib/firebase-admin")>["adminFirestore"];

async function store(): Promise<Store> {
  // Loaded on first use, like lib/analytics/db.ts: importing this never starts Firebase.
  return (await import("@/lib/firebase-admin")).adminFirestore;
}

function asChunk(data: Record<string, unknown> | undefined): VitalsChunk | null {
  if (!data || !Array.isArray(data.rows)) return null;
  return data as unknown as VitalsChunk;
}

const firestoreSpeedDb: SpeedDb = {
  async writeVitals(ns, id, chunk) {
    await (await store()).collection(`${ns}_vitals`).doc(id).set(chunk as unknown as Record<string, unknown>);
  },

  async vitalsForDay(ns, day) {
    const snap = await (await store()).collection(`${ns}_vitals`).where("days", "array-contains", day).get();
    return snap.docs.map((doc) => asChunk(doc.data())).filter((chunk): chunk is VitalsChunk => chunk !== null);
  },

  async oldVitals(ns, beforeMs) {
    const snap = await (await store()).collection(`${ns}_vitals`).where("last_ts", "<", beforeMs).select("days").limit(5000).get();
    return snap.docs.map((doc) => {
      const days = (doc.data() as { days?: unknown } | undefined)?.days;
      return { id: doc.id, days: Array.isArray(days) ? days.filter((d): d is string => typeof d === "string") : [] };
    });
  },

  async deleteVitals(ns, ids) {
    const db = await store();
    for (let i = 0; i < ids.length; i += 100) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + 100)) batch.delete(db.collection(`${ns}_vitals`).doc(id));
      await batch.commit();
    }
  },

  async readSpeed(ns, days) {
    const out = new Map<string, SpeedDay>();
    if (days.length === 0) return out;
    const db = await store();
    const snaps = await db.getAll(...days.map((day) => db.collection(`${ns}_speed`).doc(day)));
    for (const snap of snaps) {
      const data = snap.exists ? (snap.data() as SpeedDay | undefined) : undefined;
      if (data && typeof data.day === "string" && data.routes && typeof data.routes === "object") out.set(snap.id, data);
    }
    return out;
  },

  async writeSpeed(ns, days) {
    if (days.length === 0) return;
    const db = await store();
    for (let i = 0; i < days.length; i += 100) {
      const batch = db.batch();
      for (const day of days.slice(i, i + 100)) batch.set(db.collection(`${ns}_speed`).doc(day.day), day as unknown as Record<string, unknown>);
      await batch.commit();
    }
  },
};

let current: SpeedDb = firestoreSpeedDb;

export function speedDb(): SpeedDb {
  return current;
}

/** Tests only: swap the store for a fake; call with no argument to restore the real one. */
export function setSpeedDbForTests(db?: SpeedDb) {
  current = db ?? firestoreSpeedDb;
}
