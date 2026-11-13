import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./data", () => ({ loadStockFacts: async () => new Map(), tickerFromId: (id: string) => id.slice(3) }));

import { conditionInputsOf, newestReport } from "./condition-data";
import { emptyFacts } from "./facts";

/** CSCO's releases as tm_earnings_history stores them: the newest one's 10-Q is not filed yet. */
const CSCO = [
  { date: "2026-11-12", period_end: null, periodic_form: null, accepted_at: "2026-11-12T21:06:24+00:00", release: true, url: "https://www.sec.gov/csco-20261112.htm" },
  { date: "2026-08-12", period_end: "2026-07-25", periodic_form: "10-K", release: true },
  { date: "2026-05-13", period_end: "2026-04-25", periodic_form: "10-Q", release: true },
  { date: "2025-08-13", period_end: "2025-07-26", periodic_form: "10-K", release: true },
];

describe("newestReport", () => {
  it("names the fiscal quarter from the year's 10-K, and a release with no filing yet as the quarter after", () => {
    expect(newestReport(CSCO, "2026-11-13")).toEqual({ date: "2026-11-12", quarter: "Q1", acceptedAt: "2026-11-12T21:06:24+00:00", url: "https://www.sec.gov/csco-20261112.htm" });
    expect(newestReport(CSCO, "2026-11-01")?.quarter).toBe("Q4");
    expect(newestReport(CSCO, "2026-06-01")?.quarter).toBe("Q3");
    // AMD: a calendar fiscal year.
    const amd = [
      { date: "2026-11-03", period_end: "2026-09-26", periodic_form: "10-Q" },
      { date: "2026-02-03", period_end: "2025-12-27", periodic_form: "10-K" },
    ];
    expect(newestReport(amd, "2026-11-13")?.quarter).toBe("Q3");
  });

  it("ignores reports after today and rows that are not releases", () => {
    expect(newestReport([{ date: "2026-12-01" }, { date: "2026-09-01", release: false }], "2026-11-13")).toBeNull();
    expect(newestReport(null, "2026-11-13")).toBeNull();
  });
});

describe("conditionInputsOf", () => {
  it("reads the twelve-month figures with their stored time, EPS for the newest report, and the day's facts", () => {
    const facts = { ...emptyFacts("AMD", "US_AMD", "AMD", "2026-11-13"), close: { value: 585.3, day: "2026-11-12" }, pe: 143.2 };
    const inputs = conditionInputsOf(
      "AMD",
      {
        facts: { financials: { revenue: 45_436e6, gross_profit: 25_444e6, operating_income: 8_097e6, revenue_growth_yoy_pct: 41.87 }, financial_depth_updated_at: "2026-11-08T09:54:21Z" },
        reports: [{ date: "2026-11-03", period_end: "2026-09-26", periodic_form: "10-Q", accepted_at: "2026-11-03T21:16:27+00:00" }],
        event: { reported_eps: 1.84, estimated_eps: 1.68, eps_surprise_pct: 9.52, actuals_captured_at: "2026-11-09T20:13:41Z", actuals_source: "nasdaq_calendar" },
      },
      facts,
      "2026-11-13",
    );
    expect(inputs.values.revenue_growth?.value).toBe(41.87);
    expect(inputs.values.gross_margin?.value).toBeCloseTo(56.0, 1);
    expect(inputs.values.operating_margin?.value).toBeCloseTo(17.82, 1);
    expect(inputs.values.eps_surprise).toMatchObject({ value: 9.52, reportDate: "2026-11-03", source: "Nasdaq earnings calendar" });
    expect(inputs.values.price?.value).toBe(585.3);
    expect(inputs.values.pe?.value).toBe(143.2);
    expect(inputs.values.dividend).toBeUndefined();
  });

  it("leaves a figure out rather than guessing it", () => {
    const inputs = conditionInputsOf("XYZ", { facts: { financials: { revenue: 0, gross_profit: 5 } }, reports: null, event: { reported_eps: 1 } }, null, "2026-11-13");
    expect(inputs.values).toEqual({});
  });
});
