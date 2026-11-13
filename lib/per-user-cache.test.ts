import { describe, expect, it, vi } from "vitest";

import { fingerprint, perUserCache } from "@/lib/per-user-cache";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("perUserCache", () => {
  it("reuses a build for the same uid and key inside the window", async () => {
    const time = clock();
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10, now: time.now });
    const load = vi.fn(async () => "alice's briefing");
    expect(await cache.get("alice", "k1", load)).toBe("alice's briefing");
    time.advance(59_000);
    expect(await cache.get("alice", "k1", load)).toBe("alice's briefing");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never hands one person's value to another, even with the same key", async () => {
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10 });
    await cache.get("alice", "same-inputs", async () => "alice's briefing");
    const bob = vi.fn(async () => "bob's briefing");
    expect(await cache.get("bob", "same-inputs", bob)).toBe("bob's briefing");
    expect(bob).toHaveBeenCalledTimes(1);
  });

  it("does not collide when a uid and key could join into the same string", async () => {
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10 });
    await cache.get("a\u0000b", "c", async () => "first");
    expect(await cache.get("a", "b\u0000c", async () => "second")).toBe("second");
  });

  it("refuses an empty uid", () => {
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10 });
    expect(() => cache.get("", "k", async () => "x")).toThrow(/uid/);
  });

  it("builds again when the key changes (an edit) or the window runs out", async () => {
    const time = clock();
    const cache = perUserCache<number>({ ttlMs: 60_000, max: 10, now: time.now });
    let n = 0;
    const load = async () => ++n;
    expect(await cache.get("alice", "v1", load)).toBe(1);
    expect(await cache.get("alice", "v2", load)).toBe(2);
    time.advance(60_000);
    expect(await cache.get("alice", "v2", load)).toBe(3);
  });

  it("shares one load between overlapping requests", async () => {
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10 });
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const first = cache.get("alice", "k", load);
    const second = cache.get("alice", "k", load);
    resolve("done");
    expect(await first).toBe("done");
    expect(await second).toBe("done");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps neither failures nor results `keep` refuses", async () => {
    const cache = perUserCache<{ degraded: string[] }>({ ttlMs: 60_000, max: 10, keep: (value) => value.degraded.length === 0 });
    await expect(cache.get("alice", "k", async () => Promise.reject(new Error("store down")))).rejects.toThrow("store down");
    expect(cache.size()).toBe(0);
    await cache.get("alice", "k", async () => ({ degraded: ["news"] }));
    expect(cache.size()).toBe(0);
    await cache.get("alice", "k", async () => ({ degraded: [] }));
    expect(cache.size()).toBe(1);
  });

  it("says whether one person has an entry inside the window, under any key", async () => {
    const time = clock();
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 10, now: time.now });
    expect(cache.has("alice")).toBe(false);
    await cache.get("alice", "k1", async () => "x");
    expect(cache.has("alice")).toBe(true);
    expect(cache.has("bob")).toBe(false);
    expect(cache.has("")).toBe(false);
    time.advance(60_000);
    expect(cache.has("alice")).toBe(false);
  });

  it("drops the oldest entry past the cap", async () => {
    const cache = perUserCache<string>({ ttlMs: 60_000, max: 2 });
    await cache.get("a", "k", async () => "a");
    await cache.get("b", "k", async () => "b");
    await cache.get("c", "k", async () => "c");
    expect(cache.size()).toBe(2);
    const reloadA = vi.fn(async () => "a2");
    expect(await cache.get("a", "k", reloadA)).toBe("a2");
    expect(reloadA).toHaveBeenCalledTimes(1);
  });
});

describe("fingerprint", () => {
  it("is stable for equal inputs and changes with any input", () => {
    const base = { today: "2026-11-11", rows: [{ instrument_id: "US_AAPL" }], plan: "free", covered: ["US_AAPL"] };
    expect(fingerprint(base)).toBe(fingerprint({ ...base }));
    expect(fingerprint({ ...base, plan: "pro" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, covered: [] })).not.toBe(fingerprint(base));
  });
});
