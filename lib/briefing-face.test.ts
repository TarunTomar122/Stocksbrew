import { describe, expect, it } from "vitest";

import { repeatsFigure, shownFigures } from "@/lib/no-repeat";

import type { BriefingItem, BriefingPosition } from "@/lib/briefing";
import {
  atYourLevels,
  clockWords,
  dayLabel,
  doToday,
  earningsWeek,
  faceMode,
  fittingLine,
  gapOf,
  gapWords,
  heatCells,
  levelLine,
  levelSetAtClose,
  marketStrip,
  marketTiles,
  ownLevel,
  LINE_WORDS,
  gridColumns,
  levelCandidates,
  levelFact,
  levelsTitle,
  lineStatesCall,
  pickLevelFacts,
  sessionOpened,
  weekTitle,
  youVsMarketPath,
  type LevelFact,
  stockItems,
  whyItMoved,
} from "@/lib/briefing-face";
import { buildCallEvidence, type CallEvidenceInput } from "@/lib/call-evidence";
import type { ResultRead } from "@/lib/results/types";

const TODAY = "2026-11-12"; // a Thursday

function position(overrides: Partial<BriefingPosition> & { ticker: string }): BriefingPosition {
  return {
    instrument_id: `US_${overrides.ticker}`,
    name: `${overrides.ticker} Inc.`,
    relation: "holding",
    price: 100,
    day_change_pct: 1,
    price_as_of: "2026-11-11T21:00:00.000Z",
    stance: null,
    call_summary: null,
    watch_out: null,
    add_below: null,
    breakout_above: null,
    trim_above: null,
    earnings_date: null,
    earnings_time: null,
    pre_earnings_headline: null,
    ...overrides,
  };
}

function item(overrides: Partial<BriefingItem> & { id: string; kind: BriefingItem["kind"]; ticker: string }): BriefingItem {
  return {
    instrument_id: null,
    name: `${overrides.ticker} Inc.`,
    relation: "holding",
    severity: "medium",
    needs_you: false,
    tone: "flat",
    headline: "",
    metric: null,
    why: "",
    reason_status: "not_applicable",
    next_step: "",
    spoken: "",
    evidence: [],
    as_of: null,
    deadline_days: null,
    price: 100,
    day_change_pct: 1,
    alert: null,
    href: `/stock/${overrides.ticker}`,
    ...overrides,
  };
}

function result(overrides: Partial<ResultRead> & { ticker: string; reportDate: string }): ResultRead {
  return {
    company: overrides.ticker,
    session: "amc",
    period: null,
    eps: { actual: 1.2, expected: 1, verdict: "beat", surprisePct: 20, source: "Nasdaq", asOf: null },
    revenue: null,
    guidance: null,
    move: { pct: 6.4, kind: "day", day: TODAY, nextDay: true, usualPct: null, usualCount: 0, source: "closes", asOf: null },
    call: null,
    reportHref: null,
    sources: [],
    ...overrides,
  };
}

describe("ownLevel: a call speaks only for its own level", () => {
  it("uses the buy-more price on Buy more, the sell-some price on Sell some, and none on Keep", () => {
    expect(ownLevel(position({ ticker: "A", stance: "accumulate", price: 97, add_below: 100, trim_above: 90 }))).toMatchObject({ side: "buy_below", level: 100, crossed: true });
    expect(ownLevel(position({ ticker: "B", stance: "trim", price: 97, add_below: 100, trim_above: 95 }))).toMatchObject({ side: "sell_above", level: 95, crossed: true });
    expect(ownLevel(position({ ticker: "C", stance: "hold", price: 97, add_below: 100, trim_above: 95 }))).toBeNull();
  });

  it("falls back to a breakout above on Buy more, and keeps Sell some for holders", () => {
    expect(ownLevel(position({ ticker: "A", stance: "accumulate", price: 103, breakout_above: 100 }))).toMatchObject({ side: "buy_above", crossed: true });
    expect(ownLevel(position({ ticker: "B", stance: "trim", relation: "watching", price: 97, trim_above: 95 }))).toBeNull();
  });

  it("says one percent and never two dollar prices, even when they round alike", () => {
    // The ORCL bug: $128.43 "under" a $128.43 level.
    const orcl = ownLevel(position({ ticker: "ORCL", stance: "accumulate", price: 128.429, add_below: 128.431 }))!;
    expect(levelLine(orcl)).toBe("At the buy-more price");
    expect(levelLine(ownLevel(position({ ticker: "A", stance: "accumulate", price: 97.9, add_below: 100 }))!)).toBe("2.1% under the buy-more price");
    expect(levelLine(ownLevel(position({ ticker: "B", stance: "accumulate", price: 103, add_below: 100 }))!)).toBe("3.0% over the buy-more price");
    expect(levelLine(ownLevel(position({ ticker: "C", stance: "trim", price: 97, trim_above: 100 }))!)).toBe("3.0% under the sell-some price");
    expect(levelLine(ownLevel(position({ ticker: "D", stance: "trim", price: 97, trim_above: 100 }))!)).not.toMatch(/\$/);
  });

  it("never says the day's move twice when the level is the last close (owner rule 1, Nov 13)", () => {
    // AVGO: Buy more set at Wednesday's $364.38 close, $357.35 now, −1.9% on the day: "1.9% under" said −1.9% again
    const avgo = ownLevel(position({ ticker: "AVGO", stance: "accumulate", price: 357.35, add_below: 364.38 }))!;
    const pct = (357.35 / 364.38 - 1) * 100;
    expect(levelSetAtClose(avgo, pct)).toBe(true);
    expect(levelLine(avgo, pct)).toBe("Under the buy-more price set at the last close");
    expect(repeatsFigure(levelLine(avgo, pct), shownFigures(`${pct.toFixed(1)}%`))).toBe(false);
    // a level of its own, a different distance from the day's move, keeps its percent
    expect(levelSetAtClose(avgo, -0.5)).toBe(false);
    expect(levelLine(avgo, -0.5)).toBe("1.9% under the buy-more price");
    expect(levelLine(avgo, null)).toBe("1.9% under the buy-more price");
    // a level a few cents off the close prints a different distance (1.6% against −1.5%) and keeps it
    const cgnx = ownLevel(position({ ticker: "CGNX", stance: "accumulate", price: 49.99, add_below: 50.79 }))!;
    expect(levelLine(cgnx, -1.5)).toBe("1.6% under the buy-more price");
  });
});

