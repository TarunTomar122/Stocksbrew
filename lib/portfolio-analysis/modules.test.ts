import { describe, expect, it } from "vitest";

import type { DividendPlan } from "@/lib/dividend-plan";
import { runStressTest, type EpisodeCloses } from "@/lib/stress-test";
import { buildXray, type FundDoc } from "@/lib/xray";

import { buildCalls, buildEarnings, buildIncome } from "./book";
import { benchmarkConcentration, buildConcentration, buildOverlap, equalBets } from "./concentration";
import { buildCrashes } from "./crashes";
import { buildAttribution, buildLean } from "./market";

const fund = (ticker: string, holdings: Array<[string, number]>, status: FundDoc["status"] = "ok"): FundDoc => ({
  ticker,
  fundName: ticker,
  asOf: "2026-09-30",
  filedAt: null,
  sourceUrl: null,
  status,
  note: null,
  holdings: holdings.map(([t, weight]) => ({ ticker: t, name: t, weight })),
});

const SPY = fund("SPY", [
  ["NVDA", 0.08],
  ["MSFT", 0.07],
  ["AAPL", 0.065],
  ["AMZN", 0.04],
  ["GOOGL", 0.02],
  ["GOOG", 0.018],
  ["META", 0.03],
]);

describe("concentration", () => {
  it("counts equal bets as 1 / sum of squared weights", () => {
    expect(equalBets([50, 50])).toBeCloseTo(2);
    expect(equalBets([25, 25, 25, 25])).toBeCloseTo(4);
    expect(equalBets([100])).toBeCloseTo(1);
    expect(equalBets([])).toBeNull();
  });

  it("reads the index's own largest names with share classes folded", () => {
    const sp = benchmarkConcentration(SPY);
    expect(sp.largest?.ticker).toBe("NVDA");
    expect(sp.largest?.weight).toBe(8);
    // Alphabet is GOOGL + GOOG = 3.8%, ahead of META.
    expect(sp.top5).toBeCloseTo(8 + 7 + 6.5 + 4 + 3.8, 5);
  });

  it("takes the lines as typed, a fund being one line", () => {
    const result = buildConcentration({
      positions: [
        { ticker: "NVDA", name: "NVIDIA", weight: 50, sector: "Technology", fund: false },
        { ticker: "QQQ", name: "Invesco QQQ", weight: 30, sector: null, fund: true },
        { ticker: "JPM", name: "JPMorgan", weight: 20, sector: "Financials", fund: false },
      ],
      xray: null,
      benchmark: SPY,
      spSectors: { Technology: 33, Financials: 13, "Health Care": 10 },
    })!;
    expect(result.basis).toBe("as-typed");
    expect(result.largest).toEqual({ ticker: "NVDA", name: "NVIDIA", weight: 50 });
    expect(result.top5).toBe(100);
    expect(result.equalBets).toBeCloseTo(1 / (0.25 + 0.09 + 0.04), 1);
    // A fund line is not a company: no S&P comparison at all, and no index-only sector rows.
    expect(result.sp).toEqual({ largest: null, top5: null, equalBets: null, asOf: null });
    expect(result.sectors.every((row) => row.spPct === null && row.pct > 0)).toBe(true);
  });

  it("compares a stock-only book with the index, sector by sector", () => {
    const result = buildConcentration({
      positions: [
        { ticker: "NVDA", name: "NVIDIA", weight: 70, sector: "Technology", fund: false },
        { ticker: "JPM", name: "JPMorgan", weight: 30, sector: "Financials", fund: false },
      ],
      xray: null,
      benchmark: SPY,
      spSectors: { Technology: 33, Financials: 13, "Health Care": 10 },
    })!;
    expect(result.sp.largest?.ticker).toBe("NVDA");
    // A sector the book does not hold still shows the index's weight in it.
    expect(result.sectors.find((row) => row.sector === "Health Care")).toEqual({ sector: "Health Care", pct: 0, spPct: 10, names: [] });
  });

  it("names the holdings on each sector row, and the index's largest as ideas where the book is light", () => {
    const sectorOf = (ticker: string) =>
      ({ NVDA: "Technology", MSFT: "Information Technology", AAPL: "Technology", AMZN: "Consumer Discretionary", GOOGL: "Communication Services", GOOG: "Communication Services", META: "Communication Services", JPM: "Financials" })[ticker];
    const result = buildConcentration({
      positions: [
        { ticker: "NVDA", name: "NVIDIA Corporation", weight: 50, sector: "Technology", fund: false },
        { ticker: "AAPL", name: "Apple Inc.", weight: 40, sector: "Technology", fund: false },
        { ticker: "GOOG", name: "Alphabet Inc.", weight: 2, sector: "Communication Services", fund: false },
        { ticker: "JPM", name: "JPMorgan", weight: 8, sector: "Financials", fund: false },
      ],
      xray: null,
      benchmark: SPY,
      spSectors: { Technology: 33, Financials: 13, "Communication Services": 10, "Consumer Discretionary": 10, "Health Care": 10 },
      sectorOf,
      // The filing stops short of Health Care: the screener's S&P 500 rows by company value fill it in.
      indexRows: [
        { ticker: "UNH", name: "UnitedHealth", sector: "Health Care", weight: 500 },
        { ticker: "LLY", name: "Eli Lilly", sector: "Health Care", weight: 700 },
        { ticker: "NVDA", name: "NVIDIA", sector: "Technology", weight: 4000 },
      ],
    })!;
    const names = (sector: string) => result.sectors.find((row) => row.sector === sector)!.names.map((name) => `${name.ticker}${name.idea ? "?" : ""}`);
    // Held: biggest first, no ideas while the book is not light there.
    expect(names("Technology")).toEqual(["NVDA", "AAPL"]);
    expect(names("Financials")).toEqual(["JPM"]);
    // Not held: the index's largest there, biggest first.
    expect(names("Consumer Discretionary")).toEqual(["AMZN?"]);
    expect(names("Health Care")).toEqual(["LLY?", "UNH?"]);
    // Far under the index (2% against 10%): the own name, then ideas, never GOOGL (the same company as GOOG).
    expect(names("Communication Services")).toEqual(["GOOG", "META?"]);
    expect(result.sectors.find((row) => row.sector === "Communication Services")!.names[0]!.name).toBe("Alphabet");
  });

  it("gives no ideas when there is no index to compare with", () => {
    const result = buildConcentration({
      positions: [
        { ticker: "NVDA", name: "NVIDIA", weight: 60, sector: "Technology", fund: false },
        { ticker: "VOO", name: "Vanguard S&P 500 ETF", weight: 40, sector: null, fund: true },
      ],
      xray: null,
      benchmark: SPY,
      spSectors: { Technology: 33, "Health Care": 10 },
      sectorOf: () => "Technology",
    })!;
    expect(result.sectors.map((row) => [row.sector, row.names.map((name) => name.ticker)])).toEqual([
      ["Technology", ["NVDA"]],
      ["Funds", ["VOO"]],
    ]);
    expect(result.sectors.flatMap((row) => row.names).some((name) => name.idea)).toBe(false);
  });

  it("opens funds into companies and counts what it cannot place", () => {
    const xray = buildXray(
      [
        { ticker: "NVDA", name: "NVIDIA", value: 50 },
        { ticker: "QQQ", name: "Invesco QQQ", value: 30, looksLikeFund: true },
        { ticker: "LEV", name: "Leveraged ETF", value: 20, looksLikeFund: true },
      ],
      { funds: { QQQ: fund("QQQ", [["NVDA", 0.5], ["MSFT", 0.5]]), LEV: fund("LEV", [], "derivatives") }, sectorOf: { NVDA: "Technology", MSFT: "Technology" } },
    );
    const result = buildConcentration({ positions: [], xray, benchmark: SPY, spSectors: {} });
    expect(result).toBeNull(); // nothing valued
    const opened = buildConcentration({
      positions: [{ ticker: "NVDA", name: "NVIDIA", weight: 50, sector: "Technology", fund: false }],
      xray,
      benchmark: SPY,
      spSectors: {},
    })!;
    expect(opened.basis).toBe("look-through");
    expect(opened.largest?.ticker).toBe("NVDA");
    expect(opened.largest?.weight).toBe(65);
    expect(opened.unplacedPct).toBe(20);
    expect(opened.coveragePct).toBe(80);
    // Spread over the placed money only: 65 / 80 and 15 / 80.
    expect(opened.equalBets).toBeCloseTo(1 / ((65 / 80) ** 2 + (15 / 80) ** 2), 1);
  });

  it("measures fund overlap symmetrically", () => {
    const xray = buildXray(
      [
        { ticker: "VOO", name: "VOO", value: 50, looksLikeFund: true },
        { ticker: "QQQ", name: "QQQ", value: 50, looksLikeFund: true },
        { ticker: "MSFT", name: "Microsoft", value: 10 },
      ],
      { funds: { VOO: fund("VOO", [["MSFT", 0.07], ["JPM", 0.02]]), QQQ: fund("QQQ", [["MSFT", 0.09], ["NVDA", 0.1]]) } },
    );
    const overlap = buildOverlap(xray)!;
    expect(overlap.matrix?.funds).toEqual(["VOO", "QQQ"]);
    expect(overlap.matrix?.pct[0]![1]).toBe(overlap.matrix?.pct[1]![0]);
    expect(overlap.matrix?.pct[0]![0]).toBe(100);
    expect(overlap.matrix?.pct[0]![1]).toBe(7);
    const msft = overlap.companies.find((row) => row.ticker === "MSFT")!;
    expect(msft.via).toEqual(["QQQ", "VOO"]);
    expect(buildOverlap(buildXray([{ ticker: "NVDA", name: "NVIDIA", value: 1 }], { funds: {} }))).toBeNull();
  });
});

