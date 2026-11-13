import { PRODUCTION_HOSTS } from "@/lib/analytics-env";
import type { DayRollup, EventChunk } from "@/lib/analytics/rollup";
import { parseMs, type AgentFact, type LifecycleFact, type RealFacts, type UserFact } from "@/lib/analytics/funnel";
import type { SaltStore } from "@/lib/analytics/visitor";

/**
 * Where the first-party analytics lives in LocalDB (all additive, all under
 * the tm_analytics prefix):
 *
 *   tm_analytics_events/{id}   one chunk per flush: { days, first_ts, last_ts, count, events[], created_at },
 *                              deleted 5 days after its day (lib/analytics/retention.ts), once the rollup is final
 *   tm_analytics_daily/{day}   one rollup per UTC day (lib/analytics/rollup.ts DayRollup)
 *   tm_analytics_salt/{day}    the day's visitor-hash salt; earlier days' are deleted
 *
 * Only the production site writes there. Anything else (next dev on a laptop,
 * which talks to the same store through the tunnel, or a preview host) writes
 * to tm_analytics_dev_*, so test traffic never lands in the owner's numbers.
 */

export const PROD_NAMESPACE = "tm_analytics";
export const DEV_NAMESPACE = "tm_analytics_dev";

export function analyticsNamespace(host: string | null | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): string {
  const name = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return nodeEnv === "production" && (PRODUCTION_HOSTS as readonly string[]).includes(name) ? PROD_NAMESPACE : DEV_NAMESPACE;
}

export type AnalyticsDb = {
  writeChunk(ns: string, id: string, chunk: EventChunk): Promise<void>;
  salts(ns: string): SaltStore;
  chunksForDay(ns: string, day: string): Promise<EventChunk[]>;
  chunksSince(ns: string, sinceMs: number): Promise<EventChunk[]>;
  /** Ids and days of raw chunks whose newest event is before `beforeMs`. */
  oldChunks(ns: string, beforeMs: number): Promise<Array<{ id: string; days: string[] }>>;
  deleteChunks(ns: string, ids: readonly string[]): Promise<void>;
  readRollups(ns: string, days: readonly string[]): Promise<Map<string, DayRollup>>;
  writeRollups(ns: string, rollups: readonly DayRollup[]): Promise<void>;
  realFacts(): Promise<RealFacts>;
};

type Store = Awaited<typeof import("@/lib/firebase-admin")>["adminFirestore"];

async function store(): Promise<Store> {
  // Loaded on first use, so importing the analytics code (the beacon route, the tests) never starts Firebase.
  return (await import("@/lib/firebase-admin")).adminFirestore;
}

function asChunk(data: Record<string, unknown> | undefined): EventChunk | null {
  if (!data || !Array.isArray(data.events)) return null;
  return data as unknown as EventChunk;
}