describe("doToday", () => {
  const positions = [
    position({ ticker: "ORCL", stance: "accumulate", price: 97, add_below: 100 }),
    position({ ticker: "CBRS", day_change_pct: 8, earnings_time: "amc" }),
    position({ ticker: "MSFT", stance: "hold", add_below: 110 }),
    position({ ticker: "NVDA", day_change_pct: -2 }),
    position({ ticker: "AMD", day_change_pct: 4 }),
  ];

  it("orders call, level, alert, earnings; one card per stock; at most three", () => {
    const items = [
      item({ id: "e", kind: "earnings_upcoming", ticker: "CBRS", deadline_days: 0 }),
      item({ id: "z", kind: "zone_entered", ticker: "ORCL", needs_you: true }),
      item({ id: "c", kind: "call_changed", ticker: "NVDA", metric: "Trim" }),
      item({ id: "c2", kind: "earnings_upcoming", ticker: "NVDA", deadline_days: 1 }),
      item({ id: "a", kind: "alert_triggered", ticker: "AMD", headline: "Your alert on AMD triggered: above $150" }),
    ];
    const out = doToday({ items, positions, degraded: [] });
    expect(out.kind).toBe("cards");
    if (out.kind !== "cards") return;
    expect(out.cards.map((card) => [card.ticker, card.reason, card.line])).toEqual([
      ["NVDA", "call", "Our call moved to Sell some"],
      ["ORCL", "level", "3.0% under the buy-more price"],
      ["AMD", "alert", "Your alert fired: above $150"],
    ]);
  });

  it("says when a holding reports, and skips a zone its own call does not name", () => {
    const items = [
      item({ id: "e", kind: "earnings_upcoming", ticker: "CBRS", deadline_days: 0 }),
      item({ id: "z", kind: "zone_entered", ticker: "MSFT", needs_you: true }),
    ];
    const out = doToday({ items, positions, degraded: [] });
    expect(out).toEqual({ kind: "cards", cards: [expect.objectContaining({ ticker: "CBRS", line: "Reports today after the close" })] });
  });

  it("shows no figure before the open for a stock with no premarket quote", () => {
    const out = doToday({ items: [item({ id: "e", kind: "earnings_upcoming", ticker: "CBRS", deadline_days: 1 })], positions, degraded: [], premarket: { NVDA: 1 } });
    expect(out.kind === "cards" && out.cards[0]!.pct).toBeNull();
  });

  it("uses the premarket move before the open", () => {
    const out = doToday({ items: [item({ id: "e", kind: "earnings_upcoming", ticker: "CBRS", deadline_days: 1 })], positions, degraded: [], premarket: { CBRS: -3.2 } });
    expect(out.kind === "cards" && out.cards[0]!.pct).toBe(-3.2);
  });

  it("is quiet only when its sources loaded, and unavailable otherwise", () => {
    expect(doToday({ items: [], positions, degraded: ["news"] })).toEqual({ kind: "quiet" });
    expect(doToday({ items: [], positions, degraded: ["prices"] })).toEqual({ kind: "unavailable" });
  });
});

