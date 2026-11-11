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
