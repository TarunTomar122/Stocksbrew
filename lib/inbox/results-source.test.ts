import { describe, expect, it, vi } from "vitest";

import type { ResultRead } from "@/lib/results/types";

/** Bug 6: one stock's failed results read must not leave an inbox that is cached as whole. */

const state = vi.hoisted(() => ({ failed: [] as string[] }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/local-firestore", () => ({ localFirestoreFromEnv: () => null }));
vi.mock("@/lib/results/server", () => ({
  resultsForChecked: async () => ({ reads: [crwv()], failed: state.failed }),
}));

function crwv(): ResultRead {
  return {
    ticker: "CRWV",
    company: "CoreWeave, Inc.",
    reportDate: "2026-11-10",
    session: "amc",
    period: null,
    eps: { actual: -1.28, expected: -1.45, verdict: "beat", surprisePct: 11.7, source: "Alpha Vantage", asOf: null },
    revenue: null,
    guidance: null,
    move: null,
    call: null,
    reportHref: null,
    sources: [],
  };
}

const { resultsSource } = await import("./sources");
const { settle } = await import("./server");

const stocks = [
  { instrumentId: "US_CRWV", ticker: "CRWV", position: "holding" as const, covered: true },
  { instrumentId: "US_CEG", ticker: "CEG", position: "holding" as const, covered: true },
];

describe("a failed results read", () => {
  it("keeps the rows it read but names the source missing, so the inbox is built again next time", async () => {
    state.failed = ["CEG"];
    const { lists, missing } = await settle([{ name: "results", run: () => resultsSource(stocks, "mine", "2026-10-29", "2026-11-12") }]);
    expect(missing).toEqual(["results"]);
    expect(lists[0]!.map((item) => item.id)).toEqual(["results:CRWV:2026-11-10"]);
  });

  it("is whole when every read worked", async () => {
    state.failed = [];
    const { lists, missing } = await settle([{ name: "results", run: () => resultsSource(stocks, "mine", "2026-10-29", "2026-11-12") }]);
    expect(missing).toEqual([]);
    expect(lists[0]).toHaveLength(1);
  });
});
