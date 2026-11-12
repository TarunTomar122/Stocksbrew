import { describe, expect, it } from "vitest";

import {
  activeCount,
  applyFilters,
  filterOptions,
  NO_FILTERS,
  parseFilters,
  readableQuery,
  sectorKey,
  usableFilters,
  writeFilters,
} from "@/lib/portfolio-filters";
import { FUNDS_SECTOR, type PortfolioPosition } from "@/lib/portfolio-shared";

const TODAY = "2026-11-12";

function pos(ticker: string, over: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    instrument_id: `US_${ticker}`,
    ticker,
    name: ticker,
    sector: null,
    kind: "watchlist",
    price: 100,
    dayPct: 0,
    shares: null,
    avgCost: null,
    value: null,
    valueSource: null,
    cost: null,
    gain: null,
    gainPct: null,
    dayMove: null,
    weight: null,
    stance: null,
    zone: null,
    needsAttention: false,
    attentionDirection: null,
    reason: null,
    nextEarnings: null,
    savedAt: null,
    beta: null,
    volatility: null,
    sinceSaved: null,
    ...over,
  };
}

const ROWS = [
  pos("NVDA", { sector: "Technology", stance: "accumulate", capTier: "mega", dayPct: -4.5, zone: { label: "Below $101", tone: "bull", level: 101 } }),
  pos("MSFT", { sector: "Technology", stance: "hold", capTier: "large", nextEarnings: { date: "2026-11-20", time: null } }),
  pos("XOM", { sector: "Energy", stance: "trim", capTier: "mid", dayPct: 3 }),
  pos("SMR", { sector: "Industrials", stance: "hold", capTier: "small" }),
  pos("VOO", { sector: FUNDS_SECTOR, capTier: "mega" }),
];

const tickers = (rows: PortfolioPosition[]) => rows.map((row) => row.ticker);

describe("filterOptions", () => {
  it("offers only what splits the rows, with counts, funds kept out of sectors and sizes", () => {
    const options = filterOptions(ROWS, TODAY);
    expect(options.sectors.map((sector) => [sector.value, sector.count])).toEqual([
      ["technology", 2],
      ["energy", 1],
      ["industrials", 1],
    ]);
    expect(options.calls.map((call) => [call.value, call.count])).toEqual([
      ["buy", 1],
      ["keep", 2],
      ["sell", 1],
    ]);
    expect(options.sizes.map((size) => [size.value, size.count])).toEqual([
      ["small", 1],
      ["mid", 1],
      ["large", 2],
    ]);
    expect(options.types.map((type) => type.value)).toEqual(["stock", "fund"]);
    expect(options.near).toBe(1);
    expect(options.reports).toBe(1);
    expect(options.moving).toBe(2);
  });

  it("drops a choice every row shares, and a yes/no filter every row passes", () => {
    const rows = [pos("A", { sector: "Energy", dayPct: 5, stance: "hold" }), pos("B", { sector: "Energy", dayPct: -3, stance: "hold" })];
    const options = filterOptions(rows, TODAY);
    expect(options.sectors).toEqual([]);
    expect(options.types).toEqual([]);
    expect(options.moving).toBe(0);
    expect(options.calls).toEqual([]);
  });

  it("offers one known sector, call or size beside rows without one, or beside funds", () => {
    const rows = [
      pos("NVDA", { sector: "Technology", stance: "accumulate", capTier: "mega" }),
      pos("AMD", { sector: "Technology", stance: "accumulate", capTier: "large" }),
      pos("NEW", { sector: null }),
      pos("VOO", { sector: FUNDS_SECTOR }),
    ];
    const options = filterOptions(rows, TODAY);
    expect(options.sectors.map((sector) => [sector.value, sector.count])).toEqual([["technology", 2]]);
    expect(options.calls.map((call) => [call.value, call.count])).toEqual([["buy", 2]]);
    expect(options.sizes.map((size) => [size.value, size.count])).toEqual([["large", 2]]);
    expect(tickers(applyFilters(rows, { ...NO_FILTERS, sectors: ["technology"] }, TODAY))).toEqual(["NVDA", "AMD"]);
  });

  it("counts a report today but not one past 14 days or already gone", () => {
    const rows = [
      pos("A", { nextEarnings: { date: TODAY, time: "amc" } }),
      pos("B", { nextEarnings: { date: "2026-11-26", time: null } }),
      pos("C", { nextEarnings: { date: "2026-11-27", time: null } }),
      pos("D", { nextEarnings: { date: "2026-11-11", time: null } }),
    ];
    expect(tickers(applyFilters(rows, { ...NO_FILTERS, reports: true }, TODAY))).toEqual(["A", "B"]);
  });
});

