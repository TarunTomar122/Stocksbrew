import { describe, expect, it } from "vitest";

import { buildXray, buildXrayRead, fmtFilingDay, fmtPct, joinList, topTenShare, xrayFootnote, type FundDoc } from "./xray";

function fund(ticker: string, holdings: Array<[string | null, number, string?]>, extra: Partial<FundDoc> = {}): FundDoc {
  return {
    ticker,
    fundName: `${ticker} fund`,
    asOf: "2026-06-30",
    filedAt: "2026-08-28",
    sourceUrl: `https://www.sec.gov/${ticker}`,
    status: "ok",
    note: null,
    holdings: holdings.map(([t, weight, name]) => ({ ticker: t, weight, name: name ?? `${t ?? "Unknown"} Inc` })),
    ...extra,
  };
}

const QQQ = fund("QQQ", [
  ["NVDA", 0.09, "NVIDIA Corp"],
  ["AAPL", 0.08, "Apple Inc"],
  ["MSFT", 0.07, "Microsoft Corp"],
  ["GOOGL", 0.03, "Alphabet Inc"],
  ["GOOG", 0.03, "Alphabet Inc"],
  [null, 0.01, "Unmatched Co"],
]);
const VOO = fund("VOO", [
  ["NVDA", 0.075, "NVIDIA Corp"],
  ["AAPL", 0.066, "Apple Inc"],
  ["MSFT", 0.043, "Microsoft Corp"],
  ["GOOGL", 0.0325],
  ["GOOG", 0.026],
  ["JPM", 0.015, "JPMorgan Chase & Co"],
  ["XOM", 0.01, "Exxon Mobil Corp"],
], { asOf: "2026-07-31" });

const NAMES = { NVDA: "NVIDIA Corporation", AAPL: "Apple Inc.", MSFT: "Microsoft Corporation", GOOGL: "Alphabet Inc.", GOOG: "Alphabet Inc.", JPM: "JPMorgan Chase & Co.", XOM: "Exxon Mobil Corporation" };
const SECTORS = { NVDA: "Technology", AAPL: "Technology", MSFT: "Technology", GOOGL: "Communication Services", GOOG: "Communication Services", JPM: "Financials", XOM: "Energy" };