describe("what made the money", () => {
  it("adds today's weights times each return, scaled to the covered money", () => {
    const rows = new Map([
      ["NVDA", { ret_1m: 10, ret_3m: 20, ret_ytd: 30 }],
      ["KO", { ret_1m: -2, ret_3m: 4, ret_ytd: undefined }],
    ]);
    const result = buildAttribution(
      [
        { ticker: "NVDA", name: "NVIDIA", weight: 75 },
        { ticker: "KO", name: "Coca-Cola", weight: 25 },
      ],
      rows,
      { ret_1m: 1, ret_3m: 2, ret_ytd: 12 },
    )!;
    const month = result.windows.find((window) => window.key === "1m")!;
    expect(month.book).toBeCloseTo(0.75 * 10 + 0.25 * -2, 6);
    expect(month.rows.reduce((sum, row) => sum + row.contribution, 0)).toBeCloseTo(month.book, 1);
    expect(month.sp).toBe(1);
    // This year only NVDA has a return: 75% of the money, under the 80% floor.
    expect(result.windows.map((window) => window.key)).toEqual(["1m", "3m"]);
  });
});

describe("against the S&P", () => {
  it("uses a harmonic P/E without losses and a real zero yield", () => {
    const rows = new Map([
      ["A", { pe: 10, rev_growth: 20, op_margin: 30, market_cap: 300e9, div_yield: 2, ret_6m: 10 }],
      ["B", { pe: 40, rev_growth: 600, op_margin: -400, market_cap: 50e9, div_yield: undefined, ret_6m: -10 }],
      ["C", { pe: -5, rev_growth: 5, op_margin: 5, market_cap: 10e9, div_yield: 1, ret_6m: 0 }],
    ]);
    const lean = buildLean({
      companies: [
        { ticker: "A", weight: 50 },
        { ticker: "B", weight: 30 },
        { ticker: "C", weight: 20 },
      ],
      lines: [
        { ticker: "A", weight: 50 },
        { ticker: "B", weight: 30 },
        { ticker: "C", weight: 20 },
      ],
      rows,
      spRows: [{ pe: 20, rev_growth: 10, op_margin: 20, market_cap: 1e12, div_yield: 1.5 }],
      spReturns: { ret_6m: 4 },
      basis: "as-typed",
    })!;
    const pe = lean.figures.find((figure) => figure.key === "pe")!;
    expect(pe.book).toBeCloseTo(80 / (50 / 10 + 30 / 40), 1);
    expect(pe.coveragePct).toBe(80);
    expect(pe.sp).toBe(20);
    // Growth and margin are clipped at ±100 per company.
    expect(lean.figures.find((figure) => figure.key === "growth")!.book).toBeCloseTo(0.5 * 20 + 0.3 * 100 + 0.2 * 5, 1);
    expect(lean.figures.find((figure) => figure.key === "yield")!.book).toBeCloseTo(0.5 * 2 + 0.2 * 1, 2);
    expect(lean.figures.find((figure) => figure.key === "giants")!.book).toBe(50);
    expect(lean.figures.find((figure) => figure.key === "gap6m")).toMatchObject({ book: 2, sp: 4 });
  });
});

