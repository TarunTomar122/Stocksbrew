import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the document store: docs, single-field where queries and transactional writes. */
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
      collection: (collection: string) => ({
        doc: (id: string) => ref(collection, id),
        where: (field: string, _op: string, value: unknown) => ({
          async get() {
            const docs = [...store.docs.entries()]
              .filter(([path, data]) => path.startsWith(`${collection}/`) && data[field] === value)
              .map(([path, data]) => ({ id: path.split("/")[1], data: () => data }));
            return { docs };
          },
        }),
      }),
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

import { consumeMeter } from "@/lib/entitlements-server";
import { claimRun, copyForPerson, getSharedReport, loadFreshnessSignals, lookupSharedReport, putSharedReport, readRunLock, releaseRun, toShared, RESEARCH_LOCK_TTL_MS } from "./shared";
import { EMPTY_CHARTS, initialSteps, type ResearchReport } from "./types";

function report(patch: Partial<ResearchReport> = {}): ResearchReport {
  return {
    key: "20261112T181711Z",
    uid: "owner-uid",
    ticker: "MP",
    name: "MP Materials",
    status: "ready",
    created_at: "2026-11-12T18:17:11.000Z",
    updated_at: "2026-11-12T18:19:00.000Z",
    finished_at: "2026-11-12T18:19:00.000Z",
    steps: initialSteps(),
    body: { headline: "Magnets are the story [S1].", summary: ["Line one [S1]."], business: [], drivers: [], bull: [], bear: [], valuation: [], numbers: [], ownership: [], risks: [], change: [], watch: [] },
    sources: [{ id: "S1", label: "Financials", url: "/stock/MP", kind: "data", as_of: null }],
    charts: { ...EMPTY_CHARTS, stats: [] },
    missing: [],
    audit: { checked: 1, traced: 1, removed: [], citations_dropped: 0 },
    usage: { via: "anthropic", model: "claude-haiku-5-5", input_tokens: 10, output_tokens: 10, cost_usd: 0.01, ms: 1000 },
    error: null,
    share_id: "abcdefabcdefabcdef12",
    ...patch,
  };
}

beforeEach(() => store.docs.clear());

describe("the shared copy", () => {
  it("holds nothing about the person who ran it", () => {
    const shared = toShared(report(), new Date("2026-11-12T18:20:00Z"))!;
    const json = JSON.stringify(shared);
    expect(json).not.toContain("owner-uid");
    expect(json).not.toContain("abcdefabcdefabcdef12");
    expect(shared).not.toHaveProperty("usage");
    expect(shared).not.toHaveProperty("key");
    expect(shared).toMatchObject({ kind: "shared", source_key: "20261112T181711Z", written_at: "2026-11-12T18:19:00.000Z", ticker: "MP" });
  });

  it("is never made from a run that did not finish", () => {
    expect(toShared(report({ status: "running" }))).toBeNull();
    expect(toShared(report({ status: "ready", body: null }))).toBeNull();
  });

  it("becomes the next person's own report under a new key, keeping when it was written", () => {
    const shared = toShared(report())!;
    const copy = copyForPerson(shared, "reader-uid", new Date("2026-11-13T09:00:00Z"));
    expect(copy).toMatchObject({
      key: "20261113T090000Z",
      uid: "reader-uid",
      status: "ready",
      created_at: "2026-11-12T18:17:11.000Z",
      finished_at: "2026-11-12T18:19:00.000Z",
      share_id: null,
      usage: null,
      shared_from: "20261112T181711Z",
    });
    expect(copy.body).toEqual(report().body);
  });

  it("is replaced only by a newer report", async () => {
    expect(await putSharedReport(report())).toBe(true);
    expect(await putSharedReport(report({ key: "20261111T100000Z", finished_at: "2026-11-11T10:02:00.000Z" }))).toBe(false);
    expect((await getSharedReport("MP"))?.source_key).toBe("20261112T181711Z");
    expect(await putSharedReport(report({ key: "20261113T100000Z", finished_at: "2026-11-13T10:02:00.000Z" }))).toBe(true);
    expect((await getSharedReport("MP"))?.source_key).toBe("20261113T100000Z");
    expect(await getSharedReport("NVDA")).toBeNull();
  });
});

