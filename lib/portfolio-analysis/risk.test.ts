import { describe, expect, it } from "vitest";

import { chooseWindow } from "./compute";
import { LINK, buildCorrelation, closestPair, clusterOrder, correlationMatrix, groupNoun, linkGroups, steadiestIndex } from "./correlation";
import { returnsFromCloses } from "./market";
import { buildRisk } from "./risk";
import { alignReturns, compound, largestDrop, type CloseSeries } from "./stats";

/** Business days from 2025-01-01, as ISO dates. */
function days(n: number): string[] {
  const out: string[] = [];
  let t = Date.parse("2025-01-01T00:00:00Z");
  while (out.length < n) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

/** A deterministic pseudo-random walk. */
function noise(seed: number, n: number): number[] {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x / 2147483648 - 0.5) * 0.04;
  });
}

function series(dates: string[], returns: number[], adjusted = true): CloseSeries {
  const closes = [100];
  for (const r of returns.slice(1)) closes.push(closes[closes.length - 1]! * (1 + r));
  return { dates, closes, adjusted };
}

const DATES = days(260);
const market = noise(7, 260);
const tech = market.map((m, i) => 1.5 * m + noise(11, 260)[i]! * 0.3);
const chip = market.map((m, i) => 1.5 * m + noise(13, 260)[i]! * 0.3);
const staple = noise(17, 260).map((x) => x * 0.5);

const SERIES: Record<string, CloseSeries> = {
  SPY: series(DATES, market),
  NVDA: series(DATES, tech),
  AMD: series(DATES, chip),
  KO: series(DATES, staple),
};

describe("alignReturns", () => {
  it("lines everything up on the benchmark's sessions", () => {
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: SERIES, tickers: ["NVDA", "AMD", "KO"] })!;
    expect(aligned.dates).toHaveLength(252);
    expect(aligned.start < aligned.dates[0]!).toBe(true);
    expect(aligned.byTicker.NVDA).toHaveLength(252);
    expect(aligned.dropped).toEqual([]);
  });

  it("drops a recent listing first instead of cutting everyone's window", () => {
    const ipo = { dates: DATES.slice(-30), closes: DATES.slice(-30).map((_, i) => 10 + i) };
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: { ...SERIES, NEW: ipo }, tickers: ["NVDA", "NEW"] })!;
    expect(aligned.dropped).toEqual(["NEW"]);
    expect(aligned.dates).toHaveLength(252);
  });

  it("never reads unadjusted closes, and skips a missing day rather than calling it flat", () => {
    const gappy = { dates: DATES.filter((_, i) => i !== 200), closes: SERIES.KO!.closes.filter((_, i) => i !== 200) };
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: { ...SERIES, KO: gappy, OLD: series(DATES, staple, false) }, tickers: ["KO", "NVDA", "OLD"] })!;
    expect(aligned.dropped).toEqual(["OLD"]);
    // The day KO has no close and the day after both lose their return.
    expect(aligned.dates).toHaveLength(250);
    expect(aligned.dates).not.toContain(DATES[200]);
  });

  it("returns null without a benchmark or enough sessions", () => {
    expect(alignReturns({ benchmark: null, series: SERIES, tickers: ["NVDA"] })).toBeNull();
    const short = { dates: DATES.slice(-40), closes: SERIES.SPY!.closes.slice(-40) };
    expect(alignReturns({ benchmark: short, series: SERIES, tickers: ["NVDA"] })).toBeNull();
  });
});

describe("largestDrop", () => {
  it("finds the deepest fall from a high", () => {
    const index = compound([0.1, -0.2, 0.05, -0.1, 0.3]);
    const dates = ["d0", "d1", "d2", "d3", "d4", "d5"];
    const drop = largestDrop(index, dates);
    expect(drop.peak).toBe("d1");
    expect(drop.trough).toBe("d4");
    expect(drop.pct).toBeCloseTo((0.8 * 1.05 * 0.9 - 1) * 100, 6);
  });
});

