import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** An in-memory stand-in for the document store: docs by path, `where` on one field, `getAll`. */
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/seo/stock-pages", () => ({ isFeaturedStockTicker: () => false }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (collection: string, id: string) => ({
    path: `${collection}/${id}`,
    async get() {
      const data = store.docs.get(`${collection}/${id}`);
      return { exists: data !== undefined, data: () => data };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const path = `${collection}/${id}`;
      store.docs.set(path, options?.merge ? { ...(store.docs.get(path) ?? {}), ...data } : data);
    },
  });
  return {
    adminAuth: {},
    adminFirestore: {
      collection: (collection: string) => ({
        doc: (id: string) => ref(collection, id),
        where: (field: string, _op: string, value: unknown) => ({
          async get() {
            const docs = [...store.docs.entries()]
              .filter(([path, data]) => path.startsWith(`${collection}/`) && data[field] === value)
              .map(([, data]) => ({ data: () => data }));
            return { docs, size: docs.length };
          },
        }),
      }),
      async getAll(...refs: Array<{ get: () => Promise<unknown> }>) {
        return Promise.all(refs.map((r) => r.get()));
      },
    },
  };
});

const ROWS = [
  { instrument_id: "US_NVDA", ticker: "NVDA", directive_v2: { zones: { accumulate_below: 150, trim_above: 220 } } },
  { instrument_id: "US_TSLA", ticker: "TSLA", directive_v2: { zones: { accumulate_below: 180, trim_above: 300 } } },
];

function seedUser(doc: Record<string, unknown>) {
  store.docs.set("users/u1", doc);
  store.docs.set("tm_watchlist_views/u1", { rows: ROWS });
}

beforeEach(() => store.docs.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveScope only loads levels for covered stocks", () => {
  it("Free: levels on the covered stock, none on the other", async () => {
    seedUser({ tracked_stocks: ["US_NVDA", "US_TSLA"], covered_stocks: ["US_NVDA"] });
    const { resolveScope } = await import("./agent-jobs-data");
    const scope = await resolveScope("u1", { kind: "watchlist" });
    expect(scope.tickers).toEqual(["NVDA", "TSLA"]);
    expect(scope.levels.NVDA).toEqual({ add_below: 150, trim_above: 220 });
    expect(scope.levels.TSLA).toEqual({ add_below: null, trim_above: null, locked: true });
  });

  it("Pro: levels on every stock", async () => {
    seedUser({ tracked_stocks: ["US_NVDA", "US_TSLA"], covered_stocks: ["US_NVDA"], isSubscribed: true, subscriptionStatus: "active" });
    const { resolveScope } = await import("./agent-jobs-data");
    const scope = await resolveScope("u1", { kind: "watchlist" });
    expect(scope.levels.TSLA).toEqual({ add_below: 180, trim_above: 300 });
  });
});

describe("createJob and the plan", () => {
  const news = { template: "news", name: "NVDA news", trigger: { type: "event" as const, event: "news" as const }, scope: { kind: "tickers" as const, tickers: ["NVDA"] } };
  const price = {
    template: "price-level",
    name: "NVDA below $150",
    trigger: { type: "price" as const, rule: "crosses_below" as const, level: 150 },
    scope: { kind: "tickers" as const, tickers: ["NVDA"] },
  };

  it("today's line: a news agent runs on Free", async () => {
    vi.stubEnv("PAYWALL_V2", "");
    vi.resetModules();
    const { createJob } = await import("./agent-jobs-data");
    const job = await createJob("u1", news as never, new Date("2026-11-11T12:00:00Z"), 2, "free");
    expect(job.enabled).toBe(true);
  });

  it("tighter line: a news agent is saved paused on Free, never dropped, and cannot be switched on", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    const { createJob, updateJob, listJobs } = await import("./agent-jobs-data");
    const job = await createJob("u1", news as never, new Date("2026-11-11T12:00:00Z"), 1, "free");
    expect(job.enabled).toBe(false);
    expect((await listJobs("u1")).map((saved) => saved.id)).toEqual([job.id]);
    await expect(updateJob("u1", job.id, { enabled: true }, new Date(), 1, "free")).rejects.toThrow(/part of Pro/);
    const onPro = await updateJob("u1", job.id, { enabled: true }, new Date(), 20, "pro");
    expect(onPro?.enabled).toBe(true);
  });

  it("tighter line: Free runs one agent; the second is saved paused", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    const { createJob } = await import("./agent-jobs-data");
    const { limitFor } = await import("./entitlements");
    const limit = limitFor("agents", "free");
    expect(limit).toBe(1);
    const first = await createJob("u1", price as never, new Date("2026-11-11T12:00:00Z"), limit, "free");
    const second = await createJob("u1", { ...price, name: "NVDA below $140", trigger: { ...price.trigger, level: 140 } } as never, new Date("2026-11-11T12:01:00Z"), limit, "free");
    expect([first.enabled, second.enabled]).toEqual([true, false]);
  });
});
