import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  getAllCalls: [] as string[][],
}));

vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: {
    collection: (name: string) => ({ doc: (id: string) => ({ id, path: `${name}/${id}` }) }),
    getAll: async (...refs: Array<{ id: string }>) => {
      store.getAllCalls.push(refs.map((ref) => ref.id));
      if (refs.some((ref) => ref.id === "BOOM")) throw new Error("bad path");
      return refs.map((ref) => ({
        id: ref.id,
        exists: store.docs.has(ref.id),
        data: () => store.docs.get(ref.id),
      }));
    },
  },
}));

import { NextRequest } from "next/server";

import { GET } from "./route";

const TILE = Buffer.from("fake-webp-bytes").toString("base64");

function call(symbol: string, query = "v=1") {
  return GET(new NextRequest(`http://localhost/api/logo/x?${query}`), { params: { symbol } });
}

describe("GET /api/logo/[symbol]", () => {
  beforeEach(() => {
    store.docs.clear();
    store.getAllCalls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
  });

  it("serves a stored tile as an immutable image", async () => {
    store.docs.set("MSFT", { status: "ok", mime: "image/webp", data_b64: TILE });
    const res = await call("MSFT");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("fake-webp-bytes");
  });

  it("maps share-class spellings onto one key", async () => {
    store.docs.set("BRK.B", { status: "ok", mime: "image/webp", data_b64: TILE });
    const res = await call("BRK-B");
    expect(res.status).toBe(200);
    expect(store.getAllCalls.flat()).toContain("BRK.B");
  });

  it("refuses keys that cannot be a document id, without touching the store", async () => {
    for (const bad of ["-", "A--B", "%", "%41", "", "TOOLONGTICKER12345"]) {
      const res = await call(bad);
      expect(res.status, bad).toBe(400);
    }
    expect(store.getAllCalls).toEqual([]);
  });

  it("gives a company with no logo its lettered tile for a day", async () => {
    store.docs.set("HWKN", { status: "none" });
    const res = await call("HWKN");
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await res.text()).toContain(">HW</text>");
  });

  it("batches requests that arrive together, and one bad key does not fail the rest", async () => {
    store.docs.set("AAPL", { status: "ok", mime: "image/webp", data_b64: TILE });
    store.docs.set("NVDA", { status: "ok", mime: "image/webp", data_b64: TILE });
    const [a, b, c] = await Promise.all([call("AAPL"), call("NVDA"), call("BOOM")]);
    expect(store.getAllCalls[0].sort()).toEqual(["AAPL", "BOOM", "NVDA"]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(503);
    expect(c.headers.get("cache-control")).toBe("no-store");
  });
});
