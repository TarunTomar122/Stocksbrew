import { afterEach, describe, expect, it, vi } from "vitest";

import { describeCall, documentsInResponse } from "@/lib/localdb-trace";

describe("documentsInResponse", () => {
  it("reads the count of a list answer, 1 for a document, 0 for errors", () => {
    expect(documentsInResponse('{"documents":[{"path":"a/1"},{"path":"a/2"}],"count":2}', 200)).toBe(2);
    expect(documentsInResponse('{"document":{"path":"a/1","data":{}}}', 200)).toBe(1);
    expect(documentsInResponse('{"error":"document not found"}', 404)).toBe(0);
    expect(documentsInResponse('{"documents":[],"count":0}', 200)).toBe(0);
  });
});

describe("describeCall", () => {
  it("names the collection, never a document id", () => {
    expect(describeCall("POST", "/query", { collection: "tm_news", filters: [] })).toBe("query tm_news");
    expect(describeCall("POST", "/query", { collection: "stocks", collection_group: true })).toBe("query stocks (group)");
    expect(describeCall("POST", "/query", { collection: "tm_radar_inbox/secret-uid/items" })).toBe("query tm_radar_inbox/*/items");
    expect(describeCall("POST", "/documents:batchGet", { paths: ["users/u1", "tm_latest_prices/NVDA", "users/u2"] })).toBe(
      "batchGet tm_latest_prices,users",
    );
    expect(describeCall("GET", "/documents/users%2Fsecret-uid%2Fwatchlist%2FAAPL", undefined)).toBe("GET users/*/watchlist");
  });
});

describe("traceLocalDbCall", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (fetch as unknown as { __nextGetStaticStore?: unknown }).__nextGetStaticStore;
  });

  it("adds a request's calls up, including those made inside an unstable_cache copy of its store, and logs once", async () => {
    vi.useFakeTimers();
    vi.stubEnv("LOCALDB_TRACE", "1");
    const { traceLocalDbCall } = await import("@/lib/localdb-trace");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const pageStore: Record<string, unknown> = { urlPathname: "/stock/NVDA" };
    let current: Record<string, unknown> = pageStore;
    (fetch as unknown as { __nextGetStaticStore: () => { getStore: () => unknown } }).__nextGetStaticStore = () => ({
      getStore: () => current,
    });
    traceLocalDbCall({ kind: "query tm_news", write: false, docs: 10, bytes: 1000, startedAt: 0, endedAt: 50 });
    // unstable_cache runs its callback in `{ ...store }`: the record must travel with it.
    current = { ...pageStore, fetchCache: "only-no-store" };
    traceLocalDbCall({ kind: "batchGet tm_latest_prices", write: false, docs: 2, bytes: 500, startedAt: 10, endedAt: 80 });
    expect(log).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("/stock/NVDA");
    expect(line).toContain("calls=2");
    expect(line).toContain("docs=12");
    expect(line).toContain("bytes=1500");
    expect(line).toContain("span_ms=80");
    log.mockRestore();
  });
});
