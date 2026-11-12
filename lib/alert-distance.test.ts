import { describe, expect, it } from "vitest";

import { alertDistance, groupAlerts } from "@/lib/alert-distance";

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

});

describe("groupAlerts", () => {
  const prices: Record<string, number> = { LLY: 1437.76, INTC: 62.51, TSM: 413.27 };
  const alert = (id: string, ticker: string, condition: "above" | "below" | null, target: number | null, kind = "price_threshold", created_at: string | null = null) => ({
    id,
    ticker,
    kind,
    condition,
    target_price: target,
    created_at,
  });

  it("puts one stock's alerts together, newest first, and orders stocks by their newest alert (owner, Nov 12)", () => {
    // The owner's list that day, in the order the server sent it: INTC (set Jun 25) led and META's Aug 26 alert sat last.
    const alerts = [
      alert("intc", "INTC", "below", 130, "price_threshold", "2026-06-25T14:00:00Z"),
      alert("avgo1", "AVGO", "below", 400, "price_threshold", "2026-05-21T14:00:00Z"),
      alert("avgo2", "AVGO", "below", 406, "price_threshold", "2026-05-15T14:00:00Z"),
      alert("googl", "GOOGL", "below", 370, "price_threshold", "2026-05-06T14:00:00Z"),
      alert("tsm", "TSM", "above", 420, "price_threshold", "2026-05-13T14:00:00Z"),
      alert("meta1", "META", "below", 580, "price_threshold", "2026-05-06T15:00:00Z"),
      alert("meta2", "META", "below", 559.02, "price_threshold", "2026-08-26T14:00:00Z"),
      alert("ed", "ED", null, null, "brief_ready", null),
    ];
    const groups = groupAlerts(alerts, (item) => prices[item.ticker]);
    expect(groups.map((group) => group.ticker)).toEqual(["META", "INTC", "AVGO", "TSM", "GOOGL", "ED"]);
    expect(groups[0]!.alerts.map((item) => item.alert.id)).toEqual(["meta2", "meta1"]);
    expect(groups[2]!.alerts.map((item) => item.alert.id)).toEqual(["avgo1", "avgo2"]);
    // Each alert still says how far it is from firing.
    expect(groups[1]!.alerts[0]!.distance).toEqual({ met: true, condition: "below" });
  });

  it("puts an alert with no date after the dated ones, and keeps the incoming order on a tie", () => {
    const groups = groupAlerts(
      [
        alert("old", "LLY", "below", 1065.9, "price_threshold", null),
        alert("new", "LLY", "below", 1125.11, "price_threshold", "2026-11-12T15:00:00Z"),
        alert("x", "TSM", "above", 420, "price_threshold", "2026-11-12T15:00:00Z"),
      ],
      (item) => prices[item.ticker],
    );
    expect(groups.map((group) => [group.ticker, group.alerts.map((item) => item.alert.id)])).toEqual([
      ["LLY", ["new", "old"]],
      ["TSM", ["x"]],
    ]);
  });

  it("keeps the incoming order for alerts with nothing to measure", () => {
    const groups = groupAlerts([alert("a", "ED", null, null, "brief_ready"), alert("b", "SCHW", null, null, "earnings_24h"), alert("c", "ED", null, null, "anomaly")], () => null);
    expect(groups.map((group) => [group.ticker, group.alerts.map((item) => item.alert.id)])).toEqual([
      ["ED", ["a", "c"]],
      ["SCHW", ["b"]],
    ]);
  });
});