describe("earnings, calls and income", () => {
  const today = "2026-11-12";

  it("adds up the money reporting in the next two weeks, funds left out", () => {
    const result = buildEarnings(
      [
        { ticker: "NVDA", name: "NVIDIA", weight: 40, fund: false, nextEarnings: "2026-11-19" },
        { ticker: "CRM", name: "Salesforce", weight: 10, fund: false, nextEarnings: "2026-12-03" },
        { ticker: "VOO", name: "VOO", weight: 50, fund: true, nextEarnings: null },
      ],
      today,
    )!;
    expect(result.reportingPct).toBe(40);
    expect(result.days).toHaveLength(14);
    expect(result.days[7]).toMatchObject({ date: "2026-11-19", weight: 40 });
    expect(result.next).toBeNull();
  });

  it("names the next report when nothing reports inside the window, and hides an all-fund book", () => {
    const later = buildEarnings([{ ticker: "CRM", name: "Salesforce", weight: 100, fund: false, nextEarnings: "2026-12-03" }], today)!;
    expect(later.reportingPct).toBe(0);
    expect(later.next).toMatchObject({ ticker: "CRM", date: "2026-12-03" });
    expect(buildEarnings([{ ticker: "VOO", name: "VOO", weight: 100, fund: true, nextEarnings: null }], today)).toBeNull();
  });

  it("splits the money by call and measures each level from the price", () => {
    const result = buildCalls(
      [
        { ticker: "AAPL", name: "Apple", weight: 50, price: 200 },
        { ticker: "NVDA", name: "NVIDIA", weight: 30, price: 100 },
        { ticker: "VOO", name: "VOO", weight: 20, price: 500 },
      ],
      { AAPL: { call: "Add", addBelow: 180, trimAbove: 260 }, NVDA: { call: "Hold", addBelow: 80, trimAbove: 150 } },
      2,
    )!;
    expect(result.split).toEqual({ buyMore: 50, keep: 30, sellSome: 0, none: 20 });
    // Keep has no level.
    expect(result.rows).toEqual([{ ticker: "AAPL", name: "Apple", call: "Buy more", weight: 50, level: 180, price: 200, distancePct: -10 }]);
    expect(result.withheld).toBe(2);
  });

  it("reads the dividend plan by month", () => {
    const plan = {
      today,
      months: [
        { month: "2026-11", confirmed: 10, estimated: 0, total: 10, tickers: ["KO"] },
        { month: "2026-12", confirmed: 0, estimated: 30, total: 30, tickers: ["JPM"] },
      ],
      stocks: [
        { ticker: "KO", name: "Coca-Cola", income: 10 },
        { ticker: "JPM", name: "JPMorgan Chase", income: 30 },
      ],
      total: 40,
      missingShares: [],
    } as unknown as DividendPlan;
    const income = buildIncome(plan)!;
    expect(income.largest).toMatchObject({ ticker: "JPM", share: 75 });
    expect(buildIncome({ ...plan, total: 0 })).toBeNull();
  });
});

