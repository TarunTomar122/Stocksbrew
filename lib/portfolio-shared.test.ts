import { describe, expect, it } from "vitest";

import {
  annualisedVolatility,
  betaAgainst,
  buildPortfolio,
  dailyReturns,
  parsePortfolioTab,
  performanceSince,
  sortPositions,
  zoneFor,
  type DailySeries,
  type PortfolioRowInput,
} from "@/lib/portfolio-shared";

function series(start: number, steps: number[], firstDay = "2026-01-01"): DailySeries {
  const dates: string[] = [];
  const closes: number[] = [];
  let close = start;
  const t0 = Date.parse(`${firstDay}T00:00:00Z`);
  steps.forEach((step, index) => {
    close *= 1 + step;
    dates.push(new Date(t0 + index * 86_400_000).toISOString().slice(0, 10));
    closes.push(close);
  });
  return { dates, closes };
}

const wiggle = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.008));

function row(over: Partial<PortfolioRowInput> & { ticker: string }): PortfolioRowInput {
  return {
    instrument_id: `US_${over.ticker}`,
    name: over.ticker,
    sector: "Technology",
    kind: "holding",
    price: 100,
    day_change_pct: 1,
    stance: null,
    ...over,
  };
}

describe("buildPortfolio", () => {
  it("values, weighs and totals holdings that have shares, and leaves the rest out", () => {
    const portfolio = buildPortfolio({
      today: "2026-11-09",
      rows: [
        row({ ticker: "AAA", price: 100, day_change_pct: 25 }),
        row({ ticker: "BBB", price: 50, day_change_pct: -50, sector: "Energy" }),
        row({ ticker: "CCC", price: 10 }),
        row({ ticker: "WWW", kind: "watchlist" }),
      ],
      holdings: {
        US_AAA: { quantity: 3, average_cost: 80 },
        US_BBB: { quantity: 2 },
        US_WWW: { quantity: 99, average_cost: 1 },
      },
    });
    expect(portfolio.positions.map((p) => p.ticker)).toEqual(["AAA", "BBB", "CCC"]);
    expect(portfolio.watching.map((p) => p.ticker)).toEqual(["WWW"]);
    expect(portfolio.watching[0]!.value).toBeNull();

    const [a, b, c] = portfolio.positions;
    expect(a!.value).toBe(300);
    expect(a!.gain).toBe(60);
    expect(a!.gainPct).toBeCloseTo(25);
    expect(a!.dayMove).toBeCloseTo(60); // 240 -> 300
    expect(a!.weight).toBeCloseTo(75);
    expect(b!.value).toBe(100);
    expect(b!.gain).toBeNull();
    expect(b!.dayMove).toBeCloseTo(-100); // 200 -> 100
    expect(c!.value).toBeNull();
    expect(c!.weight).toBeNull();

    expect(portfolio.totals).toMatchObject({ holdings: 3, watching: 1, valued: 2, value: 400, withCost: 1, cost: 240, gain: 60 });
    expect(portfolio.totals.dayMove).toBeCloseTo(-40);
    expect(portfolio.totals.dayPct).toBeCloseTo((-40 / 440) * 100);
    expect(portfolio.analytics.basis).toBe("value");
    expect(portfolio.analytics.bySector.map((s) => [s.label, Math.round(s.weight)])).toEqual([
      ["Technology", 75],
      ["Energy", 25],
    ]);
    expect(portfolio.analytics.top1).toBeCloseTo(75);
    expect(portfolio.analytics.effectivePositions).toBeCloseTo(1 / (0.75 ** 2 + 0.25 ** 2));
  });

  it("uses a typed-in value only when there are no shares, and never computes a gain from it", () => {
    const portfolio = buildPortfolio({
      today: "2026-11-09",
      rows: [row({ ticker: "AAA" })],
      holdings: { US_AAA: { market_value: 5000, average_cost: 10 } },
    });
    const position = portfolio.positions[0]!;
    expect(position.value).toBe(5000);
    expect(position.valueSource).toBe("entered");
    expect(position.gain).toBeNull();
    expect(position.dayMove).toBeNull();
    expect(portfolio.totals.dayMove).toBeNull();
    expect(portfolio.totals.gain).toBeNull();
  });

  it("falls back to equal weights when no holding has a value, and says so", () => {
    const portfolio = buildPortfolio({
      today: "2026-11-09",
      rows: [row({ ticker: "AAA" }), row({ ticker: "BBB", sector: null })],
    });
    expect(portfolio.totals.value).toBeNull();
    expect(portfolio.analytics.basis).toBe("count");
    expect(portfolio.analytics.byPosition.map((s) => s.weight)).toEqual([50, 50]);
    expect(portfolio.analytics.bySector.map((s) => s.label).sort()).toEqual(["Technology", "Unclassified"]);
  });

  it("is empty-safe", () => {
    const portfolio = buildPortfolio({ today: "2026-11-09", rows: [] });
    expect(portfolio.totals.value).toBeNull();
    expect(portfolio.analytics.basis).toBeNull();
    expect(portfolio.analytics.beta).toBeNull();
  });

  it("takes the next earnings date from the calendar, ignores past ones, and falls back to the row", () => {
    const portfolio = buildPortfolio({
      today: "2026-11-09",
      rows: [
        row({ ticker: "AAA", earnings_date: "2026-12-01" }),
        row({ ticker: "BBB", earnings_date: "2026-10-01" }),
        row({ ticker: "CCC" }),
      ],
      earnings: new Map([
        ["AAA", { date: "2026-11-20", time: "amc" }],
        ["CCC", { date: "2026-11-01", time: null }],
      ]),
    });
    expect(portfolio.positions.map((p) => p.nextEarnings?.date ?? null)).toEqual(["2026-11-20", null, null]);
  });

  it("computes beta and volatility from stored closes", () => {
    const bench = series(100, wiggle);
    const double = series(50, wiggle.map((step) => step * 2));
    const portfolio = buildPortfolio({
      today: "2026-11-09",
      rows: [row({ ticker: "AAA" })],
      holdings: { US_AAA: { quantity: 1, updated_at: "2026-02-01T10:00:00.000Z" } },
      series: new Map([["AAA", double]]),
      benchmark: bench,
    });
    const position = portfolio.positions[0]!;
    expect(position.beta).toBeCloseTo(2, 5);
    expect(portfolio.analytics.beta).toBeCloseTo(2, 5);
    expect(portfolio.analytics.volatility).toBeCloseTo(position.volatility!, 6);
    expect(portfolio.analytics.volatility!).toBeGreaterThan(portfolio.analytics.benchmarkVolatility!);
    expect(position.sinceSaved?.fromDate).toBe("2026-02-01");
    expect(position.sinceSaved?.benchmarkPct).not.toBeNull();
  });
});

