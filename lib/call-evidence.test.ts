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
  checkCardText,
  conditionFigure,
  conditionWords,
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
      text: "NVDA's sales rose 83% over the last four quarters, to $303B, faster than its 65% growth in fiscal 2026.",
      source: "From the 10-Q for the quarter to Jul\u00a026, reported Aug\u00a026",
      // The fact card (owner, Nov 12: cards, not bullets): built from the numbers, the two growth rates as the bars, and
      // no line beside the bars (judges, ship 85).
      card: {
        figure: "+83%",
        tone: "up",
        label: "sales over four quarters",
        line: null,
        compare: [
          { label: "Past four quarters", value: 83.38, display: "+83%" },
          { label: "Fiscal 2026", value: expect.closeTo(65.47, 1), display: "+65%" },
        ],
        compareKind: "change",
      },
    });
  });

  it("gives every fact card a figure, a short label and at most one line within the word budget", () => {
    const prices = closes("2026-11-10", 260, Array.from({ length: 200 }, () => -0.004));
    const calendar = [{ event_date: "2026-10-13", eps_estimate: 5.94, estimated_eps: 5.94, reported_eps: 6.1, eps_surprise: 0.16, source: "nasdaq_calendar", actuals_source: "nasdaq_calendar" }];
    const { evidence } = buildCallEvidence(
      base({
        series: prices.series,
        benchmark: prices.series.map((point) => ({ ...point })),
        calendar,
        reports: [{ date: "2026-10-13", periodEnd: "2026-09-30", form: "10-Q" }],
        sales: { ...base().sales!, capturedAt: "2026-10-20T00:00:00Z" },
        dividend: { annual: 6.6, price: 342.11, growthYears: 15, capturedAt: "2026-11-08T08:41:01Z" },
      }),
    );
    expect(evidence.map((line) => line.id)).toEqual(["sales", "high", "eps"]);
    for (const { card } of evidence) {
      expect(card.figure).toMatch(/\d/);
      expect(card.label.split(/\s+/).length).toBeLessThanOrEqual(5);
      expect(card.label).toBe(card.label.toLowerCase());
      if (card.line) expect(card.line.split(/\s+/).length).toBeLessThanOrEqual(15);
      // A card with bars has no line: the bars are its one thing (owner rule 8, judge92).
      if (card.compare) expect(card.line).toBeNull();
    }
    const high = evidence[1]!.card;
    expect(high).toMatchObject({ tone: "down", label: "below its past-year high" });
    expect(high.figure).toMatch(/^\u2212\d+%$/);
    expect(high.compare!.map((bar) => bar.label)).toEqual(["Last close", "High"]);
    expect(high.compare![0].value).toBeLessThan(high.compare![1].value);
    expect(evidence[2]!.card).toEqual({
      figure: "$6.10",
      tone: "up",
      label: "earnings per share",
      // The bars say the beat; no second sentence under the figure (owner rule 8, judge92).
      line: null,
      compare: [
        { label: "Reported", value: 6.1, display: "$6.10" },
        { label: "Forecast", value: 5.94, display: "$5.94" },
      ],
      compareKind: "level",
    });
  });

  it("sets the stock against the S&P 500 on a move card, the market's own sign kept", () => {
    const prices = closes("2026-11-10", 80, [-0.04, -0.04, -0.05, -0.03, -0.04]);
    const benchmark = prices.benchmark.map((point, index, all) => (index === all.length - 1 ? { ...point, close: 495.5 } : point));
    const move = buildCallEvidence(base({ series: prices.series, benchmark, sayDays: true })).evidence.find((line) => line.id === "move")!;
    expect(move.card).toMatchObject({ figure: "\u221218%", tone: "down", label: "five trading days", line: null });
    expect(move.card.compare).toEqual([
      { label: "NVDA", value: expect.closeTo(-18, 0), display: "\u221218%" },
      { label: "S&P 500", value: expect.closeTo(-0.9, 1), display: "\u22120.9%" },
    ]);
  });

  it("puts a loss on the card as a loss, and a flat market as 0%", () => {
    const calendar = [{ event_date: "2026-10-13", eps_estimate: -0.2, estimated_eps: -0.2, reported_eps: -0.12, eps_surprise: 0.08, source: "nasdaq_calendar" }];
    const eps = buildCallEvidence(base({ sales: null, calendar, reports: [], nextReport: null })).evidence.find((line) => line.id === "eps")!;
    expect(eps.card).toMatchObject({ figure: "\u2212$0.12", tone: "up", line: null });
    expect(eps.card.compare!.map((bar) => bar.display)).toEqual(["\u2212$0.12", "\u2212$0.20"]);
    const prices = closes("2026-11-10", 80, [-0.04, -0.04, -0.05, -0.03, -0.04]);
    const move = buildCallEvidence(base({ series: prices.series, benchmark: prices.benchmark })).evidence.find((line) => line.id === "move")!;
    expect(move.card.compare![1]).toEqual({ label: "S&P 500", value: 0, display: "0%" });
  });

  it("compares with the year before when the last report was the annual one", () => {
    const sales = { revenue: 479_000_000_000, growthPct: 15, history: [{ period: "FY 2026", revenue: 479_000_000_000 }, { period: "FY 2025", revenue: 416_000_000_000 }, { period: "FY 2024", revenue: 391_000_000_000 }], capturedAt: "2026-11-08T00:00:00Z" };
    const reports = [{ date: "2026-11-02", periodEnd: "2026-09-26", form: "10-K" }];
    const { evidence } = buildCallEvidence(base({ ticker: "AAPL", sales, reports }));
    expect(evidence[0]).toMatchObject({
      id: "sales",
      text: "AAPL's sales rose 15% over the last four quarters, to $479B, faster than its 6.4% growth in fiscal 2025.",
      source: "From the 10-K for the year to Sep\u00a026, reported Nov\u00a02",
      card: { figure: "+15%", line: null },
    });
    expect(evidence[0]!.card.compare![1]).toMatchObject({ label: "Fiscal 2025", display: "+6.4%" });
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
      "The Nov\u00a017 report could raise the call if it beats the $2.49 a share analysts expect and sales growth stays above 65%, its pace in fiscal 2026.",
      "It could lower the call if it misses the $2.49 forecast or shows sales growth below 42%, half its 83% growth over the four quarters to Jul\u00a026.",
      // 4 x 1% daily swing = 4% in a day; x sqrt(5) = 9% in a week.
      "So could a day in which NVDA falls 4% more than the S&P 500, about four times the 1% it usually moves apart from the index in a day, or a week in which it falls 9% more.",
    ]);
    // Never a second call beside this one.
    expect(conditions.join(" ")).not.toMatch(/buy more|sell some|keep/i);
  });

  it("takes the conditions apart into checks, each with its threshold and where the number comes from", () => {
    const reports = [{ date: "2026-08-26", periodEnd: "2026-07-26", form: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000150/nvda-8k.htm" }];
    const { checks } = buildCallEvidence(base({ reports }));
    expect(checks.map((check) => [check.way, check.figure])).toEqual([
      ["raise", "$2.49"],
      ["lower", "$2.49"],
      ["lower", "42%"],
      ["lower", "4%"],
      ["lower", "9%"],
    ]);
    const slowdown = checks[2]!;
    expect(slowdown.text).toBe("The Nov\u00a017 report shows sales growth below 42%, half its 83% growth over the four quarters to Jul\u00a026.");
    expect(slowdown.source).toBe("From the 10-Q for the quarter to Jul\u00a026, reported Aug\u00a026");
    expect(slowdown.href).toBe(reports[0]!.url);
    expect(checks[3]!.text).toBe("NVDA has a day 4% worse than the S&P 500 (a normal day's gap is about 1%).");
    expect(checks[3]!.source).toMatch(/daily closes to /);
    // Every check has a source, and none names a second call.
    expect(checks.every((check) => check.source.length > 0)).toBe(true);
    expect(checks.map((check) => check.text).join(" ")).not.toMatch(/buy more|sell some|keep/i);
  });

  it("keeps a condition as a check even when its figures carry no date", () => {
    const { conditions, checks } = buildCallEvidence(base({ call: "Add", reports: [], sales: { ...base().sales!, capturedAt: null } }));
    expect(checks.length).toBeGreaterThanOrEqual(conditions.length);
    expect(checks.some((check) => check.figure === "42%" && check.source === "")).toBe(true);
  });

  it("never links a check to anything but SEC EDGAR", () => {
    const reports = [{ date: "2026-08-26", periodEnd: "2026-07-26", form: "10-Q", url: "https://example.com/nvda" }];
    const { checks } = buildCallEvidence(base({ reports }));
    expect(checks.every((check) => check.href === null)).toBe(true);
  });

  it("gives every check structured conditions built from the numbers, for the stock page's cards", () => {
    const reports = [{ date: "2026-08-26", periodEnd: "2026-07-26", form: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000150/nvda-8k.htm" }];
    const { checks } = buildCallEvidence(base({ reports }));
    // Keep moves either way, one step: up to Buy more, down to Sell some.
    expect(checks.map((check) => [check.way, check.to, check.event, check.eventDate])).toEqual([
      ["raise", "Add", "report", "2026-11-17"],
      ["lower", "Trim", "report", "2026-11-17"],
      ["lower", "Trim", "report", "2026-11-17"],
      ["lower", "Trim", "move", null],
      ["lower", "Trim", "move", null],
    ]);
    expect(checks[0]!.join).toBe("and");
    expect(checks[0]!.conditions).toEqual([
      { kind: "eps", operator: "above", value: 2.49, unit: "usd_per_share", period: { kind: "report" }, benchmark: null, usual: null },
      { kind: "sales_growth", operator: "above", value: 65, unit: "percent", period: { kind: "report" }, benchmark: null, usual: null },
    ]);
    expect(checks[3]!.conditions).toEqual([
      { kind: "relative_return", operator: "below", value: -4, unit: "points", period: { kind: "sessions", sessions: 1 }, benchmark: "S&P 500", usual: 1 },
    ]);
    expect(checks[4]!.conditions[0]).toMatchObject({ value: -9, period: { kind: "sessions", sessions: MOVE_WEEK_SESSIONS }, usual: null });
    expect(checks.map(checkCardText)).toEqual([
      "Earnings above $2.49 a share AND sales growth above 65%",
      "Earnings below $2.49 a share",
      "Sales growth below 42%",
      "4 points worse in one day",
      "9 points worse in 5 trading days",
    ]);
    // Owner word budget: a card is a few words.
    for (const check of checks) expect(checkCardText(check).split(/\s+/).length).toBeLessThanOrEqual(12);
    // The combined check names both its sources, the filing linked; the sentence-level source stays for other readers.
    expect(checks[0]!.sources).toEqual([
      { source: "Analysts' forecast on the Nasdaq earnings calendar", href: null },
      { source: "From the 10-Q for the quarter to Jul 26, reported Aug 26", href: reports[0]!.url },
    ]);
    expect(checks[0]!.source).toBe("Analysts' forecast on the Nasdaq earnings calendar; from the 10-Q for the quarter to Jul 26, reported Aug 26");
  });

  it("points Buy more and Sell some only at Keep", () => {
    expect(buildCallEvidence(base({ call: "Add" })).checks.every((check) => check.to === "Hold" && check.way === "lower")).toBe(true);
    const trim = buildCallEvidence(base({ call: "Trim", sales: { ...base().sales!, growthPct: -6, history: [] } })).checks;
    expect(trim.map((check) => [check.way, check.to])).toEqual([["raise", "Hold"]]);
    expect(checkCardText(trim[0]!)).toBe("Earnings above $2.49 a share AND sales growing");
  });

  it("keeps a forecast loss negative and says it as a loss", () => {
    const { checks } = buildCallEvidence(base({ calendar: [], nextReport: { date: "2026-11-17", epsEstimate: -0.12 } }));
    const eps = checks.flatMap((check) => check.conditions).filter((condition) => condition.kind === "eps");
    expect(eps.map((condition) => [condition.operator, condition.value])).toEqual([
      ["above", -0.12],
      ["below", -0.12],
    ]);
    expect(conditionWords(eps[0]!)).toEqual({ lead: "Loss under ", figure: "$0.12", tail: " a share" });
    expect(conditionWords(eps[1]!)).toEqual({ lead: "Loss over ", figure: "$0.12", tail: " a share" });
  });

  it("gives no report day when the calendar has none in the window", () => {
    const far = buildCallEvidence(base({ nextReport: { date: "2027-06-01", epsEstimate: 2.49 } })).checks;
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((check) => check.eventDate === null)).toBe(true);
    const none = buildCallEvidence(base({ nextReport: null })).checks;
    expect(none.filter((check) => check.event === "report").map(checkCardText)).toEqual(["Sales growth above 65%", "Sales growth below 42%"]);
    expect(none.every((check) => check.eventDate === null)).toBe(true);
  });

  it("leads every condition card with its figure, its side said small or once for a pair", () => {
    const { checks } = buildCallEvidence(base());
    expect(checks.map((check) => check.conditions.map(conditionFigure))).toEqual([
      [
        { figure: "$2.49", label: "earnings per share", side: "above" },
        { figure: "65%", label: "sales growth", side: "above" },
      ],
      [{ figure: "$2.49", label: "earnings per share", side: "below" }],
      [{ figure: "42%", label: "sales growth", side: "below" }],
      [{ figure: "4 points", label: "worse in one day", side: "" }],
      [{ figure: "9 points", label: "worse in five trading days", side: "" }],
    ]);
    // A forecast loss is a loss, never "below −$0.13".
    const loss = buildCallEvidence(base({ calendar: [], nextReport: { date: "2026-11-17", epsEstimate: -0.13 } })).checks;
    const eps = loss.flatMap((check) => check.conditions).filter((condition) => condition.kind === "eps").map(conditionFigure);
    expect(eps).toEqual([
      { figure: "$0.13", label: "loss per share", side: "under" },
      { figure: "$0.13", label: "loss per share", side: "over" },
    ]);
  });

  it("says shrinking and growing sales in words, not as 0%", () => {
    expect(conditionWords({ kind: "sales_growth", operator: "below", value: 0, unit: "percent", period: { kind: "report" }, benchmark: null, usual: null })).toEqual({ lead: "Sales ", figure: "shrinking", tail: "" });
    expect(conditionWords({ kind: "sales_growth", operator: "above", value: 0, unit: "percent", period: { kind: "report" }, benchmark: null, usual: null })).toEqual({ lead: "Sales ", figure: "growing", tail: "" });
  });

  it("moves Buy more only one step, to Keep", () => {
    const { conditions } = buildCallEvidence(base({ call: "Add" }));
    expect(conditions[0]).toBe("The Nov\u00a017 report could lower the call if it misses the $2.49 forecast or shows sales growth below 42%, half its 83% growth over the four quarters to Jul\u00a026.");
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
    // Without prices there is no move bar, and the market-wide drop is never listed.
    expect(conditions).toEqual([]);
  });

  it("uses only the stock's own moves when there is no report to name, never the market's", () => {
    const { conditions } = buildCallEvidence(base({ sales: null, nextReport: null, calendar: [] }));
    expect(conditions).toEqual([
      "A day in which NVDA falls 4% more than the S&P 500, about four times the 1% it usually moves apart from the index in a day, or a week in which it falls 9% more could lower the call.",
    ]);
  });

  it("keeps a call that just went up from falling back on a move, without explaining how long it stands", () => {
    const { conditions } = buildCallEvidence(base({ steady: { since: "2026-11-09", lastStep: 1 } }));
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions.join(" ")).not.toMatch(/call stands until|Short of that/);
    expect(conditions.join(" ")).not.toMatch(/So could/);
  });

  it("adds the last report's earnings against the forecast, but only when the figures agree", () => {
    const calendar = [
      { event_date: "2026-10-13", eps_estimate: 5.94, estimated_eps: 5.94, reported_eps: 5.75, eps_surprise: -0.19, source: "nasdaq_calendar", actuals_source: "nasdaq_calendar" },
    ];
    const reports = [{ date: "2026-10-13", periodEnd: "2026-09-30", form: "10-Q" }];
    const ok = buildCallEvidence(base({ ticker: "JPM", calendar, reports, nextReport: null }));
    expect(ok.evidence.find((line) => line.id === "eps")).toMatchObject({
      id: "eps",
      text: "In its Oct\u00a013 report, JPM's earnings per share of $5.75 missed the $5.94 analysts expected.",
      source: "Nasdaq earnings calendar, Oct\u00a013",
      card: { figure: "$5.75", tone: "down", line: null },
    });
    const mixed = buildCallEvidence(base({ ticker: "JPM", calendar: [{ ...calendar[0]!, eps_estimate: 4.74, estimated_eps: 5.81, eps_surprise: 0.15 }], reports, nextReport: null }));
    expect(mixed.evidence.find((line) => line.id === "eps")).toBeUndefined();
  });

  it("never lists a line that argues against the call as a reason for it", () => {
    const calendar = [
      { event_date: "2026-10-13", eps_estimate: 5.94, estimated_eps: 5.94, reported_eps: 5.75, eps_surprise: -0.19, source: "nasdaq_calendar", actuals_source: "nasdaq_calendar" },
    ];
    const reports = [{ date: "2026-10-13", periodEnd: "2026-09-30", form: "10-Q" }];
    const dividend = { annual: 6.6, price: 342.11, growthYears: 15, capturedAt: "2026-11-08T08:41:01Z" };
    const jpm = (call: CallEvidenceInput["call"]) => buildCallEvidence(base({ ticker: "JPM", call, calendar, reports, nextReport: null, dividend }));
    // A missed report is not a reason to buy more; the next line in line (the dividend) takes its place.
    expect(jpm("Add").evidence.map((line) => line.id)).toEqual(["sales", "dividend"]);
    expect(jpm("Hold").evidence.map((line) => line.id)).toEqual(["sales", "eps", "dividend"]);
    // A fall under Buy more and a rise under Sell some are left out the same way.
    const fell = closes("2026-11-10", 80, [-0.04, -0.04, -0.05, -0.03, -0.04]);
    const addAfterFall = buildCallEvidence(base({ call: "Add", series: fell.series, benchmark: fell.benchmark })).evidence;
    expect(addAfterFall.some((line) => line.id === "move")).toBe(false);
    // With a long enough history, the dropped move gives way to how far the stock sits under its high.
    const longFall = closes("2026-11-10", 200, [-0.04, -0.04, -0.05, -0.03, -0.04]);
    const addUnderHigh = buildCallEvidence(base({ call: "Add", series: longFall.series, benchmark: longFall.benchmark })).evidence;
    expect(addUnderHigh.map((line) => line.id)).toContain("high");
    expect(addUnderHigh.map((line) => line.id)).not.toContain("move");
    expect(buildCallEvidence(base({ call: "Trim", series: fell.series, benchmark: fell.benchmark })).evidence.some((line) => line.id === "move")).toBe(true);
    const rose = closes("2026-11-10", 80, [0.04, 0.04, 0.05, 0.03, 0.04]);
    expect(buildCallEvidence(base({ call: "Trim", series: rose.series, benchmark: rose.benchmark })).evidence.some((line) => line.id === "move")).toBe(false);
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

  it("calls a year that rounds to 0% flat, whichever way sales went since", () => {
    const sales = (growthPct: number, last: number) => ({ revenue: 90e9, growthPct, history: [{ period: "FY 2025", revenue: last }, { period: "FY 2024", revenue: 100e9 }], capturedAt: "2026-11-08T00:00:00Z" });
    // Fell after a year that barely grew: not "after growing 0%".
    const afterUp = buildCallEvidence(base({ ticker: "INTC", sales: sales(-4, 100.3e9) }));
    expect(afterUp.evidence[0]?.text).toBe("INTC's sales fell 4% over the last four quarters, to $90.0B, after flat sales in fiscal 2025.");
    // Fell after a year that barely fell: not "after falling 0%".
    const afterDown = buildCallEvidence(base({ ticker: "INTC", sales: sales(-4, 99.7e9) }));
    expect(afterDown.evidence[0]?.text).toBe("INTC's sales fell 4% over the last four quarters, to $90.0B, after flat sales in fiscal 2025.");
    // Rose after a year that barely fell: not "after falling 0%" either.
    const rising = buildCallEvidence(base({ ticker: "INTC", sales: sales(5, 99.7e9) }));
    expect(rising.evidence[0]?.text).toBe("INTC's sales rose 5% over the last four quarters, to $90.0B, after flat sales in fiscal 2025.");
    // Flat both times: said once.
    const still = buildCallEvidence(base({ ticker: "INTC", sales: sales(0.2, 100.3e9) }));
    expect(still.evidence[0]?.text).toBe("INTC's sales were flat over the last four quarters, to $90.0B, as in fiscal 2025.");
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

  it("says the last close in words on a page rendered now, and keeps the date for Ask", () => {
    const prices = closes("2026-11-10", 260, Array.from({ length: 200 }, () => -0.004));
    const input = base({ sales: null, series: prices.series, benchmark: prices.series.map((point) => ({ ...point })) });
    const page = buildCallEvidence({ ...input, sayDays: true }).evidence[0]?.text ?? "";
    expect(page).toMatch(/closed at \$[\d.]+ yesterday, /);
    // A high from last year is still said by its date.
    expect(page).toMatch(/below its high of \$[\d.]+ on [A-Z][a-z]{2}\u00a0\d+, 2025\.$/);
    expect(buildCallEvidence(input).evidence[0]?.text).toMatch(/closed at \$[\d.]+ on Nov\u00a010, /);
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
        card: { figure: "1.9%", tone: null, label: "dividend yield", line: "$6.60 a share a year, raised 15 years in a row.", compare: null, compareKind: null },
      },
    ]);
  });

  it("leaves out a P/E median whose window ended long ago", () => {
    const valuation = { pe: 29.1, medianPe: 32.9, from: "2026-04-23", to: "2026-07-23", days: 48 };
    expect(buildCallEvidence(base({ sales: null, valuation })).evidence).toEqual([]);
    const fresh = buildCallEvidence(base({ sales: null, valuation: { ...valuation, from: "2026-08-01", to: "2026-11-07" } }));
    expect(fresh.evidence[0]?.text).toBe("At 29 times its past year's earnings, NVDA is cheaper than its median of 33 from Aug\u00a01 to Nov\u00a07.");
    expect(fresh.evidence[0]?.card).toEqual({
      figure: "29\u00d7",
      tone: null,
      label: "price to past year's earnings",
      line: null,
      compare: [
        { label: "Now", value: 29.1, display: "29\u00d7" },
        { label: "Median", value: 32.9, display: "33\u00d7" },
      ],
      compareKind: "level",
    });
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