describe("buildRisk", () => {
  const holdings = [
    { ticker: "NVDA", name: "NVIDIA", weight: 40 },
    { ticker: "AMD", name: "AMD", weight: 30 },
    { ticker: "KO", name: "Coca-Cola", weight: 30 },
  ];
  const aligned = alignReturns({ benchmark: SERIES.SPY, series: SERIES, tickers: holdings.map((h) => h.ticker) });

  it("splits the swings so they add up to 100", () => {
    const risk = buildRisk(holdings, aligned)!;
    const total = risk.shares.reduce((sum, share) => sum + share.share, 0);
    expect(total).toBeCloseTo(100, 1);
    // The two chip names carry far more of the swings than their weight; the staple far less.
    const ko = risk.shares.find((share) => share.ticker === "KO")!;
    expect(ko.share).toBeLessThan(ko.weight);
    expect(risk.sensitivity).toBeGreaterThan(0.9);
    expect(risk.swing).toBeGreaterThan(risk.spSwing);
    expect(risk.path.book).toHaveLength(253);
    expect(risk.path.book[0]).toBe(100);
    expect(risk.worstDrop.pct).toBeLessThan(0);
  });

  it("gives one holding the whole of the swings", () => {
    const risk = buildRisk([{ ticker: "NVDA", name: "NVIDIA", weight: 100 }], aligned)!;
    expect(risk.shares).toHaveLength(1);
    expect(risk.shares[0]!.share).toBeCloseTo(100, 6);
  });

  it("holds back when too little of the money has prices", () => {
    const thin = buildRisk([...holdings.slice(0, 1), { ticker: "MISSING", name: "Missing", weight: 60 }], aligned);
    expect(thin).toBeNull();
  });
});

describe("correlation", () => {
  it("is symmetric with ones on the diagonal", () => {
    const m = correlationMatrix([tech, chip, staple]);
    for (let i = 0; i < 3; i++) {
      expect(m[i]![i]).toBe(1);
      for (let j = 0; j < 3; j++) expect(m[i]![j]).toBeCloseTo(m[j]![i]!, 12);
    }
    expect(m[0]![1]!).toBeGreaterThan(0.75);
  });

  it("links pairs above the cut into groups and orders close names together", () => {
    const matrix = [
      [1, 0.9, 0.8, 0.1],
      [0.9, 1, 0.2, 0.1],
      [0.8, 0.2, 1, 0.1],
      [0.1, 0.1, 0.1, 1],
    ];
    expect(linkGroups(matrix, 0.75).map((group) => group.sort())).toEqual([[0, 1, 2], [3]]);
    const order = clusterOrder(matrix);
    expect(Math.abs(order.indexOf(0) - order.indexOf(1))).toBe(1);
  });

  it("keeps a tight pair only when it holds real money", () => {
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: SERIES, tickers: ["NVDA", "AMD", "KO"] });
    const big = buildCorrelation(
      [
        { ticker: "NVDA", name: "NVIDIA", weight: 40 },
        { ticker: "AMD", name: "AMD", weight: 30 },
        { ticker: "KO", name: "Coca-Cola", weight: 30 },
      ],
      aligned,
    )!;
    expect(big.groups).toHaveLength(1);
    expect(big.groups[0]!.tickers).toEqual(["NVDA", "AMD"]);
    expect(big.groups[0]!.weight).toBe(70);
    expect(big.matrix).toHaveLength(3);
    const small = buildCorrelation(
      [
        { ticker: "NVDA", name: "NVIDIA", weight: 5 },
        { ticker: "AMD", name: "AMD", weight: 5 },
        { ticker: "KO", name: "Coca-Cola", weight: 90 },
      ],
      aligned,
    )!;
    expect(small.groups).toEqual([]);
  });

  // The owner's book on Nov 12 (daily moves over a year), in this order.
  const BOOK = ["GOOGL", "AMZN", "MSFT", "ORCL", "SMR", "ASTS", "MRVL", "AVGO", "NVDA", "TSM"];
  const BOOK_MATRIX = [
    [1, 0.6, 0.25, 0.2, 0.15, 0.15, 0.2, 0.25, 0.25, 0.25],
    [0.6, 1, 0.44, 0.25, 0.15, 0.2, 0.2, 0.25, 0.25, 0.3],
    [0.25, 0.44, 1, 0.47, 0.2, 0.15, 0.1, 0.2, 0.2, 0.15],
    [0.2, 0.25, 0.47, 1, 0.45, 0.34, 0.36, 0.47, 0.44, 0.44],
    [0.15, 0.15, 0.2, 0.45, 1, 0.61, 0.45, 0.46, 0.42, 0.53],
    [0.15, 0.2, 0.15, 0.34, 0.61, 1, 0.41, 0.39, 0.35, 0.45],
    [0.2, 0.2, 0.1, 0.36, 0.45, 0.41, 1, 0.55, 0.42, 0.61],
    [0.25, 0.25, 0.2, 0.47, 0.46, 0.39, 0.55, 1, 0.51, 0.64],
    [0.25, 0.25, 0.2, 0.44, 0.42, 0.35, 0.42, 0.51, 1, 0.66],
    [0.25, 0.3, 0.15, 0.44, 0.53, 0.45, 0.61, 0.64, 0.66, 1],
  ];

  it("finds the chip makers as one group in the owner's book at the default cut", () => {
    const groups = linkGroups(BOOK_MATRIX, LINK).map((group) => group.map((i) => BOOK[i]).sort());
    expect(groups).toContainEqual(["AVGO", "MRVL", "NVDA", "TSM"]);
    // Looser pairs link too, but stay pairs (kept only when very close and heavy).
    expect(groups.filter((group) => group.length >= 3)).toEqual([["AVGO", "MRVL", "NVDA", "TSM"]]);
  });

  it("picks the steadiest diversifier among names worth a few percent", () => {
    const weights = [9, 6, 17, 5, 4, 4, 6, 10, 17, 16];
    expect(BOOK[steadiestIndex(BOOK_MATRIX, weights)!.index]).toBe("MSFT");
    // A tiny holding that moves on its own does not win by being tiny.
    const withTiny = [...BOOK_MATRIX.map((row) => [...row, 0]), [...BOOK.map(() => 0), 1]];
    expect(steadiestIndex(withTiny, [...weights, 0.5])!.index).toBe(2);
    expect(steadiestIndex([[1, 0.5], [0.5, 1]], [50, 50])).toBeNull();
  });

  it("names the closest pair", () => {
    const pair = closestPair(BOOK_MATRIX)!;
    expect([BOOK[pair.a], BOOK[pair.b]]).toEqual(["NVDA", "TSM"]);
    expect(pair.together).toBe(0.66);
    expect(closestPair([[1]])).toBeNull();
  });

  it("names a group by what its names share", () => {
    const semis = { industry: "Semiconductors", sector: "Technology" };
    expect(groupNoun([semis, semis, { industry: "Semiconductor Equipment & Materials", sector: "Technology" }])).toBe("chip stocks");
    expect(groupNoun([semis, { industry: "Software - Infrastructure", sector: "Technology" }])).toBe("tech stocks");
    expect(groupNoun([{ fund: true }, { fund: true }])).toBe("funds");
    expect(groupNoun([{ fund: true }, semis])).toBe("holdings");
    expect(groupNoun([semis, { industry: "Banks - Diversified", sector: "Financials" }])).toBe("stocks");
    expect(groupNoun([{ industry: "Utilities - Regulated Gas", sector: "Utilities" }, { industry: "Gas Utilities" }])).toBe("utility stocks");
    expect(groupNoun([undefined, undefined])).toBe("stocks");
  });

  it("carries the steadiest name, the closest pair and the group noun", () => {
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: SERIES, tickers: ["NVDA", "AMD", "KO"] });
    const result = buildCorrelation(
      [
        { ticker: "NVDA", name: "NVIDIA", weight: 40 },
        { ticker: "AMD", name: "AMD", weight: 30 },
        { ticker: "KO", name: "Coca-Cola", weight: 30 },
      ],
      aligned,
      { NVDA: { industry: "Semiconductors" }, AMD: { industry: "Semiconductors" } },
    )!;
    expect(result.groups[0]!.noun).toBe("chip stocks");
    expect(result.steadiest?.ticker).toBe("KO");
    expect([result.closest?.a.ticker, result.closest?.b.ticker]).toEqual(["NVDA", "AMD"]);
  });

  it("needs two holdings", () => {
    const aligned = alignReturns({ benchmark: SERIES.SPY, series: SERIES, tickers: ["NVDA"] });
    expect(buildCorrelation([{ ticker: "NVDA", name: "NVIDIA", weight: 100 }], aligned)).toBeNull();
  });
});

