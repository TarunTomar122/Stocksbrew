import { describe, expect, it } from "vitest";

import { BIGGEST_MAX, bigScore, bigSize, biggestThings, dollarsIn, fitLine, normalFactor, type BigCandidate } from "./biggest";

const big = (patch: Partial<BigCandidate> & Pick<BigCandidate, "ticker" | "kind">): BigCandidate => ({
  name: patch.ticker,
  pct: null,
  session: null,
  price: 100,
  holding: false,
  line: "Something happened.",
  day: "2026-11-12",
  source: null,
  href: `/stock/${patch.ticker}`,
  ...patch,
});

describe("biggest things: the ranking", () => {
  // The owner's own day (Nov 13): "the most important thing was … Cerebras reported earnings and rose after hours and
  // then some news around AMD and SMCI".
  it("puts the owner's Nov 13 events in the order he named them, ahead of moves nobody explained", () => {
    const things = biggestThings([
      big({ ticker: "CBRS", kind: "results", pct: 15.85, session: "pre", holding: true }),
      big({ ticker: "SMCI", kind: "news", pct: -11.3, normalPct: 4.67, holding: true }),
      big({ ticker: "AMD", kind: "analyst", pct: 5.86, normalPct: 3.82 }),
      big({ ticker: "AVGO", kind: "move", pct: 5.54, normalPct: 2.43, holding: true }),
      big({ ticker: "ASTS", kind: "move", pct: -5.79, normalPct: 5.17, holding: true }),
      big({ ticker: "NVDA", kind: "move", pct: -4.34, normalPct: 2.04, holding: true }),
      big({ ticker: "COHR", kind: "insider", amount: 1_200_000 }),
    ]);
    expect(things.map((thing) => thing.ticker)).toEqual(["CBRS", "SMCI", "AMD", "COHR"]);
  });

  it("leaves out what is not big enough to list", () => {
    expect(bigSize({ kind: "move", pct: 4.9 })).toBeNull();
    expect(bigSize({ kind: "move", pct: -5 })).toBe(5);
    expect(bigSize({ kind: "news", pct: 2.9 })).toBeNull();
    expect(bigSize({ kind: "analyst", pct: 3 })).toBe(3);
    expect(bigSize({ kind: "insider", pct: null, amount: 249_999 })).toBeNull();
    expect(bigSize({ kind: "insider", pct: null, amount: 300_000 })).toBe(4);
    expect(bigSize({ kind: "insider", pct: null, amount: 1_000_000 })).toBe(6);
    expect(bigSize({ kind: "results", pct: null })).toBe(3);
    expect(bigSize({ kind: "filing", pct: null })).toBe(4);
    expect(biggestThings([big({ ticker: "A", kind: "move", pct: 3 })])).toEqual([]);
    // A 6% move on a stock that moves 5% on a normal day is an ordinary day for it.
    expect(bigSize({ kind: "move", pct: 6, normalPct: 5 })).toBeNull();
    expect(bigSize({ kind: "move", pct: 7.5, normalPct: 5 })).toBe(7.5);
  });

  it("weighs a move against the stock's normal day, within bounds", () => {
    expect(normalFactor(10, 2.5)).toBe(1.5);
    expect(normalFactor(6, 5)).toBe(0.6);
    expect(normalFactor(4, 2)).toBe(1);
    expect(normalFactor(4, null)).toBe(1);
    expect(normalFactor(null, 2)).toBe(1);
    // Same 8% move: on a stock that moves 2% a day it outranks the one that moves 5% a day.
    const calm = bigScore(big({ ticker: "A", kind: "move", pct: 8, normalPct: 2 }))!;
    const wild = bigScore(big({ ticker: "B", kind: "move", pct: 8, normalPct: 5 }))!;
    expect(calm).toBeGreaterThan(wild);
  });

  it("ranks a stock owned over the same event on one watched, and breaks ties by move then ticker", () => {
    const things = biggestThings([
      big({ ticker: "W", kind: "news", pct: 6 }),
      big({ ticker: "H", kind: "news", pct: 6, holding: true }),
      big({ ticker: "B", kind: "filing" }),
      big({ ticker: "A", kind: "filing" }),
    ]);
    expect(things.map((thing) => thing.ticker)).toEqual(["H", "W", "A", "B"]);
  });

  it("keeps one card per stock (its biggest event) and at most four", () => {
    const things = biggestThings([
      big({ ticker: "smci", kind: "move", pct: 9, ids: ["a"] }),
      big({ ticker: "SMCI", kind: "news", pct: -11, ids: ["b"] }),
      ...["A", "B", "C", "D", "E"].map((ticker, index) => big({ ticker, kind: "move", pct: 6 + index })),
    ]);
    expect(things).toHaveLength(BIGGEST_MAX);
    const smci = things.find((thing) => thing.ticker === "SMCI")!;
    expect(smci).toMatchObject({ kind: "news", pct: -11, ids: ["b"] });
  });

  it("is the same order whatever order the candidates come in", () => {
    const list = [
      big({ ticker: "A", kind: "results", pct: 4 }),
      big({ ticker: "B", kind: "news", pct: -7 }),
      big({ ticker: "C", kind: "insider", amount: 2_000_000 }),
      big({ ticker: "D", kind: "move", pct: 8, holding: true }),
    ];
    const order = biggestThings(list).map((thing) => thing.ticker);
    expect(biggestThings([...list].reverse()).map((thing) => thing.ticker)).toEqual(order);
  });
});

describe("biggest things: words", () => {
  it("keeps a line of one sentence of at most 15 words", () => {
    expect(fitLine(["Super Micro fell after DOJ China-smuggling probe."])).toBe("Super Micro fell after DOJ China-smuggling probe.");
    expect(fitLine(["one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.", "Short one."])).toBe("Short one.");
    expect(fitLine(["reported revenue of $211M. Then more."])).toBe("Reported revenue of $211M.");
    expect(fitLine([null, "", undefined])).toBeNull();
  });

  it("reads a dollar amount", () => {
    expect(dollarsIn("2 insiders bought $1.2 million, led by James Robert Anderson.")).toBe(1_200_000);
    expect(dollarsIn("Scott Angel, director, bought $49,941 on Tuesday.")).toBe(49_941);
    expect(dollarsIn("bought $2.5M of stock")).toBe(2_500_000);
    expect(dollarsIn("no money here")).toBeNull();
  });
});
