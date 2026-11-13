import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ uid: null as string | null, doc: null as Record<string, unknown> | null }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid } : null) }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: async () => state.doc }));

const { ThesisEntry } = await import("./thesis-entry");

describe("My stocks' Write a thesis", () => {
  it("shows only for a signed-in person with two or more holdings", async () => {
    expect(await ThesisEntry()).toBeNull();
    state.uid = "u1";
    state.doc = { tracked_stocks: ["US_NVDA", "US_MU"], watchlist_positions: { US_NVDA: "holding", US_MU: "watchlist" } };
    expect(await ThesisEntry()).toBeNull();
    state.doc = { tracked_stocks: ["US_NVDA", "US_MU"], watchlist_positions: { US_NVDA: "holding", US_MU: "holding" } };
    expect(await ThesisEntry()).not.toBeNull();
  });
});
