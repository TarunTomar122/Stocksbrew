import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ alerts: new Map<string, Record<string, unknown>>(), tracked: [] as string[] }));

/** tm_alerts: where("uid", "==", x).get(), add, doc(id).update(patch); users: doc(uid).get() with `h.tracked`. */
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
  adminFirestore: {
    collection: (name: string) => {
      if (name === "users") {
        return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ tracked_stocks: [...h.tracked] }) }) }) };
      }
      if (name !== "tm_alerts") throw new Error(`unexpected collection ${name}`);
      return {
        where: (_field: string, _op: string, uid: string) => ({
          get: async () => ({
            docs: [...h.alerts.entries()]
              .filter(([, data]) => data.uid === uid)
              .map(([id, data]) => ({ id, data: () => ({ ...data }) })),
          }),
        }),
        add: async (data: Record<string, unknown>) => {
          const id = `new${h.alerts.size}`;
          h.alerts.set(id, { ...data });
          return { id };
        },
        doc: (id: string) => ({
          update: async (patch: Record<string, unknown>) => {
            h.alerts.set(id, { ...h.alerts.get(id), ...patch });
          },
        }),
      };
    },
  },
}));

import { createStockAlert, listStockAlerts, syncAlertPauses } from "@/lib/stock-alerts";

const alert = (patch: Record<string, unknown>) => ({
  uid: "u1",
  kind: "price_threshold",
  condition: "below",
  target_price: 100,
  active: true,
  triggered: false,
  created_at: "2026-11-01T00:00:00Z",
  ...patch,
});

beforeEach(() => {
  h.tracked = [];
  h.alerts.clear();
  h.alerts.set("a1", alert({ instrument_id: "US_AAPL", ticker: "AAPL" }));
  h.alerts.set("a2", alert({ instrument_id: "US_AAPL", ticker: "AAPL", kind: "earnings_24h" }));
  h.alerts.set("a3", alert({ instrument_id: "US_NVDA", ticker: "NVDA" }));
  h.alerts.set("fired", alert({ instrument_id: "US_AAPL", ticker: "AAPL", active: false, triggered: true }));
  h.alerts.set("other", alert({ uid: "u2", instrument_id: "US_AAPL", ticker: "AAPL" }));
});

describe("syncAlertPauses", () => {
  it("pauses a removed stock's live alerts with an additive field and keeps everything else", async () => {
    await expect(syncAlertPauses("u1", { pause: ["US_AAPL"] })).resolves.toEqual({ paused: 2, resumed: 0 });
    expect(h.alerts.get("a1")).toMatchObject({ active: true, target_price: 100, paused_reason: "removed" });
    expect(h.alerts.get("a2")).toMatchObject({ active: true, paused_reason: "removed" });
    expect(h.alerts.get("a3")?.paused_reason).toBeUndefined();
    expect(h.alerts.get("fired")?.paused_reason).toBeUndefined();
    expect(h.alerts.get("other")?.paused_reason).toBeUndefined();
    expect(h.alerts.size).toBe(5);
  });

  it("keeps a paused alert listed, so the Alerts tab can show it and turn it off", async () => {
    await syncAlertPauses("u1", { pause: ["US_AAPL"] });
    const listed = await listStockAlerts("u1");
    expect(listed.map((row) => [row.id, row.paused])).toEqual(
      expect.arrayContaining([["a1", true], ["a2", true], ["a3", false]]),
    );
  });

  it("resumes only alerts it paused, once the stock is followed again", async () => {
    h.alerts.set("manual", alert({ instrument_id: "US_AAPL", ticker: "AAPL", paused_reason: "something_else" }));
    await syncAlertPauses("u1", { pause: ["US_AAPL"] });
    await expect(syncAlertPauses("u1", { resume: ["US_AAPL"] })).resolves.toEqual({ paused: 0, resumed: 2 });
    expect(h.alerts.get("a1")).toMatchObject({ active: true, paused_reason: null });
    expect(h.alerts.get("manual")?.paused_reason).toBe("something_else");
  });

  it("leaves a stock alone that is tracked again by the time the pause runs (a quick re-add)", async () => {
    h.tracked = ["US_AAPL"];
    await expect(syncAlertPauses("u1", { pause: ["US_AAPL", "US_NVDA"] })).resolves.toEqual({ paused: 1, resumed: 0 });
    expect(h.alerts.get("a1")?.paused_reason).toBeUndefined();
    expect(h.alerts.get("a3")?.paused_reason).toBe("removed");
  });

  it("with createdBefore, pauses only alerts set before then", async () => {
    h.alerts.set("later", alert({ instrument_id: "US_AAPL", ticker: "AAPL", target_price: 90, created_at: "2026-11-12T10:00:00Z" }));
    await syncAlertPauses("u1", { pause: ["US_AAPL"], createdBefore: "2026-11-05T00:00:00Z" });
    expect(h.alerts.get("a1")?.paused_reason).toBe("removed");
    expect(h.alerts.get("later")?.paused_reason).toBeUndefined();
  });

  it("treats a stock in both lists as followed and does nothing for empty lists", async () => {
    await expect(syncAlertPauses("u1", { pause: ["US_AAPL"], resume: ["US_AAPL"] })).resolves.toEqual({ paused: 0, resumed: 0 });
    await expect(syncAlertPauses("u1", {})).resolves.toEqual({ paused: 0, resumed: 0 });
    expect(h.alerts.get("a1")?.paused_reason).toBeUndefined();
  });
});

