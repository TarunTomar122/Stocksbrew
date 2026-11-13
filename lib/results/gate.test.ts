import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The switch: with RESULTS_NIGHT unset every loader answers empty without touching the store; with RESULTS_NIGHT=1
 * the same calls read the reports and build the reads. The store here is a stand-in with one real-shaped row.
 */

const store = vi.hoisted(() => ({ queries: 0 }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/local-firestore", () => ({ localFirestoreFromEnv: () => null }));
vi.mock("@/lib/premarket", () => ({ getPremarketMovers: async () => null }));
vi.mock("@/lib/earnings-season-data", () => ({
  loadTickerEarnings: async (tickers: string[]) =>
    new Map(tickers.map((ticker) => [ticker, { history: { past: [{ date: "2026-08-05", session: "bmo", from: "calendar", epsEstimate: null, epsActual: null, result: null, surprisePct: null, move: 2, basis: "1d" }], typicalDayPct: 1.5 } }])),
}));
vi.mock("@/lib/firebase-admin", () => {
  const row = { ticker: "CEG", company: "Constellation Energy Corporation", event_date: "2026-11-11", market: "US", time: "amc", reported_eps: 5.06, estimated_eps: 3.9, eps_estimate: 3.9, actuals_source: "alphavantage", actuals_captured_at: "2026-11-11T23:00:41Z" };
  const missing = { exists: false, id: "", data: () => undefined };
  return {
    adminAuth: {},
    adminFirestore: {
      collection: () => {
        // Chainable: the recent-events read bounds event_date on both sides.
        const query = {
          where: () => query,
          get: async () => {
            store.queries += 1;
            return { docs: [{ data: () => row }] };
          },
        };
        return query;
      },
      doc: (path: string) => path,
      getAll: async (...paths: string[]) =>
        paths.map((path) => (path.startsWith("tm_call_stability/") ? { exists: true, id: "US_CEG", data: () => ({ call: "Add", session: "2026-11-11", changes: [] }) } : missing)),
    },
  };
});

const server = await import("./server");

afterEach(() => {
  vi.unstubAllEnvs();
  store.queries = 0;
});

describe("the RESULTS_NIGHT switch", () => {
  it("keeps everything dark when unset", async () => {
    vi.stubEnv("RESULTS_NIGHT", "");
    expect(server.resultsNightOn()).toBe(false);
    expect(await server.recentEvents("2026-11-12")).toEqual([]);
    expect(await server.readResult("CEG", "2026-11-11", "2026-11-12")).toBeNull();
    expect(await server.latestResultFor("CEG", "2026-11-12")).toBeNull();
    expect(await server.resultsFor(["CEG"], { today: "2026-11-12" })).toEqual([]);
    expect(await server.resultsForChecked(["CEG"], { today: "2026-11-12" })).toEqual({ reads: [], failed: [] });
    expect(await server.resultSummaries(["CEG"], { today: "2026-11-12" })).toEqual({});
    expect(await server.overnightResultFacts(["CEG"], "2026-11-12")).toEqual({});
    expect(await server.listRecentResults({ today: "2026-11-12" })).toEqual([]);
    expect(store.queries).toBe(0);
  });

  it("only the exact value 1 turns it on", () => {
    vi.stubEnv("RESULTS_NIGHT", "true");
    expect(server.resultsNightOn()).toBe(false);
    vi.stubEnv("RESULTS_NIGHT", "1");
    expect(server.resultsNightOn()).toBe(true);
  });

  it("reads and builds everything when set to 1", async () => {
    vi.stubEnv("RESULTS_NIGHT", "1");
    const latest = await server.latestResultFor("CEG", "2026-11-12");
    expect(latest).toMatchObject({ ticker: "CEG", reportDate: "2026-11-11", eps: { verdict: "beat" }, call: { status: "pending", call: "Buy more" } });
    expect(Object.keys(await server.resultSummaries(["CEG"], { today: "2026-11-12" }))).toEqual(["CEG"]);
    expect((await server.overnightResultFacts(["CEG"], "2026-11-12")).CEG).toBe("Beat by 30%");
    expect((await server.listRecentResults({ today: "2026-11-12" })).map((event) => event.ticker)).toEqual(["CEG"]);
    expect(store.queries).toBeGreaterThan(0);
    // The calendar row says after the close on Nov 11, and the call has not run since: it is stated, not "still".
    expect(latest!.sources.some((source) => source.label === "Call reviewed")).toBe(false);
  });
});
