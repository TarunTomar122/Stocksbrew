import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  MARKET_DROP_PCT,
  MARKET_DROP_SESSIONS,
  MIN_HOLD_SESSIONS,
  MOVE_SIGMA,
  MOVE_WEEK_SESSIONS,
  VOL_SESSIONS,
  addSessions,
  buildCallEvidence,
  dailySwing,
  growthBars,
  reportBehind,
  type CallEvidenceInput,
  type DailyClose,
} from "./call-evidence";

/** Weekday dates ending on `last`, oldest first. */
function weekdays(last: string, count: number): string[] {
  const out: string[] = [];
  const date = new Date(`${last}T00:00:00Z`);
  while (out.length < count) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.unshift(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return out;
}

/** A stock that wobbles ±1% a day against a flat market, then does `tail` over its last days. */
function closes(last: string, count: number, tail: number[] = []): { series: DailyClose[]; benchmark: DailyClose[] } {
  const dates = weekdays(last, count);
  const series: DailyClose[] = [];
  let price = 100;
  dates.forEach((date, index) => {
    const fromEnd = dates.length - index;
    const move = fromEnd <= tail.length ? tail[tail.length - fromEnd]! : index % 2 === 0 ? 0.01 : -0.01;
    if (index > 0) price *= 1 + move;
    series.push({ date, close: Math.round(price * 10000) / 10000 });
  });
  return { series, benchmark: dates.map((date) => ({ date, close: 500 })) };
}

function base(overrides: Partial<CallEvidenceInput> = {}): CallEvidenceInput {
  const prices = closes("2026-11-10", 80);
  return {
    ticker: "NVDA",
    call: "Hold",
    today: "2026-11-11",
    sales: {
      revenue: 302_970_000_000,
      growthPct: 83.38,
      history: [
        { period: "TTM", revenue: 302_970_000_000 },
        { period: "FY 2026", revenue: 215_938_000_000 },
        { period: "FY 2025", revenue: 130_497_000_000 },
      ],
      capturedAt: "2026-11-08T08:47:18Z",
    },
    reports: [
      { date: "2026-08-26", periodEnd: "2026-07-26", form: "10-Q" },
      { date: "2026-05-20", periodEnd: "2026-04-26", form: "10-Q" },
    ],
    calendar: [{ event_date: "2026-11-17", eps_estimate: 2.49, source: "nasdaq_calendar" }],
    nextReport: { date: "2026-11-17", epsEstimate: 2.49 },
    series: prices.series,
    benchmark: prices.benchmark,
    priceSource: "Yahoo Finance",
    valuation: null,
    dividend: null,
    steady: null,
    ...overrides,
  };
}

describe("rule parity", () => {
  it("uses the same numbers as backend/call_stability.py", () => {
    const source = readFileSync(new URL("../backend/call_stability.py", import.meta.url), "utf8");
    const value = (name: string) => Number(new RegExp(`${name}: (?:int|float) = (-?[\\d.]+)`).exec(source)?.[1]);
    expect(value("move_sigma")).toBe(MOVE_SIGMA);
    expect(value("vol_sessions")).toBe(VOL_SESSIONS);
    expect(value("market_drop_pct")).toBe(-MARKET_DROP_PCT);
    expect(value("market_drop_sessions")).toBe(MARKET_DROP_SESSIONS);
    expect(value("min_hold_sessions")).toBe(MIN_HOLD_SESSIONS);
    expect(/move_days: tuple\[int, \.\.\.\] = \(1, (\d+)\)/.exec(source)?.[1]).toBe(String(MOVE_WEEK_SESSIONS));
  });
});

describe("dailySwing", () => {
  it("is the standard deviation of the daily return against the market", () => {
    const { series, benchmark } = closes("2026-11-10", 80);
    expect(dailySwing(series, benchmark)).toBeCloseTo(0.01, 3);
  });

  it("is null with too little history or no market", () => {
    const { series, benchmark } = closes("2026-11-10", 15);
    expect(dailySwing(series, benchmark)).toBeNull();
    expect(dailySwing(series, null)).toBeNull();
  });
});

describe("reportBehind", () => {
  const reports = [
    { date: "2026-08-26", periodEnd: "2026-07-26", form: "10-Q" },
    { date: "2026-11-06", periodEnd: "2026-10-26", form: "10-Q" },
  ];

  it("skips a report the facts may not include yet", () => {
    expect(reportBehind(reports, "2026-11-08T08:00:00Z")?.date).toBe("2026-08-26");
    expect(reportBehind(reports, "2026-11-10T08:00:00Z")?.date).toBe("2026-11-06");
  });

  it("gives nothing when the last report is so old one must be missing, or the fetch day is unknown", () => {
    expect(reportBehind([reports[0]!], "2027-02-01T00:00:00Z")).toBeNull();
    expect(reportBehind(reports, null)).toBeNull();
  });
});

describe("growthBars", () => {
  it("holds the pace at last year's growth when that was at least half of today's, and halves for a slowdown", () => {
    expect(growthBars(83.38, 65.47)).toEqual({ up: 65, down: 42, recover: null });
  });

  it("holds today's pace when growth is slowing or last year was far slower", () => {
    expect(growthBars(83, 114)).toEqual({ up: 83, down: 42, recover: 114 });
    expect(growthBars(14.06, 0.88)).toEqual({ up: 14, down: 7, recover: null });
  });

  it("only counts shrinking sales for a slow grower, and growth again for a shrinking one", () => {
    expect(growthBars(4, null)).toEqual({ up: 4, down: 0, recover: null });
    expect(growthBars(-6, -2)).toEqual({ up: null, down: null, recover: 0 });
    expect(growthBars(null, 10)).toEqual({ up: null, down: null, recover: null });
  });

  it("never puts the slowdown bar above the bar to buy more", () => {
    const bars = growthBars(21, 10.6);
    expect(bars.up).toBe(10);
    expect(bars.down).toBe(10);
  });
});

describe("buildCallEvidence", () => {
  it("dates the sales figure by the report behind it and compares it with the last full year", () => {
    const { evidence } = buildCallEvidence(base());
    expect(evidence[0]).toEqual({
      id: "sales",
      text: "NVDA's sales rose 83% over the last four quarters, to $303B, faster than the 65% of fiscal 2026.",
      source: "From the 10-Q for the quarter to Jul\u00a026, reported Aug\u00a026",
    });
  });

  it("compares with the year before when the last report was the annual one", () => {
    const sales = { revenue: 479_000_000_000, growthPct: 15, history: [{ period: "FY 2026", revenue: 479_000_000_000 }, { period: "FY 2025", revenue: 416_000_000_000 }, { period: "FY 2024", revenue: 391_000_000_000 }], capturedAt: "2026-11-08T00:00:00Z" };
    const reports = [{ date: "2026-11-02", periodEnd: "2026-09-26", form: "10-K" }];
    const { evidence } = buildCallEvidence(base({ ticker: "AAPL", sales, reports }));
    expect(evidence[0]).toEqual({
      id: "sales",
      text: "AAPL's sales rose 15% over the last four quarters, to $479B, faster than the 6.4% of fiscal 2025.",
      source: "From the 10-K for the year to Sep\u00a026, reported Nov\u00a02",
    });
  });

  it("names a big five-session move against the market in trading days, with the closes it comes from", () => {
    const prices = closes("2026-11-10", 80, [-0.04, -0.04, -0.05, -0.03, -0.04]);
    const { evidence } = buildCallEvidence(base({ series: prices.series, benchmark: prices.benchmark }));
    const move = evidence.find((line) => line.id === "move");
    // Five sessions, not "the week": the weekly memo's week runs from Friday's close and can show a different figure.
    expect(move?.text).toBe("NVDA fell 18% in the five trading days to Nov\u00a010, while the S&P 500 was flat.");
    expect(move?.source).toBe("Yahoo Finance daily closes to Nov\u00a010");
  });

  it("says nothing about the price when the stock moved as usual and sits near its high", () => {
    const { evidence } = buildCallEvidence(base());
    expect(evidence.map((line) => line.id)).toEqual(["sales"]);
  });

  it("gives Keep a measurable way up and down, tied to the report and the rule's move", () => {
    const { conditions } = buildCallEvidence(base());
    expect(conditions).toEqual([
      "The Nov\u00a017 report could raise the call if it beats the $2.49 a share analysts expect and sales growth stays above 65%.",
      "It could lower the call if it misses the $2.49 forecast or shows sales growth below 42%.",
      // 4 x 1% daily swing = 4% in a day; x sqrt(5) = 9% in a week.
      "So could a day in which NVDA falls 4% more than the S&P 500, a week in which it falls 9% more, or a week in which the S&P 500 falls 4%.",
    ]);
    // Never a second call beside this one.
    expect(conditions.join(" ")).not.toMatch(/buy more|sell some|keep/i);
  });

  it("moves Buy more only one step, to Keep", () => {
    const { conditions } = buildCallEvidence(base({ call: "Add" }));
    expect(conditions[0]).toBe("The Nov\u00a017 report could lower the call if it misses the $2.49 forecast or shows sales growth below 42%.");
    expect(conditions.join(" ")).not.toMatch(/raise|sell some|buy more/i);
  });

  it("moves Sell some only up to Keep, and never on a fall", () => {
    const { conditions } = buildCallEvidence(
      base({ call: "Trim", sales: { ...base().sales!, growthPct: -6, history: [] } }),
    );
    expect(conditions).toEqual(["The Nov\u00a017 report could raise the call if it beats the $2.49 a share analysts expect and sales start growing again."]);
  });

  it("leaves a line out rather than write it without a number", () => {
    const { evidence, conditions } = buildCallEvidence(
      base({ sales: null, nextReport: null, calendar: [], series: null, benchmark: null }),
    );
    expect(evidence).toEqual([]);
    // Without prices there is no move bar; the market drop alone stands.
    expect(conditions).toEqual([]);
  });

  it("uses only the market drop and the stock's own move when there is no report to name", () => {
    const { conditions } = buildCallEvidence(base({ sales: null, nextReport: null, calendar: [] }));
    expect(conditions).toEqual([
      "A day in which NVDA falls 4% more than the S&P 500, a week in which it falls 9% more, or a week in which the S&P 500 falls 4% could lower the call.",
    ]);
  });

  it("says how long the steady call stands, and keeps a call that just went up from falling back on a move", () => {
    const { conditions } = buildCallEvidence(base({ steady: { since: "2026-11-09", lastStep: 1 } }));
    expect(conditions[conditions.length - 1]).toBe("Short of that, the call stands until at least Nov\u00a025.");
    expect(conditions.join(" ")).not.toMatch(/So could/);
  });

  it("adds the last report's earnings against the forecast, but only when the figures agree", () => {
    const calendar = [
      { event_date: "2026-10-13", eps_estimate: 5.94, estimated_eps: 5.94, reported_eps: 5.75, eps_surprise: -0.19, source: "nasdaq_calendar", actuals_source: "nasdaq_calendar" },
    ];
    const reports = [{ date: "2026-10-13", periodEnd: "2026-09-30", form: "10-Q" }];
    const ok = buildCallEvidence(base({ ticker: "JPM", calendar, reports, nextReport: null }));
    expect(ok.evidence.find((line) => line.id === "eps")).toEqual({
      id: "eps",
      text: "In its Oct\u00a013 report, JPM's earnings per share of $5.75 missed the $5.94 analysts expected.",
      source: "Nasdaq earnings calendar, Oct\u00a013",
    });
    const mixed = buildCallEvidence(base({ ticker: "JPM", calendar: [{ ...calendar[0]!, eps_estimate: 4.74, estimated_eps: 5.81, eps_surprise: 0.15 }], reports, nextReport: null }));
    expect(mixed.evidence.find((line) => line.id === "eps")).toBeUndefined();
  });

  it("says a loss as money lost, not as earnings of a loss", () => {
    const calendar = [{ event_date: "2026-11-06", eps_estimate: -0.26, estimated_eps: -0.26, reported_eps: -0.22, eps_surprise: 0.04, source: "nasdaq_calendar" }];
    const { evidence } = buildCallEvidence(base({ ticker: "OKLO", sales: null, calendar, reports: [], nextReport: null }));
    expect(evidence[0]?.text).toBe("In its Nov\u00a06 report, OKLO lost $0.22 a share, better than the $0.26 loss analysts expected.");
  });

  it("says what the last year did when sales fell, instead of faster or slower", () => {
    const history = [{ period: "FY 2025", revenue: 92 }, { period: "FY 2024", revenue: 100 }];
    const shrinking = buildCallEvidence(base({ ticker: "INTC", sales: { revenue: 90e9, growthPct: -2, history: history.map((row) => ({ ...row, revenue: row.revenue * 1e9 })), capturedAt: "2026-11-08T00:00:00Z" } }));
    expect(shrinking.evidence[0]?.text).toBe("INTC's sales fell 2% over the last four quarters, to $90.0B, after falling 8% in fiscal 2025.");
    const turned = buildCallEvidence(base({ ticker: "INTC", sales: { revenue: 90e9, growthPct: -6, history: [{ period: "FY 2025", revenue: 110e9 }, { period: "FY 2024", revenue: 100e9 }], capturedAt: "2026-11-08T00:00:00Z" } }));
    expect(turned.evidence[0]?.text).toBe("INTC's sales fell 6% over the last four quarters, to $90.0B, after growing 10% in fiscal 2025.");
  });

  it("names the provider the earnings figures came from", () => {
    const calendar = [{ event_date: "2026-11-06", estimated_eps: 1.1, reported_eps: 1.2, eps_surprise: 0.1, actuals_source: "yfinance" }];
    const { evidence } = buildCallEvidence(base({ ticker: "ACME", sales: null, calendar, reports: [], nextReport: null }));
    expect(evidence.find((line) => line.id === "eps")?.source).toBe("Yahoo Finance earnings data, Nov\u00a06");
  });

  it("finds the high within the past calendar year only", () => {
    // With gaps in the closes (holidays, a missing week), the last 252 closes reach back past Nov 10, 2025; a spike
    // from before then must not be named as the high.
    const prices = closes("2026-11-10", 300, Array.from({ length: 200 }, () => -0.004));
    const keep = (_: unknown, index: number) => index < 60 || index >= 100;
    const series = prices.series.map((point, index) => (index === 12 ? { ...point, close: 1000 } : point)).filter(keep);
    // The market moves with the stock, so the fall reads as the high, not as a move against the market.
    const { evidence } = buildCallEvidence(base({ sales: null, series, benchmark: prices.series.filter(keep) }));
    const high = evidence.find((line) => line.id === "high");
    expect(high?.text).toMatch(/below its high of/);
    expect(high?.text).not.toContain("$1000.00");
  });

  it("names the year of a high from last year", () => {
    const prices = closes("2026-11-10", 260, Array.from({ length: 200 }, () => -0.004));
    const { evidence } = buildCallEvidence(base({ sales: null, series: prices.series, benchmark: prices.series.map((point) => ({ ...point })) }));
    expect(evidence[0]?.id).toBe("high");
    expect(evidence[0]?.text).toMatch(/below its high of \$[\d.]+ on [A-Z][a-z]{2}\u00a0\d+, 2025\.$/);
  });

  it("states a long dividend record over today's price", () => {
    const { evidence } = buildCallEvidence(
      base({ ticker: "JPM", sales: null, dividend: { annual: 6.6, price: 342.11, growthYears: 15, capturedAt: "2026-11-08T08:41:01Z" } }),
    );
    expect(evidence).toEqual([
      {
        id: "dividend",
        text: "JPM pays $6.60 a share a year, 1.9% of today's price, and has raised its dividend 15 years in a row.",
        source: "Dividend history, as of Nov\u00a08",
      },
    ]);
  });

  it("leaves out a P/E median whose window ended long ago", () => {
    const valuation = { pe: 29.1, medianPe: 32.9, from: "2026-04-23", to: "2026-07-23", days: 48 };
    expect(buildCallEvidence(base({ sales: null, valuation })).evidence).toEqual([]);
    const fresh = buildCallEvidence(base({ sales: null, valuation: { ...valuation, from: "2026-08-01", to: "2026-11-07" } }));
    expect(fresh.evidence[0]?.text).toBe("At 29 times its past year's earnings, NVDA is cheaper than its median of 33 from Aug\u00a01 to Nov\u00a07.");
  });

  it("gives no conditions without a call", () => {
    expect(buildCallEvidence(base({ call: null })).conditions).toEqual([]);
  });
});

describe("addSessions", () => {
  it("counts weekdays", () => {
    expect(addSessions("2026-11-09", 12)).toBe("2026-11-25");
    expect(addSessions("2026-11-13", 1)).toBe("2026-11-16");
  });
});