describe("the strip", () => {
  const indices = [
    { name: "S&P 500", price: 7600, change_pct: -1.31 },
    { name: "Nasdaq 100", price: 25000, change_pct: -1.8 },
  ];

  it("puts you against the S&P 500 in points, flat only at the same shown figure", () => {
    expect(gapWords(gapOf(2.7, -1.31)!)).toBe("Ahead 4.0 pts");
    expect(gapWords(gapOf(-2.5, -1.31)!)).toBe("Behind 1.2 pts");
    expect(gapWords(gapOf(0.5, 0.5)!)).toBe("Flat");
    expect(gapOf(null, 1)).toBeNull();
  });

  // Judge 89: "Even with the S&P 500" sat beside −0.4% against −0.3%.
  it("calls it flat only when the two shown figures match, and names the smallest gap", () => {
    expect(gapOf(-0.4, -0.3)).toEqual({ word: "Behind", pts: 0.1 });
    expect(gapOf(0.5, 0.4)).toEqual({ word: "Ahead", pts: 0.1 });
    // Raw moves 0.08 apart that print as −0.4% and −0.3% still differ by the shown 0.1.
    expect(gapOf(-0.36, -0.34)).toEqual({ word: "Behind", pts: 0.1 });
    // Raw moves 0.08 apart that print the same are even.
    expect(gapOf(-0.31, -0.34)).toEqual({ word: "Flat", pts: 0 });
    // A move that prints as 0.0% is zero, never −0.0.
    expect(gapOf(-0.04, 0.04)).toEqual({ word: "Flat", pts: 0 });
    expect(gapOf(-0.04, 0.1)).toEqual({ word: "Behind", pts: 0.1 });
    // Across zero, the gap is the distance between the two shown figures.
    expect(gapOf(0.2, -0.2)).toEqual({ word: "Ahead", pts: 0.4 });
  });

  it("weights by money when every holding has a value, else averages and says so", () => {
    const valued = [position({ ticker: "A", quantity: 10, day_change_pct: 2 }), position({ ticker: "B", quantity: 10, day_change_pct: 4 })];
    const strip = marketStrip({
      briefing: { market: { indices, gainers: [], losers: [], as_of: null }, portfolio: { value: 2000, day_change_value: 60, day_change_pct: 3, counted: 2, holdings: 2, as_of: null } },
      positions: valued,
      mode: "close",
      premarket: null,
      extras: [],
    });
    expect(strip.you).toEqual({ pct: 3, label: "You" });
    expect(strip.sp500).toEqual({ pct: -1.31, source: "index" });
    // From the figures as shown: +3.0% against −1.3%.
    expect(strip.gap).toEqual({ word: "Ahead", pts: 4.3 });

    const unvalued = marketStrip({ briefing: { market: { indices, gainers: [], losers: [], as_of: null }, portfolio: null }, positions: [position({ ticker: "A", day_change_pct: 2 }), position({ ticker: "B", day_change_pct: 1 }), position({ ticker: "W", relation: "watching", day_change_pct: 9 })], mode: "close", premarket: null, extras: [] });
    expect(unvalued.you).toEqual({ pct: 1.5, label: "Your stocks" });
  });

  it("before the open, reads the premarket quotes and SPY, and leaves the stale tiles out", () => {
    const strip = marketStrip({
      briefing: { market: { indices, gainers: [], losers: [], as_of: null }, portfolio: null },
      positions: [position({ ticker: "A", day_change_pct: 2 }), position({ ticker: "B", day_change_pct: 1 })],
      mode: "premarket",
      premarket: { stocks: { A: 1, B: 3 }, sp500: { pct: 0.4, source: "SPY" } },
      extras: [{ id: "vix", price: 18, change: 5, changeMode: "pct" }],
    });
    expect(strip.you?.pct).toBeCloseTo(2);
    expect(strip.sp500).toEqual({ pct: 0.4, source: "SPY" });
    expect(strip.tiles).toEqual([]);
  });

  it("shows the day's change of the 10-year and the VIX, one decimal, coloured by what it means for stocks", () => {
    const tiles = marketTiles(indices, [
      { id: "us10y", price: 4.31, change: 6, changeMode: "bps" },
      { id: "vix", price: 27.2, change: -8, changeMode: "pct" },
    ]);
    // The colour is what the day's move means for stocks: yields up is bad, the VIX down is good.
    expect(tiles.map((tile) => [tile.key, tile.figure, tile.label, tile.good])).toEqual([
      ["ndx", "−1.8%", "Nasdaq 100", "down"],
      ["us10y", "+6.0 bps", "10-yr 4.3%", "down"],
      ["vix", "−8.0%", "VIX 27.2", "up"],
    ]);
    // The live bug: +10 bps and a VIX up 4.5% read green. A rise in either is never good for stocks.
    expect(marketTiles([], [{ id: "us10y", price: 4.98, change: 10, changeMode: "bps" }, { id: "vix", price: 13, change: 4.5, changeMode: "pct" }]).map((tile) => tile.good)).toEqual(["down", "down"]);
    expect(marketTiles([], [{ id: "us10y", price: 4.3, change: -5, changeMode: "bps" }, { id: "vix", price: 30, change: -3, changeMode: "pct" }]).map((tile) => tile.good)).toEqual(["up", "up"]);
    // A small move has no verdict: plain, not coloured by its sign.
    expect(marketTiles([], [{ id: "us10y", price: 4.3, change: 1, changeMode: "bps" }, { id: "vix", price: 17, change: 0.6, changeMode: "pct" }]).map((tile) => tile.good)).toEqual(["flat", "flat"]);
    // No change for the day: no bare level.
    expect(marketTiles([], [{ id: "vix", price: 17.2, change: null, changeMode: "pct" }])).toEqual([]);
  });

  it("gives a tile its line only from a real series, never a made-up one", () => {
    const month = [17, 17.4, 18.1, 17.8, 18.6, 19];
    const [vix] = marketTiles([], [{ id: "vix", price: 19, change: 4, changeMode: "pct", spark: month }]);
    expect(vix?.spark).toEqual(month);
    expect(marketTiles([], [{ id: "vix", price: 19, change: 4, changeMode: "pct", spark: [18, 19] }])[0]?.spark).toBeNull();
    expect(marketTiles([], [{ id: "vix", price: 19, change: 4, changeMode: "pct" }])[0]?.spark).toBeNull();
  });

  it("before the open, never puts yesterday's S&P 500 beside this morning's quotes", () => {
    const strip = marketStrip({
      briefing: { market: { indices, gainers: [], losers: [], as_of: null }, portfolio: null },
      positions: [position({ ticker: "A" })],
      mode: "premarket",
      premarket: { stocks: { A: 1 }, sp500: null },
      extras: [],
    });
    expect(strip.sp500).toBeNull();
    expect(strip.gap).toBeNull();
  });

  describe("you against the S&P 500 over the last sessions", () => {
    // Five closes before today (Thu Nov 12): Thu 5, Fri 6, Mon 9, Tue 10, Wed 11.
    const days = ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
    const closes = (values: number[]) => days.map((date, index) => ({ date, close: values[index]! }));
    const series = {
      SPY: closes([100, 101, 102, 101, 102]),
      A: closes([50, 51, 52, 53, 54]),
      B: closes([20, 20, 19, 19, 18]),
    };
    const holdings = [position({ ticker: "A", quantity: 10, price: 54, day_change_pct: 2 }), position({ ticker: "B", quantity: 25, price: 18, day_change_pct: -1 })];

    it("holds today's shares through the days and ends on today's move", () => {
      const path = youVsMarketPath({ holdings, series, today: TODAY, todayPct: (p) => p.day_change_pct, marketToday: -0.5 })!;
      expect(path.map((point) => point.day)).toEqual([...days, TODAY]);
      // 10 A + 25 B: 1000 at the first close, 990 at the last, then A +2% and B −1% today.
      expect(path[0]).toEqual({ day: days[0], you: 0, market: 0 });
      expect(path[4]).toEqual({ day: days[4], you: -1, market: 2 });
      expect(path[5]?.you).toBeCloseTo(((540 * 1.02 + 450 * 0.99) / 1000 - 1) * 100, 1);
      expect(path[5]?.market).toBeCloseTo(1.49, 2);
    });

    it("draws nothing when the closes are stale or missing for too much of the money", () => {
      const stale = { ...series, SPY: series.SPY.slice(0, 4) };
      expect(youVsMarketPath({ holdings, series: stale, today: TODAY, todayPct: (p) => p.day_change_pct, marketToday: 0 })).toBeNull();
      const noA = { SPY: series.SPY, B: series.B };
      expect(youVsMarketPath({ holdings, series: noA, today: TODAY, todayPct: (p) => p.day_change_pct, marketToday: 0 })).toBeNull();
      expect(youVsMarketPath({ holdings, series, today: TODAY, todayPct: (p) => p.day_change_pct, marketToday: null })).toBeNull();
    });

    it("rides on the strip, which draws it only when it has the closes", () => {
      const briefing = { market: { indices, gainers: [], losers: [], as_of: null }, portfolio: { value: 990, day_change_value: 0, day_change_pct: 0.66, counted: 2, holdings: 2, as_of: null } };
      expect(marketStrip({ briefing, positions: holdings, mode: "close", premarket: null, extras: [] }).path).toBeNull();
      const strip = marketStrip({ briefing, positions: holdings, mode: "close", premarket: null, extras: [], series, today: TODAY });
      expect(strip.path).toHaveLength(6);
      expect(strip.path?.[5]?.market).toBeCloseTo(((102 * (1 - 0.0131)) / 100 - 1) * 100, 1);
    });
  });

  it("names one clock", () => {
    expect(faceMode("premarket", true)).toBe("premarket");
    expect(faceMode("premarket", false)).toBe("close");
    expect(faceMode("open", false)).toBe("session");
    expect(clockWords("premarket", "2026-11-11", null)).toBe("Before the open");
    expect(clockWords("close", "2026-11-11", null)).toBe("Wed close");
    expect(clockWords("session", TODAY, "11:42 AM ET")).toBe("As of 11:42 AM ET");
  });
});