describe("crashes", () => {
  const closes = (start: number, end: number, first = "2010-01-01"): EpisodeCloses => ({
    first,
    last: "2026-11-11",
    points: { covid: { start: { date: "2020-02-19", close: start }, end: { date: "2020-03-23", close: end } } },
  });
  const episodes = [{ id: "covid", name: "Covid crash", start: "2020-02-19", end: "2020-03-23", what: "", kind: "fall" as const }];

  it("names the holdings that did the damage and hides thin coverage", () => {
    const stress = runStressTest(
      { holdings: [{ ticker: "A", name: "A", weight: 60 }, { ticker: "B", name: "B", weight: 40 }], basis: "value", unvalued: [] },
      new Map([
        ["A", closes(100, 60)],
        ["B", closes(100, 90)],
      ]),
      closes(100, 66),
      episodes,
    );
    const result = buildCrashes(stress)!;
    expect(result.episodes[0]).toMatchObject({ book: -28, sp: -34 });
    expect(result.worst?.drivers.map((driver) => driver.ticker)).toEqual(["A", "B"]);
    expect(result.worst?.drivers.reduce((sum, driver) => sum + driver.contribution, 0)).toBeCloseTo(-28, 5);

    const thin = runStressTest(
      { holdings: [{ ticker: "A", name: "A", weight: 70 }, { ticker: "NEW", name: "New", weight: 30 }], basis: "value", unvalued: [] },
      new Map([["A", closes(100, 60)]]),
      closes(100, 66),
      episodes,
    );
    expect(buildCrashes(thin)).toBeNull();
  });
});
