import { describe, expect, it, vi } from "vitest";

import { INDEXNOW_BATCH, indexNowUrls, submitIndexNow } from "@/lib/seo/indexnow";

const ok = () => new Response("", { status: 202 });

describe("IndexNow submission", () => {
  it("sends absolute addresses on our host only, once each", () => {
    expect(indexNowUrls(["/stock/NVDA", "stock/NVDA", "https://www.stocksbrew.online/stock/NVDA", "https://example.com/x", "/pricing"])).toEqual([
      "https://www.stocksbrew.online/stock/NVDA",
      "https://www.stocksbrew.online/pricing",
    ]);
  });

  it("splits a long list into batches of at most 10,000", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const urls = Array.from({ length: 23_456 }, (_, i) => `/stock/T${i}`);
    const result = await submitIndexNow(urls, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, status: 202, submitted: 23_456 });
    const sizes = fetchImpl.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).urlList.length);
    expect(sizes).toEqual([INDEXNOW_BATCH, INDEXNOW_BATCH, 3_456]);
    const first = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(first.host).toBe("www.stocksbrew.online");
    expect(first.keyLocation).toBe("https://www.stocksbrew.online/stocksbrew-seo-2026.txt");
  });

  it("stops at the first refused batch and says how many went through", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }));
    const urls = Array.from({ length: 15_000 }, (_, i) => `/stock/T${i}`);
    const result = await submitIndexNow(urls, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, status: 429, submitted: INDEXNOW_BATCH, error: "Too Many Requests" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses an empty list without calling IndexNow", async () => {
    const fetchImpl = vi.fn();
    expect(await submitIndexNow([], fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, error: "no_urls" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
