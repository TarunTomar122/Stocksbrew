import { describe, expect, it } from "vitest";

import type { ScreenerRow } from "@/lib/screener-shared";
import { buildXray } from "@/lib/xray";

import { cardFacts, peerLabel, peerMoves, salesMarks } from "./facts";
import { companyOutcomes, concentrationTitle, fundRows, tailSpan, sectorMix, tickAligns, topShare, weightRows } from "./mix";
import { buildRebalance } from "./rebalance";
import { DEFAULT_RATES } from "./tax";
import type { IdeaHolding } from "./types";
import type { AddIdea, RebalancePlan, TrimIdea } from "./types";

const row = (symbol: string, partial: Partial<ScreenerRow> = {}): ScreenerRow => ({ symbol, ...partial });

describe("peer groups", () => {
  it("names the industry when it has a plain name, else the sector", () => {
    expect(peerLabel("Semiconductors", "Technology")).toEqual(["industry", "chip stocks"]);
    expect(peerLabel("Software - Infrastructure", "Technology")).toEqual(["industry", "software stocks"]);
    expect(peerLabel("Discount Stores", "Consumer Staples")).toEqual(["sector", "food, drink and household stocks"]);
    expect(peerLabel(null, null)).toEqual(["", ""]);
  });

  it("takes the median five-day move of the others, never the stock itself", () => {
    const rows = [
      row("NVDA", { industry: "Semiconductors", sector: "Technology", ret_1w: -13 }),
      row("AMD", { industry: "Semiconductors", sector: "Technology", ret_1w: 4 }),
      row("AVGO", { industry: "Semiconductors", sector: "Technology", ret_1w: 6 }),
      row("MU", { industry: "Semiconductors", sector: "Technology", ret_1w: 8 }),
      row("QCOM", { industry: "Semiconductors", sector: "Technology", ret_1w: 2 }),
    ];
    const moves = peerMoves(rows, ["NVDA"]);
    expect(moves.get("NVDA")).toEqual({ label: "chip stocks", ret1w: 5 });
  });

  it("falls back to the sector when the industry is too small, and gives nothing when both are", () => {
    const rows = [
      row("ODD", { industry: "Semiconductors", sector: "Technology", ret_1w: 1 }),
      row("A", { industry: "Software - Application", sector: "Technology", ret_1w: 1 }),
      row("B", { industry: "Software - Application", sector: "Technology", ret_1w: 2 }),
      row("C", { industry: "Software - Application", sector: "Technology", ret_1w: 3 }),
      row("D", { industry: "Software - Application", sector: "Technology", ret_1w: 4 }),
      row("LONE", { industry: "Banks", sector: "Financials", ret_1w: 1 }),
    ];
    expect(peerMoves(rows, ["ODD"]).get("ODD")).toEqual({ label: "tech stocks", ret1w: 2.5 });
    expect(peerMoves(rows, ["LONE"]).has("LONE")).toBe(false);
  });
});

