import { vi } from "vitest";

// Next's server puts AsyncLocalStorage on globalThis before its storage modules load; do the same here.
vi.hoisted(() => {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
});

import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage.external";
import { afterEach, describe, expect, it } from "vitest";

import { LocalFirestore } from "@/lib/local-firestore";
import { noteDegradedRender } from "@/lib/next-render";

type Store = Parameters<typeof staticGenerationAsyncStorage.run>[0];

/** Runs `fn` as if inside a Next render; only the fields these helpers read are filled in. */
function inRender<T>(store: Partial<Store>, fn: () => T): T {
  return staticGenerationAsyncStorage.run(store as Store, fn);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { _nextOriginalFetch?: unknown })._nextOriginalFetch;
});

describe("LocalDB reads skip Next's Data Cache", () => {
  it("goes through Next's unpatched fetch when Next has patched the global one", async () => {
    const original = vi.fn(async () => new Response(JSON.stringify({ document: { path: "a/b", data: {} } }), { status: 200 }));
    const patched = vi.fn(async () => new Response("{}", { status: 200 }));
    (globalThis as { _nextOriginalFetch?: unknown })._nextOriginalFetch = original;
    vi.stubGlobal("fetch", patched);
    await new LocalFirestore("http://store.test", "token").collection("a").doc("b").get();
    expect(original).toHaveBeenCalledTimes(1);
    expect(patched).not.toHaveBeenCalled();
  });

  it("uses the global fetch outside Next", async () => {
    const plain = vi.fn(async () => new Response(JSON.stringify({ document: { path: "a/c", data: {} } }), { status: 200 }));
    vi.stubGlobal("fetch", plain);
    await new LocalFirestore("http://store.test", "token").collection("a").doc("c").get();
    expect(plain).toHaveBeenCalledTimes(1);
  });
});

describe("noteDegradedRender", () => {
  it("shortens the life of a cached page built from a failed read", () => {
    const store: Partial<Store> = { isStaticGeneration: true, revalidate: 60 };
    inRender(store, () => noteDegradedRender());
    expect(store.revalidate).toBe(10);
  });

  it("leaves shorter lives, never-cache and live renders alone", () => {
    const short: Partial<Store> = { isStaticGeneration: true, revalidate: 5 };
    inRender(short, () => noteDegradedRender());
    expect(short.revalidate).toBe(5);
    const never: Partial<Store> = { isStaticGeneration: true, revalidate: 0 };
    inRender(never, () => noteDegradedRender());
    expect(never.revalidate).toBe(0);
    const live: Partial<Store> = { isStaticGeneration: false, revalidate: 60 };
    inRender(live, () => noteDegradedRender());
    expect(live.revalidate).toBe(60);
    expect(() => noteDegradedRender()).not.toThrow();
  });

  it("is called when a store read fails during a cached build", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const store: Partial<Store> = { isStaticGeneration: true, revalidate: 60 };
    await inRender(store, () => new LocalFirestore("http://store.test", "token").collection("a").doc("d").get().catch(() => null));
    expect(store.revalidate).toBe(10);
  });
});
