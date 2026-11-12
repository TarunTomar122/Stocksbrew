import { describe, expect, it } from "vitest";

import { costOn10k, fmtDollars, fmtRatio, fundLookThrough, lastCloseQuote, yearReturn } from "@/lib/funds/view";
import type { FundDoc } from "@/lib/xray";

function doc(holdings: FundDoc["holdings"], status: FundDoc["status"] = "ok"): FundDoc {
  return { ticker: "TEST", fundName: "Test Fund", asOf: "2026-06-30", filedAt: "2026-08-28", sourceUrl: null, status, note: null, holdings };
}

describe("cost", () => {
  it("says what a year costs on $10,000", () => {
    expect(costOn10k(0.0003)).toBeCloseTo(3);
    expect(fmtDollars(costOn10k(0.0003)!)).toBe("$3");
    expect(fmtDollars(costOn10k(0.0035)!)).toBe("$35");
    expect(fmtDollars(costOn10k(0.00003)!)).toBe("$0.30");
    expect(fmtDollars(costOn10k(0.0095)!)).toBe("$95");
    expect(costOn10k(null)).toBeNull();
    expect(costOn10k(-1)).toBeNull();
  });

  it("quotes the ratio with two decimals", () => {
    expect(fmtRatio(0.0003)).toBe("0.03%");
    expect(fmtRatio(0.0035)).toBe("0.35%");
  });
});

describe("lastCloseQuote", () => {
  it("prices from the last two closes", () => {
    const quote = lastCloseQuote([
      { date: "2026-11-06", close: 100 },
      { date: "2026-11-09", close: 102 },
    ]);
    expect(quote).toMatchObject({ price: 102, changeAbs: 2, date: "2026-11-09" });
    expect(quote!.changePct).toBeCloseTo(2);
  });

  it("has no move with one close and nothing with none", () => {
    expect(lastCloseQuote([{ date: "2026-11-09", close: 5 }])).toMatchObject({ price: 5, changeAbs: null, changePct: null });
    expect(lastCloseQuote([])).toBeNull();
    expect(lastCloseQuote(null)).toBeNull();
  });
});

describe("yearReturn", () => {
  const fund = [
    { date: "2025-11-07", close: 90 },
    { date: "2025-11-10", close: 100 },
    { date: "2026-11-10", close: 120 },
    { date: "2026-11-11", close: 121 },
  ];
  const spy = [
    { date: "2025-11-10", close: 500 },
    { date: "2026-11-10", close: 550 },
  ];

  it("compares the same days, ending on the last close both share", () => {
    const result = yearReturn(fund, spy)!;
    expect(result.to).toBe("2026-11-10");
    expect(result.from).toBe("2025-11-10");
    expect(result.fundPct).toBeCloseTo(20);
    expect(result.sp500Pct).toBeCloseTo(10);
  });

  it("starts where the chart's 1Y tab starts when given", () => {
    const result = yearReturn(fund, spy, "2025-11-10")!;
    expect(result.from).toBe("2025-11-10");
    expect(result.fundPct).toBeCloseTo(20);
  });

  it("is null when a series does not reach a year back", () => {
    expect(yearReturn(fund.slice(2), spy)).toBeNull();
    expect(yearReturn(fund, [])).toBeNull();
  });
});

describe("fundLookThrough", () => {
  const holdings = [
    { ticker: "NVDA", name: "NVIDIA Corp", weight: 0.08 },
    { ticker: "GOOGL", name: "Alphabet Inc", weight: 0.04 },
    { ticker: "GOOG", name: "Alphabet Inc", weight: 0.03 },
    { ticker: "XOM", name: "Exxon Mobil", weight: 0.05 },
    { ticker: "JPM", name: "JPMorgan Chase", weight: 0.8 },
  ];
  const sectorOf = { NVDA: "Technology", GOOGL: "Communication Services", GOOG: "Communication Services", XOM: "Energy", JPM: "Financials" };

  it("folds share classes, ranks companies and sets the sectors beside the S&P 500", () => {
    const view = fundLookThrough({ doc: doc(holdings), sectorOf, benchmarkSectors: { Technology: 33, Financials: 13, Utilities: 2 } });
    expect(view.top.map((row) => row.ticker)).toEqual(["JPM", "NVDA", "GOOGL", "XOM"]);
    expect(view.top[2]!.weightPct).toBeCloseTo(7);
    expect(view.companyCount).toBe(4);
    expect(view.sectors!.map((row) => row.sector)).toEqual(["Financials", "Technology", "Communication Services", "Energy", "Utilities"]);
    expect(view.sectors![0]).toMatchObject({ pct: 80, benchmarkPct: 13 });
    expect(view.sectors!.at(-1)).toMatchObject({ sector: "Utilities", pct: 0, benchmarkPct: 2 });
    expect(view.overlap).toBeNull();
  });

  it("finds the stocks held directly, any share class", () => {
    const view = fundLookThrough({ doc: doc(holdings), sectorOf, direct: ["GOOG", "XOM", "AAPL"] });
    expect(view.overlap!.stocks.map((row) => row.ticker)).toEqual(["GOOGL", "XOM"]);
    expect(view.overlap!.pct).toBeCloseTo(12);
  });

  it("uses Yahoo's sector mix when the holdings cannot be placed, and nothing for a fund it cannot break down", () => {
    const yahoo = { "Financial Services": 0.5, Technology: 0.3 };
    const unplaced = fundLookThrough({ doc: doc(holdings), sectorOf: {}, yahooSectors: yahoo, benchmarkSectors: { Technology: 33 } });
    expect(unplaced.sectors!.map((row) => [row.sector, Math.round(row.pct)])).toEqual([
      ["Financials", 50],
      ["Technology", 30],
    ]);
    const bonds = fundLookThrough({ doc: doc([], "not_stocks"), yahooSectors: null });
    expect(bonds).toEqual({ top: [], companyCount: 0, sectors: null, overlap: null });
  });
});