describe("figure rows under a card", () => {
  it("draws the bars each call is measured against on sales growth", () => {
    // 17.9% growth: raise above 17%, lower below 9% (the reason's own numbers).
    expect(salesMarks(17.9, "Hold")).toEqual([
      { value: 9, label: "lower" },
      { value: 17, label: "raise" },
    ]);
    expect(salesMarks(49, "Add")).toEqual([{ value: 25, label: "stop" }]);
    expect(salesMarks(-4, "Trim")).toEqual([{ value: 0, label: "stop" }]);
    expect(salesMarks(5, null)).toEqual([]);
  });

  it("marks sales growth only when the reason names it, and says the change in one short line", () => {
    const facts = cardFacts(
      { rev_growth: 17.9, ret_1w: -6.2, pe: 30, pe_hist_median: 31 },
      { label: "software stocks", ret1w: -2.9 },
      "Hold",
      "Microsoft's sales grew 18% over the past year. Microsoft's next report could raise the call if sales growth stays above 17%, and lower it if sales growth falls below 9%.",
    );
    expect(facts.rows.map((fact) => fact.kind)).toEqual(["sales", "move"]);
    expect(facts.rows[0]).toMatchObject({ kind: "sales", marks: [{ value: 9 }, { value: 17 }] });
    expect(facts.change).toBe("Buy more above 17% sales growth · Sell some below 9%");
    expect(facts.change!.split(" ").length).toBeLessThanOrEqual(12);
  });

  it("puts the P/E first, marked, when the call is measured against it", () => {
    const facts = cardFacts(
      { rev_growth: 22, ret_1w: -1, pe: 17, pe_hist_median: 29 },
      { label: "media stocks", ret1w: 0 },
      "Add",
      "Alphabet fell 17% but its P/E of 17 is below the usual 29. We'd stop buying if the P/E climbs back above 29 or Alphabet's next report misses profit forecasts.",
    );
    expect(facts.rows.map((fact) => fact.kind)).toEqual(["pe", "sales"]);
    expect(facts.rows[0]).toMatchObject({ kind: "pe", mark: true });
    expect(facts.rows[1]).toMatchObject({ kind: "sales", marks: [] });
    expect(facts.change).toBe("Keep if the P/E tops 29");
  });

  it("draws no condition when the reason names none we can draw, and skips a move close to its group", () => {
    const facts = cardFacts({ rev_growth: 10, ret_1w: 1, pe: 20, pe_hist_median: 20 }, { label: "banks", ret1w: 0.5 }, "Hold", "Results could move it.");
    expect(facts.change).toBeNull();
    expect(facts.rows.map((fact) => fact.kind)).toEqual(["sales", "pe"]);
    expect(facts.rows[0]).toMatchObject({ marks: [] });
  });

  it("says a Keep's floor of zero as shrinking sales, and a Sell some's way back as Keep", () => {
    const keep = cardFacts({ rev_growth: 5 }, null, "Hold", "The next report could raise the call if sales growth stays above 5%, and lower it if sales shrink.");
    expect(keep.change).toBe("Buy more above 5% sales growth · Sell some if sales shrink");
    const sell = cardFacts({ rev_growth: -4 }, null, "Trim", "We'd stop selling if the next report shows sales growing again.");
    expect(sell.change).toBe("Keep once sales grow again");
    // No change sentence for today's call: no marker and no line, even when the why mentions sales.
    const none = cardFacts({ rev_growth: -4 }, null, "Trim", null);
    expect(none.change).toBeNull();
    expect(none.rows[0]).toMatchObject({ kind: "sales", marks: [] });
  });

  it("is empty without a screener row, and never more than two rows", () => {
    expect(cardFacts(null, null, "Add", null)).toEqual({ rows: [], change: null });
    const full = cardFacts({ rev_growth: 10, ret_1w: -9, pe: 40, pe_hist_median: 20 }, { label: "x", ret1w: 3 }, null, null);
    expect(full.rows).toHaveLength(2);
  });
});