describe("buildXray", () => {
  const xray = buildXray(
    [
      { ticker: "QQQ", name: "Invesco QQQ Trust", value: 10_000 },
      { ticker: "VOO", name: "Vanguard S&P 500 ETF", value: 20_000 },
      { ticker: "NVDA", name: "NVIDIA Corporation", value: 5_000 },
      { ticker: "TSLA", name: "Tesla", value: null },
    ],
    { funds: { QQQ, VOO }, nameOf: NAMES, sectorOf: SECTORS, benchmarkSectors: { Technology: 33 } },
  );

  it("adds fund money to the direct stake", () => {
    const nvda = xray.companies.find((row) => row.ticker === "NVDA")!;
    expect(nvda.direct).toBe(5_000);
    expect(nvda.viaFunds).toBeCloseTo(10_000 * 0.09 + 20_000 * 0.075);
    expect(nvda.pct).toBeCloseTo(((5_000 + 900 + 1_500) / 35_000) * 100);
    expect(nvda.via.map((slice) => slice.fund)).toEqual(["VOO", "QQQ"]);
    expect(xray.companies[0]!.ticker).toBe("NVDA");
  });

  it("folds share classes into one company and shows the heavier class", () => {
    const alphabet = xray.companies.filter((row) => row.key === "GOOGL");
    expect(alphabet).toHaveLength(1);
    expect(alphabet[0]!.classes).toEqual(["GOOGL", "GOOG"]);
    expect(alphabet[0]!.total).toBeCloseTo(10_000 * 0.06 + 20_000 * 0.0585);
    expect(alphabet[0]!.name).toBe("Alphabet");
  });

  it("totals only valued money and lists the rest", () => {
    expect(xray.total).toBe(35_000);
    expect(xray.directValue).toBe(5_000);
    expect(xray.fundValue).toBe(30_000);
    expect(xray.unvalued).toEqual(["TSLA"]);
  });

  it("keeps fund money it cannot place out of the companies", () => {
    const placedQqq = 0.3; // unmatched row has no ticker
    const placedVoo = 0.2675;
    expect(xray.unplacedValue).toBeCloseTo(10_000 * (1 - placedQqq) + 20_000 * (1 - placedVoo));
    const sum = xray.companies.reduce((acc, row) => acc + row.total, 0);
    expect(sum + xray.unplacedValue).toBeCloseTo(xray.total);
  });

  it("groups by sector with the benchmark alongside", () => {
    const tech = xray.sectors.find((row) => row.sector === "Technology")!;
    expect(tech.benchmarkPct).toBe(33);
    expect(xray.sectors[0]!.sector).toBe("Technology");
    expect(xray.unclassifiedValue).toBe(0);
  });

  it("measures fund overlap with the smaller weight, classes folded", () => {
    expect(xray.overlaps).toHaveLength(1);
    const pair = xray.overlaps[0]!;
    expect(pair.a).toBe("QQQ");
    expect(pair.b).toBe("VOO");
    expect(pair.shared).toBe(4);
    expect(pair.pct).toBeCloseTo((0.075 + 0.066 + 0.043 + 0.0585) * 100);
    expect(pair.top.map((item) => item.name)).toEqual(["NVIDIA", "Apple", "Alphabet"]);
  });

  it("carries each fund's filing date", () => {
    expect(xray.asOfDates).toEqual(["2026-06-30", "2026-07-31"]);
    expect(xray.funds.map((item) => item.ticker)).toEqual(["VOO", "QQQ"]);
    expect(xray.funds[0]!.pct).toBeCloseTo((20_000 / 35_000) * 100);
  });

  it("merges a ticker listed twice", () => {
    const twice = buildXray(
      [
        { ticker: "nvda", name: "NVIDIA", value: 100 },
        { ticker: "NVDA", name: "NVIDIA", value: 50 },
      ],
      { funds: {} },
    );
    expect(twice.companies).toHaveLength(1);
    expect(twice.companies[0]!.direct).toBe(150);
  });

  it("does not open leveraged funds or funds with no filing", () => {
    const soxl = fund("SOXL", [["NVDA", 0.2]], { status: "derivatives", note: "Swaps.", holdings: [] });
    const result = buildXray(
      [
        { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X Shares", value: 1_000 },
        { ticker: "ABCD", name: "Some Sector ETF", value: 1_000, looksLikeFund: true },
        { ticker: "NVDA", name: "NVIDIA", value: 2_000 },
      ],
      { funds: { SOXL: soxl } },
    );
    expect(result.closedFundValue).toBe(2_000);
    expect(result.companies).toHaveLength(1);
    expect(result.funds.map((item) => item.status).sort()).toEqual(["derivatives", "missing"]);
    const read = buildXrayRead(result)!;
    expect(read.headline).toBe("We cannot see inside SOXL and ABCD, so this page cannot add up what they hold.");
    expect(read.insights[0]!.text).toContain("SOXL gets much of its exposure through swaps");
    expect(read.insights[0]!.text).toContain("we have not read the holdings of ABCD yet");
    expect(read.insights[0]!.text).toContain("50% of your money");
  });
});

describe("buildXrayRead", () => {
  it("leads with the company the funds make biggest, direct stake included", () => {
    const xray = buildXray(
      [
        { ticker: "QQQ", name: "QQQ", value: 10_000 },
        { ticker: "VOO", name: "VOO", value: 20_000 },
        { ticker: "NVDA", name: "NVIDIA", value: 5_000 },
      ],
      { funds: { QQQ, VOO }, nameOf: NAMES },
    );
    const read = buildXrayRead(xray)!;
    expect(read.headline).toBe("Once your funds are counted, NVIDIA is 21% of everything you own, not the 14% you bought directly.");
    expect(read.headlineTickers).toEqual(["NVDA"]);
    expect(read.source).toBe("Fund holdings from SEC N-PORT filings dated Jun 30, 2026 to Jul 31, 2026");
    expect(read.insights.find((item) => item.id === "xray-overlap")?.text).toMatch(/^QQQ and VOO overlap by 24%/);
  });

  it("says when the biggest company is one you never bought", () => {
    const xray = buildXray(
      [
        { ticker: "VOO", name: "VOO", value: 100_000 },
        { ticker: "JPM", name: "JPMorgan", value: 2_000 },
      ],
      { funds: { VOO }, nameOf: NAMES },
    );
    const read = buildXrayRead(xray)!;
    expect(read.headline).toBe("Once your funds are counted, NVIDIA is 7.4% of everything you own, more than any stock you bought directly.");
    const doubled = read.insights.find((item) => item.id === "xray-doubled")!;
    expect(doubled.text).toBe("JPM is 2.0% of everything you own on its own, and VOO adds another 1.5%, so it is really 3.4%.");
    expect(doubled.leadName).toBe("JPMorgan Chase");
  });

  it("does not compare a number with itself when the funds add too little to show", () => {
    const xray = buildXray(
      [
        { ticker: "AAPL", name: "Apple", value: 100_000 },
        { ticker: "VOO", name: "VOO", value: 1_000 },
      ],
      { funds: { VOO }, nameOf: NAMES },
    );
    const read = buildXrayRead(xray)!;
    expect(read.headline).not.toMatch(/not the/);
    expect(read.headline).toBe("Apple is still your biggest company at 99%, and your funds add 0.1% in NVIDIA, which you never bought.");
  });

  it("names a swaps fund without promising to read it later", () => {
    const soxl = fund("SOXL", [], { status: "derivatives", note: "Swaps." });
    const read = buildXrayRead(buildXray([{ ticker: "SOXL", name: "SOXL", value: 10 }], { funds: { SOXL: soxl } }))!;
    expect(read.headline).toBe("We cannot split SOXL into companies, so this page cannot add up what it holds.");
  });

  it("leaves index comparisons out when much of the money sits in funds it cannot open", () => {
    const soxl = fund("SOXL", [], { status: "derivatives", note: "Swaps." });
    const concentrated = fund("SMH", Array.from({ length: 10 }, (_, index) => [`S${index}`, 0.1] as [string, number]));
    const many = fund("SPY", Array.from({ length: 20 }, (_, index) => [`S${index}`, 0.05] as [string, number]));
    const xray = buildXray(
      [
        { ticker: "SMH", name: "SMH", value: 1_000 },
        { ticker: "SOXL", name: "SOXL", value: 1_000 },
      ],
      { funds: { SMH: concentrated, SOXL: soxl } },
    );
    const ids = buildXrayRead(xray, { benchmark: many })!.insights.map((item) => item.id);
    expect(ids).not.toContain("xray-top-ten");
    expect(ids).toContain("xray-closed");
  });

  it("folds share classes in a fund's biggest holdings", () => {
    const xray = buildXray([{ ticker: "QQQ", name: "QQQ", value: 1_000 }], { funds: { QQQ } });
    expect(xray.funds[0]!.top.map((item) => item.ticker)).toEqual(["NVDA", "AAPL", "MSFT", "GOOGL"]);
    expect(xray.funds[0]!.top[3]!.weightPct).toBeCloseTo(6);
  });

  it("speaks of the example as this portfolio", () => {
    const xray = buildXray([{ ticker: "VOO", name: "VOO", value: 1_000 }], { funds: { VOO }, nameOf: NAMES });
    expect(buildXrayRead(xray, { example: true })!.headline).toContain("of this portfolio");
  });

  it("compares the top ten with the S&P 500 when the gap is real", () => {
    const many = fund(
      "SPY",
      Array.from({ length: 20 }, (_, index) => [`S${index}`, index < 10 ? 0.04 : 0.02] as [string, number]),
    );
    const concentrated = fund("SMH", Array.from({ length: 10 }, (_, index) => [`S${index}`, 0.1] as [string, number]));
    const xray = buildXray([{ ticker: "SMH", name: "SMH", value: 1_000 }], { funds: { SMH: concentrated } });
    expect(topTenShare(many)).toBeCloseTo(40);
    const insight = buildXrayRead(xray, { benchmark: many })!.insights.find((item) => item.id === "xray-top-ten")!;
    expect(insight.text).toBe("Your ten biggest companies are 100% of everything you own, against 40% for the ten biggest in the S&P 500.");
  });

  it("has a plain headline when nothing is a fund, and nothing when nothing is valued", () => {
    const direct = buildXray([{ ticker: "AAPL", name: "Apple", value: 10 }], { funds: {} });
    expect(buildXrayRead(direct)!.headline).toBe("None of your holdings is a fund, so the list you see is everything you own.");
    expect(buildXrayRead(buildXray([{ ticker: "AAPL", name: "Apple", value: null }], { funds: {} }))).toBeNull();
  });
});

describe("words", () => {
  it("formats percentages for reading", () => {
    expect(fmtPct(14.2)).toBe("14%");
    expect(fmtPct(9.96)).toBe("10%");
    expect(fmtPct(4.54)).toBe("4.5%");
    expect(fmtPct(0.04)).toBe("under 0.1%");
  });

  it("joins lists and dates", () => {
    expect(joinList(["QQQ"])).toBe("QQQ");
    expect(joinList(["QQQ", "VOO", "VTI"])).toBe("QQQ, VOO and VTI");
    expect(fmtFilingDay("2026-06-30")).toBe("Jun 30, 2026");
    expect(fmtFilingDay(null)).toBe("");
  });

  it("names one filing date or a range", () => {
    const one = buildXray([{ ticker: "QQQ", name: "QQQ", value: 1 }], { funds: { QQQ } });
    expect(xrayFootnote(one)).toBe("Fund holdings from SEC N-PORT filings as of Jun 30, 2026");
  });
});
