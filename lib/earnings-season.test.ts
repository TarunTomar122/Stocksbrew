import { describe, expect, it } from "vitest";

import type { EarningsItem } from "@/lib/calendar-shared";
import {
  buildHistory,
  buildSeason,
  buildSeasonRead,
  filingSession,
  historyWords,
  measureMove,
  moveStats,
  oneToWatch,
  reportDay,
  seasonWindow,
  vsDayWords,
  weekName,
  whenWords,
  type PastReport,
  type SeasonStockInput,
  type StockHistory,
} from "@/lib/earnings-season";

function event(ticker: string, date: string, patch: Partial<EarningsItem> = {}): EarningsItem {
  return {
    kind: "earnings",
    id: `${ticker}_${date}`,
    date,
    ticker,
    company: ticker,
    session: "unknown",
    epsEstimate: null,
    epsActual: null,
    surprisePct: null,
    surpriseLabel: null,
    fiscalEnding: "",
    marketCap: null,
    reaction: null,
    hasPreRead: false,
    ...patch,
  };
}

/** Weekday closes from `start`, one per entry. */
function series(start: string, closes: number[]): { dates: string[]; closes: number[] } {
  const dates: string[] = [];
  let day = new Date(`${start}T00:00:00Z`);
  while (dates.length < closes.length) {
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(day.toISOString().slice(0, 10));
    day = new Date(day.getTime() + 86_400_000);
  }
  return { dates, closes };
}

function past(move: number | null, patch: Partial<PastReport> = {}): PastReport {
  return {
    date: "2026-08-01",
    session: "amc",
    from: "calendar",
    epsEstimate: null,
    epsActual: null,
    result: null,
    surprisePct: null,
    move,
    basis: move === null ? null : "1d",
    ...patch,
  };
}

describe("filingSession", () => {
  it("reads the New York time of an 8-K", () => {
    // 20:21 UTC in August is 4:21 PM EDT: after the close.
    expect(filingSession("2026-08-26T20:21:19+00:00")).toEqual({ day: "2026-08-26", session: "amc" });
    // 10:30 UTC in October is 6:30 AM EDT: before the open.
    expect(filingSession("2026-10-13T10:30:38+00:00")).toEqual({ day: "2026-10-13", session: "bmo" });
    // 19:00 UTC is 3 PM: during the session, so unknown.
    expect(filingSession("2026-10-13T19:00:00+00:00")).toEqual({ day: "2026-10-13", session: "unknown" });
    // 02:00 UTC on the 14th is still the 13th in New York.
    expect(filingSession("2026-10-14T02:00:00+00:00")?.day).toBe("2026-10-13");
    expect(filingSession("")).toBeNull();
    expect(filingSession("not a date")).toBeNull();
  });
});

describe("measureMove", () => {
  const s = series("2026-08-03", [100, 102, 99, 110, 111]); // Mon..Fri Aug 3-7
  it("before the open: prior close to that day's close", () => {
    expect(measureMove(s.dates, s.closes, "2026-08-05", "bmo")).toEqual({ pct: -2.94, basis: "1d" });
  });
  it("after the close: that day's close to the next", () => {
    expect(measureMove(s.dates, s.closes, "2026-08-05", "amc")).toEqual({ pct: 11.11, basis: "1d" });
  });
  it("unknown time spans two sessions", () => {
    expect(measureMove(s.dates, s.closes, "2026-08-05", "unknown")).toEqual({ pct: 7.84, basis: "2d" });
  });
  it("a report on a non-trading day lands on the next session", () => {
    expect(measureMove(s.dates, s.closes, "2026-08-02", "amc")).toBeNull(); // no close before Monday
    expect(measureMove(s.dates, s.closes, "2026-08-08", "amc")).toBeNull(); // after the last close
  });
  it("waits for the closing price that ends the window", () => {
    expect(measureMove(s.dates, s.closes, "2026-08-07", "amc")).toBeNull();
  });
});