describe("heatCells", () => {
  it("holdings only, biggest gain first, wide cells for the big moves", () => {
    const cells = heatCells([
      position({ ticker: "BIG", quantity: 100, price: 100, day_change_pct: 1 }),
      position({ ticker: "MID", quantity: 10, price: 100, day_change_pct: -2 }),
      position({ ticker: "SML", quantity: 5, price: 100, day_change_pct: 0 }),
      position({ ticker: "W", relation: "watching", day_change_pct: 5 }),
      position({ ticker: "NOP", quantity: 1, day_change_pct: null }),
    ]);
    expect(cells.map((cell) => [cell.ticker, cell.size, cell.tone])).toEqual([
      ["BIG", 1, "up"],
      ["SML", 1, "flat"],
      ["MID", 2, "down"],
    ]);
  });

  it("uses equal cells when a size is missing, and the premarket % before the open", () => {
    const cells = heatCells([position({ ticker: "A", quantity: 100 }), position({ ticker: "B" })], { B: -4 });
    expect(cells.every((cell) => cell.size === 1)).toBe(true);
    expect(cells.find((cell) => cell.ticker === "B")?.pct).toBe(-4);
    // Before the open, a holding with no premarket quote is left out, not shown at yesterday's move.
    expect(cells.map((cell) => cell.ticker)).toEqual(["B"]);
  });

  it("carries each holding's price, this morning's before the open", () => {
    expect(heatCells([position({ ticker: "A", price: 173.85 })])[0]?.price).toBe(173.85);
    expect(heatCells([position({ ticker: "A", price: 173.85 })], { A: 1.2 }, { A: 175.94 })[0]?.price).toBe(175.94);
  });
});