describe("chooseWindow", () => {
  const ipo = { dates: DATES.slice(-100), closes: SERIES.NVDA!.closes.slice(-100) };

  it("keeps the full year and leaves out a small recent listing", () => {
    const aligned = chooseWindow(
      [
        { ticker: "NVDA", weight: 90 },
        { ticker: "NEW", weight: 10 },
      ],
      SERIES.SPY!,
      { ...SERIES, NEW: ipo },
    )!;
    expect(aligned.dates).toHaveLength(252);
    expect(aligned.byTicker.NEW).toBeUndefined();
  });

  it("shortens the window when the recent listing is too much of the money to leave out", () => {
    const aligned = chooseWindow(
      [
        { ticker: "NVDA", weight: 50 },
        { ticker: "NEW", weight: 50 },
      ],
      SERIES.SPY!,
      { ...SERIES, NEW: ipo },
    )!;
    expect(aligned.dates.length).toBeLessThan(100);
    expect(aligned.byTicker.NEW).toBeDefined();
  });
});

describe("returnsFromCloses", () => {
  it("measures back from the last close, and refuses a stale series", () => {
    const dates = days(300);
    const closes = dates.map((_, i) => 100 + i);
    const last = dates[dates.length - 1]!;
    const own = returnsFromCloses({ dates, closes }, last)!;
    expect(own.ret_1m).toBeCloseTo((399 / 378 - 1) * 100, 6);
    expect(own.ret_ytd).toBeGreaterThan(0);
    expect(returnsFromCloses({ dates, closes }, "2027-06-01")).toBeNull();
  });
});