describe("buildHistory", () => {
  const closes = series("2026-04-01", Array.from({ length: 160 }, (_, i) => 100 + (i % 2 ? 1 : -1) + i * 0.1));

  it("joins calendar rows and 8-K days, newest first, and takes the time from the 8-K", () => {
    const history = buildHistory(
      {
        events: [
          { ...event("NVDA", "2026-05-20", { session: "amc", epsEstimate: 1.7 }), capturedAt: "2026-05-16T04:48:06Z" },
          event("NVDA", "2026-11-17", { session: "amc", epsEstimate: 2.49 }),
          event("NVDA", "2026-10-28", { epsEstimate: 1, epsActual: 1.1 }),
        ],
        reactions: [],
        filings: [{ filedAt: "2026-08-26T20:21:19+00:00" }, { filedAt: "2026-10-28T20:04:00+00:00" }],
        series: closes,
      },
      "2026-11-11",
    );
    expect(history.past.map((report) => [report.date, report.session, report.from])).toEqual([
      ["2026-10-28", "amc", "calendar"],
      ["2026-08-26", "amc", "filing"],
      ["2026-05-20", "amc", "calendar"],
    ]);
    expect(history.past[0]!.result).toBe("beat");
    expect(history.past.every((report) => report.basis === "1d" && typeof report.move === "number")).toBe(true);
    expect(history.next).toMatchObject({ date: "2026-11-17", session: "amc", epsEstimate: 2.49, reported: false });
    expect(history.typicalDayPct).not.toBeNull();
  });

  it("takes a day's earliest 8-K whatever order the filings arrive in", () => {
    // 7:00 AM ET (before the open) and 4:30 PM ET (after the close) on the same day.
    const early = { filedAt: "2026-08-26T11:00:00+00:00" };
    const late = { filedAt: "2026-08-26T20:30:00+00:00" };
    for (const filings of [
      [early, late],
      [late, early],
    ]) {
      const history = buildHistory({ events: [], reactions: [], filings, series: closes }, "2026-11-11");
      expect(history.past.map((report) => [report.date, report.session])).toEqual([["2026-08-26", "bmo"]]);
    }
  });

  it("keeps one row per quarter, preferring the one with a result", () => {
    const history = buildHistory(
      {
        events: [event("A", "2026-07-28"), event("A", "2026-07-30", { epsEstimate: 1, epsActual: 0.9 })],
        reactions: [],
        filings: [],
        series: null,
      },
      "2026-11-11",
    );
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toMatchObject({ date: "2026-07-30", result: "miss", move: null });
  });

  it("falls back to the stored reaction without closes, but never one that ends today", () => {
    const history = buildHistory(
      {
        events: [
          { ...event("A", "2026-07-28"), capturedAt: "2026-07-20T00:00:00Z" },
          { ...event("A", "2026-11-10"), capturedAt: "2026-11-01T00:00:00Z" },
        ],
        reactions: [
          { date: "2026-07-28", pct: 3.7, basis: "2d", toDate: "2026-07-29" },
          { date: "2026-11-10", pct: 9, basis: "2d", toDate: "2026-11-11" },
        ],
        filings: [],
        series: null,
      },
      "2026-11-11",
    );
    expect(history.past.map((report) => report.move)).toEqual([null, 3.7]);
  });

  it("ignores closes dated today and 8-Ks on weekends or after today", () => {
    const history = buildHistory(
      {
        events: [],
        reactions: [],
        filings: [{ filedAt: "2026-08-22T12:00:00Z" }, { filedAt: "2026-11-12T12:00:00Z" }],
        series: closes,
      },
      "2026-11-11",
    );
    expect(history.past).toEqual([]);
    expect(history.next).toBeNull();
  });

  it("marks a report from earlier today as reported", () => {
    const history = buildHistory({ events: [event("A", "2026-11-11", { epsEstimate: 1, epsActual: 1.2 })], reactions: [], filings: [], series: null }, "2026-11-11");
    expect(history.next).toMatchObject({ reported: true, result: "beat" });
  });
});

