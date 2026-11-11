import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ uid: null as string | null, plan: "free" as "anon" | "free" | "pro", calls: [] as unknown[] }));

vi.mock("@/lib/entitlements-server", () => ({
  getViewer: async () => ({ uid: state.uid, signedIn: Boolean(state.uid), plan: state.uid ? state.plan : "anon", covered: [], tracked: [] }),
}));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: async (uid: string) => ({ uid, tracked_stocks: ["US_NVDA"] }) }));
vi.mock("@/lib/thesis-watch/server", () => ({
  checkReasons: async (_viewer: unknown, _doc: unknown, options: unknown) => {
    state.calls.push(options);
    return { checks: {}, locked: ["US_NVDA"], unchecked: [], theses: {} };
  },
}));

import { GET } from "./route";

const get = (query = "") => new NextRequest(`http://localhost/api/thesis/checks${query}`);

beforeEach(() => {
  state.uid = "made-up-uid";
  state.plan = "free";
  state.calls = [];
});

describe("/api/thesis/checks", () => {
  it("needs a signed-in person and computes nothing otherwise", async () => {
    state.uid = null;
    expect((await GET(get())).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("checks every reason, lets a model word changed notes, and is never cached", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checks: {}, locked: ["US_NVDA"], unchecked: [], plan: "free" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(state.calls).toEqual([{ only: undefined, word: true }]);
  });

  it("checks only the ids asked for, and refuses ids that are all malformed", async () => {
    await GET(get("?ids=us_nvda,BAD,US_KO"));
    expect(state.calls).toEqual([{ only: ["US_NVDA", "US_KO"], word: true }]);
    expect((await GET(get("?ids=nope"))).status).toBe(400);
  });
});
