import { beforeEach, describe, expect, it, vi } from "vitest";

/** An in-memory stand-in for the document store: docs by path, `getAll`, merge writes. */
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), writes: 0 }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/portfolio-data", () => ({ EXAMPLE_STOCK_TICKERS: ["MSFT", "AAPL", "NVDA"] }));
vi.mock("@/lib/agent-jobs-data", () => ({ AGENT_JOBS_COLLECTION: "tm_agent_jobs" }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (collection: string, id: string) => ({
    async get() {
      const data = store.docs.get(`${collection}/${id}`);
      // The store gives keys back in its own order, not the writer's.
      const shuffled = data ? Object.fromEntries(Object.entries(data).reverse()) : undefined;
      return { exists: data !== undefined, data: () => shuffled };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      store.writes += 1;
      const path = `${collection}/${id}`;
      store.docs.set(path, options?.merge ? { ...(store.docs.get(path) ?? {}), ...data } : data);
    },
  });
  return {
    adminAuth: {},
    adminFirestore: {
      collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
      async getAll(...refs: Array<{ get: () => Promise<unknown> }>) {
        return Promise.all(refs.map((r) => r.get()));
      },
    },
  };
});

import { EXAMPLE_AGENTS, ensureExampleAgents } from "./example-agents";

beforeEach(() => {
  store.docs.clear();
  store.writes = 0;
});

describe("ensureExampleAgents", () => {
  it("writes the three agents once, switched on, under the example account only", async () => {
    const now = new Date("2026-11-11T11:00:00Z");
    expect((await ensureExampleAgents({ dryRun: true, now })).map((line) => line.action)).toEqual(["create", "create", "create"]);
    expect(store.writes).toBe(0);

    await ensureExampleAgents({ now });
    expect([...store.docs.keys()].sort()).toEqual(EXAMPLE_AGENTS.map((agent) => `tm_agent_jobs/example-portfolio__${agent.id}`).sort());
    for (const doc of store.docs.values()) {
      expect(doc).toMatchObject({ uid: "example-portfolio", enabled: true, mode: "tell_me", scope: { kind: "tickers", tickers: ["MSFT", "AAPL", "NVDA"] } });
    }

    // Again: nothing changes, and the run history fields are kept.
    const key = `tm_agent_jobs/example-portfolio__${EXAMPLE_AGENTS[0]!.id}`;
    store.docs.set(key, { ...store.docs.get(key)!, last_checked_day: "2026-11-11" });
    const writes = store.writes;
    expect((await ensureExampleAgents({ now })).map((line) => line.action)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(store.writes).toBe(writes);

    // A changed definition (switched off by hand) is put back, keeping last_checked_day.
    store.docs.set(key, { ...store.docs.get(key)!, enabled: false });
    expect((await ensureExampleAgents({ now }))[0]?.action).toBe("update");
    expect(store.docs.get(key)).toMatchObject({ enabled: true, last_checked_day: "2026-11-11" });
  });

  it("refuses to touch a job that belongs to someone else", async () => {
    // The last one is foreign: nothing is written, not even the first two.
    store.docs.set(`tm_agent_jobs/example-portfolio__${EXAMPLE_AGENTS[2]!.id}`, { uid: "someone" });
    await expect(ensureExampleAgents()).rejects.toThrow(/another account/);
    expect(store.writes).toBe(0);
    expect(store.docs.size).toBe(1);
  });
});