describe("the run lock", () => {
  it("lets one run claim a stock, refuses a second, and frees it when done", async () => {
    const now = new Date("2026-11-12T18:00:00Z");
    expect(await claimRun("MP", "run-a", now)).toEqual({ claimed: true });
    const second = await claimRun("MP", "run-b", new Date(now.getTime() + 1000));
    expect(second.claimed).toBe(false);
    if (!second.claimed) expect(second.lock.key).toBe("run-a");
    // Another stock is its own lock.
    expect(await claimRun("NVDA", "run-c", now)).toEqual({ claimed: true });
    // Only the holder can release it.
    await releaseRun("MP", "run-b", "failed");
    expect((await readRunLock("MP"))?.done_at).toBeNull();
    await releaseRun("MP", "run-a", "ready", new Date(now.getTime() + 60_000));
    expect(await readRunLock("MP")).toMatchObject({ key: "run-a", outcome: "ready" });
    expect(await claimRun("MP", "run-b", new Date(now.getTime() + 61_000))).toEqual({ claimed: true });
  });

  it("runs out after its time, so a crashed run never blocks a stock", async () => {
    const now = new Date("2026-11-12T18:00:00Z");
    await claimRun("MP", "run-a", now);
    expect((await claimRun("MP", "run-b", new Date(now.getTime() + RESEARCH_LOCK_TTL_MS - 1000))).claimed).toBe(false);
    expect((await claimRun("MP", "run-b", new Date(now.getTime() + RESEARCH_LOCK_TTL_MS + 1000))).claimed).toBe(true);
  });
});