const firestoreDb: AnalyticsDb = {
  async writeChunk(ns, id, chunk) {
    await (await store()).collection(`${ns}_events`).doc(id).set(chunk as unknown as Record<string, unknown>);
  },

  salts(ns) {
    return {
      async read(day) {
        const snap = await (await store()).collection(`${ns}_salt`).doc(day).get();
        const salt = snap.exists ? (snap.data() as { salt?: unknown } | undefined)?.salt : null;
        return typeof salt === "string" && salt.length >= 32 ? salt : null;
      },
      async create(day, salt) {
        try {
          await (await store()).collection(`${ns}_salt`).doc(day).create({ salt, created_at: new Date().toISOString() });
          return true;
        } catch {
          // Already there (the other instance made it first), or the write failed: the caller reads it back.
          return false;
        }
      },
      async removeBefore(day) {
        const db = await store();
        const snap = await db.collection(`${ns}_salt`).select().get();
        await Promise.all(snap.docs.filter((doc) => doc.id < day).map((doc) => doc.ref.delete()));
      },
    };
  },

  async chunksForDay(ns, day) {
    const snap = await (await store()).collection(`${ns}_events`).where("days", "array-contains", day).get();
    return snap.docs.map((doc) => asChunk(doc.data())).filter((chunk): chunk is EventChunk => chunk !== null);
  },

  async chunksSince(ns, sinceMs) {
    // The day filter goes first so the store narrows by its array index instead of reading every chunk ever kept.
    const db = await store();
    const days = Array.from(new Set([new Date(sinceMs).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)]));
    const snaps = await Promise.all(
      days.map((day) => db.collection(`${ns}_events`).where("days", "array-contains", day).where("last_ts", ">=", sinceMs).get()),
    );
    const seen = new Set<string>();
    return snaps
      .flatMap((snap) => snap.docs)
      .filter((doc) => (seen.has(doc.id) ? false : (seen.add(doc.id), true)))
      .map((doc) => asChunk(doc.data()))
      .filter((chunk): chunk is EventChunk => chunk !== null);
  },

  async oldChunks(ns, beforeMs) {
    const snap = await (await store()).collection(`${ns}_events`).where("last_ts", "<", beforeMs).select("days").limit(5000).get();
    return snap.docs.map((doc) => {
      const days = (doc.data() as { days?: unknown } | undefined)?.days;
      return { id: doc.id, days: Array.isArray(days) ? days.filter((d): d is string => typeof d === "string") : [] };
    });
  },

  async deleteChunks(ns, ids) {
    const db = await store();
    for (let i = 0; i < ids.length; i += 100) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + 100)) batch.delete(db.collection(`${ns}_events`).doc(id));
      await batch.commit();
    }
  },

  async readRollups(ns, days) {
    const out = new Map<string, DayRollup>();
    if (days.length === 0) return out;
    const db = await store();
    const refs = days.map((day) => db.collection(`${ns}_daily`).doc(day));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      const data = snap.exists ? (snap.data() as DayRollup | undefined) : undefined;
      if (data && typeof data.day === "string" && Array.isArray(data.hours)) out.set(snap.id, data);
    }
    return out;
  },

  async writeRollups(ns, rollups) {
    if (rollups.length === 0) return;
    const db = await store();
    for (let i = 0; i < rollups.length; i += 100) {
      const batch = db.batch();
      for (const rollup of rollups.slice(i, i + 100)) batch.set(db.collection(`${ns}_daily`).doc(rollup.day), rollup as unknown as Record<string, unknown>);
      await batch.commit();
    }
  },

  async realFacts() {
    const db = await store();
    const [users, jobs, baskets, lifecycle] = await Promise.all([
      db.collection("users").select("created_at", "tracked_stocks").get(),
      db.collection("tm_agent_jobs").select("uid", "created_at").get(),
      db.collection("tm_agent_baskets").select("created_at", "thesis.created_at").get(),
      db.collection("tm_lifecycle_events").select("uid", "type", "created_at", "payload.source_event").get(),
    ]);
    const userFacts: UserFact[] = users.docs.map((doc) => {
      const data = (doc.data() ?? {}) as { created_at?: unknown; tracked_stocks?: unknown };
      return { uid: doc.id, createdMs: parseMs(data.created_at), tracked: Array.isArray(data.tracked_stocks) ? data.tracked_stocks.length : 0 };
    });
    const agents: AgentFact[] = [];
    for (const doc of jobs.docs) {
      const data = (doc.data() ?? {}) as { uid?: unknown; created_at?: unknown };
      const uid = typeof data.uid === "string" ? data.uid : doc.id.split("__")[0]!;
      agents.push({ uid, ms: parseMs(data.created_at), kind: "job" });
    }
    for (const doc of baskets.docs) {
      // Basket ids are "<uid>__<basket id>" (lib/basket-agent/model.ts basketDocId). A thesis is a basket with one written.
      const data = (doc.data() ?? {}) as { created_at?: unknown; thesis?: { created_at?: unknown } };
      const uid = doc.id.split("__")[0]!;
      agents.push({ uid, ms: parseMs(data.created_at), kind: "basket" });
      if (data.thesis) agents.push({ uid, ms: parseMs(data.thesis.created_at), kind: "thesis" });
    }
    const lifecycleFacts: LifecycleFact[] = lifecycle.docs.flatMap((doc) => {
      const data = (doc.data() ?? {}) as { uid?: unknown; type?: unknown; created_at?: unknown; payload?: { source_event?: unknown } };
      const ms = parseMs(data.created_at);
      if (typeof data.uid !== "string" || typeof data.type !== "string" || ms == null) return [];
      return [{ uid: data.uid, type: data.type, ms, dev: data.payload?.source_event === "dev_activate" }];
    });
    return { users: userFacts, agents, lifecycle: lifecycleFacts };
  },
};

let current: AnalyticsDb = firestoreDb;

export function analyticsDb(): AnalyticsDb {
  return current;
}

/** Tests only: swap the store for a fake; call with no argument to restore the real one. */
export function setAnalyticsDbForTests(db?: AnalyticsDb) {
  current = db ?? firestoreDb;
}