describe("stats helpers", () => {
  it("needs enough history", () => {
    expect(annualisedVolatility([0.01, -0.01])).toBeNull();
    expect(betaAgainst(dailyReturns(series(1, [0.1, 0.1])), dailyReturns(series(1, [0.1, 0.1])))).toBeNull();
  });

  it("measures performance from the first close on or after the saved day", () => {
    const stock = { dates: ["2026-01-02", "2026-01-05", "2026-01-06"], closes: [10, 20, 30] };
    const bench = { dates: ["2026-01-02", "2026-01-05", "2026-01-06"], closes: [100, 100, 110] };
    expect(performanceSince("2026-01-03T00:00:00Z", stock, bench)).toEqual({
      fromDate: "2026-01-05",
      toDate: "2026-01-06",
      pct: 50,
      benchmarkPct: 10.000000000000009,
    });
    expect(performanceSince("2026-01-06", stock, bench)).toBeNull(); // saved on the last close: nothing to measure
    expect(performanceSince(null, stock, bench)).toBeNull();
    expect(performanceSince("2026-01-02", stock, null)?.benchmarkPct).toBeNull();
  });
});

describe("zoneFor", () => {
  it("picks the zone that matches the call", () => {
    expect(zoneFor({ stance: "Accumulate", price: 1, zones: { accumulate_below: 40.66, trim_above: 60 } })?.label).toBe("Add below $40.66");
    expect(zoneFor({ stance: "Trim", price: 1, zones: { accumulate_below: 40, trim_above: 250 } })).toEqual({ label: "Trim above $250", tone: "bear" });
    expect(zoneFor({ stance: "Hold", price: 1, zones: {} })).toBeNull();
    expect(zoneFor({ stance: "Hold", price: 1, zones: null })).toBeNull();
  });
});

describe("sortPositions", () => {
  it("keeps rows without a value last in both directions", () => {
    const { positions } = buildPortfolio({
      today: "2026-11-09",
      rows: [row({ ticker: "AAA" }), row({ ticker: "BBB" }), row({ ticker: "CCC" })],
      holdings: { US_AAA: { quantity: 1 }, US_CCC: { quantity: 5 } },
    });
    expect(sortPositions(positions, "value", "desc").map((p) => p.ticker)).toEqual(["CCC", "AAA", "BBB"]);
    expect(sortPositions(positions, "value", "asc").map((p) => p.ticker)).toEqual(["AAA", "CCC", "BBB"]);
    expect(sortPositions(positions, "ticker", "desc").map((p) => p.ticker)).toEqual(["CCC", "BBB", "AAA"]);
  });
});

describe("parsePortfolioTab", () => {
  it("defaults to positions", () => {
    expect(parsePortfolioTab("alerts")).toBe("alerts");
    expect(parsePortfolioTab("closed")).toBe("positions");
    expect(parsePortfolioTab(undefined)).toBe("positions");
  });
});