describe("freshness signals", () => {
  it("reads the latest past earnings day, the newest 10-Q, 10-K or 8-K, and the latest call change", async () => {
    store.docs.set("tm_earnings_events/a", { ticker: "MP", market: "US", event_date: "2026-08-07" });
    store.docs.set("tm_earnings_events/b", { ticker: "MP", market: "US", event_date: "2026-11-05" });
    store.docs.set("tm_earnings_events/c", { ticker: "MP", market: "US", event_date: "2027-02-26" });
    store.docs.set("tm_agent_filings/a", { ticker: "MP", form_group: "8-K", filed_at: "2026-11-05T21:04:34+00:00", role: "subject" });
    store.docs.set("tm_agent_filings/b", { ticker: "MP", form_group: "10-Q", filed_at: "2026-11-05T23:13:56+00:00" });
    store.docs.set("tm_agent_filings/c", { ticker: "MP", form_group: "13D/G", filed_at: "2026-11-10T21:25:36+00:00" });
    store.docs.set("tm_call_stability/US_MP", { call: "Add", changes: [{ date: "2026-10-01", to: "Add" }, { date: "2026-09-01", to: "Hold" }] });
    expect(await loadFreshnessSignals("MP", new Date("2026-11-13T12:00:00Z"))).toEqual({
      latestEarningsDay: "2026-11-05",
      filingsAt: ["2026-11-05T21:04:34+00:00", "2026-11-05T23:13:56+00:00"],
      latestCallChangeDay: "2026-10-01",
    });
  });

  it("hands back a fresh shared report, and a stale one with its reason", async () => {
    await putSharedReport(report());
    store.docs.set("tm_earnings_events/b", { ticker: "MP", market: "US", event_date: "2026-11-05" });
    const hit = await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z"));
    expect(hit?.verdict).toEqual({ fresh: true, reason: "fresh" });
    store.docs.set("tm_agent_filings/z", { ticker: "MP", form_group: "8-K", filed_at: "2026-11-13T11:00:00Z" });
    expect((await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z")))?.verdict.reason).toBe("filing");
    expect((await lookupSharedReport("MP", new Date("2026-12-01T12:00:00Z")))?.verdict.reason).toBe("too_old");
    expect(await lookupSharedReport("NVDA")).toBeNull();
  });

  it("marks a record with a date it cannot read as unreadable, and the copy as stale", async () => {
    await putSharedReport(report());
    store.docs.set("tm_earnings_events/b", { ticker: "MP", market: "US", event_date: "2026-11-05" });
    store.docs.set("tm_agent_filings/bad", { ticker: "MP", form_group: "8-K", filed_at: "not a time" });
    expect((await loadFreshnessSignals("MP", new Date("2026-11-13T12:00:00Z"))).unreadable).toBe(true);
    expect((await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z")))?.verdict.reason).toBe("unreadable");
    store.docs.delete("tm_agent_filings/bad");
    store.docs.set("tm_earnings_events/bad", { ticker: "MP", market: "US", event_date: "TBD" });
    expect((await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z")))?.verdict.reason).toBe("unreadable");
    store.docs.delete("tm_earnings_events/bad");
    store.docs.set("tm_call_stability/US_MP", { call: "Add", changes: [{ date: "later", to: "Add" }] });
    expect((await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z")))?.verdict.reason).toBe("unreadable");
    // A record that is not about this stock's own filings, or another market, is not read at all.
    store.docs.set("tm_call_stability/US_MP", { call: "Add", changes: [] });
    store.docs.set("tm_agent_filings/other", { ticker: "MP", form_group: "13D/G", filed_at: "garbage" });
    store.docs.set("tm_earnings_events/in", { ticker: "MP", market: "IN", event_date: "TBD" });
    expect((await lookupSharedReport("MP", new Date("2026-11-13T12:00:00Z")))?.verdict).toEqual({ fresh: true, reason: "fresh" });
  });

  it("one invalid filing date makes the copy stale even beside a later valid filing", async () => {
    await putSharedReport(report());
    const now = new Date("2026-11-13T12:00:00Z");
    store.docs.set("tm_agent_filings/ok", { ticker: "MP", form_group: "10-Q", filed_at: "2026-11-05T23:13:56+00:00" });
    for (const bad of ["2026-02-30", "2026-02-30T10:00:00Z", "Nov 5 2026", "2026-11-05 10:00", 20261105]) {
      store.docs.set("tm_agent_filings/bad", { ticker: "MP", form_group: "8-K", filed_at: bad });
      expect((await loadFreshnessSignals("MP", now)).unreadable, String(bad)).toBe(true);
      expect((await lookupSharedReport("MP", now))?.verdict.reason, String(bad)).toBe("unreadable");
    }
    store.docs.delete("tm_agent_filings/bad");
    expect((await loadFreshnessSignals("MP", now))).toEqual({ latestEarningsDay: null, filingsAt: ["2026-11-05T23:13:56+00:00"], latestCallChangeDay: null });
  });
});

describe("the charge for a handed-over report", () => {
  it("is idempotent by its key, so a retry at the limit is let through without counting twice", async () => {
    const now = new Date("2026-11-13T12:00:00Z");
    for (const key of ["a", "b", "shared:MP:20261112T181711Z"]) expect((await consumeMeter("deep_research", "free", "reader", now, key)).allowed).toBe(true);
    // The save failed after the last allowance was charged: the retry with the same key gets through, uncounted.
    expect(await consumeMeter("deep_research", "free", "reader", now, "shared:MP:20261112T181711Z")).toMatchObject({ allowed: true, used: 3 });
    // Anything new is past the limit.
    expect(await consumeMeter("deep_research", "free", "reader", now, "shared:NVDA:20261112T100000Z")).toMatchObject({ allowed: false, used: 3 });
  });
});

describe("same-day filings in the store", () => {
  it("a plain-date filing on the report's New York day makes it stale beside a later UTC timestamp", async () => {
    await putSharedReport(report());
    const now = new Date("2026-11-13T12:00:00Z");
    store.docs.set("tm_agent_filings/a", { ticker: "MP", form_group: "10-Q", filed_at: "2026-11-12T17:00:00Z" });
    expect((await lookupSharedReport("MP", now))?.verdict.fresh).toBe(true);
    store.docs.set("tm_agent_filings/b", { ticker: "MP", form_group: "8-K", filed_at: "2026-11-12" });
    expect((await lookupSharedReport("MP", now))?.verdict.reason).toBe("filing");
  });
});
