import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryStore } from "@/lib/import/test-store";

const state = vi.hoisted(() => ({ store: null as MemoryStore | null, uid: null as string | null, revalidated: [] as string[] }));

vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore } = await import("@/lib/import/test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return memoryFirestore(state.store!);
    },
  };
});
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid, email: null, displayName: null, photoURL: null } : null) }));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidatePath: (path: string) => state.revalidated.push(path),
  revalidateTag: (tag: string) => state.revalidated.push(tag),
}));

import { createMemoryStore } from "@/lib/import/test-store";
import { onDemandFundFacts, queueFundRequest, queueFundRequests, readFundRequestState } from "@/lib/funds/on-demand";
import { GET, POST } from "@/app/api/stock-request/route";

const request = (ticker: string) => state.store!.docs.get(`stock_requests/${ticker}`);

beforeEach(() => {
  state.store = createMemoryStore();
  state.uid = null;
  state.revalidated = [];
});

describe("queueFundRequest", () => {
  it("files a new fund request in the stock request queue", async () => {
    expect(await queueFundRequest("vtwo", { uid: "me", source: "page" })).toBe("adding");
    expect(request("VTWO")).toMatchObject({ query: "VTWO", status: "queued", fulfilled: false, kind: "fund", fund_kind: "etf", source: "page", requester_uids: ["me"] });
    expect(await readFundRequestState("VTWO")).toBe("adding");
  });

  it("never re-queues a fund that is covered or on its way", async () => {
    state.store!.docs.set("stock_requests/VTWO", { query: "VTWO", status: "fulfilled", fulfilled: true });
    state.store!.docs.set("stock_requests/VTSAX", { query: "VTSAX", status: "running" });
    expect(await queueFundRequest("VTWO", { source: "import" })).toBe("ready");
    expect(await queueFundRequest("VTSAX", { source: "import" })).toBe("adding");
    expect(state.store!.writes).toEqual([]);
  });

  it("gives an old stock request the fund path, but stops once Yahoo said no", async () => {
    state.store!.docs.set("stock_requests/VTWO", { query: "VTWO", status: "needs_confirmation", count: 2 });
    state.store!.docs.set("stock_requests/IWM", { query: "IWM", status: "needs_confirmation", fund_check: "not_a_fund" });
    expect(await queueFundRequest("VTWO", { source: "page" })).toBe("adding");
    expect(request("VTWO")).toMatchObject({ status: "queued", count: 3, kind: "fund" });
    expect(await queueFundRequest("IWM", { source: "page" })).toBe("not_found");
    expect(request("IWM")).toMatchObject({ status: "needs_confirmation" });
  });

  it("ignores stocks and says none when the store is down", async () => {
    expect(await queueFundRequest("AAPL", { source: "page" })).toBe("none");
    expect(request("AAPL")).toBeUndefined();
    state.store!.fail = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await queueFundRequest("VTWO", { source: "page" })).toBe("none");
  });

  it("files only the funds in a list, once each", async () => {
    expect(await queueFundRequests(["VTWO", "AAPL", "vtwo", "VTSAX"], { uid: "me", source: "import" })).toEqual({ VTWO: "adding", VTSAX: "adding" });
    expect(request("AAPL")).toBeUndefined();
  });

  it("reads facts of a fund outside the catalogue", async () => {
    expect(await onDemandFundFacts("VTWO")).toBeNull();
    state.store!.docs.set("tm_fund_facts/VTSAX", { ticker: "VTSAX", name: "Vanguard Total Stock Market Index Admiral", quote_type: "MUTUALFUND", expense_ratio: 0.0004 });
    expect(await onDemandFundFacts("VTSAX")).toMatchObject({ name: "Vanguard Total Stock Market Index Admiral", quoteType: "MUTUALFUND", expenseRatio: 0.0004 });
    expect(await onDemandFundFacts("AAPL")).toBeNull();
  });
});

describe("/api/stock-request for funds", () => {
  const get = (query: string) => GET(new NextRequest(`http://localhost/api/stock-request?query=${query}`));
  const post = (body: unknown) => POST(new NextRequest("http://localhost/api/stock-request", { method: "POST", body: JSON.stringify(body) }));

  it("tells the browser a ticker is a fund before anything is filed", async () => {
    expect(await (await get("VTWO")).json()).toMatchObject({ fundKind: "etf", fundState: "none" });
    expect(await (await get("AAPL")).json()).toMatchObject({ fundKind: null });
  });

  it("files a fund through the fund rules and reports its state", async () => {
    state.uid = "me";
    const res = await post({ query: "vtsax", source: "typed" });
    expect(await res.json()).toMatchObject({ ok: true, queued: "VTSAX", fundKind: "mutual_fund", fundState: "adding" });
    expect(request("VTSAX")).toMatchObject({ status: "queued", source: "typed", fund_kind: "mutual_fund" });
    // A second ask while it is on its way writes nothing.
    const writes = state.store!.writes.length;
    await post({ query: "VTSAX" });
    expect(state.store!.writes.length).toBe(writes);
  });

  it("refreshes the cached page once the fund is in", async () => {
    state.store!.docs.set("stock_requests/VTWO", { query: "VTWO", status: "fulfilled", fulfilled: true });
    expect(await (await get("VTWO")).json()).toMatchObject({ fundState: "ready", fulfilled: true });
    expect(state.revalidated).toEqual(["fund-on-demand:VTWO", "/stock/VTWO"]);
  });

  it("leaves a stock request as it was", async () => {
    const res = await post({ query: "ZZZZ" });
    expect(await res.json()).toMatchObject({ ok: true, queued: "ZZZZ" });
    expect(request("ZZZZ")).toMatchObject({ status: "queued", count: 1 });
    expect(request("ZZZZ")?.kind).toBeUndefined();
  });
});