describe("buildHistory, filings", () => {
  const closes = series("2026-04-01", Array.from({ length: 160 }, (_, i) => 100 + i * 0.1));
  it("drops amendments and preliminary 8-Ks in the same quarter as a calendar report", () => {
    const history = buildHistory(
      {
        events: [event("ABBV", "2026-10-30", { session: "bmo", epsEstimate: 1, epsActual: 1.1 })],
        reactions: [],
        filings: [
          { filedAt: "2026-10-05T11:00:00Z" }, // preliminary results, 25 days before the report
          { filedAt: "2026-11-04T21:00:00Z", amended: true },
          { filedAt: "2026-07-31T11:00:00Z" }, // a quarter the calendar does not hold
        ],
        series: closes,
      },
      "2026-11-11",
    );
    expect(history.past.map((report) => [report.date, report.from])).toEqual([
      ["2026-10-30", "calendar"],
      ["2026-07-31", "filing"],
    ]);
  });

  it("keeps the later of two 8-Ks in a quarter the calendar does not hold", () => {
    const history = buildHistory(
      { events: [], reactions: [], filings: [{ filedAt: "2026-08-31T11:00:00Z" }, { filedAt: "2026-09-08T21:00:00Z" }], series: closes },
      "2026-11-11",
    );
    expect(history.past.map((report) => report.date)).toEqual(["2026-09-08"]);
  });

  it("skips a past calendar row projected long before its date unless an 8-K confirms it", () => {
    const projected = { ...event("A", "2026-08-05"), capturedAt: "2026-05-16T00:00:00Z" };
    expect(buildHistory({ events: [projected], reactions: [], filings: [], series: closes }, "2026-11-11").past).toEqual([]);
    const confirmed = buildHistory({ events: [projected], reactions: [], filings: [{ filedAt: "2026-08-05T20:30:00Z" }], series: closes }, "2026-11-11");
    expect(confirmed.past.map((report) => [report.date, report.session])).toEqual([["2026-08-05", "amc"]]);
  });
});

describe("moveStats", () => {
  it("uses the mean below four moves and the median from four", () => {
    const small = moveStats([past(-2), past(4)], 1);
    expect(small).toMatchObject({ count: 2, usual: 3, usualKind: "mean", ups: 1, downs: 1, vsNormalDay: 3 });
    const big = moveStats([past(-2), past(4), past(10), past(-1), past(null)], 1);
    expect(big).toMatchObject({ count: 4, usual: 3, usualKind: "median", biggest: { pct: 10, date: "2026-08-01" } });
  });

  it("compares with a normal day only when every move is one session", () => {
    expect(moveStats([past(6, { basis: "2d" })], 2).vsNormalDay).toBeNull();
    expect(moveStats([past(6), past(2, { basis: "2d" })], 2).vsNormalDay).toBeNull();
    expect(moveStats([past(6)], null).vsNormalDay).toBeNull();
  });

  it("counts beats and misses", () => {
    const stats = moveStats([past(1, { result: "beat" }), past(-1, { result: "miss" }), past(null, { result: "beat" })], 1);
    expect(stats).toMatchObject({ results: 3, beats: 2, misses: 1, count: 2 });
  });

  it("says nothing with no moves", () => {
    expect(moveStats([], 1)).toMatchObject({ count: 0, usual: null, usualKind: null, biggest: null });
  });
});

