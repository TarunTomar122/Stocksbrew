import { describe, expect, it } from "vitest";

import { mergeTheses, readTheses, validateThesisItems } from "@/lib/thesis";

import {
  availableMetrics,
  barScale,
  conditionsFitStock,
  figureText,
  judgeCondition,
  judgeConditions,
  nextConditionRecords,
  prefill,
  readConditions,
  validateConditions,
  wordCount,
  type Condition,
  type ConditionInputs,
  type ConditionRecord,
  type ReportRef,
} from "./conditions";
import { emptyFacts } from "./facts";
import { evaluate, withConditions } from "./rules";

const TODAY = "2026-11-13";
/** AMD's Q3 release, as tm_earnings_history stores it: Nov 3, accepted 21:16 UTC (after the close). */
const Q3: ReportRef = { date: "2026-11-03", quarter: "Q3", acceptedAt: "2026-11-03T21:16:27+00:00", url: "https://www.sec.gov/amd-20261103.htm" };

function inputs(over: Partial<ConditionInputs["values"]> = {}, report: ReportRef | null = Q3): ConditionInputs {
  return {
    ticker: "AMD",
    report,
    values: {
      revenue_growth: { value: 41.87, asOf: "2026-11-08T09:54:21Z", source: "Company results, last 12 months", href: "/stock/AMD" },
      gross_margin: { value: 56, asOf: "2026-11-08T09:54:21Z", source: "Company results, last 12 months", href: "/stock/AMD" },
      eps_surprise: { value: 9.52, asOf: "2026-11-09T20:13:41Z", source: "Nasdaq earnings calendar", href: "/stock/AMD", reportDate: "2026-11-03" },
      price: { value: 585.3, asOf: "2026-11-12", source: "Daily closes", href: "/stock/AMD" },
      pe: { value: 143.2, asOf: TODAY, source: "Our daily screen", href: "/stock/AMD" },
      ...over,
    },
  };
}

const growth = (value: number, op: Condition["op"] = "above"): Condition => ({ metric: "revenue_growth", op, value });

describe("validateConditions", () => {
  it("takes up to two known lines in bounds and cleans the numbers", () => {
    const result = validateConditions([
      { metric: "revenue_growth", op: "above", value: "20" },
      { metric: "price", op: "below", value: 150.456 },
    ]);
    expect(result).toEqual({
      ok: true,
      conditions: [
        { metric: "revenue_growth", op: "above", value: 20 },
        { metric: "price", op: "below", value: 150.46 },
      ],
    });
    expect(validateConditions([])).toEqual({ ok: true, conditions: [] });
    expect(validateConditions(null)).toEqual({ ok: true, conditions: [] });
  });

  it("refuses an unknown figure, a side the figure does not take, a number out of bounds, a third line or the same figure twice", () => {
    expect(validateConditions([{ metric: "vibes", op: "above", value: 1 }]).ok).toBe(false);
    expect(validateConditions([{ metric: "dividend", op: "below", value: 0.2 }]).ok).toBe(false);
    expect(validateConditions([{ metric: "gross_margin", op: "above", value: 140 }]).ok).toBe(false);
    expect(validateConditions([{ metric: "price", op: "above", value: 0 }]).ok).toBe(false);
    expect(validateConditions([{ metric: "pe", op: "below", value: Number.NaN }]).ok).toBe(false);
    expect(validateConditions([{ metric: "pe", op: "below", value: "" }]).ok).toBe(false);
    expect(validateConditions([growth(10), { metric: "pe", op: "below", value: 30 }, { metric: "price", op: "above", value: 10 }])).toEqual({ ok: false, error: "too_many_conditions" });
    expect(validateConditions([growth(10), growth(20, "below")]).ok).toBe(false);
    expect(validateConditions("revenue > 20").ok).toBe(false);
  });

  it("only fits a stock that has the figure, and a price line near its own price", () => {
    expect(conditionsFitStock([growth(20)], inputs())).toBeNull();
    expect(conditionsFitStock([{ metric: "dividend", op: "above", value: 0.1 }], inputs())).toBe("dividend");
    expect(conditionsFitStock([{ metric: "price", op: "above", value: 500 }], inputs())).toBeNull();
    expect(conditionsFitStock([{ metric: "price", op: "above", value: 50 }], inputs())).toBe("price");
    expect(conditionsFitStock([{ metric: "price", op: "above", value: 5000 }], inputs())).toBe("price");
    expect(conditionsFitStock([growth(20)], null)).toBe("revenue_growth");
  });

  it("keeps the good line when a stored one is malformed", () => {
    expect(readConditions([growth(20), { metric: "nope", op: "above", value: 1 }])).toEqual([growth(20)]);
    expect(readConditions("x")).toEqual([]);
  });
});

