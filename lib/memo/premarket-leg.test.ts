import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));

import { getMarketSessionState } from "@/lib/market-session";

import { buildMemo } from "./build";
import {
  PREMARKET_MIN_COVERAGE,
  premarketLeg,
  premarketLegSlot,
  premarketMove,
  premarketTime,
  previousTradingDay,
  readPremarketQuotes,
  type PremarketQuotes,
} from "./premarket-leg";
import type { DailySeries, MemoCurvePoint, MemoHolding, MemoInputs, MemoWeight } from "./types";
import { readView } from "./view";
import { memoWeekFor } from "./week";

/* Week of Mon Nov 9 2026: the close before it (Fri Nov 6), then Mon to Wed. Thursday Nov 12 is "today". */
const CURVE: MemoCurvePoint[] = [
  { day: "2026-11-06", portfolio: 0, market: 0 },
  { day: "2026-11-09", portfolio: 1, market: 0.5 },
  { day: "2026-11-10", portfolio: -0.5, market: 0.2 },
  { day: "2026-11-11", portfolio: 2, market: 1 },
];
const WEIGHTS: MemoWeight[] = [
  { ticker: "NVDA", weight: 50 },
  { ticker: "AAPL", weight: 30 },
  { ticker: "KO", weight: 20 },
];
const THURSDAY = "2026-11-12";
const AT = "2026-11-12T13:42:00.000Z"; // 8:42 AM ET
const quotes = (stocks: Record<string, number>, sp500: PremarketQuotes["sp500"] = { pct: 0.5, source: "futures" }, at = AT): PremarketQuotes => ({ at, stocks, sp500 });

describe("premarketMove: weighting and coverage", () => {
  it("weights each holding by its share of the line at the last close", () => {
    const move = premarketMove(WEIGHTS, { NVDA: 4, AAPL: -1, KO: 0.5 })!;
    // 0.5*4 + 0.3*-1 + 0.2*0.5 = 1.8
    expect(move.pct).toBeCloseTo(1.8, 10);
    expect(move.coverage).toBe(1);
  });

  it("reweights over the holdings with a quote when they cover enough of the line", () => {
    // KO missing: 80% covered, (50*4 + 30*-1) / 80 = 2.125
    const move = premarketMove(WEIGHTS, { NVDA: 4, AAPL: -1 })!;
    expect(move.coverage).toBeCloseTo(0.8, 10);
    expect(move.pct).toBeCloseTo(2.125, 10);
  });

  it("gives nothing below 70% coverage by weight, and counts exactly 70% as enough", () => {
    expect(PREMARKET_MIN_COVERAGE).toBe(0.7);
    // NVDA + KO = 70%
    expect(premarketMove(WEIGHTS, { NVDA: 1, KO: 1 })).not.toBeNull();
    // AAPL + KO = 50%
    expect(premarketMove(WEIGHTS, { AAPL: 1, KO: 1 })).toBeNull();
    // NVDA alone = 50%
    expect(premarketMove(WEIGHTS, { NVDA: 1 })).toBeNull();
    // Rounded weights that land a hair under still count.
    expect(premarketMove([{ ticker: "A", weight: 69.99999999999 }, { ticker: "B", weight: 30.00000000001 }], { A: 1 })).not.toBeNull();
  });

  it("ignores holdings with no weight or a bad quote, and gives nothing without any quote", () => {
    expect(premarketMove(WEIGHTS, {})).toBeNull();
    expect(premarketMove([], { NVDA: 1 })).toBeNull();
    expect(premarketMove(WEIGHTS, { NVDA: Number.NaN, AAPL: 1, KO: 1 })).toBeNull();
    expect(premarketMove([...WEIGHTS, { ticker: "ZERO", weight: 0 }], { NVDA: 1, AAPL: 1, KO: 1 })!.coverage).toBe(1);
  });

  it("matches tickers whatever their case", () => {
    expect(premarketMove([{ ticker: "brk.b", weight: 100 }], { "BRK.B": 2 })!.pct).toBe(2);
  });
});

