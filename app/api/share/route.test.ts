import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShareFacts } from "@/lib/share/cards";

/**
 * The share routes against an in-memory store and a made-up uid. The
 * loaders are replaced by fixed facts; the card rules, privacy check, hash
 * check and storage are the real ones.
 */

type Doc = Record<string, unknown>;
const state = vi.hoisted(() => ({
  uid: null as string | null,
  docs: new Map<string, Doc>(),
  writes: [] as Array<{ op: string; path: string }>,
  facts: null as ShareFacts | null,
  /** The next create lands and then throws, like a store call that times out after writing. */
  landThenFail: false,
}));

vi.mock("@/lib/entitlements-server", () => ({ getViewer: async () => ({ uid: state.uid, signedIn: Boolean(state.uid), plan: "free" }) }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid } : null) }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: async (uid: string) => ({ uid, tracked_stocks: ["US_NVDA"] }) }));
vi.mock("@/lib/share/facts", () => ({ loadShareFacts: async () => (state.facts ? { facts: state.facts, asOf: "2026-11-11" } : null) }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    id: path.split("/").pop()!,
    async get() {
      const data = state.docs.get(path);
      return { exists: data !== undefined, id: path.split("/").pop()!, data: () => (data ? structuredClone(data) : undefined) };
    },
    async create(data: Doc) {
      if (state.docs.has(path)) throw new Error("already exists");
      state.writes.push({ op: "create", path });
      state.docs.set(path, structuredClone(data));
      if (state.landThenFail) {
        state.landThenFail = false;
        throw new Error("The operation was aborted due to timeout");
      }
    },
    async delete() {
      state.writes.push({ op: "delete", path });
      state.docs.delete(path);
    },
  });
  const collection = (name: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      async get() {
        const docs = [...state.docs.entries()]
          .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
          .map(([path, data]) => ({ id: path.split("/").pop()!, data: () => structuredClone(data) }));
        return { docs };
      },
    }),
  });
  return { adminAuth: {}, adminFirestore: { collection } };
});

import { DELETE } from "./[id]/route";
import { GET, POST } from "./route";

const FACTS: ShareFacts = {
  kind: "xray",
  facts: {
    companies: [
      { name: "NVIDIA", ticker: "NVDA", sector: "Technology", pct: 14.2, directPct: 9.1, fundPct: 5.1, funds: ["QQQ"] },
      { name: "Microsoft", ticker: "MSFT", sector: "Technology", pct: 8.4, directPct: 0, fundPct: 8.4, funds: ["QQQ"] },
    ],
    maxDirectPct: 12,
    sectors: [{ sector: "Technology", pct: 41, benchmarkPct: 33 }],
    overlap: null,
    closedPct: 0,
    filingDates: ["2026-08-31"],
  },
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/share", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function draft() {
  const res = await POST(post({ action: "draft", kind: "xray" }));
  return { res, body: await res.json() };
}

beforeEach(() => {
  state.uid = "test-uid-share-1";
  state.docs = new Map();
  state.writes = [];
  state.facts = structuredClone(FACTS);
  state.landThenFail = false;
});

