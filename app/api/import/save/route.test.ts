import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryStore } from "@/lib/import/test-store";

const state = vi.hoisted(() => ({ store: null as MemoryStore | null, uid: null as string | null, events: [] as Array<[string, string, Record<string, unknown>]> }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid, email: null, displayName: null, photoURL: null } : null) }));
vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore } = await import("@/lib/import/test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return memoryFirestore(state.store!);
    },
  };
});
vi.mock("@/lib/import/server", async () => {
  const { buildDirectory } = await import("@/lib/import/resolve");
  return {
    getImportDirectory: async () =>
      buildDirectory([
        { instrument_id: "US_AAPL", ticker: "AAPL", name: "Apple" },
        { instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA" },
        { instrument_id: "US_KO", ticker: "KO", name: "Coca-Cola" },
      ]),
  };
});
vi.mock("@/lib/on-demand-queue", () => ({ maybeQueueOnDemandNews: async () => true }));
vi.mock("@/lib/posthog-server-capture", () => ({
  captureServerEventSafe: async (uid: string, event: string, props: Record<string, unknown>) => {
    state.events.push([uid, event, props]);
  },
}));

import { createMemoryStore } from "@/lib/import/test-store";
import { POST } from "./route";

function post(body: unknown, mutation = "abcdef123456") {
  return new NextRequest("http://localhost/api/import/save", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-client-mutation-id": mutation },
  });
}

beforeEach(() => {
  state.store = createMemoryStore();
  state.uid = "me";
  state.events = [];
  state.store.docs.set("users/me", {
    tracked_stocks: ["US_AAPL"],
    watchlist_positions: { US_AAPL: "holding" },
    watchlist_holdings: { US_AAPL: { quantity: 10, average_cost: 150 } },
    watchlist_version: 3,
  });
});

describe("POST /api/import/save", () => {
  it("needs a signed-in person and writes nothing otherwise", async () => {
    state.uid = null;
    expect((await POST(post({ rows: [{ instrument_id: "US_NVDA" }] }))).status).toBe(401);
    expect(state.store!.writes).toEqual([]);
  });

  it("refuses malformed rows", async () => {
    expect((await POST(post({ rows: [{ instrument_id: "US_NVDA", shares: -3 }] }))).status).toBe(400);
    expect((await POST(post({ rows: "US_NVDA" }))).status).toBe(400);
    expect(state.store!.writes).toEqual([]);
  });

  it("refuses a stock we do not cover, even when the browser sent it", async () => {
    const res = await POST(post({ rows: [{ instrument_id: "US_NVDA" }, { instrument_id: "US_VOO", shares: 3 }] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unknown_stocks", unknown: ["US_VOO"] });
    expect(state.store!.writes).toEqual([]);
  });

  it("saves next to existing holdings, keeps the ones already owned, queues the refresh and sends one stock_tracked", async () => {
    const res = await POST(post({ rows: [{ instrument_id: "US_NVDA", shares: 25, average_cost: 118 }, { instrument_id: "US_AAPL", shares: 12 }], source: "screenshot" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: ["US_NVDA"], updated: [], kept: ["US_AAPL"] });
    const doc = state.store!.docs.get("users/me")!;
    expect(doc.watchlist_holdings).toMatchObject({
      US_AAPL: { quantity: 10, average_cost: 150 },
      US_NVDA: { quantity: 25, average_cost: 118, source: "screenshot" },
    });
    expect(state.store!.docs.get("tm_watchlist_view_refresh_control/me")).toMatchObject({ requested_by: "import_save", last_source_version: 4 });
    // tracked_count and first feed the activation funnel, the same as the batch route (docs/analytics.md).
    expect(state.events).toEqual([
      ["me", "stock_tracked", expect.objectContaining({ via: "import", added_count: 1, updated_count: 0, tracked_count: 2, first: false, ticker: "NVDA" })],
    ]);
    // No share counts or costs go to analytics.
    expect(Object.keys(state.events[0]![2]).sort()).toEqual(["$insert_id", "added_count", "first", "ticker", "tracked_count", "updated_count", "via"]);
  });

  it("replaces a holding's numbers only when the row asks for it", async () => {
    const res = await POST(post({ rows: [{ instrument_id: "US_AAPL", shares: 12, merge: "replace" }] }));
    expect(await res.json()).toMatchObject({ ok: true, added: [], updated: ["US_AAPL"], kept: [] });
    expect(state.store!.docs.get("users/me")!.watchlist_holdings).toMatchObject({ US_AAPL: { quantity: 12, average_cost: 150 } });
  });

  it("treats a retried save as done, without a second write or event", async () => {
    await POST(post({ rows: [{ instrument_id: "US_KO", shares: 4 }] }, "retry-123456"));
    const writes = state.store!.writes.length;
    const again = await POST(post({ rows: [{ instrument_id: "US_KO", shares: 4 }] }, "retry-123456"));
    expect(again.status).toBe(200);
    expect(state.store!.writes.length).toBe(writes);
    expect(state.events.length).toBe(1);
  });

  it("says when a brand-new account is not ready, so the browser can retry", async () => {
    state.uid = "brand-new";
    const res = await POST(post({ rows: [{ instrument_id: "US_NVDA" }] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "profile_not_ready" });
  });
});
