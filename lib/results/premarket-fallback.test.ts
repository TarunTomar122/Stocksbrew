import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The morning after a report: when the shared pre-market snapshot fails to load, the stored extended quote's
 * pre-market print still gives the read its move, so the stock is not dropped from the briefing that very morning.
 * Without that print the read still throws, so a read with no move is never cached for everyone.
 */

const state = vi.hoisted(() => ({ extended: true, close: "2026-11-12T16:00:01-05:00" }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/local-firestore", () => ({ localFirestoreFromEnv: () => null }));
vi.mock("@/lib/premarket", () => ({ getPremarketMovers: async () => Promise.reject(new Error("store timeout")) }));
vi.mock("@/lib/earnings-season-data", () => ({
  loadTickerEarnings: async (tickers: string[]) =>
    new Map(tickers.map((ticker) => [ticker, { history: { past: [{ date: "2026-08-12", session: "amc", from: "calendar", epsEstimate: null, epsActual: null, result: null, surprisePct: null, move: -11.85, basis: "1d" }], typicalDayPct: 4 } }])),
}));
vi.mock("@/lib/firebase-admin", () => {
  const row = { ticker: "CBRS", company: "Cerebras Systems", event_date: "2026-11-12", market: "US", time: "amc", reported_eps: 0.1, estimated_eps: -0.13, eps_estimate: -0.13, actuals_source: "nasdaq_calendar", actuals_captured_at: "2026-11-12T22:30:00Z" };
  const extended = {
    ticker: "CBRS",
    session: "pre",
    pre: { session: "pre", price: 109, change_pct: 11.51, regular_close: 97.75, get regular_close_at() { return state.close; }, as_of: "2026-11-13T08:35:00-05:00" },
  };
  const missing = { exists: false, id: "", data: () => undefined };
  return {
    adminAuth: {},
    adminFirestore: {
      collection: () => {
        const query = { where: () => query, get: async () => ({ docs: [{ data: () => row }] }) };
        return query;
      },
      doc: (path: string) => path,
      getAll: async (...paths: string[]) =>
        paths.map((path) => (path.startsWith("tm_extended_quotes/") && state.extended ? { exists: true, id: "CBRS", data: () => extended } : missing)),
    },
  };
});

const server = await import("./server");

beforeEach(() => {
  vi.stubEnv("RESULTS_NIGHT", "1");
  vi.useFakeTimers();
  // 8:40 ET on the session after the report, before the open.
  vi.setSystemTime(new Date("2026-11-13T13:40:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  state.extended = true;
  state.close = "2026-11-12T16:00:01-05:00";
});

describe("a failed pre-market snapshot on the morning after a report", () => {
  it("takes the stored pre-market print as the move", async () => {
    const read = await server.readResult("CBRS", "2026-11-12", "2026-11-13");
    expect(read!.move).toMatchObject({ pct: 11.51, kind: "before_open", day: "2026-11-13" });
  });

  it("throws when the stored print moved from another close, so no moveless read is cached", async () => {
    state.close = "2026-11-11T16:00:01-05:00";
    await expect(server.readResult("CBRS", "2026-11-12", "2026-11-13")).rejects.toThrow(/pre-market read failed/);
  });

  it("still throws without one, so no moveless read is cached", async () => {
    state.extended = false;
    await expect(server.readResult("CBRS", "2026-11-12", "2026-11-13")).rejects.toThrow(/pre-market read failed/);
  });
});
