import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import { AlertsTab, alertsSignature, type PortfolioAlert } from "./alerts-tab";

// Components written for Next's automatic JSX runtime expect React in scope under vitest.
(globalThis as { React?: typeof React }).React = React;

const alert = (patch: Partial<PortfolioAlert>): PortfolioAlert => ({
  id: "a1",
  ticker: "AAPL",
  instrument_id: "US_AAPL",
  kind: "price_threshold",
  condition: "below",
  target_price: 150,
  created_at: "2026-11-10T15:00:00Z",
  note: null,
  ...patch,
});

function tab(alerts: PortfolioAlert[]) {
  return renderToStaticMarkup(
    <AlertsTab alerts={alerts} signals={[]} positions={[]} isSubscribed={false} emailPrefs={null} example={false} today="2026-11-12" />,
  );
}

describe("AlertsTab with a removed stock's alerts", () => {
  it("lists a paused alert with what happened and a Remove button, and counts it apart", () => {
    const html = tab([alert({ paused: true }), alert({ id: "a2", ticker: "NVDA", instrument_id: "US_NVDA" })]);
    expect(html).toContain("paused, not in your stocks");
    expect(html).toContain("1 active, 1 paused");
    expect(html).toContain("Remove the AAPL alert");
  });

  it("reads as before when nothing is paused", () => {
    const html = tab([alert({})]);
    expect(html).not.toContain("paused");
    expect(html).toContain("1 active");
  });

  it("with no stocks on the list, leaves out the empty zone and flag cards", () => {
    const html = tab([alert({ paused: true })]);
    expect(html).not.toContain("Nothing is in its zone");
    expect(html).not.toContain("No flags on your stocks");
  });

  it("says paused once per stock, beside the ticker, when all its alerts are paused", () => {
    const html = tab([
      alert({ paused: true, pausedReason: "removed" }),
      alert({ id: "a2", kind: "earnings_24h", condition: null, target_price: null, paused: true, pausedReason: "removed" }),
    ]);
    expect(html.match(/paused, not in your stocks/g)).toHaveLength(1);
    expect(html).toContain("Email the day before earnings");
  });

  it("says why per row when a stock's alerts are paused for different reasons, and uses the limit copy", () => {
    const html = tab([
      alert({ paused: true, pausedReason: "plan_limit" }),
      alert({ id: "a2", target_price: 120, paused: false }),
    ]);
    expect(html).toContain("paused: Free keeps five price alerts");
  });

  it("tells a fresher server list apart, so router.refresh() replaces the tab's own copy (bug 16)", () => {
    const before = [alert({})];
    expect(alertsSignature(before)).toBe(alertsSignature([alert({})]));
    expect(alertsSignature([alert({}), alert({ id: "a2" })])).not.toBe(alertsSignature(before));
    expect(alertsSignature([alert({ paused: true, pausedReason: "removed" })])).not.toBe(alertsSignature(before));
  });
});