describe("premarketLegSlot: session and week gating", () => {
  it("is today's slot during premarket on the trading day after the chart's last close", () => {
    expect(premarketLegSlot(CURVE, "premarket", THURSDAY)).toBe(4);
  });

  it("is null outside premarket", () => {
    for (const session of ["open", "afterhours", "overnight", "weekend", "holiday"] as const) {
      expect(premarketLegSlot(CURVE, session, THURSDAY)).toBeNull();
    }
  });

  it("is null when the chart does not end at the trading day before today", () => {
    // Wednesday's close is missing: premarket moves are measured from it, not from Tuesday.
    expect(premarketLegSlot(CURVE.slice(0, 3), "premarket", THURSDAY)).toBeNull();
    // Today's close is already on the chart (a page that ran past the open).
    expect(premarketLegSlot(CURVE, "premarket", "2026-11-11")).toBeNull();
  });

  it("is null on another week's chart, a weekend or a holiday", () => {
    // Monday Nov 16 premarket: the chart is last week's.
    const lastWeek = [...CURVE, { day: "2026-11-12", portfolio: 2, market: 1 }, { day: "2026-11-13", portfolio: 2, market: 1 }];
    expect(premarketLegSlot(lastWeek, "premarket", "2026-11-16")).toBeNull();
    expect(premarketLegSlot(CURVE, "premarket", "2026-11-14")).toBeNull();
    // Thanksgiving, Thursday Nov 26.
    const thanksgivingWeek: MemoCurvePoint[] = [
      { day: "2026-11-20", portfolio: 0, market: 0 },
      { day: "2026-11-23", portfolio: 1, market: 1 },
      { day: "2026-11-24", portfolio: 1, market: 1 },
      { day: "2026-11-25", portfolio: 1, market: 1 },
    ];
    expect(premarketLegSlot(thanksgivingWeek, "premarket", "2026-11-26")).toBeNull();
    // The Friday after: Wednesday was the last trading day, so the leg runs Wednesday to Friday.
    expect(premarketLegSlot(thanksgivingWeek, "premarket", "2026-11-27")).toBe(5);
  });

  it("needs a line with at least one close inside the week", () => {
    expect(premarketLegSlot(CURVE.slice(0, 1), "premarket", "2026-11-09")).toBeNull();
  });

  it("reads the real session clock: 8:42 AM ET Thursday is premarket, 9:30 is the open", () => {
    expect(getMarketSessionState(new Date(AT)).kind).toBe("premarket");
    expect(getMarketSessionState(new Date("2026-11-12T14:30:00.000Z")).kind).toBe("open");
    expect(getMarketSessionState(new Date("2026-11-12T08:59:00.000Z")).kind).toBe("overnight");
  });
});

describe("previousTradingDay", () => {
  it("skips weekends and NYSE holidays", () => {
    expect(previousTradingDay("2026-11-12")).toBe("2026-11-11");
    expect(previousTradingDay("2026-11-16")).toBe("2026-11-13");
    expect(previousTradingDay("2026-11-27")).toBe("2026-11-25");
  });
});

describe("premarketLeg", () => {
  it("carries both lines on from the last close, compounded onto the week so far", () => {
    const leg = premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: quotes({ NVDA: 4, AAPL: -1, KO: 0.5 }), session: "premarket", today: THURSDAY })!;
    expect(leg.slot).toBe(4);
    expect(leg.day).toBe(THURSDAY);
    expect(leg.portfolioMove).toBe(1.8);
    // (1.02 * 1.018 - 1) * 100 = 3.836
    expect(leg.portfolio).toBe(3.84);
    // (1.01 * 1.005 - 1) * 100 = 1.505
    expect(leg.market).toBe(1.51);
    expect(leg.marketSource).toBe("futures");
    expect(leg.coverage).toBe(1);
    expect(leg.at).toBe(AT);
  });

  it("draws the portfolio alone when there is no S&P 500 price", () => {
    const leg = premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: quotes({ NVDA: 1, AAPL: 1, KO: 1 }, null), session: "premarket", today: THURSDAY })!;
    expect(leg.market).toBeNull();
    expect(leg.marketMove).toBeNull();
    expect(leg.portfolio).toBeCloseTo(3.02, 2);
  });

  it("is null outside premarket, below the coverage bar, without weights, or on an earlier morning's quotes", () => {
    const full = quotes({ NVDA: 1, AAPL: 1, KO: 1 });
    expect(premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: full, session: "open", today: THURSDAY })).toBeNull();
    expect(premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: quotes({ NVDA: 1 }), session: "premarket", today: THURSDAY })).toBeNull();
    expect(premarketLeg({ curve: CURVE, weights: undefined, quotes: full, session: "premarket", today: THURSDAY })).toBeNull();
    expect(premarketLeg({ curve: CURVE, weights: [], quotes: full, session: "premarket", today: THURSDAY })).toBeNull();
    expect(premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: null, session: "premarket", today: THURSDAY })).toBeNull();
    // Yesterday's 8:30 AM quotes.
    const stale = quotes({ NVDA: 1, AAPL: 1, KO: 1 }, null, "2026-11-11T13:30:00.000Z");
    expect(premarketLeg({ curve: CURVE, weights: WEIGHTS, quotes: stale, session: "premarket", today: THURSDAY })).toBeNull();
  });

  it("leaves the S&P 500 out when the chart has no S&P 500 close to carry on from", () => {
    const curve = CURVE.map((point) => ({ ...point, market: null }));
    const leg = premarketLeg({ curve, weights: WEIGHTS, quotes: quotes({ NVDA: 1, AAPL: 1, KO: 1 }), session: "premarket", today: THURSDAY })!;
    expect(leg.market).toBeNull();
    expect(leg.marketSource).toBeNull();
  });
});

