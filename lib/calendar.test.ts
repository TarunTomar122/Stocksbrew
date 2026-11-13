import { describe, expect, it } from "vitest";

import {
  addDays,
  bucketByDay,
  calendarHref,
  defaultWeekStart,
  earningsCount,
  filterItems,
  fmtEps,
  fmtIpoPrice,
  fmtMonth,
  fmtTimeET,
  fmtDayRange,
  fmtWeekRange,
  heatLevel,
  isTradingDay,
  monthBounds,
  monthGrid,
  tradingDayOnOrAfter,
  normalizeAgentEvent,
  normalizeEarnings,
  parseCalendarFilters,
  parseDay,
  parseMonth,
  relativeDay,
  sessionOf,
  shiftMonth,
  summarizeReports,
  todayET,
  topReporters,
  viewRange,
  weekDays,
  windowSpan,
  weekStart,
  weekdayIndex,
  weekdayName,
  windowDays,
  type CalendarItem,
  type EarningsItem,
} from "@/lib/calendar-shared";

const TODAY = "2026-11-09"; // a Monday

function earnings(patch: Partial<EarningsItem> & { ticker: string; date: string }): EarningsItem {
  return {
    kind: "earnings",
    id: `${patch.ticker}_${patch.date}`,
    company: patch.ticker,
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

describe("day math", () => {
  it("accepts only real days", () => {
    expect(parseDay("2026-11-09")).toBe("2026-11-09");
    expect(parseDay("2026-02-31")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("11/09/2026")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the Monday of any day", () => {
    expect(weekdayIndex("2026-11-09")).toBe(0);
    expect(weekdayIndex("2026-11-15")).toBe(6);
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-13")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekDays("2026-11-09")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(weekDays("2026-11-30")[4]).toBe("2026-12-04");
  });

  it("opens the coming week on a weekend", () => {
    expect(defaultWeekStart("2026-11-13")).toBe("2026-11-09"); // Friday
    expect(defaultWeekStart("2026-11-14")).toBe("2026-11-16"); // Saturday
    expect(defaultWeekStart("2026-11-15")).toBe("2026-11-16"); // Sunday
  });

  it("reads New York's day, not UTC's", () => {
    expect(todayET(Date.parse("2026-11-10T03:00:00Z"))).toBe("2026-11-09");
    expect(todayET(Date.parse("2026-11-10T05:30:00Z"))).toBe("2026-11-10");
  });
});

describe("month math", () => {
  it("parses, shifts and bounds months", () => {
    expect(parseMonth("2026-11")).toBe("2026-11");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-1")).toBeNull();
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(fmtMonth("2026-11")).toBe("November 2026");
  });

  it("lays a month out as weeks of weekdays", () => {
    const grid = monthGrid("2026-11"); // Nov 1 2026 is a Sunday, Nov 30 a Monday
    expect(grid).toHaveLength(5);
    expect(grid.every((week) => week.length === 5)).toBe(true);
    expect(grid[0]!.map((cell) => cell.day)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(grid[4]!.map((cell) => [cell.day, cell.inMonth])).toEqual([
      ["2026-11-30", true],
      ["2026-12-01", false],
      ["2026-12-02", false],
      ["2026-12-03", false],
      ["2026-12-04", false],
    ]);
  });

  it("drops a leading week whose weekdays all fall in the previous month", () => {
    // Aug 1 2026 is a Saturday: the week of Jul 27 has no August weekday.
    const grid = monthGrid("2026-08");
    expect(grid[0]![0]!.day).toBe("2026-08-03");
    expect(grid.flat().filter((cell) => cell.inMonth)).toHaveLength(21);
  });
});

describe("labels", () => {
  it("formats ranges, weekdays, relative days and times", () => {
    expect(fmtWeekRange("2026-11-09")).toBe("Nov 9 to 13, 2026");
    expect(fmtWeekRange("2026-11-30")).toBe("Nov 30 to Dec 4, 2026");
    expect(fmtWeekRange("2026-12-28")).toBe("Dec 28 to Jan 1, 2027");
    expect(weekdayName("2026-11-09")).toBe("Mon");
    expect(weekdayName("2026-11-14", true)).toBe("Saturday");
    expect(relativeDay(TODAY, TODAY)).toBe("Today");
    expect(relativeDay("2026-11-10", TODAY)).toBe("Tomorrow");
    expect(relativeDay("2026-11-08", TODAY)).toBe("Yesterday");
    expect(relativeDay("2026-11-17", TODAY)).toBe("in 8 days");
    expect(relativeDay("2026-11-02", TODAY)).toBe("7 days ago");
    expect(fmtTimeET("08:30")).toBe("8:30 AM");
    expect(fmtTimeET("14:00")).toBe("2:00 PM");
    expect(fmtTimeET("12:05")).toBe("12:05 PM");
    expect(fmtTimeET("00:15")).toBe("12:15 AM");
    expect(fmtTimeET(null)).toBe("");
  });

  it("never prints a number for an unknown value", () => {
    expect(fmtEps(1.244)).toBe("$1.24");
    expect(fmtEps(-0.12)).toBe("−$0.12");
    expect(fmtEps(0)).toBe("$0.00");
    expect(fmtEps(null)).toBe("");
    expect(fmtIpoPrice(11, 13)).toBe("$11 to $13");
    expect(fmtIpoPrice(10, 10)).toBe("$10");
    expect(fmtIpoPrice(4.5, null)).toBe("$4.50");
    expect(fmtIpoPrice(null, null)).toBe("");
  });
});

describe("normalising stored rows", () => {
  it("reads an upcoming and a reported earnings event", () => {
    const upcoming = normalizeEarnings({ ticker: "nvda", company: "NVIDIA", event_date: "2026-11-17", market: "US", time: "amc", eps_estimate: 2.49 });
    expect(upcoming).toMatchObject({ id: "NVDA_2026-11-17", session: "amc", epsEstimate: 2.49, epsActual: null, surpriseLabel: null, surprisePct: null });
    const reported = normalizeEarnings({
      ticker: "AAPL",
      event_date: "2026-11-02",
      market: "US",
      time: "during",
      eps_estimate: 1.98,
      reported_eps: 2.05,
      eps_surprise_pct: 3.54,
      surprise_label: "beat",
    });
    expect(reported).toMatchObject({ session: "unknown", epsActual: 2.05, surprisePct: 3.54, surpriseLabel: "beat", company: "AAPL" });
  });

  it("drops retired dates, other markets and broken rows, and never shows a surprise without a result", () => {
    expect(normalizeEarnings({ ticker: "X", event_date: "2026-11-02", market: "US_SUPERSEDED" })).toBeNull();
    expect(normalizeEarnings({ ticker: "X", event_date: "2026-11-02", market: "IN" })).toBeNull();
    expect(normalizeEarnings({ ticker: "", event_date: "2026-11-02", market: "US" })).toBeNull();
    expect(normalizeEarnings({ ticker: "X", event_date: "soon", market: "US" })).toBeNull();
    const stray = normalizeEarnings({ ticker: "X", event_date: "2026-11-02", market: "US", eps_surprise_pct: 9, surprise_label: "beat" });
    expect(stray).toMatchObject({ epsActual: null, surprisePct: null, surpriseLabel: null });
    expect(sessionOf("BMO")).toBe("bmo");
    expect(sessionOf(undefined)).toBe("unknown");
  });

  it("reads economic, IPO and dividend rows and skips superseded ones", () => {
    expect(
      normalizeAgentEvent({ id: "eco_bls_cpi_2026-11-10", kind: "economic", date: "2026-11-10", time_et: "08:30", title: "CPI inflation", importance: "high", source_name: "BLS" }),
    ).toMatchObject({ kind: "economic", timeEt: "08:30", importance: "high" });
    expect(normalizeAgentEvent({ id: "x", kind: "economic", date: "2026-11-10", title: "CPI", superseded: true })).toBeNull();
    expect(
      normalizeAgentEvent({ id: "ipo_1", kind: "ipo", date: "2026-11-12", company: "Rezera Inc.", ticker: "rzra", status: "expected", price_low: 11, price_high: 13 }),
    ).toMatchObject({ kind: "ipo", ticker: "RZRA", status: "expected", priceLow: 11, priceHigh: 13, offerAmount: null });
    expect(normalizeAgentEvent({ id: "ipo_2", kind: "ipo", date: "2026-11-12", company: "No Ticker Co" })).toMatchObject({ ticker: null });
    expect(normalizeAgentEvent({ id: "div_1", kind: "dividend", date: "2026-11-10", ticker: "AEP", amount: 0.97, payment_date: "2026-12-10" })).toMatchObject({
      kind: "dividend",
      amount: 0.97,
      paymentDate: "2026-12-10",
    });
    expect(normalizeAgentEvent({ id: "div_2", kind: "dividend", date: "2026-11-10", ticker: "AEP", amount: 0 })).toBeNull();
    expect(normalizeAgentEvent({ id: "z", kind: "filing", date: "2026-11-10" })).toBeNull();
  });
});

describe("filters in the URL", () => {
  it("centres the week on today by default and keeps a pinned day as it is", () => {
    const base = parseCalendarFilters(undefined, TODAY);
    expect(base).toEqual({ view: "week", type: null, mine: false, center: TODAY, month: "2026-11", from: TODAY, day: null });
    // Any day pins the window, an old Monday link included.
    expect(parseCalendarFilters({ w: "2026-11-05" }, TODAY).center).toBe("2026-11-05");
    expect(parseCalendarFilters({ w: "2026-11-02" }, TODAY).center).toBe("2026-11-02");
    expect(parseCalendarFilters({ w: "garbage", view: "sideways", type: "ipo" }, TODAY)).toMatchObject({ view: "week", center: TODAY, type: "ipo" });
    expect(parseCalendarFilters({ w: "2026-02-31" }, TODAY).center).toBe(TODAY);
    expect(parseCalendarFilters({ day: "2026-11-12", view: "month" }, TODAY)).toMatchObject({ view: "list", day: "2026-11-12" });
    expect(parseCalendarFilters(undefined, "2026-11-14").center).toBe("2026-11-14");
  });

  it("builds links without defaults and round-trips", () => {
    const base = parseCalendarFilters(undefined, TODAY);
    expect(calendarHref(base, TODAY)).toBe("/calendar");
    expect(calendarHref(base, TODAY, { type: "ipo" })).toBe("/calendar?type=ipo");
    expect(calendarHref(base, TODAY, { center: "2026-11-16" })).toBe("/calendar?w=2026-11-16");
    // A day that centres where today does is the default: no `w`.
    expect(calendarHref(base, TODAY, { center: TODAY })).toBe("/calendar");
    expect(calendarHref({ ...base, center: "2026-11-14" }, "2026-11-15")).toBe("/calendar");
    const pinned = parseCalendarFilters(Object.fromEntries(new URL(calendarHref(base, TODAY, { center: "2026-11-20" }), "https://x.test").searchParams), TODAY);
    expect(pinned.center).toBe("2026-11-20");
    expect(calendarHref(base, TODAY, { view: "month" })).toBe("/calendar?view=month");
    expect(calendarHref(base, TODAY, { view: "month", month: "2026-12", mine: true })).toBe("/calendar?view=month&mine=1&m=2026-12");
    expect(calendarHref(base, TODAY, { view: "list", day: "2026-11-12" })).toBe("/calendar?view=list&day=2026-11-12");
    expect(calendarHref(base, TODAY, { view: "list", from: "2026-11-30" })).toBe("/calendar?view=list&from=2026-11-30");
    const href = calendarHref(base, TODAY, { view: "month", month: "2026-12", type: "earnings" });
    const parsed = parseCalendarFilters(Object.fromEntries(new URL(href, "https://x.test").searchParams), TODAY);
    expect(parsed).toMatchObject({ view: "month", month: "2026-12", type: "earnings" });
  });

  it("loads the right span for each view", () => {
    const base = parseCalendarFilters(undefined, TODAY);
    // Thu Nov 5 and Fri Nov 6, today, Tue Nov 10 and Wed Nov 11: the weekend between is loaded too.
    expect(viewRange(base)).toEqual({ from: "2026-11-05", to: "2026-11-11" });
    // A window that ends on a Friday loads the weekend after it too.
    expect(viewRange({ ...base, center: "2026-11-11" })).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    // Ending the day before Thanksgiving: the holiday is loaded, so an event on it is not lost.
    expect(viewRange({ ...base, center: "2026-11-23" })).toEqual({ from: "2026-11-19", to: "2026-11-26" });
    expect(viewRange({ ...base, view: "month", month: "2026-11" })).toEqual({ from: "2026-11-02", to: "2026-12-04" });
    expect(viewRange({ ...base, view: "list" })).toEqual({ from: TODAY, to: "2026-11-29" });
    expect(viewRange({ ...base, view: "list", day: "2026-11-12" })).toEqual({ from: "2026-11-12", to: "2026-11-12" });
  });
});

describe("grouping and filtering", () => {
  const items: CalendarItem[] = [
    earnings({ ticker: "SMALL", date: "2026-11-10", session: "bmo", marketCap: 2e9 }),
    earnings({ ticker: "MEGA", date: "2026-11-10", session: "bmo", marketCap: 3e12 }),
    earnings({ ticker: "NOCAP", date: "2026-11-10", session: "bmo" }),
    earnings({ ticker: "LATE", date: "2026-11-10", session: "amc", marketCap: 5e10 }),
    earnings({ ticker: "WHEN", date: "2026-11-10", marketCap: 9e11 }),
    { kind: "economic", id: "e1", date: "2026-11-10", timeEt: "10:00", title: "Job openings (JOLTS)", period: "", importance: "normal", sourceName: "BLS", sourceUrl: "" },
    { kind: "economic", id: "e2", date: "2026-11-10", timeEt: "08:30", title: "CPI inflation", period: "", importance: "high", sourceName: "BLS", sourceUrl: "" },
    { kind: "ipo", id: "i1", date: "2026-11-12", ticker: "RZRA", company: "Rezera", status: "expected", exchange: "NASDAQ", priceLow: 11, priceHigh: 13, shares: null, offerAmount: 2.5e8 },
    { kind: "dividend", id: "d1", date: "2026-11-12", ticker: "AAPL", company: "Apple", amount: 0.27, annualAmount: 1.08, paymentDate: "2026-11-16" },
  ];

  it("splits a day into sessions and orders each by size", () => {
    const days = bucketByDay(items);
    const tuesday = days.get("2026-11-10")!;
    expect(tuesday.earnings.bmo.map((row) => row.ticker)).toEqual(["MEGA", "SMALL", "NOCAP"]);
    expect(tuesday.earnings.amc.map((row) => row.ticker)).toEqual(["LATE"]);
    expect(tuesday.earnings.unknown.map((row) => row.ticker)).toEqual(["WHEN"]);
    expect(tuesday.economic.map((row) => row.title)).toEqual(["CPI inflation", "Job openings (JOLTS)"]);
    expect(tuesday.total).toBe(7);
    expect(earningsCount(tuesday)).toBe(5);
    expect(topReporters(tuesday, 2).map((row) => row.ticker)).toEqual(["MEGA", "WHEN"]);
    const thursday = days.get("2026-11-12")!;
    expect([thursday.ipos.length, thursday.dividends.length, thursday.total]).toEqual([1, 1, 2]);
    expect(days.has("2026-11-11")).toBe(false);
  });

  it("filters by type and by my stocks (which hides rows with no ticker)", () => {
    expect(filterItems(items, { type: "economic", mine: false })).toHaveLength(2);
    expect(filterItems(items, { type: null, mine: true }, new Set(["AAPL", "MEGA"])).map((row) => row.id)).toEqual(["MEGA_2026-11-10", "d1"]);
    expect(filterItems(items, { type: "earnings", mine: true }, new Set(["AAPL"]))).toEqual([]);
    expect(filterItems(items, { type: null, mine: true }, null)).toHaveLength(items.length);
  });

  it("scales heat against the busiest day", () => {
    expect(heatLevel(0, 70)).toBe(0);
    expect(heatLevel(5, 70)).toBe(1);
    expect(heatLevel(20, 70)).toBe(2);
    expect(heatLevel(40, 70)).toBe(3);
    expect(heatLevel(70, 70)).toBe(4);
    expect(heatLevel(3, 0)).toBe(0);
  });
});

describe("summarizeReports", () => {
  it("finds the next and last report and the typical move", () => {
    const events = [
      earnings({ ticker: "AAPL", date: "2026-07-30", epsEstimate: 1.89, epsActual: 1.57, surpriseLabel: "miss", reaction: { pct: -7.3, basis: "2d", toDate: "2026-07-31" } }),
      earnings({ ticker: "AAPL", date: "2026-11-02", epsEstimate: 1.98, epsActual: 2.05, surpriseLabel: "beat", reaction: { pct: -3.69, basis: "2d", toDate: "2026-11-03" } }),
      earnings({ ticker: "AAPL", date: "2027-01-28", epsEstimate: 2.4 }),
    ];
    const summary = summarizeReports(events, TODAY);
    expect(summary.next?.date).toBe("2027-01-28");
    expect(summary.last?.date).toBe("2026-11-02");
    expect([summary.reported, summary.beats, summary.misses, summary.moves]).toEqual([2, 1, 1, 2]);
    expect(summary.avgAbsMove).toBeCloseTo(5.495, 3);
  });

  it("returns nulls when nothing is known and ignores a past date with no result as next", () => {
    expect(summarizeReports([], TODAY)).toEqual({ next: null, last: null, reported: 0, beats: 0, misses: 0, avgAbsMove: null, moves: 0 });
    const summary = summarizeReports([earnings({ ticker: "X", date: "2026-11-05" })], TODAY);
    expect(summary.next).toBeNull();
    expect(summary.last).toBeNull();
  });
});

describe("normalizeEarnings surprise", () => {
  it("re-derives a stored beat that contradicts the estimate it is shown against", () => {
    const item = normalizeEarnings({ event_date: "2026-08-12", ticker: "CSCO", market: "US", reported_eps: 1.08, eps_estimate: 1.17, eps_surprise_pct: 9.1, surprise_label: "beat" })!;
    expect(item.surpriseLabel).toBe("miss");
    expect(item.surprisePct).toBe(-7.7);
  });
  it("keeps a stored label that agrees", () => {
    const item = normalizeEarnings({ event_date: "2026-11-09", ticker: "CEG", market: "US", reported_eps: 5.06, eps_estimate: 3.9, eps_surprise_pct: 30.08, surprise_label: "beat" })!;
    expect(item.surpriseLabel).toBe("beat");
    expect(item.surprisePct).toBe(30.08);
  });
});

describe("the week view's window", () => {
  it("knows trading days: weekdays that are not NYSE holidays", () => {
    expect(isTradingDay("2026-11-13")).toBe(true); // Friday
    expect(isTradingDay("2026-11-14")).toBe(false); // Saturday
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(isTradingDay("2026-12-25")).toBe(false); // Christmas
    expect(tradingDayOnOrAfter("2026-11-13")).toBe("2026-11-13");
    expect(tradingDayOnOrAfter("2026-11-14")).toBe("2026-11-16");
    expect(tradingDayOnOrAfter("2026-11-26")).toBe("2026-11-27");
    expect(tradingDayOnOrAfter("2026-12-24")).toBe("2026-12-24");
  });

  it("puts today in the middle, two trading days either side", () => {
    // Friday Nov 13: Wed and Thu before, Mon and Tue after.
    expect(windowDays("2026-11-13")).toEqual(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17"]);
    // Monday: the Thursday and Friday before.
    expect(windowDays("2026-11-09")).toEqual(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
    // Midweek: one plain week.
    expect(windowDays("2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(windowDays("2026-11-11")[2]).toBe("2026-11-11");
  });

  it("centres a weekend or a holiday on the next trading day and skips holidays inside", () => {
    expect(windowDays("2026-11-14")).toEqual(["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(windowDays("2026-11-15")).toEqual(windowDays("2026-11-16"));
    // Thanksgiving: Friday Nov 27 in the middle, the holiday left out.
    expect(windowDays("2026-11-26")).toEqual(["2026-11-24", "2026-11-25", "2026-11-27", "2026-11-30", "2026-12-01"]);
    // Across Christmas and the new year.
    expect(windowDays("2026-12-28")).toEqual(["2026-12-23", "2026-12-24", "2026-12-28", "2026-12-29", "2026-12-30"]);
    expect(windowDays("2026-12-31")).toEqual(["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-04", "2027-01-05"]);
  });

  it("steps a week at a time from the anchor, keeping the weekday in the middle", () => {
    const today = "2026-11-13";
    expect(windowDays(addDays(today, 7))[2]).toBe("2026-11-20");
    expect(windowDays(addDays(today, -7))[2]).toBe("2026-11-06");
    // Into a holiday and back: the anchor round-trips even though the middle moved to the next trading day.
    const thanksgiving = addDays("2026-11-19", 7);
    expect(windowDays(thanksgiving)[2]).toBe("2026-11-27");
    expect(windowDays(addDays(thanksgiving, -7))[2]).toBe("2026-11-19");
  });

  it("loads the window and any closed days inside or right after it", () => {
    expect(windowSpan("2026-11-13")).toEqual({ from: "2026-11-11", to: "2026-11-17" });
    expect(windowSpan("2026-12-29")).toEqual({ from: "2026-12-24", to: "2027-01-03" });
  });

  it("labels the window across months and years", () => {
    expect(fmtDayRange("2026-11-11", "2026-11-17")).toBe("Nov 11 to 17, 2026");
    expect(fmtDayRange("2026-11-25", "2026-12-01")).toBe("Nov 25 to Dec 1, 2026");
    expect(fmtDayRange("2026-12-29", "2027-01-05")).toBe("Dec 29, 2026 to Jan 5, 2027");
  });
});
