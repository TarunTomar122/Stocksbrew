import { afterEach, describe, expect, it, vi } from "vitest";

import { createStockAlert, fetchStockAlerts } from "@/lib/create-alert";

afterEach(() => vi.unstubAllGlobals());

describe("fetchStockAlerts", () => {
  it("leaves out paused alerts, so the stock page's switches show them as off", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      alerts: [
        { id: "a1", kind: "price_threshold", condition: "below", target_price: 100, paused: true },
        { id: "a2", kind: "earnings_24h", paused: false },
      ],
    }), { status: 200 })));
    await expect(fetchStockAlerts("US_AAPL")).resolves.toEqual([{ id: "a2", kind: "earnings_24h", paused: false }]);
  });
});

describe("createStockAlert's 409s", () => {
  const payload = { instrument_id: "US_AAPL", ticker: "AAPL", kind: "price_threshold" as const, condition: "below" as const, target_price: 100 };
  const answer = (body: Record<string, unknown>) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 409 })));

  it("calls only a duplicate 'already set'", async () => {
    answer({ error: "This alert already exists.", code: "alert_exists" });
    await expect(createStockAlert(payload)).resolves.toEqual({ ok: true, alreadyExists: true });
  });

  it("shows the Free limit as an error, so the alert stays off", async () => {
    answer({ error: "Free keeps 5 price alerts and all 5 are set.", code: "plan_limit", feature: "price_alerts", limit: 5 });
    await expect(createStockAlert(payload)).resolves.toEqual({ ok: false, error: "Free keeps 5 price alerts and all 5 are set.", code: "plan_limit" });
  });
});
