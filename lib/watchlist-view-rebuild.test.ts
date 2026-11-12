import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore, type MemoryStore } from "@/lib/import/test-store";

const h = vi.hoisted(() => ({
  store: null as MemoryStore | null,
  save: vi.fn(async (..._args: unknown[]) => ({})),
  sync: vi.fn(async (_uid: string, _input: { pause?: readonly string[]; resume?: readonly string[] }) => ({ paused: 0, resumed: 0 })),
}));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore } = await import("@/lib/import/test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return memoryFirestore(h.store!);
    },
  };
});
vi.mock("@/lib/watchlist-view", () => ({ rebuildAndSaveWatchlistView: h.save }));
vi.mock("@/lib/stock-alerts", () => ({ syncAlertPauses: h.sync }));

import { createRebuildQueue, rebuildWatchlistViewForUser } from "@/lib/watchlist-view-rebuild";

beforeEach(() => {
  h.store = createMemoryStore();
  h.save.mockClear();
  h.sync.mockClear();
});

/** A worker the test finishes by hand, recording the version each pass read. */
function manualWorker(versions: number[]) {
  const passes: Array<{ read: number; finish: () => void; skip: number | null }> = [];
  let next = 0;
  const worker = vi.fn((_uid: string, onRead: (v: number) => void, skip: number | null) => {
    const read = versions[Math.min(next++, versions.length - 1)]!;
    onRead(read);
    return new Promise<number | null>((resolve) => passes.push({ read, skip, finish: () => resolve(read) }));
  });
  return { worker, passes };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createRebuildQueue", () => {
  it("runs one build per user at a time and one more pass for writes that land during it", async () => {
    const { worker, passes } = manualWorker([5, 7]);
    const request = createRebuildQueue(worker);
    const first = request("u1", 5);
    // Two more adds in a basket while the first build runs: one extra pass, not two.
    const second = request("u1", 6);
    const third = request("u1", 7);
    expect(worker).toHaveBeenCalledTimes(1);
    passes[0]!.finish();
    await tick();
    expect(worker).toHaveBeenCalledTimes(2);
    expect(passes[1]!.skip).toBe(5);
    passes[1]!.finish();
    await Promise.all([first, second, third]);
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("lets the browser's refresh ride on a build that already read its version", async () => {
    const { worker, passes } = manualWorker([5]);
    const request = createRebuildQueue(worker);
    const fromWrite = request("u1", 5);
    const fromBrowser = request("u1", 5);
    passes[0]!.finish();
    await Promise.all([fromWrite, fromBrowser]);
    expect(worker).toHaveBeenCalledTimes(1);
  });

  it("keeps users apart and starts fresh once a build is done", async () => {
    const { worker, passes } = manualWorker([1, 1, 2]);
    const request = createRebuildQueue(worker);
    const a = request("u1", 1);
    const b = request("u2", 1);
    expect(worker).toHaveBeenCalledTimes(2);
    passes[0]!.finish();
    passes[1]!.finish();
    await Promise.all([a, b]);
    const c = request("u1", 2);
    expect(worker).toHaveBeenCalledTimes(3);
    expect(passes[2]!.skip).toBeNull();
    passes[2]!.finish();
    await c;
  });

  it("runs again for a write that lands after a pass read the book but before it said so", async () => {
    const passes: Array<{ onRead: (v: number) => void; finish: (v: number) => void }> = [];
    const worker = vi.fn((_uid: string, onRead: (v: number) => void) =>
      new Promise<number | null>((resolve) => passes.push({ onRead, finish: (v) => resolve(v) })));
    const request = createRebuildQueue(worker);
    const first = request("u1", 5);
    // The read already returned version 5, but onRead has not fired: a write to 6 lands now.
    const second = request("u1", 6);
    passes[0]!.onRead(5);
    passes[0]!.finish(5);
    await tick();
    expect(worker).toHaveBeenCalledTimes(2);
    passes[1]!.onRead(6);
    passes[1]!.finish(6);
    await Promise.all([first, second]);
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("stops after a few passes when the version it wants never shows up", async () => {
    const worker = vi.fn(async (_uid: string, onRead: (v: number) => void) => {
      onRead(1);
      return 1;
    });
    await createRebuildQueue(worker)("u1", 9);
    expect(worker.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("reports a failed build to every caller waiting on it, and the next request starts over", async () => {
    let calls = 0;
    const request = createRebuildQueue(async () => {
      calls += 1;
      if (calls === 1) throw new Error("store down");
      return 3;
    });
    await expect(request("u1", 3)).rejects.toThrow("store down");
    await expect(request("u1", 3)).resolves.toBeUndefined();
  });
});

describe("rebuildWatchlistViewForUser", () => {
  it("builds from a fresh read of the book with its version, and keeps alerts in step with it", async () => {
    h.store!.docs.set("users/u1", {
      tracked_stocks: ["US_AAPL", "US_MSFT"],
      watchlist_positions: { US_AAPL: "holding", US_MSFT: "watchlist" },
      watchlist_version: 9,
      is_subscribed: false,
    });
    // The last view still had NVDA: the batch modal removed it.
    h.store!.docs.set("tm_watchlist_views/u1", { tracked_ids: ["US_AAPL", "US_NVDA"], source_version: 8, built_at: "2026-11-12T14:00:00.000Z" });
    const read: number[] = [];
    await expect(rebuildWatchlistViewForUser("u1", (v) => read.push(v))).resolves.toBe(9);
    expect(read).toEqual([9]);
    // Only alerts set before that view was built are paused.
    expect(h.sync).toHaveBeenCalledWith("u1", { pause: ["US_NVDA"], resume: ["US_AAPL", "US_MSFT"], plan: "free", createdBefore: "2026-11-12T14:00:00.000Z" });
    expect(h.save).toHaveBeenCalledWith(
      "u1",
      ["US_AAPL", "US_MSFT"],
      { US_AAPL: "holding", US_MSFT: "watchlist" },
      false,
      9,
      expect.objectContaining({ preserveBriefIfFallback: true }),
    );
  });

  it("skips a second pass for a version it already built, and writes nothing without a profile", async () => {
    h.store!.docs.set("users/u1", { tracked_stocks: ["US_AAPL"], watchlist_version: 3 });
    await rebuildWatchlistViewForUser("u1", undefined, 3);
    expect(h.save).not.toHaveBeenCalled();
    await expect(rebuildWatchlistViewForUser("nobody")).resolves.toBeNull();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("does not pause alerts from a view that is newer than the book it read", async () => {
    h.store!.docs.set("users/u1", { tracked_stocks: ["US_AAPL"], watchlist_version: 4 });
    h.store!.docs.set("tm_watchlist_views/u1", { tracked_ids: ["US_AAPL", "US_NVDA"], source_version: 5, built_at: "2026-11-12T14:00:00.000Z" });
    await rebuildWatchlistViewForUser("u1");
    expect(h.sync).toHaveBeenCalledWith("u1", expect.objectContaining({ pause: [], resume: ["US_AAPL"] }));
  });

  it("pauses nothing from a view with no build time", async () => {
    h.store!.docs.set("users/u1", { tracked_stocks: ["US_AAPL"], watchlist_version: 6 });
    h.store!.docs.set("tm_watchlist_views/u1", { tracked_ids: ["US_AAPL", "US_NVDA"], source_version: 5 });
    await rebuildWatchlistViewForUser("u1");
    expect(h.sync).toHaveBeenCalledWith("u1", { pause: [], resume: ["US_AAPL"], plan: "free" });
  });

  it("still builds when the alert sync fails", async () => {
    h.store!.docs.set("users/u1", { tracked_stocks: ["US_AAPL"], watchlist_version: 2 });
    h.sync.mockRejectedValueOnce(new Error("alerts down"));
    await rebuildWatchlistViewForUser("u1");
    expect(h.save).toHaveBeenCalledTimes(1);
  });
});
