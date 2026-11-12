import { describe, expect, it } from "vitest";

import { bigReportTickers, biggestReports, buildCalendarRead, pastMoveText, readTickers, surpriseOf, typicalDailyMove, whenWord } from "@/lib/calendar-insights";
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
      "fell 5.8% over the two days after its Aug 12 report, about 3 times its normal daily move",
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
      items, today: TODAY, period: "this week", mine: null, now: new Date(`${TODAY}T12:00:00Z`),
      context: { CSCO: { last: { pct: -5.8, basis: "2d", toDate: "2026-08-13", eventDate: "2026-08-12" }, typicalDayPct: 1.75 } },
    })!;
    expect(read.headline).toBe("CSCO and AMAT report on Thursday, the biggest of 3 companies still to report this week.");
    // Today's release is the first line under the earnings headline.
    expect(read.insights[0]!.id).toBe("economic");
    expect(read.insights[0]!.text).toBe("CPI inflation numbers come out today at 8:30 AM ET.");
    expect(read.insights[0]!.soWhat).toBe("Inflation numbers often move the whole market on the day they come out.");
    expect(read.insights[1]!.id).toBe("biggest");
    expect(read.insights[1]!.text).toContain("about 3 times its normal daily move");
    expect(read.insights[2]!.text).toBe("So far 3 of 3 companies beat what analysts expected (100%), and none fell short. Biggest moves after: CNH +13.5% and CEG +9.5%.");
  });

  it("leads with one idea and one number whatever the count", () => {
    const one = buildCalendarRead({ items: [earn("CSCO", "2026-11-12", 443e9)], today: TODAY, period: "this week", mine: null })!;
    expect(one.headline).toBe("CSCO reports on Thursday, the only company reporting this week.");
    const apart = buildCalendarRead({ items: [earn("CSCO", "2026-11-12", 443e9), earn("NVDA", "2026-11-11", 4e12), earn("ONON", TODAY, 1e9)], today: TODAY, period: "this week", mine: null })!;
    expect(apart.headline).toBe("NVDA reports tomorrow and CSCO on Thursday, the biggest of 3 companies reporting this week.");
    const mine = buildCalendarRead({ items: [earn("CSCO", "2026-11-12", 443e9), earn("ONON", TODAY, 1e9)], today: TODAY, period: "this week", mine: null, onlyMine: true })!;
    expect(mine.headline).toBe("CSCO reports on Thursday and ONON today, the only two of your stocks reporting this week.");
  });

  it("leaves the biggest-report card out when the page shows those reports as cards", () => {
    const read = buildCalendarRead({ items, today: TODAY, period: "this week", mine: null, biggestShown: true })!;
    expect(read.insights.some((insight) => insight.id === "biggest")).toBe(false);
  });

  it("says a release earlier today came out, by New York time", () => {
    const at = (iso: string) => buildCalendarRead({ items, today: TODAY, period: "this week", mine: null, now: new Date(iso) })!.insights[0]!.text;
    // 8:29 and 8:31 AM in New York (EST, UTC-5) on TODAY.
    expect(at(`${TODAY}T13:29:00Z`)).toMatch(/^CPI inflation numbers come out today at 8:30 AM ET\./);
    expect(at(`${TODAY}T13:31:00Z`)).toMatch(/^CPI inflation numbers came out today at 8:30 AM ET\./);
  });

  it("puts the person's own stocks first, in date order", () => {
    const read = buildCalendarRead({ items, today: TODAY, period: "this week", mine: new Set(["CSCO", "ONON"]), mineHref: "/calendar?mine=1" })!;
    expect(read.insights[0]!.text).toBe("Two of your stocks report this week: ONON today and CSCO Thursday.");
    expect(read.insights[1]!.id).toBe("economic");
    expect(read.insights[2]!.tickers?.[0]).toBe("AMAT");
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

describe("biggestReports", () => {
  const items: CalendarItem[] = [earn("CSCO", "2026-11-12", 443e9), earn("AMAT", "2026-11-11", 346e9, { session: "bmo" }), earn("NEW", "2026-11-12", 500e9), earn("TINY", "2026-11-12", 1e6), beat("CEG", 9.5)];
  const context = {
    CSCO: { last: { pct: -8.4, basis: "1d" as const, toDate: "2026-08-13", eventDate: "2026-08-12" }, typicalDayPct: 1.7 },
    AMAT: { last: { pct: 2, basis: "1d" as const, toDate: "2026-08-15", eventDate: "2026-08-14" }, typicalDayPct: null },
    TINY: { last: { pct: 30, basis: "1d" as const, toDate: "2026-08-15", eventDate: "2026-08-14" }, typicalDayPct: 3 },
  };
  it("picks the biggest still to report with a last move, largest first, and says each move once", () => {
    expect(bigReportTickers(items, TODAY)).toEqual(["NEW", "CSCO", "AMAT", "TINY"]);
    const cards = biggestReports(items, TODAY, context);
    // NEW has no report we hold, so it gets no empty card.
    expect(cards.map((card) => card.item.ticker)).toEqual(["CSCO", "AMAT", "TINY"]);
    expect(cards[0]!.lastPct).toBe(-8.4);
    expect(cards[0]!.when).toBe("Thursday after the close");
    expect(cards[0]!.size).toBe("Its last report, on Aug 12, moved it about 5 times as much as a normal day.");
    expect(cards[1]!.when).toBe("tomorrow before the open");
    expect(cards[1]!.size).toBe("Its last report was on Aug 14.");
    expect(cards[0]!.size).not.toContain("8.4");
    expect(cards[0]!.expect).toBe("Analysts expect a profit of $1.00 a share.");
  });

  it("says no estimate when analysts have none", () => {
    const bare = [earn("CSCO", "2026-11-12", 443e9, { epsEstimate: null })];
    expect(biggestReports(bare, TODAY, context)[0]!.expect).toBeNull();
  });

  it("never reaches past the biggest few for a small company", () => {
    expect(biggestReports(items, TODAY, context, 3).map((card) => card.item.ticker)).toEqual(["CSCO", "AMAT"]);
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

describe("the release and IPO cards (judges, ship 44: short cards with evidence)", () => {
  const econ = (id: string, date: string, title: string): CalendarItem => ({ kind: "economic", id, date, timeEt: "08:30", title, period: "", importance: "high", sourceName: "", sourceUrl: "" });
  const ipo = (id: string, date: string, company: string, amount: number): CalendarItem => ({
    kind: "ipo", id, date, ticker: id.toUpperCase(), company, status: "expected", exchange: "NYSE", priceLow: 21, priceHigh: 24, shares: null, offerAmount: amount,
  });

  it("gives the next big release its day as the figure and the week's earlier one as evidence", () => {
    const read = buildCalendarRead({
      items: [earn("CSCO", "2026-11-12", 443e9), econ("cpi", "2026-11-09", "CPI inflation"), econ("ppi", "2026-11-13", "PPI inflation")],
      today: TODAY,
      period: "this week",
      mine: null,
      biggestShown: true,
    })!;
    const card = read.insights.find((insight) => insight.id === "economic")!;
    expect(card.figure).toEqual({ value: "Friday", label: "8:30 AM ET" });
    expect(card.text).toBe("PPI is the one big data release left this week.");
    expect(card.soWhat).toBe("It follows CPI on Monday. Inflation numbers often move the whole market on the day they come out.");
  });

  it("names how many IPOs there are and the next biggest", () => {
    const read = buildCalendarRead({
      items: [earn("CSCO", "2026-11-12", 443e9), ipo("vvvv", "2026-11-13", "vVARDIS", 262.9e6), ipo("rzra", "2026-11-12", "Rezera", 249.2e6), ipo("wwb", "2026-11-13", "Windward", 213e6)],
      today: TODAY,
      period: "this week",
      mine: null,
      biggestShown: true,
    })!;
    const card = read.insights.find((insight) => insight.id === "ipo")!;
    expect(card.soWhat).toBe("It is the biggest of 3 IPOs this week; the next biggest is Rezera at $249.2M, Thursday.");
  });
});

describe("today's release and the week's card", () => {
  const econ = (id: string, date: string, title: string): CalendarItem => ({ kind: "economic", id, date, timeEt: "08:30", title, period: "", importance: "high", sourceName: "", sourceUrl: "" });
  it("never says today's release twice, and never calls a release already out 'left'", () => {
    const read = buildCalendarRead({
      items: [earn("CSCO", "2026-11-12", 443e9), econ("cpi", TODAY, "CPI inflation"), econ("ppi", "2026-11-13", "PPI inflation")],
      today: TODAY, period: "this week", mine: null, biggestShown: true, now: new Date(`${TODAY}T18:00:00Z`),
    })!;
    const week = read.insights.find((insight) => insight.id === "economic-week")!;
    expect(week.figure?.value).toBe("Friday");
    expect(week.text).toBe("PPI is the one big data release left this week.");
    expect(read.insights.filter((insight) => /Inflation numbers/.test(insight.soWhat ?? "")).length).toBe(1);
    const alone = buildCalendarRead({ items: [econ("cpi", TODAY, "CPI inflation")], today: TODAY, period: "this week", mine: null, now: new Date(`${TODAY}T18:00:00Z`) })!;
    expect(alone.insights.some((insight) => /left/.test(insight.text))).toBe(false);
  });
});
