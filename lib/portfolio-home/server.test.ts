import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));

import { ownSourcesKey } from "@/lib/portfolio-home/server";
import type { UserDoc } from "@/lib/watchlist";

const doc = {
  uid: "alice",
  tracked_stocks: ["US_AAPL", "US_MSFT"],
  watchlist_positions: { US_AAPL: "holding", US_MSFT: "holding" },
  watchlist_holdings: { US_AAPL: { quantity: 10 } },
} as unknown as UserDoc;
const free = { plan: "free" as const, covered: ["US_AAPL"] };

describe("ownSourcesKey", () => {
  it("is the same for the same inputs on the same day", () => {
    expect(ownSourcesKey(doc, free, "2026-11-11")).toBe(ownSourcesKey({ ...doc } as UserDoc, { ...free }, "2026-11-11"));
  });

  it("changes with any edit to the user doc, the plan, the covered stocks or the day", () => {
    const base = ownSourcesKey(doc, free, "2026-11-11");
    const edited = { ...doc, watchlist_holdings: { US_AAPL: { quantity: 11 } } } as unknown as UserDoc;
    expect(ownSourcesKey(edited, free, "2026-11-11")).not.toBe(base);
    expect(ownSourcesKey(doc, { plan: "pro", covered: ["US_AAPL"] }, "2026-11-11")).not.toBe(base);
    expect(ownSourcesKey(doc, { plan: "free", covered: ["US_MSFT"] }, "2026-11-11")).not.toBe(base);
    expect(ownSourcesKey(doc, free, "2026-11-12")).not.toBe(base);
  });

  it("differs between two people with otherwise identical docs (the doc carries the uid)", () => {
    const bob = { ...doc, uid: "bob" } as UserDoc;
    expect(ownSourcesKey(bob, free, "2026-11-11")).not.toBe(ownSourcesKey(doc, free, "2026-11-11"));
  });
});