describe("chart shapes", () => {
  const xray = buildXray(
    [
      { ticker: "AAA", name: "Alpha", value: 5000 },
      { ticker: "BBB", name: "Beta", value: 3000 },
      { ticker: "CCC", name: "Gamma", value: 2000 },
    ],
    { funds: {}, sectorOf: { AAA: "Technology", BBB: "Technology", CCC: "Energy" }, benchmarkSectors: { Technology: 33, Energy: 3, Financials: 13 } },
  );

  it("gives one bar per company, biggest first, with its call", () => {
    const rows = weightRows(xray, [
      { ticker: "AAA", call: "Hold" },
      { ticker: "BBB", call: "Add" },
      { ticker: "CCC", call: null },
    ]);
    expect(rows.map((r) => [r.ticker, Math.round(r.pct), r.call])).toEqual([
      ["AAA", 50, "Hold"],
      ["BBB", 30, "Add"],
      ["CCC", 20, null],
    ]);
    expect(rows[0]!.directPct).toBeCloseTo(50);
    expect(fundRows(xray)).toEqual([]);
  });

  it("moves sectors by the trims and adds, and lists the S&P sectors not held at 0%", () => {
    const trims = [{ ticker: "AAA", amount: 1000 }] as TrimIdea[];
    const adds = [{ ticker: "CCC", amount: 600, sector: "Energy" }] as AddIdea[];
    const mix = sectorMix(xray, { trims, adds }, [], { Technology: 33, Energy: 3, Financials: 13 });
    const tech = mix.find((r) => r.sector === "Technology")!;
    expect(tech.pct).toBeCloseTo(80);
    expect(tech.after).toBeCloseTo(70);
    expect(mix.find((r) => r.sector === "Energy")!.after).toBeCloseTo(26);
    expect(mix[mix.length - 1]).toEqual({ sector: "Financials", pct: 0, benchmark: 13, after: 0 });
  });

  it("says the verdict in ten words or fewer", () => {
    const none = { trims: [], companiesOver: [] } as unknown as RebalancePlan;
    expect(concentrationTitle(none)).toBe("Every stock is under 10%");
    const held = { trims: [], companiesOver: [{ ticker: "A" }, { ticker: "B" }] } as unknown as RebalancePlan;
    expect(concentrationTitle(held)).toBe("2 stocks are over 10%, nothing to sell");
    const one = { trims: [], companiesOver: [{ ticker: "A" }] } as unknown as RebalancePlan;
    expect(concentrationTitle(one)).toBe("One stock is over 10%, nothing to sell");
    // GOOGL and GOOG trimmed for one company count once, and both reach the line.
    const trims = {
      trims: [
        { ticker: "GOOGL", kind: "company", subject: "Alphabet", before: 14, after: 12, reached: false },
        { ticker: "GOOG", kind: "company", subject: "Alphabet", before: 14, after: 12, reached: true },
        { ticker: "B", kind: "company", subject: "Beta", before: 12, after: 10, reached: true },
      ],
      companiesOver: [],
    } as unknown as RebalancePlan;
    expect(concentrationTitle(trims)).toBe("Sell some of 2 stocks to get to 10%");
    expect(companyOutcomes(trims.trims)).toEqual([
      { subject: "Alphabet", ticker: "GOOGL", before: 14, after: 10, reached: true },
      { subject: "Beta", ticker: "B", before: 12, after: 10, reached: true },
    ]);
    const mixed = {
      trims: [{ ticker: "A", kind: "sector", subject: "Technology", before: 55, after: 40, reached: true }],
      companiesOver: [],
      sectors: [{ sector: "Technology", before: 55, after: 40, benchmark: 33, target: 43, shortBy: null }],
    } as unknown as RebalancePlan;
    expect(concentrationTitle(mixed)).toBe("Sell some of one stock; Technology goes 55% → 40%");
    for (const plan of [none, held, one, trims, mixed]) expect(concentrationTitle(plan).split(" ").length).toBeLessThanOrEqual(10);
  });

  it("never claims the line is reached when the plan stops short (half the holding at most)", () => {
    const holdings: IdeaHolding[] = [
      ["BIG", 100, 370],
      ["MID", 100, 160],
      ["A", 100, 90],
      ["B", 100, 90],
      ["C", 100, 90],
      ["D", 100, 90],
      ["E", 100, 110],
    ].map(([ticker, shares, price]) => ({
      ticker: ticker as string,
      name: ticker as string,
      instrumentId: `US_${ticker}`,
      fund: false,
      shares: shares as number,
      price: price as number,
      value: (shares as number) * (price as number),
      lots: [],
      basis: "none",
      recentBuys: [],
      call: null,
      callReason: null,
      sector: null,
      industry: null,
      marketCap: null,
      ret1y: null,
    }));
    const xray = buildXray(
      holdings.map((h) => ({ ticker: h.ticker, name: h.name, value: h.value })),
      { funds: {} },
    );
    const plan = buildRebalance({ holdings, xray, rates: DEFAULT_RATES, today: "2026-11-12", subject: "mine" });
    const outcomes = companyOutcomes(plan.trims);
    const big = outcomes.find((row) => row.ticker === "BIG")!;
    // BIG is 37% and may sell only half: it ends near 18.5%, nowhere near 10%.
    expect(big.reached).toBe(false);
    expect(big.after).toBeGreaterThan(15);
    const title = concentrationTitle(plan);
    expect(title).toMatch(/^Sell some of 2 stocks; BIG still ends at 1[89]%$/);
    expect(title).not.toMatch(/to get to/);
    expect(title.split(" ").length).toBeLessThanOrEqual(10);
  });

  it("places tick labels inward so they never run off the track or into each other", () => {
    expect(tickAligns([50])).toEqual(["center"]);
    expect(tickAligns([5])).toEqual(["start"]);
    expect(tickAligns([98])).toEqual(["end"]);
    expect(tickAligns([50, 94])).toEqual(["end", "end"]);
    expect(tickAligns([40, 60])).toEqual(["end", "start"]);
    expect(tickAligns([8, 60])).toEqual(["start", "start"]);
  });

  it("sums the biggest five only when there are more than five", () => {
    const rows = [30, 20, 10, 5, 5, 3].map((pct, i) => ({ ticker: `T${i}`, name: "", pct, directPct: pct, fundPct: 0, call: null }));
    expect(topShare(rows)).toEqual({ count: 5, pct: 70 });
    expect(topShare(rows.slice(0, 5))).toBeNull();
  });

  it("gives the companion panel the rest of the last row, or a whole row when the cards end level", () => {
    expect(tailSpan(1, 3)).toBe(2);
    expect(tailSpan(2, 3)).toBe(1);
    expect(tailSpan(3, 3)).toBe(3);
    expect(tailSpan(5, 3)).toBe(1);
    expect(tailSpan(5, 2)).toBe(1);
    expect(tailSpan(4, 2)).toBe(2);
    expect(tailSpan(0, 3)).toBe(3);
  });
});