describe("conditions on a saved reason", () => {
  const now = new Date("2026-11-13T15:00:00Z");

  it("validates them with the reason and stores them on it", () => {
    const valid = validateThesisItems([{ instrument_id: "US_AMD", kind: "growth", reason: null, conditions: [growth(20)] }]);
    expect(valid.ok && valid.items[0]!.conditions).toEqual([growth(20)]);
    expect(validateThesisItems([{ instrument_id: "US_AMD", kind: "growth", conditions: [{ metric: "x" }] }])).toEqual({ ok: false, error: "invalid_conditions" });
    const merged = mergeTheses({}, valid.ok ? valid.items : [], now);
    expect(merged.US_AMD!.conditions).toEqual([growth(20)]);
    expect(readTheses(merged).US_AMD!.conditions).toEqual([growth(20)]);
  });

  it("keeps the stored lines when a save leaves them out, and clears them with an empty list", () => {
    const stored = { US_AMD: { kind: "growth", reason: null, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z", conditions: [growth(20)] } };
    const kept = mergeTheses(stored, [{ instrument_id: "US_AMD", kind: "growth", reason: "AI chips" }], now);
    expect(kept.US_AMD!.conditions).toEqual([growth(20)]);
    expect(kept.US_AMD!.reason).toBe("AI chips");
    const cleared = mergeTheses(stored, [{ instrument_id: "US_AMD", kind: "growth", reason: null, conditions: [] }], now);
    expect(cleared.US_AMD!.conditions).toEqual([]);
    expect(readTheses(cleared).US_AMD!.conditions).toBeUndefined();
  });
});

describe("judgeCondition", () => {
  it("holds above the line and breaks under it, with the dated source", () => {
    const holds = judgeCondition(growth(20), inputs(), TODAY);
    expect(holds.status).toBe("holds");
    expect(holds.nowText).toBe("42%");
    expect(holds.line).toBe("AMD's Q3: revenue growth 42%, above your 20%. Reason holds.");
    expect(holds.source).toBe("Revenue growth 42% after the Q3 report, Nov 3 (SEC 8-K)");
    const broken = judgeCondition(growth(45), inputs(), TODAY);
    expect(broken.status).toBe("broken");
    expect(broken.line).toBe("Revenue growth is 42%, under your 45%.");
  });

  it("holds exactly at the line, and never prints a figure that reads the same as the line", () => {
    expect(judgeCondition(growth(41.87), inputs(), TODAY).status).toBe("holds");
    const near = judgeCondition(growth(20), inputs({ revenue_growth: { value: 19.6, asOf: "2026-11-08T09:54:21Z", source: "s", href: null } }), TODAY);
    expect(near.status).toBe("broken");
    expect(near.line).toBe("Revenue growth is 19.6%, under your 20%.");
    expect(figureText("revenue_growth", 20, 20)).toBe("20%");
  });

  it("counts a figure stored before the newest report as unknown, not holds", () => {
    // Stored the afternoon of the report, before SEC accepted the release at 21:16 UTC.
    const early = inputs({ revenue_growth: { value: 41.87, asOf: "2026-11-03T18:00:00Z", source: "s", href: null } });
    const result = judgeCondition(growth(20), early, TODAY);
    expect(result.status).toBe("unknown");
    expect(result.line).toBe("Waiting for the figures from the Q3 report, Nov 3.");
    // A date-only figure from the report day itself is not after the report either.
    const sameDay = inputs({ revenue_growth: { value: 41.87, asOf: "2026-11-03", source: "s", href: null } }, { ...Q3, acceptedAt: null });
    expect(judgeCondition(growth(20), sameDay, TODAY).status).toBe("unknown");
  });

  it("judges EPS only against the newest report's own figure", () => {
    expect(judgeCondition({ metric: "eps_surprise", op: "above", value: 0 }, inputs(), TODAY).line).toBe("AMD's Q3: EPS beat the estimate by 9.5%, above your 0%. Reason holds.");
    const next = { ...Q3, date: "2026-11-12", acceptedAt: "2026-11-12T21:00:00Z" };
    expect(judgeCondition({ metric: "eps_surprise", op: "above", value: 0 }, inputs({}, next), TODAY).status).toBe("unknown");
    const miss = inputs({ eps_surprise: { value: -4.2, asOf: "2026-11-09T20:13:41Z", source: "n", href: null, reportDate: "2026-11-03" } });
    expect(judgeCondition({ metric: "eps_surprise", op: "above", value: 0 }, miss, TODAY).line).toBe("EPS missed the estimate by 4.2%, under your 0%.");
  });

  it("says a daily figure is too old to judge, and treats a stopped dividend as none", () => {
    const old = inputs({ price: { value: 585, asOf: "2026-10-01", source: "Daily closes", href: null } });
    expect(judgeCondition({ metric: "price", op: "above", value: 500 }, old, TODAY).status).toBe("unknown");
    const stopped = inputs({ dividend: { value: 0.26, asOf: TODAY, source: "Dividend history", href: null, stoppedSince: "2026-03-03" } });
    const result = judgeCondition({ metric: "dividend", op: "above", value: 0.26 }, stopped, TODAY);
    expect(result.status).toBe("broken");
    expect(result.line).toBe("No AMD dividend has gone ex since Mar 3.");
  });

  it("is unknown with no figure, and with old report figures and no report on file", () => {
    expect(judgeCondition({ metric: "operating_margin", op: "above", value: 10 }, inputs(), TODAY).status).toBe("unknown");
    const stale = inputs({ revenue_growth: { value: 40, asOf: "2026-05-01T00:00:00Z", source: "s", href: null } }, null);
    expect(judgeCondition(growth(20), stale, TODAY).status).toBe("unknown");
  });

  it("keeps every line within 15 words", () => {
    const lines: string[] = [];
    const cases: Condition[] = [
      growth(20),
      growth(50),
      growth(30, "below"),
      { metric: "gross_margin", op: "above", value: 60 },
      { metric: "operating_margin", op: "below", value: 5 },
      { metric: "eps_surprise", op: "above", value: 15 },
      { metric: "price", op: "above", value: 600 },
      { metric: "price", op: "below", value: 500 },
      { metric: "pe", op: "below", value: 100 },
      { metric: "dividend", op: "above", value: 1 },
    ];
    const all = inputs({
      operating_margin: { value: 17.8, asOf: "2026-11-08T09:54:21Z", source: "s", href: null },
      dividend: { value: 0.5, asOf: TODAY, source: "Dividend history", href: null },
    });
    for (const condition of cases) {
      const result = judgeCondition(condition, all, TODAY);
      lines.push(result.line);
    }
    lines.push(judgeCondition(growth(20), inputs({ revenue_growth: { value: 41, asOf: "2026-11-01T00:00:00Z", source: "s", href: null } }), TODAY).line);
    for (const line of lines) expect(wordCount(line), line).toBeLessThanOrEqual(15);
  });
});

describe("nextConditionRecords: a report is checked once", () => {
  const records = (stored: ConditionRecord[], input: ConditionInputs, today: string) => nextConditionRecords(stored, [judgeCondition(growth(20), input, today)], today);

  it("marks the night a new report's figures are first judged, and not again on later nights", () => {
    const before = records([], inputs({}, { ...Q3, date: "2026-08-04", quarter: "Q2", acceptedAt: "2026-08-04T20:16:24Z" }), "2026-08-20");
    // Saved weeks after the Q2 report: a baseline, not news.
    expect(before[0]!.report_date).toBe("2026-08-04");
    expect(before[0]!.checked_on).toBeNull();
    const night = records(before, inputs(), "2026-11-08");
    expect(night[0]!.report_date).toBe("2026-11-03");
    expect(night[0]!.checked_on).toBe("2026-11-08");
    const later = records(night, inputs(), "2026-11-09");
    expect(later[0]!.checked_on).toBe("2026-11-08");
    expect(later[0]!.since).toBe(night[0]!.since);
  });

  it("waits while the figures are older than the report, then checks it the night they land", () => {
    const base = records([], inputs({}, { ...Q3, date: "2026-08-04", quarter: "Q2", acceptedAt: "2026-08-04T20:16:24Z" }), "2026-08-20");
    const waiting = records(base, inputs({ revenue_growth: { value: 30, asOf: "2026-11-03T15:00:00Z", source: "s", href: null } }), "2026-11-03");
    expect(waiting[0]!.status).toBe("unknown");
    expect(waiting[0]!.report_date).toBe("2026-08-04");
    expect(waiting[0]!.checked_on).toBeNull();
    const landed = records(waiting, inputs({ revenue_growth: { value: 30, asOf: "2026-11-03T23:02:00Z", source: "s", href: null } }), "2026-11-03");
    expect(landed[0]!.status).toBe("holds");
    expect(landed[0]!.checked_on).toBe("2026-11-03");
  });

  it("waits when the figure after a new report is exactly the one judged on the last report (not refreshed yet)", () => {
    const q2 = { ...Q3, date: "2026-08-04", quarter: "Q2", acceptedAt: "2026-08-04T20:16:24Z" };
    const base = nextConditionRecords([], judgeConditions([growth(20)], inputs({}, q2), "2026-08-05"), "2026-08-05");
    // Stamped after the Q3 release, but the same 41.87 as on Q2: the scrape ran before the source updated.
    const same = judgeConditions([growth(20)], inputs(), "2026-11-04", base);
    expect(same[0]!.status).toBe("unknown");
    expect(same[0]!.line).toBe("Waiting for the figures from the Q3 report, Nov 3.");
    const fresh = judgeConditions([growth(20)], inputs({ revenue_growth: { value: 44.1, asOf: "2026-11-04T23:00:00Z", source: "s", href: null } }), "2026-11-04", base);
    expect(fresh[0]!.status).toBe("holds");
    expect(nextConditionRecords(base, fresh, "2026-11-04")[0]!.checked_on).toBe("2026-11-04");
  });

  it("records figures that land weeks after the report without a report-day line", () => {
    const q2 = { ...Q3, date: "2026-08-04", quarter: "Q2", acceptedAt: "2026-08-04T20:16:24Z" };
    const base = nextConditionRecords([], [judgeCondition(growth(20), inputs({}, q2), "2026-08-05")], "2026-08-05");
    const late = nextConditionRecords(base, [judgeCondition(growth(20), inputs(), "2026-11-25")], "2026-11-25");
    expect(late[0]!.report_date).toBe("2026-11-03");
    expect(late[0]!.checked_on).toBeNull();
  });

  it("counts a report from the last few days as news when the line is first saved", () => {
    expect(records([], inputs(), "2026-11-05")[0]!.checked_on).toBe("2026-11-05");
    expect(records([], inputs(), TODAY)[0]!.checked_on).toBeNull();
  });
});

describe("withConditions", () => {
  it("breaks the reason on a broken line, which leads the note", () => {
    const facts = { ...emptyFacts("AMD", "US_AMD", "AMD", TODAY), revenueGrowth: 41.87 };
    const check = evaluate({ kind: "growth", reason: null, created_at: "2026-10-01T00:00:00Z" }, facts, { avgCost: null, savedClose: null }, TODAY);
    expect(check.verdict).toBe("holds");
    expect(withConditions(check, [judgeCondition(growth(20), inputs(), TODAY)])).toBe(check);
    const broken = withConditions(check, [judgeCondition(growth(45), inputs(), TODAY)]);
    expect(broken.verdict).toBe("broken");
    expect(broken.signals[0]!.id).toBe("condition_revenue_growth");
    expect(broken.signals[0]!.text).toBe("Revenue growth is 42%, under your 45%.");
    expect(broken.checked).toEqual([]);
  });
});

describe("prefill", () => {
  it("starts from a line the stock clears today", () => {
    expect(prefill("revenue_growth", "above", 41.87)).toBe(30);
    expect(prefill("gross_margin", "above", 56)).toBe(53);
    expect(prefill("eps_surprise", "above", 9.5)).toBe(0);
    expect(prefill("eps_surprise", "above", -7.3)).toBe(-15);
    expect(prefill("price", "above", 585.3)).toBe(520);
    expect(prefill("price", "below", 166.19)).toBe(185);
    expect(prefill("pe", "below", 29.1)).toBe(37);
    expect(prefill("dividend", "above", 0.26)).toBe(0.26);
    // Rounded down: a line never starts above the payment it is set from.
    expect(prefill("dividend", "above", 1.125)).toBe(1.12);
    expect(prefill("dividend", "above", 0.06875)).toBe(0.0687);
    // Kept inside the bounds, so the picker never opens on a number it refuses.
    expect(prefill("gross_margin", "below", 99)).toBe(100);
    expect(prefill("revenue_growth", "above", -98)).toBe(-100);
  });

  it("prints dollars with the digits that tell them apart", () => {
    expect(figureText("dividend", 1.125, 1.13)).toBe("$1.125");
    expect(figureText("price", 149.996, 150)).toBe("$149.996");
    expect(figureText("price", 140, 150)).toBe("$140");
  });
});

describe("barScale", () => {
  it("puts the figure and the line on one scale from zero", () => {
    // NVDA: revenue growth 83% against a 60% line reads 83 and 60 of a 0-to-100 track.
    expect(barScale("revenue_growth", 83, 60)).toEqual({ from: 0, to: 100, value: 0.83, line: 0.6, zero: null });
    expect(barScale("gross_margin", 74.7, 76)).toMatchObject({ from: 0, to: 100, value: 0.747, line: 0.76 });
    expect(barScale("revenue_growth", 671, 500)).toMatchObject({ from: 0, to: 1000 });
    expect(barScale("price", 34.5, 31)).toMatchObject({ from: 0, to: 50 });
  });

  it("runs below zero with zero marked, and leaves room over a figure at the top end", () => {
    const loss = barScale("operating_margin", -393, -397);
    expect(loss.from).toBe(-500);
    expect(loss.to).toBe(0);
    expect(loss.zero).toBe(1);
    const miss = barScale("eps_surprise", -7.3, 0);
    expect(miss).toMatchObject({ from: -10, zero: expect.any(Number) });
    expect(miss.value).toBeLessThan(miss.zero!);
    expect(barScale("revenue_growth", 99, 60).to).toBe(200);
    expect(barScale("gross_margin", 99, 60).to).toBe(100);
  });
});

describe("QA: waiting nights, stable verdicts, edited lines", () => {
  const q2: ReportRef = { ...Q3, date: "2026-08-04", quarter: "Q2", acceptedAt: "2026-08-04T20:16:24Z" };
  const fig = (value: number, asOf: string) => ({ revenue_growth: { value, asOf, source: "Company results, last 12 months", href: null } });
  const night = (stored: ReturnType<typeof nextConditionRecords>, conditions: Condition[], input: ConditionInputs, today: string) => {
    const results = judgeConditions(conditions, input, today, stored);
    return { results, records: nextConditionRecords(stored, results, today) };
  };

  it("keeps waiting after an unknown night when the old figure is stamped again (judged figure carried)", () => {
    const base = night([], [growth(20)], inputs(fig(41.87, "2026-08-05T23:00:00Z"), q2), "2026-08-05").records;
    // Report night: the scrape ran before SEC accepted the release.
    const first = night(base, [growth(20)], inputs(fig(41.87, "2026-11-03T18:00:00Z")), "2026-11-03");
    expect(first.results[0]!.status).toBe("unknown");
    expect(first.records[0]!.judged_now).toBe(41.87);
    // Next night: the same Q2 figure, stamped after the release. Still Q2's, not Q3's.
    const second = night(first.records, [growth(20)], inputs(fig(41.87, "2026-11-04T23:00:00Z")), "2026-11-04");
    expect(second.results[0]!.status).toBe("unknown");
    // Still the Q2 report's check: Q3 is not marked as checked on Q2's figure.
    expect(second.records[0]!.report_date).toBe("2026-08-04");
    expect(second.records[0]!.checked_on).toBe("2026-08-05");
    const landed = night(second.records, [growth(20)], inputs(fig(44.2, "2026-11-05T23:00:00Z")), "2026-11-05");
    expect(landed.results[0]!.status).toBe("holds");
    expect(landed.records[0]!.checked_on).toBe("2026-11-05");
    expect(landed.records[0]!.report_date).toBe("2026-11-03");
  });

  it("keeps a broken line broken while the next report's figures are awaited, so `since` does not move", () => {
    const base = night([], [growth(45)], inputs(fig(41.87, "2026-08-05T23:00:00Z"), q2), "2026-08-05").records;
    expect(base[0]!.status).toBe("broken");
    const waiting = night(base, [growth(45)], inputs(fig(41.87, "2026-11-03T18:00:00Z")), "2026-11-03");
    expect(waiting.results[0]).toMatchObject({ status: "broken", now: 41.87, waitingFor: "Q3", line: "Revenue growth is 42%, under your 45%." });
    expect(waiting.records[0]!.since).toBe("2026-08-05");
    const facts = { ...emptyFacts("AMD", "US_AMD", "AMD", "2026-11-03"), revenueGrowth: 41.87 };
    const check = evaluate({ kind: "growth", reason: null, created_at: "2026-08-01T00:00:00Z" }, facts, { avgCost: null, savedClose: null }, "2026-11-03");
    expect(withConditions(check, waiting.results).verdict).toBe("broken");
    const cleared = night(waiting.records, [growth(45)], inputs(fig(48, "2026-11-04T23:00:00Z")), "2026-11-04");
    expect(cleared.results[0]!.status).toBe("holds");
  });

  it("clears a broken price line only once the close is 1% past it", () => {
    const line: Condition = { metric: "price", op: "above", value: 150 };
    const close = (value: number, day: string) => inputs({ price: { value, asOf: day, source: "Daily closes", href: null } });
    const broke = night([], [line], close(140, "2026-11-10"), "2026-11-10").records;
    expect(broke[0]!.status).toBe("broken");
    const near = night(broke, [line], close(150.9, "2026-11-11"), "2026-11-11");
    expect(near.results[0]!.status).toBe("broken");
    expect(near.records[0]!.since).toBe("2026-11-10");
    expect(night(near.records, [line], close(151.6, "2026-11-12"), "2026-11-12").results[0]!.status).toBe("holds");
  });

  it("does not make a report news twice when the line's number is edited", () => {
    const saved = night([], [growth(20)], inputs(), "2026-11-05").records;
    expect(saved[0]!.checked_on).toBe("2026-11-05");
    const edited = night(saved, [growth(25)], inputs(), "2026-11-06").records;
    expect(edited[0]!.key).toBe("revenue_growth:above:25");
    expect(edited[0]!.checked_on).toBe("2026-11-05");
  });

  it("offers no P/E line on a loss", () => {
    expect(availableMetrics(inputs({ pe: { value: -12, asOf: TODAY, source: "s", href: null } }))).not.toContain("pe");
    expect(availableMetrics(inputs())).toContain("pe");
  });
});
