import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryStore } from "@/lib/import/test-store";

const state = vi.hoisted(() => ({ store: null as MemoryStore | null, uid: null as string | null }));

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

// NVDA's stored figures: revenue growth and a $166 price, no dividend line possible (none paid in this fixture).
vi.mock("@/lib/thesis-watch/condition-data", () => ({
  conditionInputsFor: async (ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        {
          ticker: id.slice(3),
          report: null,
          values: {
            revenue_growth: { value: 62, asOf: "2026-11-08T09:00:00Z", source: "s", href: null },
            price: { value: 166, asOf: "2026-11-12", source: "Daily closes", href: null },
          },
        },
      ]),
    ),
}));

import { createMemoryStore } from "@/lib/import/test-store";
import { DELETE, GET, POST } from "./route";

function del(body: unknown) {
  return new NextRequest("http://localhost/api/thesis", { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/thesis", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

const ME = {
  tracked_stocks: ["US_NVDA", "US_AAPL", "US_KO"],
  watchlist_positions: { US_NVDA: "holding", US_AAPL: "watchlist", US_KO: "watchlist" },
  watchlist_holdings: { US_NVDA: { quantity: 5 } },
  theses: {
    US_AAPL: { kind: "product", reason: "I like the phones", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
    // A reason for a stock no longer tracked stays stored but is not sent back.
    US_GONE: { kind: "trade", reason: null, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  },
};

beforeEach(() => {
  state.store = createMemoryStore();
  state.uid = "me";
  state.store.docs.set("users/me", structuredClone(ME));
  state.store.docs.set("users/someone", { tracked_stocks: ["US_NVDA"], theses: {} });
});

describe("/api/thesis", () => {
  it("needs a signed-in person, for reading and writing", async () => {
    state.uid = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth" }] }))).status).toBe(401);
    expect(state.store!.writes).toEqual([]);
  });

  it("returns the person's reasons for stocks they still track", async () => {
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body.theses)).toEqual(["US_AAPL"]);
    expect(body.held).toEqual(["US_NVDA"]);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    ["no items", {}],
    ["empty list", { items: [] }],
    ["a bad id", { items: [{ instrument_id: "NVDA", kind: "growth" }] }],
    ["an unknown kind", { items: [{ instrument_id: "US_NVDA", kind: "vibes" }] }],
    ["no kind and no reason", { items: [{ instrument_id: "US_NVDA", kind: null, reason: "   " }] }],
    ["a reason that is too long", { items: [{ instrument_id: "US_NVDA", reason: "x".repeat(281) }] }],
    ["too many at once", { items: Array.from({ length: 51 }, (_, i) => ({ instrument_id: `US_T${i}`, kind: "growth" })) }],
  ])("refuses %s and writes nothing", async (_label, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(state.store!.writes).toEqual([]);
  });

  it("refuses a stock the person does not track", async () => {
    const res = await POST(post({ items: [{ instrument_id: "US_TSLA", kind: "trade" }] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_tracked", ids: ["US_TSLA"] });
    expect(state.store!.writes).toEqual([]);
  });

  it("adds reasons without touching other reasons or any other field, on the person's own doc only", async () => {
    const res = await POST(post({ items: [{ instrument_id: "us_nvda", kind: "growth", reason: "  Data centres\nkeep buying  " }, { instrument_id: "US_KO", kind: "dividend" }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.theses.US_NVDA).toMatchObject({ kind: "growth", reason: "Data centres keep buying" });
    expect(state.store!.writes.map((w) => w.path)).toEqual(["users/me"]);
    // Only the theses map and its timestamp are written.
    expect(Object.keys(state.store!.writes[0]!.data).sort()).toEqual(["theses", "theses_updated_at"]);
    const doc = state.store!.docs.get("users/me")!;
    expect(Object.keys(doc.theses as object).sort()).toEqual(["US_AAPL", "US_GONE", "US_KO", "US_NVDA"]);
    expect((doc.theses as Record<string, unknown>).US_AAPL).toEqual(ME.theses.US_AAPL);
    expect(doc.watchlist_holdings).toEqual(ME.watchlist_holdings);
    expect(doc.tracked_stocks).toEqual(ME.tracked_stocks);
    expect(state.store!.docs.get("users/someone")).toEqual({ tracked_stocks: ["US_NVDA"], theses: {} });
  });

  it("keeps the first answer's date when a reason is changed", async () => {
    await POST(post({ items: [{ instrument_id: "US_AAPL", kind: "long_term", reason: null }] }));
    const saved = (state.store!.docs.get("users/me")!.theses as Record<string, { kind: string; reason: string | null; created_at: string; updated_at: string }>).US_AAPL!;
    expect(saved.kind).toBe("long_term");
    expect(saved.reason).toBeNull();
    expect(saved.created_at).toBe(ME.theses.US_AAPL.created_at);
    expect(saved.updated_at > saved.created_at).toBe(true);
  });

  it("refuses an account with no profile yet", async () => {
    state.uid = "new";
    const res = await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth" }] }));
    expect(res.status).toBe(409);
    expect(state.store!.writes).toEqual([]);
  });

  it("removes one reason, keeps every other one and every other field, on the person's own doc only", async () => {
    await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth" }] }));
    state.store!.writes = [];
    const res = await DELETE(del({ instrument_ids: ["us_aapl"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: ["US_AAPL"] });
    expect(state.store!.writes.map((w) => w.path)).toEqual(["users/me"]);
    expect(Object.keys(state.store!.writes[0]!.data).sort()).toEqual(["theses", "theses_updated_at"]);
    const doc = state.store!.docs.get("users/me")!;
    expect(Object.keys(doc.theses as object).sort()).toEqual(["US_GONE", "US_NVDA"]);
    expect(doc.watchlist_holdings).toEqual(ME.watchlist_holdings);
    expect(doc.tracked_stocks).toEqual(ME.tracked_stocks);
    expect(state.store!.docs.get("users/someone")).toEqual({ tracked_stocks: ["US_NVDA"], theses: {} });
  });

  it("removing a reason that is not there writes nothing", async () => {
    const res = await DELETE(del({ instrument_ids: ["US_KO"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: [] });
    expect(state.store!.writes).toEqual([]);
  });

  it.each([
    ["no ids", {}],
    ["a bad id", { instrument_ids: ["KO"] }],
    ["too many", { instrument_ids: Array.from({ length: 51 }, (_, i) => `US_T${i}`) }],
  ])("refuses a removal with %s and writes nothing", async (_label, body) => {
    expect((await DELETE(del(body))).status).toBe(400);
    expect(state.store!.writes).toEqual([]);
  });

  it("needs a signed-in person to remove", async () => {
    state.uid = null;
    expect((await DELETE(del({ instrument_ids: ["US_AAPL"] }))).status).toBe(401);
    expect(state.store!.writes).toEqual([]);
  });

  it("refuses a new line on a figure the stock lacks, and keeps an old one that lost its figure", async () => {
    const refused = await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth", reason: null, conditions: [{ metric: "dividend", op: "above", value: 0.1 }] }] }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).metric).toBe("dividend");
    // A dividend line saved back when it paid one, and a price line far from today's $166.
    const doc = state.store!.docs.get("users/me") as Record<string, unknown>;
    (doc.theses as Record<string, unknown>).US_NVDA = {
      kind: "growth",
      reason: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      conditions: [{ metric: "dividend", op: "above", value: 0.1 }],
    };
    const kept = await POST(
      post({
        items: [{ instrument_id: "US_NVDA", kind: "growth", reason: "AI chips", conditions: [{ metric: "dividend", op: "above", value: 0.1 }, { metric: "revenue_growth", op: "above", value: 40 }] }],
      }),
    );
    expect(kept.status).toBe(200);
    expect((await kept.json()).theses.US_NVDA.conditions).toHaveLength(2);
    // Changing the old line's number makes it new: it is checked, and refused.
    const changed = await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth", reason: null, conditions: [{ metric: "dividend", op: "above", value: 0.2 }] }] }));
    expect(changed.status).toBe(400);
    const far = await POST(post({ items: [{ instrument_id: "US_NVDA", kind: "growth", reason: null, conditions: [{ metric: "price", op: "above", value: 1000 }] }] }));
    expect(far.status).toBe(400);
  });
});
