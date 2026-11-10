import { describe, expect, it } from "vitest";

import {
  auditNumbers,
  cardForModel,
  cleanSeries,
  cleanTickerList,
  collectNumbers,
  extractClaims,
  parsePeriod,
  pct,
  returnStats,
  slicePeriod,
  thin,
  type BacktestCard,
  type ReturnsCard,
  type SeriesPoint,
} from "@/lib/ask-cards";

function series(start: string, closes: number[]): SeriesPoint[] {
  const first = new Date(`${start}T00:00:00Z`);
  return closes.map((close, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), close };
  });
}

describe("parsePeriod", () => {
  it("reads the common spellings", () => {
    expect(parsePeriod("1y")).toMatchObject({ kind: "days", days: 365 });
    expect(parsePeriod("6mo")).toMatchObject({ kind: "days", days: 183 });
    expect(parsePeriod("3 months")).toMatchObject({ kind: "days", days: 91 });
    expect(parsePeriod("5d")).toMatchObject({ kind: "days", days: 5 });
    expect(parsePeriod("2w")).toMatchObject({ kind: "days", days: 14 });
    expect(parsePeriod("YTD")).toMatchObject({ kind: "ytd" });
    expect(parsePeriod("max")).toMatchObject({ kind: "max" });
  });

  it("refuses what it does not understand instead of guessing", () => {
    expect(parsePeriod("")).toBeNull();
    expect(parsePeriod("a while")).toBeNull();
    expect(parsePeriod("0d")).toBeNull();
    expect(parsePeriod(undefined)).toBeNull();
  });
});

describe("cleanSeries", () => {
  it("drops gaps, zeros and mismatched lengths", () => {
    const out = cleanSeries(["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"], [10, null, 0, 12]);
    expect(out).toEqual([
      { date: "2026-01-02", close: 10 },
      { date: "2026-01-07", close: 12 },
    ]);
    expect(cleanSeries(null, [1])).toEqual([]);
  });
});

describe("slicePeriod and returnStats", () => {
  const data = series("2026-01-01", [100, 110, 121, 90, 99, 120]);

  it("measures a range from the first session on or after its start", () => {
    const slice = slicePeriod(data, { kind: "range", start: "2026-01-02", end: "2026-01-05", label: "" });
    expect(slice.map((point) => point.close)).toEqual([110, 121, 90, 99]);
    const stats = returnStats(slice)!;
    expect(stats.return_pct).toBe(-10);
    expect(stats.high).toEqual({ date: "2026-01-03", close: 121 });
    expect(stats.low).toEqual({ date: "2026-01-04", close: 90 });
    // 121 down to 90.
    expect(stats.max_drawdown_pct).toBe(-25.62);
  });

  it("does not annualise a stretch shorter than a year", () => {
    expect(returnStats(data)!.annualized_pct).toBeNull();
  });

  it("annualises once there is a year or more", () => {
    const long = [
      { date: "2024-01-02", close: 100 },
      { date: "2026-01-02", close: 121 },
    ];
    expect(returnStats(long)!.annualized_pct).toBeCloseTo(10, 0);
  });

  it("starts year to date from the last close of the prior year", () => {
    const span = [
      { date: "2025-12-30", close: 50 },
      { date: "2025-12-31", close: 80 },
      { date: "2026-01-02", close: 100 },
      { date: "2026-01-05", close: 120 },
    ];
    const slice = slicePeriod(span, { kind: "ytd", label: "" });
    expect(slice[0]).toEqual({ date: "2025-12-31", close: 80 });
    expect(returnStats(slice)!.return_pct).toBe(50);
  });

  it("returns nothing when the period holds fewer than two closes", () => {
    expect(returnStats(slicePeriod(data, { kind: "range", start: "2026-01-06", end: null, label: "" }))).toBeNull();
    expect(slicePeriod([], { kind: "max", label: "" })).toEqual([]);
    expect(slicePeriod(data, { kind: "range", start: "2030-01-01", end: null, label: "" })).toEqual([]);
  });

  it("covers the trailing window for a day count", () => {
    const slice = slicePeriod(data, { kind: "days", days: 2, label: "" });
    expect(slice.map((point) => point.date)).toEqual(["2026-01-04", "2026-01-05", "2026-01-06"]);
  });
});

