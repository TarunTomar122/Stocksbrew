import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the document store, with merge-aware transactional writes. */
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
      return { exists: data !== undefined, id, data: () => data };
    },
  });
  return {
    adminAuth: {},
    adminFirestore: {
      collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
      async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        const writes: Array<[string, Record<string, unknown>, boolean]> = [];
        const result = await fn({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => writes.push([r.path, data, Boolean(options?.merge)]),
        });
        for (const [path, data, merge] of writes) store.docs.set(path, merge ? { ...(store.docs.get(path) ?? {}), ...data } : data);
        return result;
      },
    },
  };
});

import { consumeMeter, peekMeter } from "@/lib/entitlements-server";
import { researchStore, runningItem } from "./store";
import { EMPTY_CHARTS, initialSteps, type ResearchReport } from "./types";

function report(patch: Partial<ResearchReport> = {}): ResearchReport {
  return {
    key: "20261110T153012Z",
    uid: "u1",
    ticker: "NVDA",
    name: "NVIDIA",
    status: "ready",
    created_at: "2026-11-10T15:30:12.000Z",
    updated_at: "2026-11-10T15:32:00.000Z",
    finished_at: "2026-11-10T15:32:00.000Z",
    steps: initialSteps(),
    body: { headline: "Revenue reached $303 billion [S1].", summary: ["Line one [S1]."], business: [], drivers: [], bull: [], bear: [], valuation: [], numbers: [], ownership: [], risks: [], change: [], watch: [] },
    sources: [{ id: "S1", label: "Financials", url: "/stock/NVDA", kind: "data", as_of: null }],
    charts: { ...EMPTY_CHARTS, stats: [] },
    missing: [],
    audit: { checked: 1, traced: 1, removed: [], citations_dropped: 0 },
    usage: { via: "anthropic", model: "claude-haiku-5-5", input_tokens: 1, output_tokens: 1, cost_usd: 0, ms: 1 },
    error: null,
    share_id: null,
    ...patch,
  };
}

beforeEach(() => store.docs.clear());

describe("saving reports", () => {
  it("writes the report at {uid}__{TICKER}__{key} and lists it on the person's index", async () => {
    await researchStore.save(report({ status: "running", body: null }));
    await researchStore.save(report());
    expect([...store.docs.keys()].sort()).toEqual(["tm_research_reports/u1__NVDA__20261110T153012Z", "tm_research_reports/u1__index"]);
    const saved = store.docs.get("tm_research_reports/u1__NVDA__20261110T153012Z")!;
    expect(saved).toMatchObject({ kind: "report", uid: "u1", status: "ready", key: "20261110T153012Z" });
    const items = await researchStore.list("u1");
    expect(items).toEqual([{ key: "20261110T153012Z", ticker: "NVDA", name: "NVIDIA", status: "ready", created_at: "2026-11-10T15:30:12.000Z", headline: "Revenue reached $303 billion [S1]." }]);
  });

  it("reads a report back only for its owner", async () => {
    await researchStore.save(report());
    expect((await researchStore.get("u1", "NVDA", "20261110T153012Z"))?.name).toBe("NVIDIA");
    expect(await researchStore.get("u2", "NVDA", "20261110T153012Z")).toBeNull();
    expect(await researchStore.get("u1", "NVDA", "not-a-key")).toBeNull();
  });

  it("shares a ready report by link, keeps the same link, and turns it off without deleting", async () => {
    await researchStore.save(report());
    const first = await researchStore.setShare("u1", "NVDA", "20261110T153012Z", true);
    expect(first).toMatch(/^[a-f0-9]{24}$/);
    expect(await researchStore.setShare("u1", "NVDA", "20261110T153012Z", true)).toBe(first);
    expect((await researchStore.getShared(first!))?.ticker).toBe("NVDA");

    expect(await researchStore.setShare("u1", "NVDA", "20261110T153012Z", false)).toBeNull();
    expect(await researchStore.getShared(first!)).toBeNull();
    expect(store.docs.get(`tm_research_shares/${first}`)).toMatchObject({ revoked: true });
  });

  it("will not share a report that did not finish", async () => {
    await researchStore.save(report({ status: "failed", body: null }));
    await expect(researchStore.setShare("u1", "NVDA", "20261110T153012Z", true)).rejects.toThrow("research_not_found");
  });

  it("refuses a second run while one is still being written, even from another server", async () => {
    await researchStore.save(report({ status: "running", body: null }));
    const second = report({ key: "20261110T153100Z", ticker: "AMD", status: "running", body: null, created_at: "2026-11-10T15:31:00.000Z" });
    await expect(researchStore.save(second)).rejects.toThrow("research_running");
    // The running report itself keeps saving its progress.
    await expect(researchStore.save(report({ status: "running", body: null }))).resolves.toBeUndefined();
    // Once it is done, the next run may start.
    await researchStore.save(report());
    await expect(researchStore.save(second)).resolves.toBeUndefined();
  });

  it("knows when a run is still going, and forgets one that went quiet", () => {
    const item = { key: "20261110T153012Z", ticker: "NVDA", name: "NVIDIA", status: "running" as const, created_at: "2026-11-10T15:30:12.000Z", headline: null };
    expect(runningItem([item], Date.parse("2026-11-10T15:32:00Z"))).toEqual(item);
    expect(runningItem([item], Date.parse("2026-11-10T15:45:00Z"))).toBeNull();
  });
});

describe("the research meter", () => {
  const NOV = new Date("2026-11-10T15:00:00Z");
  const DEC = new Date("2026-12-01T00:00:01Z");

  it("gives Free three reports a month, refuses the fourth, and resets on the first", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeMeter("deep_research", "free", "u1", NOV, `k${i}`));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results[2]).toMatchObject({ used: 3, limit: 3, remaining: 0, per: "month" });
    expect(await peekMeter("deep_research", "free", "u1", NOV)).toMatchObject({ allowed: false, used: 3 });
    expect((await consumeMeter("deep_research", "free", "u1", DEC, "k5")).allowed).toBe(true);
    expect([...store.docs.keys()]).toContain("tm_agent_usage_meters/u1__deep_research__2026-11");
  });

  it("counts the same report once", async () => {
    await consumeMeter("deep_research", "pro", "u1", NOV, "20261110T153012Z");
    const again = await consumeMeter("deep_research", "pro", "u1", NOV, "20261110T153012Z");
    expect(again).toMatchObject({ allowed: true, used: 1, limit: 30 });
  });

  it("gives signed-out visitors none", async () => {
    expect((await consumeMeter("deep_research", "anon", "anon_x", NOV)).allowed).toBe(false);
  });
});
