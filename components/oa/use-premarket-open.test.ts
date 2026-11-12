import { describe, expect, it, vi } from "vitest";

import { fetchPremarketReady, PREMARKET_READY_URL } from "./use-premarket-open";

const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

describe("fetchPremarketReady", () => {
  it("asks the quotes route with no tickers and is true only on live: true", async () => {
    const fetcher = answer({ live: true });
    expect(await fetchPremarketReady(fetcher as unknown as typeof fetch)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(PREMARKET_READY_URL, expect.objectContaining({ signal: expect.anything() }));
    expect(await fetchPremarketReady(answer({ live: false }) as unknown as typeof fetch)).toBe(false);
    expect(await fetchPremarketReady(answer({}) as unknown as typeof fetch)).toBe(false);
  });

  it("is null when the answer cannot be read, so the item stays hidden", async () => {
    expect(await fetchPremarketReady(answer({ live: true }, false) as unknown as typeof fetch)).toBeNull();
    expect(await fetchPremarketReady((async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBeNull();
  });

  it("gives up on a slow answer", async () => {
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await fetchPremarketReady(slow, 10)).toBeNull();
  });
});
