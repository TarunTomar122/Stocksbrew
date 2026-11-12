import { describe, expect, it } from "vitest";

import { moveFacts, type CloseSeries } from "./briefing-move-facts";

/** Sessions of closes ending the day before `end`, built from daily returns in percent, oldest first. */
function series(returns: number[], start = "2026-01-01"): CloseSeries {
  const dates: string[] = [];
  const closes: number[] = [];
  let close = 100;
  let day = Date.parse(`${start}T12:00:00Z`);
  dates.push(start);
  closes.push(close);
  for (const pct of returns) {
    day += 86_400_000;
    close *= 1 + pct / 100;
    dates.push(new Date(day).toISOString().slice(0, 10));
    closes.push(close);
  }
  return { dates, closes };
}

describe("moveFacts", () => {
  // A quiet stock: 1% up and down, with one 4% gain early on.
  const quiet = [4, ...Array.from({ length: 120 }, (_, index) => (index % 2 ? -1 : 1))];

  it("names the last move as big, against the stock's own normal day", () => {
    const facts = moveFacts(3, series(quiet), "2026-12-31");
    expect(facts[0]).toBe("Its biggest gain since Jan 2");
    expect(facts[1]).toBe("About three times a normal 1.0% day");
  });

  it("says the biggest move in the whole history when nothing matched it, in months or years", () => {
    // 121 daily closes from Jan 1: the move on May 2 is the biggest in about four months.
    expect(moveFacts(5, series(quiet), "2026-05-02")[0]).toBe("Its biggest gain in more than 3 months");
    expect(moveFacts(-5, series(quiet), "2026-05-02")[0]).toBe("Its biggest drop in more than 3 months");
    const long = series(Array.from({ length: 800 }, (_, index) => (index % 2 ? -1 : 1)), "2024-01-01");
    expect(moveFacts(5, long, "2026-03-12")[0]).toMatch(/^Its biggest gain in more than (a year|2 years)$/);
  });

  it("keeps a last close that only happens to match the move when the move's day is known", () => {
    const withYesterday = series([...quiet, 3]);
    const next = "2026-05-04";
    // Yesterday rose 3% too: with the quote's own day, it is a real earlier session, so the move is no bigger than it.
    expect(moveFacts(3, withYesterday, next, { exactDay: true })[0]).not.toMatch(/biggest/);
    // Without it, the same close is taken as the move itself and left out.
    expect(moveFacts(3, withYesterday, next)[0]).toBe("Its biggest gain since Jan 2");
  });

  it("says a normal-sized move as the normal day only", () => {
    const facts = moveFacts(0.9, series(quiet), "2026-12-31");
    expect(facts).not.toContain(expect.stringMatching(/biggest/));
    expect(facts[0]).toBe("A normal day moves it about 1.0%");
  });

  it("never measures the move against itself or a later close", () => {
    const withToday = series([...quiet, 3]);
    const day = withToday.dates[withToday.dates.length - 1]!;
    // The last close already holds today's 3%: it is left out, so the answer matches the history without it.
    expect(moveFacts(3, withToday, day)).toEqual(moveFacts(3, series(quiet), day));
  });

  it("says where the month stands with today's move in it, only from a series that runs up to the move", () => {
    const falling = [...Array.from({ length: 100 }, () => 0.5), ...Array.from({ length: 20 }, () => -1)];
    // 120 returns from Jan 1 end on May 1; the move is on May 2.
    expect(moveFacts(2, series(falling), "2026-05-02")).toContain("Still down 16.6% over the past month");
    expect(moveFacts(2, series(falling), "2026-05-20").some((fact) => /past month/.test(fact))).toBe(false);
  });

  it("says nothing with too little history", () => {
    expect(moveFacts(3, series([1, 2, 3]), "2026-12-31")).toEqual([]);
    expect(moveFacts(3, null, "2026-12-31")).toEqual([]);
    expect(moveFacts(0, series(quiet), "2026-12-31")).toEqual([]);
  });
});

describe("one month for every page", () => {
  it("counts the month on the S&P 500's sessions, so a stock missing a close is measured over the same days", async () => {
    const { monthChange, windowStart } = await import("./briefing-move-facts");
    const spy = series(Array.from({ length: 30 }, () => 0.1), "2026-10-01");
    const day = spy.dates[spy.dates.length - 1]!;
    const window = windowStart(spy, day, 21)!;
    expect(window.stored).toBe(true);
    expect(window.from).toBe(spy.dates[spy.dates.length - 1 - 21]);
    // The stock's own closes lack the last two days: the start is still SPY's, and the end is the price given.
    const stock = { dates: spy.dates.slice(0, -2), closes: spy.dates.slice(0, -2).map(() => 100) };
    expect(monthChange(stock, spy, day, 110)).toBeCloseTo(10, 6);
    // Today not stored yet: the window ends at today all the same.
    const next = "2026-11-02";
    expect(windowStart(spy, next, 21)!.stored).toBe(false);
    // A Saturday is no session: the window is the one ending on Friday's close.
    const weekdays = { dates: [] as string[], closes: [] as number[] };
    for (let at = Date.parse("2026-09-01T12:00:00Z"); at <= Date.parse("2026-10-30T12:00:00Z"); at += 86_400_000) {
      if ([0, 6].includes(new Date(at).getUTCDay())) continue;
      weekdays.dates.push(new Date(at).toISOString().slice(0, 10));
      weekdays.closes.push(100);
    }
    expect(windowStart(weekdays, "2026-10-31", 21)).toEqual(windowStart(weekdays, "2026-10-30", 21));
    // A weekday not stored yet is today's session on top.
    expect(windowStart(weekdays, "2026-11-02", 21)!.start).toBe(windowStart(weekdays, "2026-10-30", 21)!.start + 1);
    expect(monthChange(stock, null, day, 110)).toBeNull();
    expect(monthChange(stock, spy, day, null)).toBeNull();
  });

  it("uses the month it is given in place of its own", () => {
    const quiet = [4, ...Array.from({ length: 120 }, (_, index) => (index % 2 ? -1 : 1))];
    expect(moveFacts(0.9, series(quiet), "2026-12-31", { month: -2.44 })).toContain("Still down 2.4% over the past month");
    expect(moveFacts(0.9, series(quiet), "2026-12-31", { month: null }).some((fact) => /month/.test(fact))).toBe(false);
  });
});
