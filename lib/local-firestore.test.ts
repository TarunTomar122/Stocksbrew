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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LocalDB request concurrency", () => {
  it("starts at six in flight against a server that does not advertise its backlog", async () => {
    const { LocalFirestore, localDbConcurrencyForTests } = await load({ LOCALDB_MAX_CONCURRENCY: undefined });
    const control = controlledFetch({});
    vi.stubGlobal("fetch", control.fetchMock);
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
    const { LocalFirestore, localDbConcurrencyForTests } = await load({ LOCALDB_MAX_CONCURRENCY: undefined });
    const control = controlledFetch({ "X-LocalDB-Backlog": "128" });
    vi.stubGlobal("fetch", control.fetchMock);
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
    const { LocalFirestore, localDbConcurrencyForTests } = await load({ LOCALDB_MAX_CONCURRENCY: "3" });
    const control = controlledFetch({ "X-LocalDB-Backlog": "128" });
    vi.stubGlobal("fetch", control.fetchMock);
    const db = new LocalFirestore("http://store.test", "token");
    const reads = Array.from({ length: 10 }, (_, index) => db.collection("tm_instruments").doc(`US_T${index}`).get());
    await control.releaseAll();
    await Promise.all(reads);
    expect(control.peak()).toBe(3);
    expect(localDbConcurrencyForTests().max).toBe(3);
  });
});
