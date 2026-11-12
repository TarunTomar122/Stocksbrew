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
        // Whole-collection reads (congress, funds, insiders) come back empty here.
        limit: () => ({ get: async () => ({ docs: [], size: 0 }) }),
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

// Filings and headlines for the filing and news agents: none, but read fine.
vi.mock("@/lib/agent-events-data", () => ({ loadFilingFacts: async () => [], loadNewsFacts: async () => null }));
vi.mock("@/lib/earnings-day", () => ({ listEarningsDayReports: async () => [] }));

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

describe("the runner and the example account", () => {
  const job = (uid: string, id: string, trigger: Record<string, unknown>, created: string) => ({
    id,
    uid,
    template: "x",
    name: id,
    trigger,
    scope: { kind: "tickers", tickers: ["NVDA"] },
    mode: "tell_me",
    enabled: true,
    created_at: created,
    updated_at: created,
  });
  const FILING = { type: "event", event: "sec_filing", filings: { major: true } };
  const EARNINGS = { type: "event", event: "earnings_approaching", days_before: 3 };
  const MOVE = { type: "price", rule: "moves_pct", pct: 5 };

  function seedJobs() {
    for (const [uid, id, trigger, created] of [
      ["example-portfolio", "exampleearnings", EARNINGS, "2026-11-11T10:00:00.000Z"],
      ["example-portfolio", "examplebigmove", MOVE, "2026-11-11T10:00:00.001Z"],
      ["example-portfolio", "examplefilings", FILING, "2026-11-11T10:00:00.002Z"],
      ["u1", "userfiling1", FILING, "2026-11-01T10:00:00.000Z"],
    ] as const) {
      store.docs.set(`tm_agent_jobs/${uid}__${id}`, job(uid, id, trigger, created));
    }
    // A Free account on the tighter line: one agent, and no filing agents.
    store.docs.set("users/u1", { tracked_stocks: ["US_NVDA"] });
  }

  it("runs all three example agents on the tighter Free line, where a Free account's filing agent waits", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    seedJobs();
    const { runAllEnabledJobs } = await import("./agent-jobs-data");
    const summary = await runAllEnabledJobs(new Date("2026-11-11T23:00:00Z"), () => {}, { dryRun: true });
    expect(summary.jobs).toBe(4);
    // u1's filing agent is past its plan; the example account's three all run.
    expect(summary.over_plan).toBe(1);
    expect(summary.recorded + summary.not_due).toBe(3);
    // Dry: nothing written.
    expect([...store.docs.keys()].filter((key) => key.startsWith("tm_agent_runs/"))).toEqual([]);
  });

  it("onlyUid leaves everyone else's agents alone, and a real run writes only that account's runs", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    seedJobs();
    const { runAllEnabledJobs } = await import("./agent-jobs-data");
    const summary = await runAllEnabledJobs(new Date("2026-11-11T23:00:00Z"), () => {}, { onlyUid: "example-portfolio" });
    expect(summary.jobs).toBe(3);
    expect(summary.over_plan).toBe(0);
    const runs = [...store.docs.keys()].filter((key) => key.startsWith("tm_agent_runs/"));
    expect(runs.length).toBe(summary.recorded);
    expect(runs.every((key) => key.startsWith("tm_agent_runs/example-portfolio__"))).toBe(true);
  });
});

describe("agents that watch our call", () => {
  const STATE = (call: string, trim: number, changes: unknown[] = []) => ({ call, levels: { accumulate_below: 100, trim_above: trim }, changes });

  it("reads our call for each name, levels from the call's state for a stock not on the list, and keeps the reason off uncovered stocks", async () => {
    seedUser({ tracked_stocks: ["US_NVDA", "US_TSLA"], covered_stocks: ["US_NVDA"] });
    store.docs.set("tm_call_stability/US_NVDA", STATE("Trim", 230, [{ date: "2026-11-11", from: "Hold", to: "Trim", reason: "Ran past fair value." }]));
    store.docs.set("tm_call_stability/US_TSLA", STATE("Hold", 320, [{ date: "2026-11-11", from: "Add", to: "Hold", reason: "Secret reason." }]));
    store.docs.set("tm_call_stability/US_ORCL", STATE("Trim", 250));
    const { resolveScope } = await import("./agent-jobs-data");
    const mine = await resolveScope("u1", { kind: "watchlist" }, { calls: true });
    expect(mine.calls?.NVDA).toEqual({ call: "Trim", changes: [{ date: "2026-11-11", from: "Hold", to: "Trim", reason: "Ran past fair value." }] });
    expect(mine.calls?.TSLA).toEqual({ call: "Hold", changes: [{ date: "2026-11-11", from: "Add", to: "Hold", reason: null }], locked: true });
    // The list's own levels win; nothing new is added for a listed stock.
    expect(mine.levels.NVDA).toEqual({ add_below: 150, trim_above: 220 });

    const named = await resolveScope("u1", { kind: "tickers", tickers: ["ORCL"] }, { calls: true });
    // Free and ORCL is not covered: the call is free, its levels are not.
    expect(named.calls?.ORCL).toMatchObject({ call: "Trim", locked: true });
    expect(named.levels.ORCL).toEqual({ add_below: null, trim_above: null, locked: true });

    seedUser({ tracked_stocks: ["US_NVDA"], isSubscribed: true, subscriptionStatus: "active" });
    const pro = await resolveScope("u1", { kind: "tickers", tickers: ["ORCL", "AMD"] }, { calls: true });
    expect(pro.levels.ORCL).toEqual({ add_below: 100, trim_above: 250 });
    expect(pro.calls?.AMD).toEqual({ call: null, changes: [] });
    // Without the option nothing extra is read.
    expect((await resolveScope("u1", { kind: "tickers", tickers: ["ORCL"] })).calls).toBeUndefined();
  });

  it("a run remembers the calls it saw on the job, and a dry run writes nothing", async () => {
    seedUser({ tracked_stocks: ["US_NVDA"], isSubscribed: true, subscriptionStatus: "active" });
    store.docs.set("tm_call_stability/US_NVDA", STATE("Trim", 230));
    const { createJob, runJob, getJob } = await import("./agent-jobs-data");
    const draft = { template: "sell-zone", name: "When to sell some", trigger: { type: "price" as const, rule: "enters_sell_zone" as const }, scope: { kind: "tickers" as const, tickers: ["NVDA"] } };
    const job = await createJob("u1", draft, new Date("2026-11-11T12:00:00Z"), 20, "pro");
    const now = new Date("2026-11-12T22:00:00Z");
    await runJob(job, now, { dryRun: true });
    expect((await getJob("u1", job.id))?.calls_seen).toBeUndefined();
    const outcome = await runJob(job, now);
    expect(outcome.status).toBe("recorded");
    expect((await getJob("u1", job.id))?.calls_seen).toEqual({ NVDA: "Trim" });
    // The run record itself does not carry the memory.
    if (outcome.status === "recorded") expect("calls_seen" in outcome.run).toBe(false);
  });
});
