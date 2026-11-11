import { describe, expect, it } from "vitest";

import { buildStockRead, earningsReaction, relativeDayRank, usualMove, type DailyClose, type StockInsightInput } from "./stock-insights";

/** Weekday closes from a start day, one per value. */
function series(start: string, closes: number[]): DailyClose[] {
  const out: DailyClose[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  for (const close of closes) {
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    out.push({ date: day.toISOString().slice(0, 10), close });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

/** A gentle zig-zag: +1% / -0.5% alternating, so moves are small and regular. */
function zigzag(n: number, start = 100): number[] {
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1]! * (i % 2 ? 1.01 : 0.995));
  return out;
}

const base: StockInsightInput = {
  ticker: "NVDA",
  today: "2026-11-10",
  quoteDay: "2026-11-10",
  price: 100,
  dayPct: null,
  group: null,
  marketPct: null,
  series: null,
  benchmark: null,
  moveReason: null,
  nextEarnings: null,
  pastEarnings: [],
  call: null,
  levels: null,
  lastChange: null,
};

describe("earningsReaction", () => {
  const closes = series("2026-05-18", [100, 102, 104, 110, 108]); // 18,19,20,21,22 May
  it("measures after-the-close reports from that close to the next", () => {
    expect(earningsReaction(closes, "2026-05-20", "amc")).toBeCloseTo((110 / 104 - 1) * 100, 5);
  });
  it("measures before-the-open reports from the prior close", () => {
    expect(earningsReaction(closes, "2026-05-20", "bmo")).toBeCloseTo((104 / 102 - 1) * 100, 5);
  });
  it("returns null when the closes are not on file", () => {
    expect(earningsReaction(closes, "2026-04-01", "amc")).toBeNull();
    expect(earningsReaction(null, "2026-05-20", "amc")).toBeNull();
  });
});

describe("relativeDayRank and usualMove", () => {
  const stock = series("2025-09-01", zigzag(300));
  const bench = series("2025-09-01", zigzag(300, 500));
  const quoteDay = "2027-01-01";
  it("finds a drop against the market bigger than anything on file", () => {
    const rank = relativeDayRank({ dayPct: -4, marketPct: 1, quoteDay, series: stock, benchmark: bench });
    expect(rank).not.toBeNull();
    expect(rank!.since).toBeNull();
    expect(rank!.rel).toBe(-5);
  });
  it("says nothing about a small gap", () => {
    expect(relativeDayRank({ dayPct: 1, marketPct: 0.2, quoteDay, series: stock, benchmark: bench })).toBeNull();
  });
  it("says nothing with too little history", () => {
    expect(relativeDayRank({ dayPct: -4, marketPct: 1, quoteDay, series: stock.slice(0, 20), benchmark: bench })).toBeNull();
  });
  it("usual move is the median absolute daily move", () => {
    expect(usualMove(stock, quoteDay)).toBeGreaterThan(0.4);
    expect(usualMove(stock, quoteDay)).toBeLessThan(1.1);
    expect(usualMove(stock.slice(0, 10), quoteDay)).toBeNull();
  });
});

describe("buildStockRead", () => {
  it("returns null when there is nothing to say", () => {
    expect(buildStockRead(base)).toBeNull();
  });

  it("leads with the move against its group and the call", () => {
    const read = buildStockRead({
      ...base,
      dayPct: -4.3,
      group: { label: "Semiconductors", medianPct: 1.2, count: 20 },
      call: { word: "Hold", writtenAt: "2026-11-09T21:00:00Z" },
    });
    expect(read?.headline).toBe("NVDA fell 4.3% today while Semiconductors rose 1.2%. We'd keep it, not buy more.");
  });

  it("leaves the call out when the page already shows it above the read", () => {
    const read = buildStockRead({
      ...base,
      dayPct: -4.3,
      group: { label: "Semiconductors", medianPct: 1.2, count: 20 },
      call: { word: "Hold", writtenAt: "2026-11-09T21:00:00Z" },
      callInHeadline: false,
    });
    expect(read?.headline).toBe("NVDA fell 4.3% today while Semiconductors rose 1.2%.");
  });

  it("says 'on Nov 9' when the quote is not from today", () => {
    const read = buildStockRead({ ...base, quoteDay: "2026-11-09", dayPct: 2, marketPct: 1 });
    expect(read?.headline).toContain("rose 2.0% on Nov 9, more than the S&P 500 (+1.0%)");
  });

  it("adds the earnings date with the past reaction", () => {
    const closes = series("2026-05-18", [100, 102, 104, 110, 108]);
    const read = buildStockRead({
      ...base,
      dayPct: 0.2,
      series: closes,
      nextEarnings: { date: "2026-11-17", time: "amc" },
      pastEarnings: [{ date: "2026-05-20", time: "amc" }],
    });
    const earnings = read?.insights.find((item) => item.id === "earnings");
    expect(earnings?.text).toBe("NVDA reports Nov 17 after the close, in 7 days.");
    expect(earnings?.soWhat).toContain("moved +5.8% the next session");
  });

  it("never writes a level for an uncovered stock", () => {
    const read = buildStockRead({ ...base, dayPct: 1, call: { word: "Add", writtenAt: null }, levels: null, lastChange: null });
    const text = JSON.stringify(read);
    expect(text).not.toMatch(/\$\d/);
    expect(read?.insights.find((item) => item.id === "call")).toBeUndefined();
  });

  it("places a covered stock between its add and trim levels", () => {
    const read = buildStockRead({
      ...base,
      dayPct: 1,
      price: 110,
      call: { word: "Hold", writtenAt: null },
      levels: { addBelow: 100, trimAbove: 132 },
      lastChange: { date: "2026-10-01", from: "Add", to: "Hold", priceAtCall: 100 },
    });
    const call = read?.insights.find((item) => item.id === "call");
    expect(call?.text).toBe("NVDA is 10% above our buy-more price ($100), and 20% below the price where we'd sell some ($132).");
    expect(call?.soWhat).toBe("We changed our call to Hold on Oct 1 at $100, and it is up 10% since.");
  });

  it("caps the read at three insights", () => {
    const stock = series("2025-09-01", zigzag(300));
    const bench = series("2025-09-01", zigzag(300, 500));
    const last = stock[stock.length - 1]!.date;
    const read = buildStockRead({
      ...base,
      today: last,
      quoteDay: "2099-01-01",
      dayPct: -5,
      marketPct: 1,
      series: stock,
      benchmark: bench,
      price: stock[stock.length - 1]!.close,
      nextEarnings: { date: last, time: null },
      levels: { addBelow: 50, trimAbove: 500 },
      moveReason: "Board probe headlines",
    });
    expect(read?.insights.length).toBe(3);
    expect(read?.insights[0]?.soWhat).toBe("The reason we found: Board probe headlines.");
  });
});