describe("lineStatesCall", () => {
  it("drops a card's badge only when the shared line itself states that call", () => {
    // The past day: "Our call moved to Keep on ASTS, NVDA and SMR" says Keep, so the Keep badges go.
    expect(lineStatesCall("Our call moved to Keep", "Keep")).toBe(true);
    expect(lineStatesCall("Our call moved to Buy more", "Buy more")).toBe(true);
    // Two Keep stocks under "Reported results": the line names no call, so both keep their badge.
    expect(lineStatesCall("Reported results", "Keep")).toBe(false);
    // A line naming another call, or no call on the card, hides nothing.
    expect(lineStatesCall("Our call moved to Keep", "Sell some")).toBe(false);
    expect(lineStatesCall("Our call moved to Keep", null)).toBe(false);
    // A word that only contains the call is not the call.
    expect(lineStatesCall("Keeps rising", "Keep")).toBe(false);
  });
});

describe("atYourLevels", () => {
  const fact = (kind: LevelFact["kind"], weight: number, label: string = kind): LevelFact => ({ kind, figure: "+42%", label, line: null, tone: "up", weight });
  const why = [fact("sales", 2.5)];
  const vague = "The setup is still constructive; add on pullbacks rather than chasing.";
  it("only names at or through their own call's price with a measured fact; never one already in Do today", () => {
    const rows = atYourLevels(
      [
        position({ ticker: "NEAR", stance: "accumulate", price: 103, add_below: 100 }),
        position({ ticker: "IN", stance: "accumulate", price: 99, add_below: 100, relation: "watching" }),
        position({ ticker: "AT", stance: "accumulate", price: 100.3, add_below: 100 }),
        position({ ticker: "NOWHY", stance: "accumulate", price: 95, add_below: 100, call_summary: vague }),
        position({ ticker: "KEEP", stance: "hold", price: 99, add_below: 100 }),
        position({ ticker: "DONE", stance: "accumulate", price: 98, add_below: 100 }),
      ],
      new Set(["DONE"]),
      { NEAR: why, IN: why, AT: why, KEEP: why, DONE: why, NOWHY: [] },
    );
    // NOWHY has only the call's summary: it is never used in place of a measured fact. AT's only fact would say what
    // IN's card says, so AT is listed without one rather than carded with a repeat.
    expect(rows.map((row) => [row.ticker, row.fact?.kind ?? null])).toEqual([
      ["IN", "sales"],
      ["AT", null],
    ]);
  });

  it("picks one card per kind of fact first, then only labels no card has used; a repeat is listed, not carded", () => {
    const at = (ticker: string, price: number) => position({ ticker, stance: "accumulate", price, add_below: 100 });
    // Through the level, closest first: A, B, C, D. The facts are picked in that order.
    const rows = atYourLevels([at("D", 96), at("C", 97), at("B", 98), at("A", 99)], new Set(), {
      A: [fact("sales", 3), fact("eps", 2.6)],
      B: [fact("sales", 3), fact("valuation", 2.2)],
      C: [fact("sales", 2.8), fact("dividend", 2)],
      D: [fact("sales", 2)],
    });
    expect(rows.map((row) => [row.ticker, row.fact?.kind ?? null])).toEqual([
      ["A", "sales"],
      ["B", "valuation"],
      ["C", "dividend"],
      ["D", null],
    ]);
    // A second sales card is fine when it says something else ("growth sped up" against "sales growth").
    const picked = pickLevelFacts(["A", "B"], { A: [fact("sales", 3, "sales growth")], B: [fact("sales", 2.5, "growth sped up")] });
    expect([picked.get("A")?.label, picked.get("B")?.label]).toEqual(["sales growth", "growth sped up"]);
    // On its own, the strongest wins.
    expect(pickLevelFacts(["A"], { A: [fact("sales", 3), fact("eps", 2.6)] }).get("A")?.kind).toBe("sales");
  });

  it("measures from this morning's price before the open, the price the card shows", () => {
    const [row] = atYourLevels([position({ ticker: "A", stance: "accumulate", price: 110, add_below: 100 })], new Set(), { A: why }, { A: -7 }, { A: 99 });
    expect(row).toMatchObject({ ticker: "A", price: 99, line: "1.0% under the buy-more price" });
  });

  it("says the call once in the title, and fills the last row as best the columns allow", () => {
    const row = (call: "Buy more" | "Sell some") => ({ level: { call } as never });
    expect(levelsTitle([row("Buy more"), row("Buy more")])).toBe("Buy more levels");
    expect(levelsTitle([row("Buy more"), row("Sell some")])).toBe("At our buy and sell levels");
    expect(levelsTitle([row("Sell some")])).toBe("Sell some levels");
    // Seven cards: 4 + 3 rather than 3 + 3 + 1; six: two rows of three; five at 2xl: one row.
    expect(gridColumns(7, [3, 4])).toBe(4);
    expect(gridColumns(6, [3, 4])).toBe(3);
    expect(gridColumns(8, [3, 4])).toBe(4);
    expect(gridColumns(5, [4, 5])).toBe(5);
  });
});

describe("levelCandidates", () => {
  it("reads only US names at their level, a few percent wider before the open, closest first", () => {
    const positions = [
      position({ ticker: "FAR", stance: "accumulate", price: 110, add_below: 100 }),
      position({ ticker: "NEAR", stance: "accumulate", price: 102, add_below: 100 }),
      position({ ticker: "AT", stance: "accumulate", price: 100.2, add_below: 100 }),
      position({ ticker: "IN", stance: "accumulate", price: 95, add_below: 100 }),
      position({ ticker: "SELL", stance: "trim", price: 121, trim_above: 120 }),
      position({ ticker: "KEEP", stance: "hold", price: 99, add_below: 100 }),
      position({ ticker: "TCS", instrument_id: "IN_TCS", stance: "accumulate", price: 95, add_below: 100 }),
    ];
    expect(levelCandidates(positions, false)).toEqual([
      { ticker: "IN", instrumentId: "US_IN", call: "Buy more" },
      { ticker: "SELL", instrumentId: "US_SELL", call: "Sell some" },
      { ticker: "AT", instrumentId: "US_AT", call: "Buy more" },
    ]);
    expect(levelCandidates(positions, true).map((row) => row.ticker)).toEqual(["IN", "SELL", "AT", "NEAR"]);
  });
});