describe("createStockAlert with paused alerts", () => {
  const base = { uid: "u1", email: "a@example.com", instrumentId: "US_AAPL", ticker: "AAPL" };

  it("turns the paused alert back on instead of saying it already exists", async () => {
    await syncAlertPauses("u1", { pause: ["US_AAPL"] });
    const result = await createStockAlert({ ...base, kind: "price_threshold", condition: "below", targetPrice: 100, plan: "pro" });
    expect(result.alert_id).toBe("a1");
    expect(h.alerts.get("a1")).toMatchObject({ active: true, paused_reason: null });
    expect(h.alerts.size).toBe(5); // nothing new written
    const earnings = await createStockAlert({ ...base, kind: "earnings_24h", plan: "pro" });
    expect(earnings.alert_id).toBe("a2");
  });

  it("still says a live duplicate exists", async () => {
    await expect(createStockAlert({ ...base, kind: "price_threshold", condition: "below", targetPrice: 100, plan: "pro" }))
      .rejects.toMatchObject({ code: "alert_exists" });
  });

  it("does not count paused alerts against the Free price-alert limit", async () => {
    const limit = (await import("@/lib/entitlements")).limitFor("price_alerts", "free");
    h.alerts.clear();
    for (let i = 0; i < limit; i++) {
      h.alerts.set(`p${i}`, alert({ instrument_id: "US_AAPL", ticker: "AAPL", target_price: 50 + i, paused_reason: "removed" }));
    }
    const result = await createStockAlert({ ...base, instrumentId: "US_NVDA", ticker: "NVDA", kind: "price_threshold", condition: "above", targetPrice: 300, plan: "free" });
    expect(result.alert_id).toMatch(/^new/);
    // With every slot live, the next one is refused.
    for (const [id, row] of h.alerts) h.alerts.set(id, { ...row, paused_reason: null });
    await expect(createStockAlert({ ...base, instrumentId: "US_MSFT", ticker: "MSFT", kind: "price_threshold", condition: "above", targetPrice: 500, plan: "free" }))
      .rejects.toMatchObject({ code: "plan_limit" });
  });

  it("turning alerts back on after a re-add keeps the Free price-alert limit", async () => {
    const limit = (await import("@/lib/entitlements")).limitFor("price_alerts", "free");
    h.alerts.clear();
    // limit - 1 live price alerts on other stocks, and two paused ones (plus an earnings toggle) on AAPL.
    for (let i = 0; i < limit - 1; i++) h.alerts.set(`live${i}`, alert({ instrument_id: `US_X${i}`, ticker: `X${i}` }));
    h.alerts.set("old", alert({ instrument_id: "US_AAPL", ticker: "AAPL", target_price: 90, paused_reason: "removed", created_at: "2026-10-01T00:00:00Z" }));
    h.alerts.set("new", alert({ instrument_id: "US_AAPL", ticker: "AAPL", target_price: 80, paused_reason: "removed", created_at: "2026-10-02T00:00:00Z" }));
    h.alerts.set("earn", alert({ instrument_id: "US_AAPL", ticker: "AAPL", kind: "earnings_24h", paused_reason: "removed" }));
    await expect(syncAlertPauses("u1", { resume: ["US_AAPL"], plan: "free" })).resolves.toMatchObject({ resumed: 2 });
    expect(h.alerts.get("old")?.paused_reason).toBeNull(); // oldest first fills the last slot
    expect(h.alerts.get("earn")?.paused_reason).toBeNull(); // not a price alert
    expect(h.alerts.get("new")?.paused_reason).toBe("plan_limit");
    // Pro has no limit: the same call resumes it.
    await syncAlertPauses("u1", { resume: ["US_AAPL"], plan: "pro" });
    expect(h.alerts.get("new")?.paused_reason).toBeNull();
  });
});