describe("thin", () => {
  it("keeps the first and the last point", () => {
    const items = Array.from({ length: 1000 }, (_, index) => index);
    const out = thin(items, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(999);
  });

  it("returns short lists untouched", () => {
    expect(thin([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});

describe("cleanTickerList", () => {
  it("normalises, dedupes and caps", () => {
    expect(cleanTickerList(["nvda", "$AAPL", "NVDA", "BRK.B", "not a ticker", 5, ""], 3)).toEqual(["NVDA", "AAPL", "BRK.B"]);
    expect(cleanTickerList("msft, googl amzn")).toEqual(["MSFT", "GOOGL", "AMZN"]);
    expect(cleanTickerList(null)).toEqual([]);
  });
});

describe("pct", () => {
  it("turns a fraction into a rounded percentage and keeps unknown as unknown", () => {
    expect(pct(0.1234)).toBe(12.3);
    expect(pct(null)).toBeNull();
    expect(pct(Number.NaN)).toBeNull();
  });
});

describe("cardForModel", () => {
  it("hides the chart series from the model and keeps the figures", () => {
    const card = {
      card: "returns",
      ticker: "NVDA",
      return_pct: 12.5,
      points: [{ date: "2026-01-01", close: 1 }],
      source: "x",
      as_of: null,
    } as unknown as ReturnsCard;
    const seen = cardForModel(card);
    expect(seen).not.toHaveProperty("points");
    expect(seen).toMatchObject({ ticker: "NVDA", return_pct: 12.5 });

    const backtest = { card: "backtest", curve: [{ date: "d", strategy: 1, benchmark: 1 }], years: 3, source: "x", as_of: null } as unknown as BacktestCard;
    expect(cardForModel(backtest)).not.toHaveProperty("curve");
  });
});

describe("the number audit", () => {
  const answer =
    "From Nov 10, 2025 to Nov 9, 2026, NVDA returned -10.97% ($198.57 to $176.79). SPY returned +11.90% over the same dates. " +
    "It trades at 29.1x trailing earnings and is worth $4.6 trillion. It reports next on Nov 17, 2026.";
  const outputs = [
    { card: "returns", return_pct: -10.97, from: { close: 198.5743 }, to: { close: 176.7902 }, benchmark: { return_pct: 11.9 } },
    { card: "quote", pe_ttm: 29.1, market_cap: 4602232045568 },
  ];

  it("finds prices, percentages, ratios and big totals, and skips dates", () => {
    expect(extractClaims(answer).map((claim) => claim.raw)).toEqual(["10.97%", "$198.57", "$176.79", "11.90%", "29.1x", "$4.6 trillion"]);
  });

  it("traces every figure that rounds to a tool number", () => {
    expect(auditNumbers(answer, outputs)).toEqual({ checked: 6, traced: 6, untraced: [] });
  });

  it("flags a figure that came from nowhere", () => {
    const audit = auditNumbers("NVDA is up 43.2% this year and trades at 29.1x.", outputs);
    expect(audit.checked).toBe(2);
    expect(audit.traced).toBe(1);
    expect(audit.untraced).toEqual(["43.2%"]);
  });

  it("accepts a fraction written as a percentage", () => {
    expect(auditNumbers("The weight is 22.0%.", [{ weight: 0.2204 }]).untraced).toEqual([]);
  });

  it("does not count list numbers, small counts, form names or index names", () => {
    const text = "1. Three of the 5 names filed a 13F.\n2. The S&P 500 fell. See the 10-K from 2024 and the 8-K.";
    expect(extractClaims(text)).toEqual([]);
    expect(auditNumbers(text, [])).toEqual({ checked: 0, traced: 0, untraced: [] });
  });

  it("does not treat the top of a scale as a claim", () => {
    expect(auditNumbers("Our score is 87 of 100.", [{ score: 87 }])).toEqual({ checked: 1, traced: 1, untraced: [] });
  });

  it("reads numbers that sit inside strings in a tool result", () => {
    expect(collectNumbers({ headline: "Revenue rose 14% to $1,250.5 million", nested: [{ level: "4,512.30" }] })).toEqual([14, 1250.5, 4512.3]);
    expect(auditNumbers("Revenue rose 14%.", [{ headline: "Revenue rose 14% to $1,250.5 million" }]).untraced).toEqual([]);
  });

  it("ignores figures inside links and code", () => {
    expect(extractClaims("See [the filing](https://sec.gov/a/123456.htm) and `x = 42.5`.")).toEqual([]);
  });
});