describe("words", () => {
  it("vsDayWords", () => {
    expect(vsDayWords(4.2)).toBe("about four times a normal day");
    expect(vsDayWords(2)).toBe("about twice a normal day");
    expect(vsDayWords(1)).toBe("about the size of a normal day");
    expect(vsDayWords(0.5)).toBe("smaller than a normal day");
    expect(vsDayWords(null)).toBeNull();
    expect(vsDayWords(14)).toBe("about 14 times a normal day");
  });

  it("historyWords", () => {
    const today = "2026-11-10";
    expect(historyWords(moveStats([past(-1.77)], 1), [past(-1.77)], today)).toBe("fell 1.8% after its last report");
    expect(historyWords(moveStats([past(-2), past(4)], 1), [], today)).toBe("moved 3.0% on average after its last two reports");
    const four = [past(8), past(-8), past(7), past(-12)];
    expect(historyWords(moveStats(four, 1), four, today)).toBe("has moved 8.0% on a typical report");
    expect(historyWords(moveStats([], 1), [], today)).toBeNull();
    // A single measured move that is not the latest report is named by its day, with the year when it is not this year's.
    const older = [past(null, { date: "2026-08-01" }), past(4.2, { date: "2025-03-06" })];
    expect(historyWords(moveStats(older, 1), older, today)).toBe("rose 4.2% after its Mar 6, 2025 report");
  });

  it("reportDay names the year only for an earlier year", () => {
    expect(reportDay("2026-03-06", "2026-11-10")).toBe("Mar 6");
    expect(reportDay("2025-03-06", "2026-11-10")).toBe("Mar 6, 2025");
  });

  it("whenWords and weekName", () => {
    expect(whenWords("2026-11-11", "2026-11-11")).toBe("today");
    expect(whenWords("2026-11-12", "2026-11-11")).toBe("tomorrow");
    expect(whenWords("2026-11-13", "2026-11-11")).toBe("on Friday");
    expect(whenWords("2026-11-17", "2026-11-11")).toBe("on Nov 17");
    expect(weekName("2026-11-09", "2026-11-11")).toBe("this week");
    expect(weekName("2026-11-16", "2026-11-11")).toBe("next week");
    expect(weekName("2026-11-23", "2026-11-11")).toBe("the week of Nov 23");
    // On a Saturday the planner starts with the coming week.
    expect(weekName("2026-11-16", "2026-11-14")).toBe("next week");
  });
});

describe("seasonWindow", () => {
  it("covers this week and the next five, Monday to Friday", () => {
    expect(seasonWindow("2026-11-11")).toMatchObject({ from: "2026-11-11", to: "2026-12-18" });
    expect(seasonWindow("2026-11-11").mondays).toHaveLength(6);
    // On a Saturday the weeks start Monday, but a report dated today still counts.
    expect(seasonWindow("2026-11-14")).toMatchObject({ from: "2026-11-14", to: "2026-12-25" });
    expect(seasonWindow("2026-11-14").mondays[0]).toBe("2026-11-16");
  });
});

function history(next: string | null, moves: number[], patch: Partial<StockHistory> = {}, session: "amc" | "bmo" | "unknown" = "amc"): StockHistory {
  return {
    past: moves.map((move, index) => past(move, { date: `2026-0${8 - index}-15` })),
    next: next ? { date: next, session, epsEstimate: 1, reported: false, result: null } : null,
    typicalDayPct: 2,
    ...patch,
  };
}

function stock(ticker: string, patch: Partial<SeasonStockInput>): SeasonStockInput {
  return { ticker, name: ticker, kind: "holding", value: 100, fund: false, history: null, ...patch };
}

describe("buildSeason", () => {
  const today = "2026-11-11";
  const season = buildSeason(
    [
      stock("NVDA", { name: "Nvidia", value: 110, history: history("2026-11-17", [-1.8, 4]) }),
      stock("COST", { name: "Costco", value: 40, history: history("2026-12-10", [-3.9]) }),
      stock("MSFT", { name: "Microsoft", value: 200, history: history(null, [-0.2]) }),
      stock("VOO", { name: "Vanguard S&P 500", value: 650, fund: true }),
      stock("AMD", { kind: "watching", value: null, history: history("2026-11-12", [4.7]) }),
      stock("NVDA", { value: 999 }),
    ],
    today,
  );

  it("weights holdings against all valued holdings, funds included", () => {
    const nvda = season.reporting.find((s) => s.ticker === "NVDA")!;
    expect(nvda.weight).toBe(11);
    expect(season.reporting.find((s) => s.ticker === "AMD")!.weight).toBeNull();
    expect(season.weighted).toBe(true);
  });

  it("orders the reports by date and keeps the rest for later, funds last", () => {
    expect(season.reporting.map((s) => s.ticker)).toEqual(["AMD", "NVDA", "COST"]);
    expect(season.later.map((s) => s.ticker)).toEqual(["MSFT", "VOO"]);
  });

  it("groups by week with the share of the portfolio", () => {
    expect(season.weeks).toHaveLength(6);
    expect(season.weeks[0]).toMatchObject({ start: "2026-11-09", weight: 0 });
    expect(season.weeks[0]!.stocks.map((s) => s.ticker)).toEqual(["AMD"]);
    expect(season.weeks[1]).toMatchObject({ start: "2026-11-16", weight: 11 });
    expect(season.weeks[4]).toMatchObject({ start: "2026-12-07", weight: 4 });
  });

  it("never puts a fund's report in the window", () => {
    const fundSeason = buildSeason([stock("QQQ", { fund: true, history: history("2026-11-17", []) })], today);
    expect(fundSeason.reporting).toEqual([]);
  });

  it("leaves weights out when no holding has a value", () => {
    const unvalued = buildSeason([stock("A", { value: null, history: history("2026-11-17", [1]) })], today);
    expect(unvalued.weighted).toBe(false);
    expect(unvalued.weeks[1]!.weight).toBeNull();
  });
});

