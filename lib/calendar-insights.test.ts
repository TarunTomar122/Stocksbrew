import { describe, expect, it } from "vitest";

import { buildCalendarRead, buildEarningsDetailRead, pastMoveText, readTickers, surpriseOf, typicalDailyMove, whenWord } from "@/lib/calendar-insights";
import type { CalendarItem, EarningsItem } from "@/lib/calendar-shared";

const TODAY = "2026-11-10";

function earn(ticker: string, date: string, cap: number | null, extra: Partial<EarningsItem> = {}): EarningsItem {
  return {
    kind: "earnings", id: `${ticker}_${date}`, date, ticker, company: `${ticker} Inc.`, session: "amc", epsEstimate: 1, epsActual: null, surprisePct: null,
    surpriseLabel: null, fiscalEnding: "", marketCap: cap, reaction: null, hasPreRead: false, ...extra,
  };
}

const beat = (ticker: string, pct: number | null) =>
  earn(ticker, "2026-11-09", 1e9, { epsActual: 1.2, surprisePct: 20, surpriseLabel: "beat", reaction: pct === null ? null : { pct, basis: "1d", toDate: "2026-11-09" } });

describe("whenWord", () => {
  it("speaks in days a reader uses", () => {
    expect(whenWord(TODAY, TODAY)).toBe("today");
    expect(whenWord("2026-11-11", TODAY)).toBe("tomorrow");
    expect(whenWord("2026-11-12", TODAY)).toBe("Thursday");
    expect(whenWord("2026-11-20", TODAY)).toBe("Nov 20");
  });
});

describe("pastMoveText", () => {
  it("compares the last report move with a normal day", () => {
    expect(pastMoveText({ last: { pct: -5.8, basis: "2d", toDate: "2026-08-13", eventDate: "2026-08-12" }, typicalDayPct: 1.75 })).toBe(
      "fell 5.8% over two sessions after its Aug 12 report, about 3x a normal day for it",
    );
    expect(pastMoveText({ last: null, typicalDayPct: 2 })).toBeNull();
    expect(pastMoveText(undefined)).toBeNull();
  });
});

describe("typicalDailyMove", () => {
  it("needs 30 closes and averages absolute returns", () => {
    expect(typicalDailyMove([100, 101])).toBeNull();
    const closes = Array.from({ length: 40 }, (_, index) => (index % 2 ? 101 : 100));
    expect(typicalDailyMove(closes)!).toBeCloseTo(0.995, 2);
  });
});

describe("buildCalendarRead", () => {
  const items: CalendarItem[] = [
    earn("CSCO", "2026-11-12", 443e9),
    earn("AMAT", "2026-11-12", 346e9),
    earn("ONON", TODAY, 10e9, { session: "bmo" }),
    beat("CEG", 9.5), beat("CNH", 13.5), beat("ROIV", null),
    { kind: "economic", id: "cpi", date: TODAY, timeEt: "08:30", title: "CPI inflation", period: "", importance: "high", sourceName: "", sourceUrl: "" },
  ];

  it("is null for an empty agenda", () => {
    expect(buildCalendarRead({ items: [], today: TODAY, period: "this week", mine: null })).toBeNull();
  });

  it("leads with the release today and the biggest reporters", () => {
    const read = buildCalendarRead({
      items, today: TODAY, period: "this week", mine: null,
      context: { CSCO: { last: { pct: -5.8, basis: "2d", toDate: "2026-08-13", eventDate: "2026-08-12" }, typicalDayPct: 1.75 } },
    })!;
    expect(read.headline).toBe("CPI is out today at 8:30 AM; 3 companies still to report this week, led by CSCO and AMAT on Thursday.");
    expect(read.insights[0]!.id).toBe("biggest");
    expect(read.insights[0]!.text).toContain("about 3x a normal day");
    expect(read.insights[1]!.text).toBe("So far 3 of 3 companies beat what analysts expected (100%), and none fell short. Biggest moves after: CNH +13.5% and CEG +9.5%.");
  });

  it("puts the person's own stocks first, in date order", () => {
    const read = buildCalendarRead({ items, today: TODAY, period: "this week", mine: new Set(["CSCO", "ONON"]), mineHref: "/calendar?mine=1" })!;
    expect(read.insights[0]!.text).toBe("Two of your stocks report this week: ONON today and CSCO Thursday.");
    expect(read.insights[1]!.tickers?.[0]).toBe("AMAT");
    expect(readTickers(items, TODAY, new Set(["ONON"]))).toEqual(["ONON", "CSCO", "AMAT"]);
  });

  it("groups same-day names and adds the ones already out", () => {
    const read = buildCalendarRead({ items, today: TODAY, period: "this week", mine: new Set(["CSCO", "AMAT", "CNH"]) })!;
    expect(read.insights[0]!.text).toBe("Two of your stocks report this week: CSCO and AMAT Thursday. Already out: CNH beat, +13.5%.");
  });

  it("falls back to what already reported when nothing of theirs is left", () => {
    const read = buildCalendarRead({ items, today: TODAY, period: "this week", mine: new Set(["CEG"]) })!;
    expect(read.insights[0]!.text).toBe("One of your stocks has reported this week and none is still to come: CEG beat, +9.5%.");
  });
});

describe("surpriseOf", () => {
  it("trusts the numbers over the stored label, with an in-line band", () => {
    expect(surpriseOf({ epsActual: 1.08, epsEstimate: 1.17, surpriseLabel: "beat", surprisePct: 9 })?.label).toBe("miss");
    expect(surpriseOf({ epsActual: 1.0, epsEstimate: 1.0, surpriseLabel: null, surprisePct: null })?.label).toBe("in-line");
    expect(surpriseOf({ epsActual: null, epsEstimate: 1, surpriseLabel: "beat", surprisePct: 5 })?.label).toBe("beat");
    expect(surpriseOf({ epsActual: null, epsEstimate: null, surpriseLabel: null, surprisePct: null })).toBeNull();
  });
});

describe("buildEarningsDetailRead", () => {
  it("says when the next report is and how the last one went", () => {
    const events = [
      earn("CSCO", "2026-08-12", null, { epsEstimate: 1.17, epsActual: 1.08, surprisePct: 9, surpriseLabel: "beat", reaction: { pct: -5.8, basis: "2d", toDate: "2026-08-13" } }),
      earn("CSCO", "2026-11-12", null, { epsEstimate: 1.15 }),
    ];
    const read = buildEarningsDetailRead({ ticker: "CSCO", name: "Cisco", events, today: TODAY, context: { last: { pct: -5.8, basis: "2d", toDate: "2026-08-13", eventDate: "2026-08-12" }, typicalDayPct: 1.75 } })!;
    expect(read.headline).toBe("CSCO reports Thursday after the close, with EPS expected at $1.15.");
    expect(read.insights.map((insight) => insight.text)).toEqual([
      "The stock fell 5.8% over two sessions after its Aug 12 report, about 3x a normal day for it.",
      // The stored label says beat, but $1.08 against $1.17 is a miss: the numbers decide.
      "Last quarter's EPS missed the estimate by 8% and the stock fell.",
    ]);
  });
  it("is null with no reports", () => {
    expect(buildEarningsDetailRead({ ticker: "X", name: "X", events: [], today: TODAY, context: undefined })).toBeNull();
  });
});
