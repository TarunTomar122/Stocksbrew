import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  alerts: "ok" as "ok" | "fail",
  quote: true,
  call: "Add" as string | null,
}));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
  adminFirestore: {
    collection: (name: string) => ({
      where: () => ({
        get: async () => {
          if (name === "tm_alerts" && state.alerts === "fail") throw new Error("store down");
          return { docs: [] };
        },
      }),
      doc: () => ({ get: async () => ({ exists: state.call !== null, data: () => ({ call: state.call }) }) }),
    }),
  },
}));
vi.mock("@/lib/firestore", () => ({
  getLatestPriceQuotes: async (ids: string[]) =>
    new Map(state.quote ? ids.map((id) => [id, { quote: { current: 150, day_change_pct: -1 }, captured_at: "2026-11-12T20:00:00Z" }]) : []),
}));

const { freshStaleReason } = await import("./proposals-server");
const { newProposal } = await import("./proposals");
import type { ProposalAction } from "./proposals";

const NOW = new Date("2026-11-12T18:00:00.000Z");

function proposal(action: ProposalAction) {
  return newProposal(
    "u1",
    {
      kind: "call_change",
      ticker: "NVDA",
      instrument_id: "US_NVDA",
      event: { key: JSON.stringify(action), kind: "call_change", at: "2026-11-11", refs: [] },
      idea: "i",
      title: "t",
      why: ["w"],
      does: "d",
      read: [],
      figures: [],
      action,
      priority: 1,
    },
    NOW,
  );
}

const alertAction: ProposalAction = { type: "alert_price", ticker: "NVDA", instrument_id: "US_NVDA", condition: "below", price: 142, replaces: null };

describe("freshStaleReason: the check right before an accept", () => {
  it("passes when the alerts and the price were read and still fit", async () => {
    Object.assign(state, { alerts: "ok", quote: true });
    expect(await freshStaleReason("u1", proposal(alertAction), NOW)).toBeNull();
  });

  it("says stale when the price is already past the level", async () => {
    Object.assign(state, { alerts: "ok", quote: true });
    expect(await freshStaleReason("u1", proposal({ ...alertAction, price: 155 }), NOW)).toBe("price_past_level");
  });

  it("says unverified, never null, when the alerts or the price could not be read", async () => {
    Object.assign(state, { alerts: "fail", quote: true });
    expect(await freshStaleReason("u1", proposal(alertAction), NOW)).toBe("unverified");
    Object.assign(state, { alerts: "ok", quote: false });
    expect(await freshStaleReason("u1", proposal(alertAction), NOW)).toBe("unverified");
  });

  it("checks a practice ticket against our call now", async () => {
    Object.assign(state, { call: "Add" });
    expect(await freshStaleReason("u1", proposal({ type: "practice_ticket", ticker: "NVDA", side: "buy" }), NOW)).toBeNull();
    Object.assign(state, { call: "Hold" });
    expect(await freshStaleReason("u1", proposal({ type: "practice_ticket", ticker: "NVDA", side: "buy" }), NOW)).toBe("call_changed");
  });
});
