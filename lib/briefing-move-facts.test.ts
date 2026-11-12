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

describe("quietFact", () => {
  it("cuts the first telling fact to one short line, never the normal day on its own", async () => {
    const { quietFact } = await import("./briefing-move-facts");
    expect(quietFact(["A normal day moves it about 1.1%", "Still down 21.9% over the past month"])).toBe("Down 21.9% in a month");
    expect(quietFact(["About twice a normal 1.0% day", "Up 4.3% over the past month"])).toBe("Twice a normal day");
    expect(quietFact(["Its biggest drop since Sep 2"])).toBe("Biggest drop since Sep 2");
    expect(quietFact(["A normal day moves it about 1.1%"])).toBeNull();
    expect(quietFact(undefined)).toBeNull();
  });
});
