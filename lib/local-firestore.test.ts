import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

/** A fetch whose responses resolve only when the test says so, counting how many are open at once. */
function controlledFetch(headers: Record<string, string>) {
  const pending: Array<() => void> = [];
  let open = 0;
  let peak = 0;
  const fetchMock = vi.fn(async () => {
    open += 1;
    peak = Math.max(peak, open);
    await new Promise<void>((resolve) => pending.push(resolve));
    open -= 1;
    return new Response(JSON.stringify({ documents: [] }), { status: 200, headers });
  });
  return {
    fetchMock,
    peak: () => peak,
    releaseAll: async () => {
      while (pending.length) {
        pending.splice(0).forEach((resolve) => resolve());
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? "");
  return import("./local-firestore");
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LocalDB request concurrency", () => {
  it("starts at six in flight against a server that does not advertise its backlog", async () => {
    const { LocalFirestore, localDbConcurrencyForTests, setLocalDbFetchForTests } = await load({ LOCALDB_MAX_CONCURRENCY: undefined });
    const control = controlledFetch({});
    setLocalDbFetchForTests(control.fetchMock);
    const db = new LocalFirestore("http://store.test", "token");
    const reads = Array.from({ length: 20 }, (_, index) => db.collection("tm_instruments").doc(`US_T${index}`).get());
    await settle();
    expect(control.fetchMock).toHaveBeenCalledTimes(6);
    expect(localDbConcurrencyForTests().waiting).toBe(14);
    await control.releaseAll();
    await Promise.all(reads);
    expect(control.peak()).toBe(6);
    expect(localDbConcurrencyForTests()).toEqual({ max: 6, inUse: 0, waiting: 0 });
  });

  it("rises to sixteen once a response carries X-LocalDB-Backlog, and starts queued reads", async () => {
    const { LocalFirestore, localDbConcurrencyForTests, setLocalDbFetchForTests } = await load({ LOCALDB_MAX_CONCURRENCY: undefined });
    const control = controlledFetch({ "X-LocalDB-Backlog": "128" });
    setLocalDbFetchForTests(control.fetchMock);
    const db = new LocalFirestore("http://store.test", "token");
    const reads = Array.from({ length: 40 }, (_, index) => db.collection("tm_instruments").doc(`US_T${index}`).get());
    await settle();
    expect(control.fetchMock).toHaveBeenCalledTimes(6);
    await control.releaseAll();
    await Promise.all(reads);
    expect(control.peak()).toBe(16);
    expect(localDbConcurrencyForTests()).toEqual({ max: 16, inUse: 0, waiting: 0 });
  });

  it("keeps a pinned LOCALDB_MAX_CONCURRENCY whatever the server says", async () => {
    const { LocalFirestore, localDbConcurrencyForTests, setLocalDbFetchForTests } = await load({ LOCALDB_MAX_CONCURRENCY: "3" });
    const control = controlledFetch({ "X-LocalDB-Backlog": "128" });
    setLocalDbFetchForTests(control.fetchMock);
    const db = new LocalFirestore("http://store.test", "token");
    const reads = Array.from({ length: 10 }, (_, index) => db.collection("tm_instruments").doc(`US_T${index}`).get());
    await control.releaseAll();
    await Promise.all(reads);
    expect(control.peak()).toBe(3);
    expect(localDbConcurrencyForTests().max).toBe(3);
  });
});

describe("LocalDB connections", () => {
  /** A local store stand-in that counts TCP connections; `drop` decides which requests get their socket cut instead of an answer. */
  async function storeServer(drop: (count: number) => boolean = () => false) {
    let connections = 0;
    let requests = 0;
    const server = createServer((request, response) => {
      requests += 1;
      if (drop(requests)) {
        request.socket.destroy();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ document: { path: "a/b", data: { n: requests } } }));
    });
    server.keepAliveTimeout = 150_000;
    server.on("connection", () => {
      connections += 1;
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${port}`,
      connections: () => connections,
      requests: () => requests,
      close: async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }

  it("keeps idle connections for a minute, well past Node's 4 s default, with room for every request in flight", async () => {
    const { LOCALDB_AGENT_OPTIONS } = await load({ LOCALDB_MAX_CONCURRENCY: undefined });
    expect(LOCALDB_AGENT_OPTIONS.keepAliveTimeout).toBe(60_000);
    expect(LOCALDB_AGENT_OPTIONS.connections).toBeGreaterThanOrEqual(16);
    const pinned = await load({ LOCALDB_MAX_CONCURRENCY: "24" });
    expect(pinned.LOCALDB_AGENT_OPTIONS.connections).toBe(28);
  });

  it("reuses one connection for reads one after another, without the global fetch", async () => {
    const store = await storeServer();
    try {
      const globalFetch = vi.fn(async () => new Response("{}", { status: 500 }));
      vi.stubGlobal("fetch", globalFetch);
      const { LocalFirestore } = await load();
      const db = new LocalFirestore(store.url, "token");
      await db.collection("a").doc("b").get();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await db.collection("a").doc("c").get();
      expect(store.requests()).toBe(2);
      expect(store.connections()).toBe(1);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      await store.close();
    }
  });

  it("sends a read again once when its connection is cut (as a restart does to an idle pooled one), but not a write", async () => {
    const store = await storeServer((count) => count === 1 || count === 3);
    try {
      const { LocalFirestore } = await load();
      const db = new LocalFirestore(store.url, "token");
      const snapshot = await db.collection("a").doc("b").get();
      expect(snapshot.data()).toEqual({ n: 2 });
      await expect(db.collection("a").doc("b").set({ x: 1 })).rejects.toThrow();
      expect(store.requests()).toBe(3);
    } finally {
      await store.close();
    }
  });
});

describe("getLocalDBDocument", () => {
  it("reads through the shared adapter and returns only object data", async () => {
    const { setLocalDbFetchForTests } = await load({ LOCALDB_URL: "http://store.test/", LOCALDB_API_TOKEN: "token" });
    const { getLocalDBDocument } = await import("./localdb");
    const seen: string[] = [];
    setLocalDbFetchForTests(async (url) => {
      seen.push(url);
      if (url.endsWith("missing")) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ document: { path: "tm_home_view/US", data: { as_of: "2026-11-11" } } }), { status: 200 });
    });
    expect(await getLocalDBDocument("tm_home_view/US")).toEqual({ as_of: "2026-11-11" });
    expect(await getLocalDBDocument("tm_home_view/missing")).toBeNull();
    expect(seen[0]).toBe("http://store.test/documents/tm_home_view%2FUS");
  });
});

describe("field masks", () => {
  const PRICE = {
    ticker: "AAPL",
    currency: "USD",
    captured_at: "2026-11-12T20:59:00+00:00",
    quote: { current: 173.03, day_change_pct: -2.22, volume: 1296560 },
    fundamentals: { market_cap: 3.1e12, pe_ttm: 28.4 },
    history_window: { dates: ["2026-11-11", "2026-11-12"], closes: [176.95, 173.03] },
    session_phase: null,
  };
  const MASK = ["ticker", "quote.current", "quote.day_change_pct", "session_phase", "missing", "fundamentals.missing"];
  const PROJECTED = { ticker: "AAPL", quote: { current: 173.03, day_change_pct: -2.22 }, session_phase: null };

  /**
   * A store stand-in. `projects`: the current server, which applies `select` (in SQLite);
   * otherwise a server that ignores it and answers with whole documents.
   */
  function fakeStore(projects: boolean) {
    const bodies: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    const docs: Record<string, Record<string, unknown>> = { "tm_latest_prices/US_AAPL": PRICE };
    const fetch = async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      bodies.push({ url, body });
      const select = projects ? (body?.select as string[] | undefined) : undefined;
      const shape = (path: string) => ({ path, hash: "h", data: select ? pick(docs[path]!, select) : docs[path] });
      if (url.endsWith("/documents:batchGet")) {
        const paths = (body!.paths as string[]).filter((path) => docs[path]);
        return new Response(JSON.stringify({ documents: paths.map(shape) }), { status: 200 });
      }
      if (url.endsWith("/query")) {
        return new Response(JSON.stringify({ documents: Object.keys(docs).map(shape) }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };
    return { fetch, bodies };
  }

  function pick(data: Record<string, unknown>, fields: string[]) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      const parts = field.split(".");
      let value: unknown = data;
      for (const part of parts) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
      if (value === undefined) continue;
      let target = out;
      for (const part of parts.slice(0, -1)) target = (target[part] ??= {}) as Record<string, unknown>;
      target[parts.at(-1)!] = value;
    }
    return out;
  }

  it.each([true, false])("getAll(...refs, { fieldMask }) sends the mask and returns only those fields (server projects: %s)", async (projects) => {
    const { LocalFirestore, setLocalDbFetchForTests } = await load();
    const store = fakeStore(projects);
    setLocalDbFetchForTests(store.fetch);
    const db = new LocalFirestore("http://store.test", "token");
    const prices = db.collection("tm_latest_prices");
    const [hit, miss] = await db.getAll(prices.doc("US_AAPL"), prices.doc("US_NOPE"), { fieldMask: MASK });
    expect(hit!.exists).toBe(true);
    expect(hit!.data()).toEqual(PROJECTED);
    expect(miss!.exists).toBe(false);
    expect(store.bodies).toHaveLength(1);
    expect(store.bodies[0]!.body).toEqual({ paths: ["tm_latest_prices/US_AAPL", "tm_latest_prices/US_NOPE"], select: MASK });
  });

  it("getAll without options reads whole documents and sends no mask", async () => {
    const { LocalFirestore, setLocalDbFetchForTests } = await load();
    const store = fakeStore(true);
    setLocalDbFetchForTests(store.fetch);
    const db = new LocalFirestore("http://store.test", "token");
    const [snap] = await db.getAll(db.collection("tm_latest_prices").doc("US_AAPL"));
    expect(snap!.data()).toEqual(PRICE);
    expect(store.bodies[0]!.body).toEqual({ paths: ["tm_latest_prices/US_AAPL"] });
  });

  it("getAllSelected is the same read as a fieldMask", async () => {
    const { LocalFirestore, setLocalDbFetchForTests } = await load();
    const store = fakeStore(false);
    setLocalDbFetchForTests(store.fetch);
    const db = new LocalFirestore("http://store.test", "token");
    const [snap] = await db.getAllSelected([db.collection("tm_latest_prices").doc("US_AAPL")], MASK);
    expect(snap!.data()).toEqual(PROJECTED);
  });

  it.each([true, false])("query select takes Firestore's variadic form and the array form (server projects: %s)", async (projects) => {
    const { LocalFirestore, setLocalDbFetchForTests } = await load();
    const store = fakeStore(projects);
    setLocalDbFetchForTests(store.fetch);
    const db = new LocalFirestore("http://store.test", "token");
    const variadic = await db.collection("tm_latest_prices").where("market", "==", "US").select(...MASK).get();
    const array = await db.collection("tm_latest_prices").select(MASK).limit(5).get();
    expect(variadic.docs[0]!.data()).toEqual(PROJECTED);
    expect(array.docs[0]!.data()).toEqual(PROJECTED);
    expect(store.bodies[0]!.body!.select).toEqual(MASK);
    expect(store.bodies[1]!.body!.select).toEqual(MASK);
  });

  it("select() with no fields asks for ids only, as Firestore does", async () => {
    const { LocalFirestore, setLocalDbFetchForTests } = await load();
    const store = fakeStore(false);
    setLocalDbFetchForTests(store.fetch);
    const db = new LocalFirestore("http://store.test", "token");
    const snap = await db.collection("tm_latest_prices").select().get();
    expect(store.bodies[0]!.body!.select).toEqual(["__name__"]);
    expect(snap.docs[0]!.id).toBe("US_AAPL");
    expect(snap.docs[0]!.data()).toEqual({});
  });

  it("rejects a select that is not field paths", async () => {
    const { LocalFirestore } = await load();
    const db = new LocalFirestore("http://store.test", "token");
    expect(() => db.collection("a").select("ok", "" as string)).toThrow();
    expect(() => db.collection("a").select(1 as unknown as string)).toThrow();
  });
});

describe("projectFields", () => {
  it("keeps dotted paths nested and leaves out what is absent", async () => {
    const { projectFields } = await load();
    const data = { a: { b: 1, c: [1, 2], d: { e: null } }, f: false, g: [{ h: 1 }] };
    expect(projectFields(data, ["a.b", "a.d.e", "f", "a.x", "x.y", "g.h", "a.c.0", "__name__"])).toEqual({ a: { b: 1, d: { e: null } }, f: false });
    expect(projectFields(data, ["a", "a.b"])).toEqual({ a: data.a });
    expect(projectFields(data, [])).toEqual({});
    expect(projectFields(undefined, ["a"])).toBeUndefined();
  });

  it("does not read inherited properties", async () => {
    const { projectFields } = await load();
    expect(projectFields({ a: {} }, ["a.toString", "constructor"])).toEqual({});
  });
});
