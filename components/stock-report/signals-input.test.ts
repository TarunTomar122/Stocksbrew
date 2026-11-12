import { describe, expect, it } from "vitest";

import { stockSignalsInput } from "./signals-input";
import { NO_EXTRAS } from "./section-data";
import type { ReportData } from "./types";

/** Only what the signals read; the rest of the page's data is not needed here. */
function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    stock: { ticker: "JPM", sector: "Financial Services", industry: "Banks - Diversified", price: 344, instrument_id: "US_JPM" },
    currency: "$",
    readState: "ready",
    read: null,
    facts: { financials: { revenue_growth_yoy_pct: 14.1 } },
    fundamentals: null,
    intelPro: null,
    multiple: null,
    ...overrides,
  } as unknown as ReportData;
}

const extras = { ...NO_EXTRAS, ownership: { funds: null, insiders: null } };

describe("stockSignalsInput", () => {
  it("takes the latest report that has happened, and leaves out figures it does not have yet", () => {
    const input = stockSignalsInput({
      data: data(),
      extras,
      today: "2026-11-12",
      closes: null,
      calendar: [
        { event_date: "2026-07-14", eps_estimate: 5.4, reported_eps: 6.14 },
        // The newest report has no reported EPS on file yet: it is still the last report, with nothing to judge.
        { event_date: "2026-10-13", eps_estimate: 5.94, reported_eps: null },
        // Not yet: a later report has not happened.
        { event_date: "2026-11-19", eps_estimate: 1 },
      ],
    });
    expect(input.lastReport).toEqual({ date: "2026-10-13", actual: null, estimate: null });
  });

  it("judges a report from today once its EPS is in", () => {
    const input = stockSignalsInput({
      data: data(),
      extras,
      today: "2026-11-12",
      closes: null,
      calendar: [
        { event_date: "2026-08-13", eps_estimate: 1, reported_eps: 1.5 },
        { event_date: "2026-11-12", time: "bmo", eps_estimate: 2, reported_eps: 2.2 },
      ],
    });
    expect(input.lastReport).toEqual({ date: "2026-11-12", actual: 2.2, estimate: 2 });
  });

  it("leaves the earnings signals empty while today's results are not in, never showing last quarter as the latest", () => {
    const spy = [
      { date: "2026-08-13", close: 500 },
      { date: "2026-08-14", close: 505 },
    ];
    const stock = [
      { date: "2026-08-13", close: 100 },
      { date: "2026-08-14", close: 110 },
    ];
    const input = stockSignalsInput({
      data: data(),
      extras,
      today: "2026-11-12",
      closes: { JPM: stock, SPY: spy },
      calendar: [
        { event_date: "2026-08-13", time: "amc", eps_estimate: 1, reported_eps: 1.5 },
        { event_date: "2026-11-12", time: "amc", eps_estimate: 2 },
      ],
    });
    expect(input.lastReport).toEqual({ date: "2026-11-12", actual: null, estimate: null });
    expect(input.reaction).toBeNull();
  });

  it("drops both figures when the stored surprise disagrees with them", () => {
    const input = stockSignalsInput({
      data: data(),
      extras,
      today: "2026-11-12",
      closes: null,
      calendar: [{ event_date: "2026-10-13", estimated_eps: 5.81, eps_estimate: 4.74, reported_eps: 5.75, eps_surprise: 0.15 }],
    });
    expect(input.lastReport).toEqual({ date: "2026-10-13", actual: null, estimate: null });
  });

  it("passes the stock's currency, the twelve-month revenue growth and the bank flag", () => {
    const input = stockSignalsInput({ data: data({ currency: "₹" }), extras, today: "2026-11-12", closes: null, calendar: [] });
    expect(input.currency).toBe("₹");
    expect(input.ttmRevenueGrowth).toBe(14.1);
    expect(input.bank).toBe(true);
  });
});