describe("applyFilters", () => {
  it("returns the same rows when nothing is on", () => {
    expect(applyFilters(ROWS, NO_FILTERS, TODAY)).toBe(ROWS);
  });

  it("ORs within a group and ANDs across groups", () => {
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, sectors: ["technology", "energy"] }, TODAY))).toEqual(["NVDA", "MSFT", "XOM"]);
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, sectors: ["technology", "energy"], calls: ["keep", "sell"] }, TODAY))).toEqual(["MSFT", "XOM"]);
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, moving: true }, TODAY))).toEqual(["NVDA", "XOM"]);
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, near: true }, TODAY))).toEqual(["NVDA"]);
  });

  it("buckets mega as large and keeps funds out of sizes", () => {
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, sizes: ["large"] }, TODAY))).toEqual(["NVDA", "MSFT"]);
    expect(tickers(applyFilters(ROWS, { ...NO_FILTERS, types: ["fund"] }, TODAY))).toEqual(["VOO"]);
  });
});

describe("the URL", () => {
  it("round-trips through the query string", () => {
    const filters = { ...NO_FILTERS, sectors: ["health-care", "energy"], calls: ["buy" as const], near: true };
    const params = new URLSearchParams("tab=watching&sector=old");
    writeFilters(params, filters);
    expect(params.get("tab")).toBe("watching");
    expect(parseFilters(params)).toEqual(filters);
    writeFilters(params, NO_FILTERS);
    expect(params.toString()).toBe("tab=watching");
  });

  it("ignores unknown values and accepts sector names as written", () => {
    const parsed = parseFilters(new URLSearchParams("sector=Health Care,health-care&call=buy,maybe&size=huge&moving=1"));
    expect(parsed.sectors).toEqual(["health-care"]);
    expect(parsed.calls).toEqual(["buy"]);
    expect(parsed.sizes).toEqual([]);
    expect(parsed.moving).toBe(true);
    expect(activeCount(parsed)).toBe(3);
  });

  it("drops choices the rows no longer offer", () => {
    const options = filterOptions(ROWS, TODAY);
    const usable = usableFilters({ ...NO_FILTERS, sectors: ["utilities", "energy"], calls: ["buy"] }, options);
    expect(usable.sectors).toEqual(["energy"]);
    expect(usable.calls).toEqual(["buy"]);
  });

  it("folds one sector's names into one key", () => {
    expect(sectorKey("Health Care")).toBe("health-care");
    expect(sectorKey("Healthcare")).toBe("health-care");
    expect(sectorKey("Financial")).toBe("financials");
    expect(sectorKey("Financial Services")).toBe("financials");
    expect(sectorKey("Consumer Cyclical")).toBe("consumer-discretionary");
    expect(sectorKey(" Oil & Gas ")).toBe("oil-and-gas");
  });

  it("shows one chip, under one name, for a sector spelled two ways", () => {
    const rows = [pos("JPM", { sector: "Financial" }), pos("BLK", { sector: "Financial Services" }), pos("XOM", { sector: "Energy" })];
    const options = filterOptions(rows, TODAY);
    expect(options.sectors.map((sector) => [sector.value, sector.label, sector.count])).toEqual([
      ["financials", "Financials", 2],
      ["energy", "Energy", 1],
    ]);
    expect(tickers(applyFilters(rows, { ...NO_FILTERS, sectors: ["financials"] }, TODAY))).toEqual(["JPM", "BLK"]);
  });

  it("keeps commas readable in the filter keys only", () => {
    expect(readableQuery("?tab=watching&sector=energy%2Ctechnology&note=a%2Cb")).toBe("?tab=watching&sector=energy,technology&note=a%2Cb");
  });
});