describe("levelFact", () => {
  // Lines as lib/call-evidence.ts writes them, so a change to its wording shows up here.
  const evidence = (overrides: Partial<CallEvidenceInput>, call: CallEvidenceInput["call"] = "Add") =>
    buildCallEvidence({
      ticker: "AMD",
      call,
      today: TODAY,
      sales: null,
      reports: [],
      calendar: [],
      nextReport: null,
      series: null,
      benchmark: null,
      valuation: null,
      dividend: null,
      steady: null,
      sayDays: true,
      ...overrides,
    }).evidence;
  const sales = (growthPct: number, lastYear: number) => ({
    revenue: 45_400_000_000,
    growthPct,
    history: [
      { period: "FY 2025", revenue: 100 * (1 + lastYear / 100) },
      { period: "FY 2024", revenue: 100 },
    ],
    capturedAt: "2026-11-08T08:00:00Z",
  });

  const shown = (fact: LevelFact | null) => (fact ? [fact.figure, fact.label, fact.line] : null);
  // A report's day keeps its non-breaking space ("Nov 4"), so it never splits across lines.
  const nb = (text: string) => text.replace(/(Nov|Oct) (\d)/g, "$1 $2");

  it("says sales as a figure, with the year's comparison as the line when it helps the call", () => {
    const [faster] = evidence({ sales: sales(16, 8.7) });
    expect(faster?.text).toMatch(/^AMD's sales rose 16% over the last four quarters, to \$45\.4B, faster than/);
    expect(shown(levelFact(faster!, "Buy more", TODAY))).toEqual(["+16%", "growth sped up", "Up 7 pts from 8.7% in fiscal 2025."]);
    const [same] = evidence({ sales: sales(46, 45) });
    expect(shown(levelFact(same!, "Buy more", TODAY))).toEqual(["+46%", "steady sales growth", "About the same as its 45% in fiscal 2025."]);
    // "Slower than" never sits under a Buy more: the line says the period instead.
    const [slower] = evidence({ sales: sales(25, 88) });
    expect(shown(levelFact(slower!, "Buy more", TODAY))).toEqual(["+25%", "sales growth", "Over the past four quarters."]);
    // Rising sales are no reason to sell some; falling sales are.
    expect(levelFact(faster!, "Sell some", TODAY)).toBeNull();
    const [fell] = evidence({ sales: sales(-6, 3) }, "Trim");
    expect(shown(levelFact(fell!, "Sell some", TODAY))).toEqual(["−6%", "sales turned down", "Down from 3% growth in fiscal 2025."]);
    expect(levelFact(fell!, "Buy more", TODAY)).toBeNull();
    // Growth more than twice last year's says so.
    const [doubled] = evidence({ sales: sales(49, 19) });
    expect(shown(levelFact(doubled!, "Buy more", TODAY))).toEqual(["+49%", "growth more than doubled", "Up 30 pts from 19% in fiscal 2025."]);
    // Faster growth weighs more than the same growth said plainly.
    const plain = levelFact({ id: "sales", text: "AMD's sales rose 16% over the last four quarters, to $45.4B." }, "Buy more", TODAY);
    expect(levelFact(faster!, "Buy more", TODAY)!.weight).toBeGreaterThan(plain!.weight);
  });

  it("says a report's beat or miss with the day in words, fresher reports weighing more", () => {
    const calendar = [{ event_date: "2026-11-04", reported_eps: 0.53, estimated_eps: 0.51 }];
    const [beat] = evidence({ calendar });
    expect(beat?.text).toBe(nb("In its Nov 4 report, AMD's earnings per share of $0.53 beat the $0.51 analysts expected."));
    expect(shown(levelFact(beat!, "Buy more", TODAY))).toEqual(["$0.53", "beat the forecast", nb("$0.51 expected, reported on Nov 4.")]);
    expect(levelFact(beat!, "Sell some", TODAY)).toBeNull();
    const [recent] = evidence({ calendar: [{ event_date: "2026-11-10", reported_eps: 0.53, estimated_eps: 0.51 }] });
    expect(levelFact(recent!, "Buy more", TODAY)?.line).toBe("$0.51 expected, reported on Tuesday.");
    const [loss] = evidence({ calendar: [{ event_date: "2026-11-04", reported_eps: -0.12, estimated_eps: -0.2 }] });
    expect(shown(levelFact(loss!, "Buy more", TODAY))).toEqual(["−$0.12", "smaller loss than forecast", nb("A $0.20 loss expected, reported on Nov 4.")]);
    const old = levelFact({ id: "eps", text: "In its Jul 20 report, AMD's earnings per share of $0.53 beat the $0.51 analysts expected." }, "Buy more", TODAY);
    expect(levelFact(recent!, "Buy more", TODAY)!.weight).toBeGreaterThan(old!.weight);
  });

  it("says the price, the dividend and the P/E, each only for the call it backs; a fall from the high never counts", () => {
    expect(shown(levelFact({ id: "move", text: "OUST rose 32% in the five trading days to Tuesday's close, while the S&P 500 fell 0.6%." }, "Buy more", TODAY))).toEqual([
      "+32%",
      "five trading days",
      "The S&P 500 fell 0.6% over the same days.",
    ]);
    const fell = { id: "move", text: "LLY fell 12% in the month to yesterday's close, while the S&P 500 rose 2.3%." };
    expect(shown(levelFact(fell, "Sell some", TODAY))).toEqual(["−12%", "past month", "The S&P 500 rose 2.3% over the same month."]);
    expect(levelFact(fell, "Buy more", TODAY)).toBeNull();
    const high = { id: "high", text: "XPEV closed at $10.22 on Monday, 64% below its high of $28.07 on Nov 11, 2025." };
    expect(levelFact(high, "Buy more", TODAY)).toBeNull();
    const [dividend] = evidence({ dividend: { annual: 2.4, price: 100, growthYears: 12, capturedAt: "2026-11-08T00:00:00Z" } });
    expect(shown(levelFact(dividend!, "Buy more", TODAY))).toEqual(["2.4%", "dividend yield", "Raised 12 years in a row."]);
    const valuation = (pe: number) => evidence({ valuation: { pe, medianPe: 30, from: "2025-11-12", to: "2026-11-11", days: 250 } }, "Hold");
    const [cheap] = valuation(22);
    expect(levelFact(cheap!, "Buy more", TODAY)?.figure).toBe("22×");
    expect(levelFact(cheap!, "Buy more", TODAY)?.label).toBe("P/E under its usual");
    expect(levelFact(cheap!, "Buy more", TODAY)?.line).toMatch(/^Its median P\/E is 30 since Nov.12, 2025\.$/);
    expect(levelFact(valuation(40)[0]!, "Sell some", TODAY)?.label).toBe("P/E over its usual");
    expect(levelFact(valuation(40)[0]!, "Buy more", TODAY)).toBeNull();
  });

  it("never passes on a line it does not recognise, and keeps every line in the word budget", () => {
    expect(levelFact({ id: "sales", text: "The setup is constructive, but the cleaner entry is a pullback." }, "Buy more", TODAY)).toBeNull();
    expect(levelFact({ id: "other", text: "Sales rose 42%." }, "Buy more", TODAY)).toBeNull();
    const fact = levelFact({ id: "eps", text: nb("In its Oct 21 report, BRK.B's earnings per share of $7.40 beat the $6.52 analysts expected.") }, "Buy more", TODAY);
    expect(fact?.line).toBe(nb("$6.52 expected, reported on Oct 21."));
    expect(fact!.line!.split(/\s+/).length).toBeLessThanOrEqual(LINE_WORDS);
  });
});

describe("whyItMoved", () => {
  const positions = [
    position({ ticker: "MRVL", day_change_pct: 9.3, quantity: 10 }),
    position({ ticker: "AVGO", day_change_pct: 2.3, quantity: 10 }),
    position({ ticker: "MSFT", day_change_pct: -2.2, quantity: 10 }),
    position({ ticker: "NVDA", name: "Nvidia", day_change_pct: 3, quantity: 50 }),
  ];

  it("keeps only confirmed reasons, ranked by move times money", () => {
    const cards = whyItMoved({
      items: [
        item({ id: "1", kind: "price_move", ticker: "MRVL", name: "Marvell Technology", reason_status: "confirmed", why: "Marvell rose after it raised its forecast for data center sales. More text follows here.", evidence: [{ label: "Story", source: "Reuters", url: "https://r.com/a", at: null }] }),
        item({ id: "2", kind: "price_move", ticker: "AVGO", reason_status: "unconfirmed", why: "We have not found a confirmed reason for the move." }),
        item({ id: "3", kind: "news", ticker: "MSFT", headline: "News on MSFT: FPT becomes the world's first Microsoft partner", why: "A long enough summary for the story so it is not junk at all." }),
        item({ id: "4", kind: "news", ticker: "NVDA", name: "Nvidia", headline: "News on NVDA: Nvidia raises its revenue forecast", why: "Nvidia raised its revenue forecast for the quarter, the company said today." }),
      ],
      positions,
      results: [],
      exclude: new Set(),
      today: TODAY,
    });
    expect(cards.map((card) => [card.ticker, card.kind])).toEqual([
      ["NVDA", "news"],
      ["MRVL", "move"],
    ]);
    expect(cards[1]!.line).toBe("Marvell rose after it raised its forecast for data center sales.");
    expect(cards[1]!.source?.name).toBe("Reuters");
  });

  it("never writes a line over the word budget, and leaves out stocks shown above", () => {
    const long = "Marvell rose after a very long explanation that keeps going and going with many many words in it today.";
    const cards = whyItMoved({
      items: [
        item({ id: "1", kind: "price_move", ticker: "MRVL", reason_status: "confirmed", why: long }),
        item({ id: "2", kind: "price_move", ticker: "MSFT", reason_status: "confirmed", why: "Microsoft fell after a downgrade." }),
      ],
      positions,
      results: [],
      exclude: new Set(["MSFT"]),
      today: TODAY,
    });
    expect(cards).toEqual([]);
    expect(fittingLine([long, "Short one."])).toBe("Short one.");
  });

  it("explains nothing on a stock the plan does not cover", () => {
    const cards = whyItMoved({
      items: [item({ id: "1", kind: "price_move", ticker: "MSFT", reason_status: "confirmed", why: "Microsoft fell after a downgrade." })],
      positions: [position({ ticker: "MSFT", day_change_pct: -2.2, covered: false })],
      results: [],
      exclude: new Set(),
      today: TODAY,
    });
    expect(cards).toEqual([]);
  });

  it("uses this week's results read when there is one", () => {
    const cards = whyItMoved({
      items: [],
      positions,
      results: [result({ ticker: "MRVL", reportDate: "2026-11-11" })],
      exclude: new Set(),
      today: TODAY,
      resultFact: () => "Beat by 20%, up 9.3% today",
    });
    expect(cards).toEqual([expect.objectContaining({ ticker: "MRVL", kind: "results", line: "Beat by 20%, up 9.3% today." })]);
  });
});

describe("earningsWeek", () => {
  it("groups reports by day from the last trading day on, holdings first, with the result once out", () => {
    const days = earningsWeek({
      today: TODAY,
      positions: [
        position({ ticker: "NVDA", earnings_date: "2026-11-17", earnings_time: "amc" }),
        position({ ticker: "XPEV", relation: "watching", earnings_date: "2026-11-17", earnings_time: "bmo" }),
        position({ ticker: "CBRS", earnings_date: TODAY, earnings_time: "amc" }),
        position({ ticker: "LATE", earnings_date: "2026-11-25" }),
        position({ ticker: "ASTS" }),
      ],
      items: [item({ id: `${TODAY}_earnings_reported_ASTS_2026-11-11`, kind: "earnings_reported", ticker: "ASTS" })],
      results: [result({ ticker: "ASTS", reportDate: "2026-11-11", move: { pct: 8.7, kind: "day", day: TODAY, nextDay: true, usualPct: null, usualCount: 0, source: "", asOf: null } })],
    });
    expect(days.map((day) => [day.label, day.stocks.map((stock) => stock.ticker)])).toEqual([
      ["Yesterday", ["ASTS"]],
      ["Today", ["CBRS"]],
      // A day in next week says so, so a Thursday's list never reads as if Tuesday came first.
      ["Tuesday, next week", ["NVDA", "XPEV"]],
    ]);
    expect(days[0]!.stocks[0]!.result).toEqual({ verdict: "Beat", pct: 8.7 });
    // Every stock carries its price and today's move.
    expect(days[1]!.stocks[0]).toMatchObject({ ticker: "CBRS", price: 100, pct: 1 });
    expect(days[2]!.stocks[1]!.when).toBe("before the open");
  });

  it("says days in words: the date tabs and the week alike", () => {
    expect(["2026-11-11", "2026-11-10", "2026-11-09", "2026-11-13", "2026-11-16", "2026-11-03"].map((day) => dayLabel(day, TODAY))).toEqual([
      "Yesterday",
      "Tuesday",
      "Monday",
      "Tomorrow",
      "Monday, next week",
      "Nov 3",
    ]);
  });

  it("calls a before-the-open report out only once the session has opened, or once its result is in", () => {
    const stock = (when: "before the open" | "after the close", withResult = false) => ({
      ticker: "NBIS",
      name: "Nebius",
      held: true,
      when,
      price: 128,
      pct: -17,
      result: withResult ? { verdict: "Miss" as const, pct: -17 } : null,
      href: "/stock/NBIS",
    });
    const week = (when: "before the open" | "after the close", withResult = false) => [{ day: TODAY, label: "Today", stocks: [stock(when, withResult)] }];
    // Thursday Nov 12 is standard time: 9:30 ET is 14:30 UTC.
    const before = sessionOpened(TODAY, Date.parse("2026-11-12T14:29:00Z"));
    const after = sessionOpened(TODAY, Date.parse("2026-11-12T14:30:00Z"));
    expect([before, after]).toEqual([false, true]);
    expect(weekTitle(week("before the open"), TODAY, before)).toBe("Reports coming up");
    expect(weekTitle(week("before the open"), TODAY, after)).toBe("Recent and upcoming reports");
    // A result in hand counts as out at any hour; an after-the-close report is still ahead after the open.
    expect(weekTitle(week("before the open", true), TODAY, before)).toBe("Recent and upcoming reports");
    expect(weekTitle(week("after the close"), TODAY, after)).toBe("Reports coming up");
    // A past day is out.
    expect(weekTitle([{ day: "2026-11-11", label: "Yesterday", stocks: [stock("after the close")] }], TODAY, before)).toBe("Recent and upcoming reports");
  });

  it("is empty when nothing reports", () => {
    expect(earningsWeek({ today: TODAY, positions: [position({ ticker: "A" })], items: [], results: [] })).toEqual([]);
  });
});

describe("stockItems", () => {
  it("leaves standing-job items out of the stock modules", () => {
    const items = stockItems({
      needs_you: [item({ id: "j", kind: "agent_job", ticker: "MU" }), item({ id: "c", kind: "call_changed", ticker: "AMD" })],
      also_today: [],
    });
    expect(items.map((entry) => entry.id)).toEqual(["c"]);
  });
});

describe("citesOtherMove", () => {
  it("drops a reason whose own move figure is another session's", async () => {
    const { citesOtherMove } = await import("@/lib/briefing-face");
    expect(citesOtherMove("RKLB rallied 10.83% after results.", 5.5)).toBe(true);
    expect(citesOtherMove("RKLB rallied 5.4% after results.", 5.5)).toBe(false);
    expect(citesOtherMove("Dell surges as AI spending revives demand.", 11.8)).toBe(false);
  });
});
