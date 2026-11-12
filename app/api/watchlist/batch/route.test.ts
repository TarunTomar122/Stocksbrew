import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryStore } from "@/lib/import/test-store";

const state = vi.hoisted(() => ({ store: null as MemoryStore | null, uid: null as string | null }));

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
vi.mock("@/lib/watchlist", () => ({
  getUserDoc: async (uid: string) => state.store!.docs.get(`users/${uid}`) ?? null,
  resolveIsSubscribed: () => true,
}));
vi.mock("@/lib/on-demand-queue", () => ({ maybeQueueOnDemandNews: async () => false }));
vi.mock("@/lib/posthog-server-capture", () => ({ captureServerEventSafe: async () => undefined }));

import { createMemoryStore } from "@/lib/import/test-store";
import { POST } from "./route";

let mutation = 0;
function post(body: unknown) {
  mutation += 1;
  return new NextRequest("http://localhost/api/watchlist/batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-client-mutation-id": `batch-test-${mutation}` },
  });
}

const user = () => state.store!.docs.get("users/me")!;

beforeEach(() => {
  state.store = createMemoryStore();
  state.uid = "me";
  state.store.docs.set("users/me", {
    tracked_stocks: ["US_AAPL", "US_NVDA"],
    watchlist_positions: { US_AAPL: "holding", US_NVDA: "watchlist" },
    watchlist_holdings: { US_AAPL: { quantity: 10, average_cost: 150 } },
    watchlist_version: 5,
  });
});

describe("POST /api/watchlist/batch", () => {
  it("saves when the list is still at the version the sheet opened with", async () => {
    const res = await POST(post({ base_version: 5, items: [{ instrument_id: "US_AAPL", position_type: "holding", holding: { quantity: 12, average_cost: null } }] }));
    expect(res.status).toBe(200);
    expect(user().tracked_stocks).toEqual(["US_AAPL"]);
    expect(user().watchlist_version).toBe(6);
    // An emptied box is saved as cleared, not kept.
    expect((user().watchlist_holdings as Record<string, { average_cost: number | null }>).US_AAPL!.average_cost).toBeNull();
  });

  it("refuses with 409 and writes nothing when the list changed in another tab", async () => {
    // Another tab added MSFT after the sheet opened at version 5.
    state.store!.docs.set("users/me", { ...user(), tracked_stocks: ["US_AAPL", "US_NVDA", "US_MSFT"], watchlist_version: 6 });
    const before = JSON.stringify(user());
    const res = await POST(post({ base_version: 5, items: [] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "stale_list", version: 6 });
    expect(JSON.stringify(user())).toBe(before);
  });

  it("removes every stock when asked on purpose at the current version", async () => {
    const res = await POST(post({ base_version: 5, items: [] }));
    expect(res.status).toBe(200);
    expect(user().tracked_stocks).toEqual([]);
  });

  it("still refuses a list whose rows were all unreadable", async () => {
    expect((await POST(post({ base_version: 5, items: [{ instrument_id: "nope" }] }))).status).toBe(400);
    expect(user().tracked_stocks).toEqual(["US_AAPL", "US_NVDA"]);
  });

  it("goes through without a version, as older clients send", async () => {
    const res = await POST(post({ items: [{ instrument_id: "US_NVDA", position_type: "watchlist" }] }));
    expect(res.status).toBe(200);
    expect(user().tracked_stocks).toEqual(["US_NVDA"]);
  });

  it("keeps the date and extra fields of a holding whose numbers did not change, and restamps an edited one (bug 7)", async () => {
    state.store!.docs.set("users/me", {
      tracked_stocks: ["US_AAPL", "US_MSFT"],
      watchlist_positions: { US_AAPL: "holding", US_MSFT: "holding" },
      watchlist_holdings: {
        US_AAPL: { quantity: 10, average_cost: 150, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-02T00:00:00.000Z", lot_note: "kept" },
        US_MSFT: { quantity: 4, average_cost: 300, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-02T00:00:00.000Z" },
      },
      watchlist_version: 5,
    });
    await POST(post({ base_version: 5, items: [
      { instrument_id: "US_AAPL", position_type: "holding", holding: { quantity: 10, average_cost: 150 } },
      { instrument_id: "US_MSFT", position_type: "holding", holding: { quantity: 6, average_cost: 300 } },
    ] }));
    const holdings = user().watchlist_holdings as Record<string, Record<string, unknown>>;
    expect(holdings.US_AAPL).toMatchObject({ quantity: 10, updated_at: "2026-01-02T00:00:00.000Z", lot_note: "kept" });
    expect(holdings.US_MSFT!.quantity).toBe(6);
    expect(holdings.US_MSFT!.updated_at).not.toBe("2026-01-02T00:00:00.000Z");
  });

  it("treats a holding with shares as unchanged on shares and cost, keeping its typed value the sheet sends empty", async () => {
    state.store!.docs.set("users/me", {
      tracked_stocks: ["US_AAPL"],
      watchlist_positions: { US_AAPL: "holding" },
      watchlist_holdings: { US_AAPL: { quantity: 10, average_cost: 150, market_value: 2300, currency: "USD", source: "manual", updated_at: "2026-01-02T00:00:00.000Z" } },
      watchlist_version: 5,
    });
    await POST(post({ base_version: 5, items: [{ instrument_id: "US_AAPL", position_type: "holding", holding: { quantity: 10, average_cost: 150, market_value: null } }] }));
    expect((user().watchlist_holdings as Record<string, Record<string, unknown>>).US_AAPL).toMatchObject({
      quantity: 10, average_cost: 150, market_value: 2300, updated_at: "2026-01-02T00:00:00.000Z",
    });
  });
});