describe("premarketTime and readPremarketQuotes", () => {
  it("says the time in New York", () => {
    expect(premarketTime(AT)).toBe("8:42 AM ET");
    expect(premarketTime("nope")).toBe("");
  });

  it("reads the route's answer and drops anything malformed or not live", () => {
    expect(readPremarketQuotes({ live: true, at: AT, stocks: { nvda: 1.5, AAPL: "x" }, sp500: { pct: 0.4, source: "SPY" } })).toEqual({
      at: AT,
      stocks: { NVDA: 1.5 },
      sp500: { pct: 0.4, source: "SPY" },
    });
    expect(readPremarketQuotes({ live: true, at: AT, stocks: {}, sp500: { pct: 0.4, source: "other" } })!.sp500).toBeNull();
    expect(readPremarketQuotes({ live: false })).toBeNull();
    expect(readPremarketQuotes(null)).toBeNull();
    expect(readPremarketQuotes({ live: true, stocks: {} })).toBeNull();
  });
});

/* ── the weights the memo keeps for the leg ─────────────────────────────── */

const DAYS = ["2026-11-06", "2026-11-09", "2026-11-10"];
const series = (closes: number[]): DailySeries => ({ dates: DAYS.slice(0, closes.length), closes });
const HOLDINGS: MemoHolding[] = [
  { ticker: "NVDA", name: "NVIDIA", instrumentId: "US_NVDA", units: 10, fund: false, covered: true },
  { ticker: "AAPL", name: "Apple", instrumentId: "US_AAPL", units: 30, fund: false, covered: true },
  { ticker: "KO", name: "Coca-Cola", instrumentId: "US_KO", units: null, fund: false, covered: true },
];
const INPUTS: MemoInputs = {
  week: memoWeekFor("2026-11-10", "2026-11-11"),
  today: "2026-11-11",
  subject: "mine",
  holdings: HOLDINGS,
  series: new Map([
    ["NVDA", series([100, 100, 120])],
    ["AAPL", series([100, 100, 80])],
    ["KO", series([50, 50, 50])],
  ]),
  benchmark: series([500, 505, 510]),
  calls: [],
  moves: [],
  reports: [],
  upcoming: [],
  funds: [],
  insiders: [],
  congress: [],
  exposure: null,
  dividends: [],
  stress: null,
};

describe("the memo's line weights", () => {
  it("are the priced holdings' shares of the line at the last close, leaving out what the line leaves out", () => {
    const view = buildMemo(INPUTS).memo.view!;
    // NVDA 10 x 120 = 1200, AAPL 30 x 80 = 2400; KO has no share count, so it is not in the line.
    expect(view.weights).toEqual([
      { ticker: "NVDA", weight: 33.3 },
      { ticker: "AAPL", weight: 66.7 },
    ]);
  });

  it("survive a stored round trip, and a bad weight drops them all", () => {
    const view = buildMemo(INPUTS).memo.view!;
    expect(readView(JSON.parse(JSON.stringify(view)))!.weights).toEqual(view.weights);
    expect(readView({ ...view, weights: [{ ticker: "NVDA", weight: 40 }, { ticker: "AAPL", weight: "x" }] })!.weights).toEqual([]);
    // A memo stored before weights were kept has none at all, so the page can tell it apart.
    const { weights: _dropped, ...old } = view;
    expect("weights" in readView(old)!).toBe(false);
  });
});
