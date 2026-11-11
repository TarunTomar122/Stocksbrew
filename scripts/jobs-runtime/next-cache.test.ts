import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearJobsCacheForTests, unstable_cache } from "./next-cache";
import { cache } from "./react";

describe("jobs runtime stand-ins", () => {
  beforeEach(() => clearJobsCacheForTests());

  it("keeps one entry per key and arguments, and hands later callers a copy", async () => {
    const load = vi.fn(async (ticker: string) => ({ ticker, closes: [1, 2] }));
    const cached = unstable_cache(load, ["prices-v1"], { revalidate: 3600 });
    const first = await cached("NVDA");
    const second = await cached("NVDA");
    await cached("AAPL");
    expect(load).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    second.closes.push(3);
    expect((await cached("NVDA")).closes).toEqual([1, 2]);
  });

  it("shares a call that is still in flight", async () => {
    const load = vi.fn(async () => ({ ok: true }));
    const cached = unstable_cache(load, ["shared"]);
    await Promise.all([cached(), cached(), cached()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failure", async () => {
    let calls = 0;
    const cached = unstable_cache(async () => {
      calls += 1;
      if (calls === 1) throw new Error("store down");
      return { ok: true };
    }, ["flaky"]);
    await expect(cached()).rejects.toThrow("store down");
    await expect(cached()).resolves.toEqual({ ok: true });
  });

  it("expires after revalidate seconds", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => ({ at: Date.now() }));
      const cached = unstable_cache(load, ["short"], { revalidate: 60 });
      await cached();
      vi.advanceTimersByTime(61_000);
      await cached();
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("React's cache is a pass-through", () => {
    const fn = (n: number) => n * 2;
    expect(cache(fn)).toBe(fn);
  });
});