describe("/api/share", () => {
  it("needs a signed-in person and writes nothing otherwise", async () => {
    state.uid = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ action: "draft", kind: "xray" }))).status).toBe(401);
    expect((await POST(post({ action: "create", kind: "xray", cardId: "top", hash: "x" }))).status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("refuses an unknown page or action", async () => {
    expect((await POST(post({ action: "draft", kind: "everything" }))).status).toBe(400);
    expect((await POST(post({ action: "publish", kind: "xray" }))).status).toBe(400);
    expect(state.writes).toEqual([]);
  });

  it("says when there is nothing of theirs to share", async () => {
    state.facts = null;
    const { res, body } = await draft();
    expect(res.status).toBe(404);
    expect(body.error).toBe("no_holdings");
  });

  it("drafts without saving anything", async () => {
    const { res, body } = await draft();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(body.candidates.map((item: { cardId: string }) => item.cardId)).toEqual(["top", "sector"]);
    expect(state.writes).toEqual([]);
  });

  it("saves only the card that was previewed, with the owner kept out of what is returned", async () => {
    const { body } = await draft();
    const anon = body.candidates[0].variants["anon-pct"];
    const res = await POST(post({ action: "create", kind: "xray", cardId: "top", hideNames: true, showAmounts: false, hash: anon.hash }));
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made.path).toBe(`/s/${made.id}`);
    expect(made.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(JSON.stringify(made)).not.toContain("test-uid-share-1");
    const stored = state.docs.get(`tm_portfolio_shares/${made.id}`)!;
    expect(stored.owner_uid).toBe("test-uid-share-1");
    expect(stored.card).toEqual(anon.card);
    expect(stored.hide_names).toBe(true);
    expect(JSON.stringify(stored.card)).not.toMatch(/NVIDIA|Microsoft|QQQ/);
  });

  it("asks again instead of saving when the numbers moved since the preview", async () => {
    const { body } = await draft();
    const shown = body.candidates[0].variants["named-pct"];
    (state.facts!.facts as { companies: Array<{ pct: number }> }).companies[0]!.pct = 15.6;
    const res = await POST(post({ action: "create", kind: "xray", cardId: "top", hideNames: false, showAmounts: false, hash: shown.hash }));
    expect(res.status).toBe(409);
    const again = await res.json();
    expect(again.error).toBe("changed");
    expect(again.candidates[0].variants["named-pct"].card.figure.value).toBe("16%");
    expect(state.writes).toEqual([]);
  });

  it("will not take a dollar version of a card that has none, or a made-up hash", async () => {
    const res = await POST(post({ action: "create", kind: "xray", cardId: "top", hideNames: false, showAmounts: true, hash: "made-up" }));
    expect(res.status).toBe(409);
    expect(state.writes).toEqual([]);
  });

  it("lists the person's own shares and lets only them delete one", async () => {
    const { body } = await draft();
    const shown = body.candidates[1].variants["named-pct"];
    const made = await (await POST(post({ action: "create", kind: "xray", cardId: "sector", hideNames: false, showAmounts: false, hash: shown.hash }))).json();
    state.docs.set("tm_portfolio_shares/OtherPerson1", { owner_uid: "someone-else", card: shown.card, created_at: "2026-11-01T00:00:00Z" });

    const list = await (await GET()).json();
    expect(list.shares.map((row: { id: string }) => row.id)).toEqual([made.id]);
    expect(JSON.stringify(list)).not.toContain("owner_uid");

    const params = (id: string) => ({ params: { id } });
    expect((await DELETE(new Request("http://localhost"), params("OtherPerson1"))).status).toBe(404);
    expect(state.docs.has("tm_portfolio_shares/OtherPerson1")).toBe(true);
    expect((await DELETE(new Request("http://localhost"), params("../users/x"))).status).toBe(404);
    expect((await DELETE(new Request("http://localhost"), params(made.id))).status).toBe(200);
    expect(state.docs.has(`tm_portfolio_shares/${made.id}`)).toBe(false);
    state.uid = null;
    expect((await DELETE(new Request("http://localhost"), params("OtherPerson1"))).status).toBe(401);
  });

  it("keeps one copy when a write times out after landing", async () => {
    const { body } = await draft();
    const shown = body.candidates[0].variants["named-pct"];
    state.landThenFail = true;
    const res = await POST(post({ action: "create", kind: "xray", cardId: "top", hideNames: false, showAmounts: false, hash: shown.hash }));
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(state.writes.filter((write) => write.op === "create")).toHaveLength(1);
    expect([...state.docs.keys()]).toEqual([`tm_portfolio_shares/${made.id}`]);
  });

  it("stops at the per-person limit", async () => {
    const { body } = await draft();
    const shown = body.candidates[0].variants["named-pct"];
    for (let i = 0; i < 50; i++) state.docs.set(`tm_portfolio_shares/Existing${String(i).padStart(4, "0")}`, { owner_uid: "test-uid-share-1", card: shown.card, created_at: "2026-11-01T00:00:00Z" });
    const res = await POST(post({ action: "create", kind: "xray", cardId: "top", hideNames: false, showAmounts: false, hash: shown.hash }));
    expect(res.status).toBe(429);
  });
});
