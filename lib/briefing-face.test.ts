import { describe, expect, it } from "vitest";

import type { BriefingItem, BriefingPosition } from "@/lib/briefing";
import {
  atYourLevels,
  clockWords,
  doToday,
  earningsWeek,
  faceMode,
  fittingLine,
  gapOf,
  gapWords,
  heatCells,
  levelLine,
  marketStrip,
  marketTiles,
  ownLevel,
  sinceLastOpened,
  sinceStart,
  stockItems,
  whyItMoved,
} from "@/lib/briefing-face";
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

  it("puts you against the S&P 500 in points, with a flat band", () => {
    expect(gapWords(gapOf(2.7, -1.31)!)).toBe("Ahead 4.0 pts");
    expect(gapWords(gapOf(-2.5, -1.31)!)).toBe("Behind 1.2 pts");
    expect(gapWords(gapOf(0.5, 0.4)!)).toBe("Flat");
    expect(gapOf(null, 1)).toBeNull();
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
      { id: "us10y", price: 4.31, change: 6, changeMode: "bps", monthChange: 20 },
      { id: "vix", price: 27.2, change: -8, changeMode: "pct" },
    ]);
    // Yields up 0.2 points on the month and a VIX over 25 are bad for stocks, even on a day the VIX fell.
    expect(tiles.map((tile) => [tile.key, tile.figure, tile.label, tile.good])).toEqual([
      ["ndx", "−1.8%", "Nasdaq 100", "down"],
      ["us10y", "+6.0 bps", "10-yr 4.3%", "down"],
      ["vix", "−8.0%", "VIX 27.2", "down"],
    ]);
    expect(marketTiles([], [{ id: "us10y", price: 4.3, change: -2, changeMode: "bps", monthChange: -15 }, { id: "vix", price: 13, change: 4, changeMode: "pct" }]).map((tile) => tile.good)).toEqual(["up", "up"]);
    // No change for the day: no bare level.
    expect(marketTiles([], [{ id: "vix", price: 17.2, change: null, changeMode: "pct" }])).toEqual([]);
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
  it("holdings only, biggest money first, wide cells for the big ones", () => {
    const cells = heatCells([
      position({ ticker: "BIG", quantity: 100, price: 100, day_change_pct: 1 }),
      position({ ticker: "MID", quantity: 10, price: 100, day_change_pct: -2 }),
      position({ ticker: "SML", quantity: 5, price: 100, day_change_pct: 0 }),
      position({ ticker: "W", relation: "watching", day_change_pct: 5 }),
      position({ ticker: "NOP", quantity: 1, day_change_pct: null }),
    ]);
    expect(cells.map((cell) => [cell.ticker, cell.size, cell.tone])).toEqual([
      ["BIG", 2, "up"],
      ["MID", 1, "down"],
      ["SML", 1, "flat"],
    ]);
  });

  it("uses equal cells when a size is missing, and the premarket % before the open", () => {
    const cells = heatCells([position({ ticker: "A", quantity: 100 }), position({ ticker: "B" })], { B: -4 });
    expect(cells.every((cell) => cell.size === 1)).toBe(true);
    expect(cells.find((cell) => cell.ticker === "B")?.pct).toBe(-4);
    // Before the open, a holding with no premarket quote is left out, not shown at yesterday's move.
    expect(cells.map((cell) => cell.ticker)).toEqual(["B"]);
  });
});

describe("atYourLevels", () => {
  it("names within 5% of their own call's level, crossed first, and never one already in Do today", () => {
    const rows = atYourLevels(
      [
        position({ ticker: "NEAR", stance: "accumulate", price: 103, add_below: 100 }),
        position({ ticker: "IN", stance: "accumulate", price: 99, add_below: 100, relation: "watching" }),
        position({ ticker: "FAR", stance: "accumulate", price: 120, add_below: 100 }),
        position({ ticker: "KEEP", stance: "hold", price: 101, add_below: 100 }),
        position({ ticker: "DONE", stance: "accumulate", price: 98, add_below: 100 }),
      ],
      new Set(["DONE"]),
    );
    expect(rows.map((row) => [row.ticker, row.line])).toEqual([
      ["IN", "1.0% under the buy-more price"],
      ["NEAR", "3.0% over the buy-more price"],
    ]);
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
      ["Tue 17", ["NVDA", "XPEV"]],
    ]);
    expect(days[0]!.stocks[0]!.result).toEqual({ verdict: "Beat", pct: 8.7 });
    expect(days[2]!.stocks[1]!.when).toBe("before the open");
  });

  it("is empty when nothing reports", () => {
    expect(earningsWeek({ today: TODAY, positions: [position({ ticker: "A" })], items: [], results: [] })).toEqual([]);
  });
});

describe("sinceLastOpened", () => {
  const positions = [position({ ticker: "AMD", stance: "accumulate" }), position({ ticker: "TSM" })];
  const changes = [
    { ticker: "AMD", instrument_id: "US_AMD", prev_stance: "hold", new_stance: "accumulate", at: "2026-11-11T22:00:00Z", text: null },
    { ticker: "TSM", instrument_id: "US_TSM", prev_stance: "accumulate", new_stance: "hold", at: "2026-11-09T22:00:00Z", text: null },
  ];

  it("counts what is new since the last visit, and shows at most three cards", () => {
    const since = sinceLastOpened({ since: "2026-11-10T12:00:00Z", callChanges: changes, results: [], positions, exclude: new Set() });
    expect(since).toEqual({ count: 1, cards: [expect.objectContaining({ ticker: "AMD", line: "Call moved from Keep to Buy more" })] });
  });

  it("is hidden on a first visit or when nothing is new, and still counts a stock shown above", () => {
    expect(sinceLastOpened({ since: null, callChanges: changes, results: [], positions, exclude: new Set() })).toBeNull();
    expect(sinceLastOpened({ since: "2026-11-12T00:00:00Z", callChanges: changes, results: [], positions, exclude: new Set() })).toBeNull();
    expect(sinceLastOpened({ since: "2026-11-10T12:00:00Z", callChanges: changes, results: [], positions, exclude: new Set(["AMD"]) })).toBeNull();
  });

  it("dates a report by its New York time: after the close is new to a visit that afternoon", () => {
    const read = result({ ticker: "TSM", reportDate: "2026-11-11", session: "amc" });
    // Visited at 2 PM ET on the report day: the 4 PM report is new.
    expect(sinceLastOpened({ since: "2026-11-11T19:00:00Z", callChanges: [], results: [read], positions, exclude: new Set() })?.count).toBe(1);
    // Visited at 6 PM ET: already out.
    expect(sinceLastOpened({ since: "2026-11-11T23:00:00Z", callChanges: [], results: [read], positions, exclude: new Set() })).toBeNull();
  });

  it("keeps the window steady across reloads on the same day", () => {
    expect(sinceStart("2026-11-11T08:00:00Z", "2026-11-12T09:59:00Z")).toBe("2026-11-11T08:00:00Z");
    expect(sinceStart(null, "2026-11-11T08:00:00Z")).toBe("2026-11-11T08:00:00Z");
    expect(sinceStart(null, null)).toBeNull();
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
