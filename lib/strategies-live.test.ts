import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

const { liveHasReturn } = await import("./strategies");

describe("liveHasReturn", () => {
  it("waits for a close after the fill day: the fill day alone is only the cost of buying in", () => {
    // Nov 11: all 12 strategies read −0.10% after 1 session, which is the 10 bps entry cost, not a return.
    expect(liveHasReturn({ sessions: 1, strategy_return: -0.001 })).toBe(false);
    expect(liveHasReturn({ sessions: 0, strategy_return: null })).toBe(false);
    expect(liveHasReturn({ sessions: 2, strategy_return: 0.0042 })).toBe(true);
    expect(liveHasReturn({ sessions: 3, strategy_return: Number.NaN })).toBe(false);
  });
});