describe("buildSeasonRead", () => {
  const today = "2026-11-11";

  it("names how many report, how much of the money, and the one to watch", () => {
    const season = buildSeason(
      [
        stock("NVDA", { name: "Nvidia", value: 110, history: history("2026-11-17", [-2, 4, 8, -10]) }),
        stock("COST", { name: "Costco", value: 40, history: history("2026-12-10", [-3.9]) }),
        stock("VOO", { value: 850, fund: true }),
      ],
      today,
    );
    const read = buildSeasonRead(season, { example: false })!;
    // One idea in the headline; the numbers are the first line under it.
    expect(read.headline).toBe("Two of your stocks report in the next six weeks. Nvidia, on Nov 17 after the close, is the one to watch.");
    expect(read.headlineTickers).toEqual(["NVDA"]);
    expect(read.insights[0]).toMatchObject({
      id: "watch-NVDA",
      text: "NVDA is 11% of the portfolio and has moved 6.0% on a typical report, about three times a normal day.",
      soWhat: "The two that report are 15% of your portfolio.",
      leadName: "Nvidia",
    });
    // One holding a week: no "busiest week" point, and Costco's one past move is called a small sample.
    expect(read.insights.some((insight) => insight.id.startsWith("week-"))).toBe(false);
    expect(read.insights.find((insight) => insight.id === "sample")?.text).toBe(
      "We have only one past report for Costco, so treat its past moves as a small sample.",
    );
    // The biggest past move belongs to the one to watch, so the swing point names nobody else under 4%.
    expect(read.insights.some((insight) => insight.id.startsWith("swing-"))).toBe(false);
  });

  it("says plainly when the history is a small sample, and who has none", () => {
    const season = buildSeason(
      [
        stock("NVDA", { name: "Nvidia", history: history("2026-11-17", [-1.8, 4]) }),
        stock("XYZ", { name: "Xyz", history: history("2026-11-18", []) }),
      ],
      today,
    );
    const read = buildSeasonRead(season, { example: true })!;
    expect(read.headline.startsWith("Two of the example's stocks report in the next two weeks.")).toBe(true);
    expect(read.insights[0]!.soWhat).toBe("The two that report are 100% of the example portfolio.");
    const sample = read.insights.find((insight) => insight.id === "sample")!;
    expect(sample.text).toBe("We have at most two past reports for each of these stocks, so treat their past moves as a small sample. Xyz has none.");
  });

  it("calls out a beat the stock still fell on", () => {
    const beatFell: StockHistory = {
      past: [past(-3, { date: "2026-10-28", result: "beat" }), past(-1, { date: "2026-07-28", result: "beat" })],
      next: { date: "2026-11-20", session: "bmo", epsEstimate: 1, reported: false, result: null },
      typicalDayPct: 1,
    };
    const season = buildSeason([stock("AMD", { name: "AMD", history: beatFell }), stock("B", { history: history("2026-11-19", [1]) })], today);
    const read = buildSeasonRead(season, { example: false })!;
    const point = read.insights.find((insight) => insight.id === "beatfell-AMD")!;
    expect(point.text).toBe("AMD beat estimates in both of the reports we have results for, and the stock still fell after both.");
    expect(point.action?.href).toBe("/calendar/earnings/AMD");
  });

  it("with one stock reporting, says when and what it did", () => {
    const season = buildSeason([stock("NVDA", { name: "Nvidia", history: history("2026-11-12", [-1.77]) }), stock("MSFT", { history: history(null, []) })], today);
    const read = buildSeasonRead(season, { example: false })!;
    expect(read.headline).toBe("One of your stocks reports this week: Nvidia, tomorrow after the close.");
    expect(read.insights[0]!.text).toBe("NVDA is 50% of the portfolio and fell 1.8% after its last report.");
  });

  it("with no history at all, says so rather than inventing a move", () => {
    const season = buildSeason([stock("NEW", { name: "Newco", value: null, history: history("2026-11-20", []) })], today);
    const read = buildSeasonRead(season, { example: false })!;
    expect(read.headline).toBe("One of your stocks reports in the next two weeks: Newco, on Nov 20 after the close.");
    // No weight and no history: no numbers line, and the small-sample line says there is nothing to go on.
    expect(read.insights.map((insight) => insight.id)).toEqual(["sample"]);
    expect(read.insights[0]!.text).toBe("We have no measured moves after past reports for Newco yet, so there is no history to go on.");
  });

  it("when only watched stocks report, the headline says so", () => {
    const season = buildSeason(
      [stock("MSFT", { history: history("2027-01-27", []) }), stock("AMD", { name: "AMD", kind: "watching", value: null, history: history("2026-11-17", [1]) })],
      today,
    );
    const read = buildSeasonRead(season, { example: false })!;
    expect(read.headline).toBe("None of your holdings report in the next six weeks, but one stock you watch does: AMD on Nov 17.");
    expect(read.insights[0]!.text).toBe("MSFT is the next holding on the calendar, on Jan 27, after the close.");
  });

  it("names the busiest week when it carries more than one holding", () => {
    const season = buildSeason(
      [
        stock("A", { name: "Alpha", value: 300, history: history("2026-11-17", [1, 2, 3, 4]) }),
        stock("B", { name: "Beta", value: 100, history: history("2026-11-19", [1, 2, 3, 4]) }),
        stock("C", { name: "Gamma", value: 100, history: history("2026-12-01", [1, 2, 3, 4]) }),
      ],
      today,
    );
    const read = buildSeasonRead(season, { example: false })!;
    expect(read.insights[0]!.id).toBe("watch-A");
    expect(read.insights[1]!.text).toBe("Next week is the busiest: 80% of the portfolio reports, Alpha and Beta.");
    expect(read.insights.some((insight) => insight.id === "sample")).toBe(false);
  });

  it("without weights, never calls a stock the biggest holding", () => {
    const season = buildSeason(
      [stock("AAA", { name: "Aaa", value: null, history: history("2026-11-17", []) }), stock("BBB", { name: "Bbb", value: null, history: history("2026-11-18", []) })],
      today,
    );
    const read = buildSeasonRead(season, { example: false })!;
    expect(read.headline).toBe("Two of your stocks report in the next two weeks. Aaa reports first, on Nov 17 after the close.");
  });

  it("says this week in the right words on a weekend", () => {
    const season = buildSeason([stock("A", { name: "Alpha", history: history("2026-11-18", [2]) })], "2026-11-14");
    expect(buildSeasonRead(season, { example: false })!.headline.startsWith("One of your stocks reports next week")).toBe(true);
  });

  it("with nothing at all, no read", () => {
    expect(buildSeasonRead(buildSeason([], today), { example: false })).toBeNull();
  });

  it("oneToWatch weighs size by the usual move", () => {
    const season = buildSeason(
      [
        stock("BIG", { value: 500, history: history("2026-11-17", [0.5]) }),
        stock("SWING", { value: 100, history: history("2026-11-18", [12]) }),
      ],
      today,
    );
    expect(oneToWatch(season.reporting)?.ticker).toBe("SWING");
  });
});
