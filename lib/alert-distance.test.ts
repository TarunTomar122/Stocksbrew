import { describe, expect, it } from "vitest";

import { alertDistance, closeness, groupAlerts } from "@/lib/alert-distance";

describe("alertDistance", () => {
  it("says a below alert is already met once the price is under its level (INTC below $130 at $62.51)", () => {
    expect(alertDistance("below", 130, 62.51)).toEqual({ met: true, condition: "below" });
    expect(alertDistance("below", 130, 130)).toEqual({ met: true, condition: "below" });
  });

  it("says an above alert is already met once the price is over its level", () => {
    expect(alertDistance("above", 375, 552.96)).toEqual({ met: true, condition: "above" });
  });

  it("gives the signed move still needed when the condition is not met", () => {
    const fall = alertDistance("below", 1065.9, 1437.76);
    expect(fall?.met).toBe(false);
    expect(fall && !fall.met ? fall.pct : null).toBeCloseTo(-25.86, 1);
    const rise = alertDistance("above", 420, 413.27);
    expect(rise && !rise.met ? rise.pct : null).toBeCloseTo(1.63, 1);
  });

  it("returns null with nothing to compare", () => {
    expect(alertDistance(null, 130, 62)).toBeNull();
    expect(alertDistance("below", null, 62)).toBeNull();
    expect(alertDistance("below", 130, null)).toBeNull();
    expect(alertDistance("below", 130, 0)).toBeNull();
  });

  it("ranks met alerts closest, then by the move left", () => {
    expect(closeness({ met: true, condition: "below" })).toBeLessThan(closeness({ met: false, pct: 0.1 }));
    expect(closeness({ met: false, pct: -5 })).toBeLessThan(closeness({ met: false, pct: 8 }));
    expect(closeness(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("groupAlerts", () => {
  const prices: Record<string, number> = { LLY: 1437.76, INTC: 62.51, TSM: 413.27 };
  const alert = (id: string, ticker: string, condition: "above" | "below" | null, target: number | null, kind = "price_threshold") => ({
    id,
    ticker,
    kind,
    condition,
    target_price: target,
  });

  it("puts one stock's alerts together, closest first, and orders stocks by their closest alert", () => {
    const alerts = [
      alert("1", "LLY", "below", 1065.9),
      alert("2", "LLY", "below", 1125.11),
      alert("3", "ED", null, null, "brief_ready"),
      alert("4", "INTC", "below", 130),
      alert("5", "TSM", "above", 420),
      alert("6", "TSM", "above", 500),
    ];
    const groups = groupAlerts(alerts, (item) => prices[item.ticker]);
    expect(groups.map((group) => group.ticker)).toEqual(["INTC", "TSM", "LLY", "ED"]);
    expect(groups[0]!.alerts[0]!.distance).toEqual({ met: true, condition: "below" });
    expect(groups[1]!.alerts.map((item) => item.alert.id)).toEqual(["5", "6"]);
    expect(groups[2]!.alerts.map((item) => item.alert.id)).toEqual(["2", "1"]);
  });

  it("keeps the incoming order for alerts with nothing to measure", () => {
    const groups = groupAlerts([alert("a", "ED", null, null, "brief_ready"), alert("b", "SCHW", null, null, "earnings_24h"), alert("c", "ED", null, null, "anomaly")], () => null);
    expect(groups.map((group) => [group.ticker, group.alerts.map((item) => item.alert.id)])).toEqual([
      ["ED", ["a", "c"]],
      ["SCHW", ["b"]],
    ]);
  });
});
