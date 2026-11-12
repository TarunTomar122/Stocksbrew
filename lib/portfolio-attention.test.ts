import { describe, expect, it } from "vitest";

import { attentionFirst, nearCallLevel, needsLook, reportSoon } from "@/lib/portfolio-attention";
import { sortPositions, type PortfolioPosition } from "@/lib/portfolio-shared";

const TODAY = "2026-11-12";

function pos(ticker: string, over: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    instrument_id: `US_${ticker}`,
    ticker,
    name: ticker,
    sector: null,
    kind: "holding",
    price: 100,
    dayPct: 0,
    shares: 1,
    avgCost: null,
    value: 100,
    valueSource: "shares",
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

describe("reportSoon", () => {
  it("counts today through seven days ahead, the orange date", () => {
    expect(reportSoon({ date: "2026-11-12", time: "amc" }, TODAY)).toBe(true);
    expect(reportSoon({ date: "2026-11-19", time: null }, TODAY)).toBe(true);
    expect(reportSoon({ date: "2026-11-20", time: null }, TODAY)).toBe(false);
    expect(reportSoon({ date: "2026-11-11", time: null }, TODAY)).toBe(false);
    expect(reportSoon(null, TODAY)).toBe(false);
  });
});

describe("nearCallLevel", () => {
  it("lifts Buy more at, under or just above its level, and Sell some at, over or just under it", () => {
    const add = (price: number) => pos("A", { price, zone: { label: "Below $100", tone: "bull", level: 100 } });
    const trim = (price: number) => pos("T", { price, zone: { label: "Above $100", tone: "bear", level: 100 } });
    expect(nearCallLevel(add(90))).toBe(true);
    expect(nearCallLevel(add(100))).toBe(true);
    expect(nearCallLevel(add(102.5))).toBe(true);
    expect(nearCallLevel(add(110))).toBe(false);
    expect(nearCallLevel(trim(120))).toBe(true);
    expect(nearCallLevel(trim(97.5))).toBe(true);
    expect(nearCallLevel(trim(90))).toBe(false);
    expect(nearCallLevel(pos("N", { price: null, zone: { label: "Below $100", tone: "bull", level: 100 } }))).toBe(false);
    expect(nearCallLevel(pos("Z"))).toBe(false);
  });
});

describe("attentionFirst", () => {
  it("puts the rows that need a look on top, each group keeping the default sort", () => {
    const rows = [
      pos("BIG", { value: 5000 }),
      pos("SOON", { value: 4000, nextEarnings: { date: "2026-11-13", time: "bmo" } }),
      pos("MID", { value: 3000 }),
      pos("ZONE", { value: 2000, needsAttention: true }),
      pos("LEVEL", { value: 1000, price: 101, zone: { label: "Below $100", tone: "bull", level: 100 } }),
      pos("LATER", { value: 500, nextEarnings: { date: "2026-12-09", time: null } }),
    ];
    const byValue = sortPositions(rows, "value", "desc");
    expect(attentionFirst(byValue, TODAY).map((row) => row.ticker)).toEqual(["SOON", "ZONE", "LEVEL", "BIG", "MID", "LATER"]);
    expect(rows.filter((row) => needsLook(row, TODAY)).map((row) => row.ticker)).toEqual(["SOON", "ZONE", "LEVEL"]);
  });

  it("leaves the order alone when nothing needs a look", () => {
    const rows = [pos("A"), pos("B"), pos("C")];
    expect(attentionFirst(rows, TODAY).map((row) => row.ticker)).toEqual(["A", "B", "C"]);
  });
});
