import { describe, expect, it } from "vitest";

import {
  applyFollowChange,
  assetAsOfText,
  assetHref,
  biggestMoves,
  buildMarketsOverview,
  changeTone,
  classInfoBySlug,
  formatAbs,
  formatBps,
  formatBpsPlain,
  formatChange,
  formatCompactUsd,
  formatLevel,
  formatPct,
  formatProbability,
  formatProbabilityChange,
  headlineReadings,
  normalizeFollowedIds,
  pctChange,
  predictionHref,
  predictionReading,
  putCallReading,
  rangeReading,
  sectorReading,
  seriesChange,
  signalTone,
  sliceSeries,
  sparkPoints,
  structureReading,
  tileTone,
  volCurveReading,
  volCurveVerdict,
  yieldCurveReading,
  yieldCurveSpreadBps,
  type MarketAsset,
  type MarketsData,
  type PredictionMarket,
  type TreasuryCurve,
  type VolCurve,
} from "@/lib/markets-shared";

const NOW = new Date("2026-11-09T20:30:00Z"); // 3:30 PM in New York

function asset(overrides: Partial<MarketAsset> & { id: string }): MarketAsset {
  return {
    class: "etf",
    group: null,
    name: overrides.id.toUpperCase(),
    symbol: overrides.id.toUpperCase(),
    price: 100,
    prev_close: 99,
    unit: "USD",
    change_mode: "pct",
    change: { d1: 1, w1: null, m1: null, ytd: null, y1: null },
    high_1y: null,
    high_1y_date: null,
    low_1y: null,
    low_1y_date: null,
    spark: [],
    spark_start: null,
    spark_end: null,
    source: "yahoo",
    source_name: "Yahoo Finance",
    source_url: "",
    as_of: "2026-11-09T20:16:00+00:00",
    order: 0,
    contract: null,
    curve: [],
    structure: null,
    market_cap: null,
    volume_24h: null,
    ath: null,
    ath_date: null,
    image: null,
    tenor: null,
    expense_ratio_pct: null,
    total_assets: null,
    yield_pct: null,
    fund_family: null,
    category: null,
    holdings: [],
    holdings_weight_pct: null,
    sectors: [],
    profile_source_name: null,
    profile_source_url: null,
    profile_as_of: null,
    call_volume: null,
    put_volume: null,
    average_20d: null,
    daily_only: false,
    ...overrides,
  };
}

function prediction(overrides: Partial<PredictionMarket>): PredictionMarket {
  return {
    id: "kalshi-x",
    source: "kalshi",
    source_name: "Kalshi",
    source_url: "https://kalshi.com/markets/x",
    topic: "fed",
    question: "Fed decision in Dec 2026?",
    detail: "",
    kind: "exclusive",
    outcomes: [],
    outcome_count: 0,
    volume: null,
    volume_24h: null,
    volume_unit: "contracts",
    close_time: "2026-12-09T18:59:00Z",
    as_of: "2026-11-09T20:19:00+00:00",
    implied_range: null,
    order: 0,
    rules: null,
    rules_outcome: null,
    settlement_sources: [],
    has_history: false,
    ...overrides,
  };
}

const TREASURY: TreasuryCurve = {
  date: "2026-11-06",
  date_1m_ago: "2026-10-07",
  date_1y_ago: null,
  points: [
    { tenor: "2Y", label: "2 year", months: 24, asset_id: "us2y", value: 4.51, value_1m_ago: 4.8, value_1y_ago: null },
    { tenor: "10Y", label: "10 year", months: 120, asset_id: "us10y", value: 4.86, value_1m_ago: 5.1, value_1y_ago: null },
  ],
  spread_2s10s_bps: 35,
  spread_3m10y_bps: null,
  source_name: "US Treasury",
  source_url: "",
  as_of: "2026-11-06T20:30:00+00:00",
};

const VOL: VolCurve = {
  date: "2026-11-06",
  points: [
    { label: "9D", symbol: "VIX9D", days: 9, asset_id: "vix9d", value: 27.18, value_1m_ago: 11.78 },
    { label: "1M", symbol: "VIX", days: 30, asset_id: "vix", value: 25.64, value_1m_ago: 15.08 },
    { label: "3M", symbol: "VIX3M", days: 93, asset_id: "vix3m", value: 24.6, value_1m_ago: 17.72 },
  ],
  state: "inverted",
  vix_to_vix3m: 1.042,
  source_name: "Cboe",
  source_url: "",
  as_of: "2026-11-06T21:15:00+00:00",
};

describe("formatting", () => {
  it("formats levels in the unit's own terms", () => {
    expect(formatLevel(4146.7, "USD/oz")).toBe("$4,146.70");
    expect(formatLevel(3.204, "USD/MMBtu")).toBe("$3.204");
    expect(formatLevel(74918, "USD")).toBe("$74,918");
    expect(formatLevel(0.3166, "USD")).toBe("$0.3166");
    expect(formatLevel(4.86, "%")).toBe("4.86%");
    expect(formatLevel(0.35, "pp")).toBe("+35 bps");
    expect(formatLevel(1.1227, "rate")).toBe("1.1227");
    expect(formatLevel(157.8, "rate")).toBe("157.80");
    expect(formatLevel(0.59, "ratio")).toBe("0.59");
    expect(formatLevel(7576.22, "pts")).toBe("7,576.22");
  });

  it("signs changes and never prints a negative zero", () => {
    expect(formatPct(2.7)).toBe("+2.70%");
    expect(formatPct(-5.284)).toBe("−5.28%");
    expect(formatPct(-0.001)).toBe("0.00%");
    expect(formatBps(-3.4)).toBe("−3 bps");
    expect(formatBps(0.2)).toBe("0 bps");
    // The headline strip says a yield's move in words, its sign rounded as its colour is.
    expect(formatBpsPlain(10)).toBe("up 0.10 points");
    expect(formatBpsPlain(-3.4)).toBe("down 0.03 points");
    expect(formatBpsPlain(-0.5)).toBe("unchanged");
    expect(formatBpsPlain(0.2)).toBe("unchanged");
    expect(formatAbs(-0.3)).toBe("−0.30");
    expect(formatChange(0.19, "abs")).toBe("+0.19");
    expect(formatChange(5, "bps")).toBe("+5 bps");
    expect(formatChange(null, "pct")).toBeNull();
    expect(formatChange(Number.NaN, "pct")).toBeNull();
  });

  it("compacts money and keeps unknown as null", () => {
    expect(formatCompactUsd(1.51e12)).toBe("$1.51T");
    expect(formatCompactUsd(6123425792)).toBe("$6.1B");
    expect(formatCompactUsd(846.7e6)).toBe("$846.7M");
    expect(formatCompactUsd(null)).toBeNull();
  });

  it("never shows a probability as 0% or 100%", () => {
    expect(formatProbability(0.004)).toBe("<1%");
    expect(formatProbability(0.9955)).toBe(">99%");
    expect(formatProbability(0.805)).toBe("81%");
    expect(formatProbabilityChange(0.04)).toBe("+4 pts");
    expect(formatProbabilityChange(-0.01)).toBe("−1 pt");
    expect(formatProbabilityChange(0.002)).toBeNull();
    expect(formatProbabilityChange(null)).toBeNull();
  });

  it("gives end-of-day data a date and live data a clock time", () => {
    expect(assetAsOfText({ as_of: "2026-11-06T21:15:00+00:00", daily_only: true, source: "cboe" }, NOW)).toBe("Nov 6 close");
    expect(assetAsOfText({ as_of: "2026-11-06T20:30:00+00:00", daily_only: false, source: "treasury" }, NOW)).toBe("Nov 6 close");
    expect(assetAsOfText({ as_of: "2026-11-09T20:16:00+00:00", daily_only: false, source: "yahoo" }, NOW)).toBe("3:16 PM ET");
  });
});

describe("change maths", () => {
  it("computes percent change and refuses a bad base", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(pctChange(0, 110)).toBeNull();
    expect(pctChange(-5, 110)).toBeNull();
    expect(pctChange(null, 110)).toBeNull();
  });

  it("measures a series in the asset's own mode", () => {
    expect(seriesChange([100, 90, 120], "pct")).toBeCloseTo(20);
    expect(seriesChange([4.5, 4.86], "bps")).toBeCloseTo(36);
    expect(seriesChange([0.89, 0.59], "abs")).toBeCloseTo(-0.3);
    expect(seriesChange([100], "pct")).toBeNull();
  });

  it("tones a change after rounding, and keeps ratios neutral", () => {
    expect(changeTone(0.004)).toBe("flat");
    expect(changeTone(-0.006)).toBe("down");
    expect(changeTone(0.4, "bps")).toBe("flat");
    expect(changeTone(null)).toBe("flat");
    expect(signalTone(0.3, "abs")).toBe("flat");
    expect(signalTone(0.3, "pct")).toBe("up");
  });

  it("slices a series back from its last day", () => {
    const series = {
      dates: ["2025-11-10", "2026-08-07", "2026-10-09", "2026-11-02", "2026-11-06", "2026-11-09"],
      values: [1, 2, 3, 4, 5, 6],
    };
    expect(sliceSeries(series, "1W").values).toEqual([4, 5, 6]);
    expect(sliceSeries(series, "1M").values).toEqual([3, 4, 5, 6]);
    expect(sliceSeries(series, "1Y").values).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sliceSeries({ dates: [], values: [] }, "1M")).toEqual({ dates: [], values: [] });
    // A range with a single point in it still returns that point rather than nothing.
    expect(sliceSeries({ dates: ["2026-01-01", "2026-11-09"], values: [1, 2] }, "1W").values).toEqual([2]);
  });

  it("draws sparkline points inside the box", () => {
    expect(sparkPoints([1], 100, 30)).toBe("");
    const points = sparkPoints([1, 3, 2], 100, 30, 2).split(" ");
    expect(points).toEqual(["0.00,28.00", "50.00,2.00", "100.00,15.00"]);
    // A flat line must not divide by zero.
    expect(sparkPoints([5, 5], 10, 10, 0)).toBe("0.00,10.00 10.00,10.00");
  });
});

describe("routes", () => {
  it("gives every asset one canonical URL", () => {
    expect(assetHref({ id: "spy", class: "etf" })).toBe("/markets/etfs/spy");
    expect(assetHref({ id: "us10y", class: "rate" })).toBe("/markets/rates/us10y");
    expect(assetHref({ id: "pc-equity", class: "option" })).toBe("/markets/options/pc-equity");
    expect(predictionHref({ id: "poly-770450" })).toBe("/markets/predictions/poly-770450");
    expect(classInfoBySlug("ETFs")?.assetClass).toBe("etf");
    expect(classInfoBySlug("predictions")?.assetClass).toBeNull();
    expect(classInfoBySlug("sp500")).toBeNull();
  });
});

describe("readings", () => {
  it("reads the yield curve from the 2-year and the 10-year", () => {
    expect(yieldCurveReading(TREASURY)).toBe(
      "The 10-year yields 4.86%, 35 bps more than the 2-year at 4.51%: the curve slopes upward.",
    );
    const inverted = { ...TREASURY, points: [{ ...TREASURY.points[0], value: 5 }, TREASURY.points[1]] };
    expect(yieldCurveReading(inverted)).toContain("inverted by 14 bps");
    expect(yieldCurveReading(null)).toBeNull();
    expect(yieldCurveReading({ ...TREASURY, points: [TREASURY.points[0]] })).toBeNull();
  });

  it("says whether near-term volatility sits above the three-month level", () => {
    expect(volCurveReading(VOL)).toContain("1.0 points above the three-month level (24.6)");
    const calm = { ...VOL, points: VOL.points.map((point) => (point.symbol === "VIX" ? { ...point, value: 15 } : point)) };
    expect(volCurveReading(calm)).toContain("below the three-month level");
    expect(volCurveReading({ ...VOL, points: VOL.points.slice(0, 1) })).toBeNull();
  });

  it("names the curves in a word on the same cut as the sentences", () => {
    expect(yieldCurveSpreadBps(TREASURY)).toBe(35);
    expect(yieldCurveSpreadBps(null)).toBeNull();
    expect(volCurveVerdict(VOL)).toEqual({ tone: "down", word: "Stressed" });
    const calm = { ...VOL, points: VOL.points.map((point) => (point.symbol === "VIX" ? { ...point, value: 15 } : point)) };
    expect(volCurveVerdict(calm)).toEqual({ tone: "flat", word: "Usual shape" });
    expect(volCurveVerdict(null)).toBeNull();
  });

  it("compares a put/call ratio with its own average", () => {
    expect(putCallReading({ price: 0.59, average_20d: 0.61, unit: "ratio" })).toBe(
      "Bets on a rise and on a fall traded in their usual mix: 0.59 bets on a fall for each bet on a rise, against 0.61 on a usual day.",
    );
    expect(putCallReading({ price: 1.26, average_20d: 1.03, unit: "ratio" })).toContain("More bets on a fall than usual");
    expect(putCallReading({ price: 0.4, average_20d: 0.61, unit: "ratio" })).toContain("Fewer bets on a fall than usual");
    expect(putCallReading({ price: 0.59, average_20d: null, unit: "ratio" })).toBeNull();
    expect(putCallReading({ price: 100, average_20d: 90, unit: "USD" })).toBeNull();
  });

  it("places a level in its one-year range", () => {
    const base = { unit: "USD", change_mode: "pct" as const, high_1y_date: "2026-10-05", low_1y_date: "2026-03-30" };
    expect(rangeReading({ ...base, price: 79.57, high_1y: 92.78, low_1y: 63.52 })).toBe(
      "14.2% below its one-year high of $92.78 (Oct 5).",
    );
    expect(rangeReading({ ...base, price: 92.7, high_1y: 92.78, low_1y: 63.52 })).toBe("At its highest level in a year.");
    expect(rangeReading({ ...base, price: 63.6, high_1y: 92.78, low_1y: 63.52 })).toBe("At its lowest level in a year.");
    expect(rangeReading({ ...base, price: 80, high_1y: null, low_1y: 63.52 })).toBeNull();
    expect(rangeReading({ ...base, unit: "%", change_mode: "bps", price: 4.86, high_1y: 5.2, low_1y: 3.9 })).toBe(
      "34 bps below its one-year high of 5.20% (Oct 5).",
    );
    expect(rangeReading({ ...base, unit: "pts", price: 102.3, high_1y: 102.58, low_1y: 96.2 }, "The dollar index")).toBe(
      "The dollar index is 0.3% below its one-year high of 102.58 (Oct 5).",
    );
    expect(rangeReading({ ...base, price: 92.7, high_1y: 92.78, low_1y: 63.52 }, "Gold")).toBe("Gold is at its highest level in a year.");
  });

  it("reads a futures curve, with the commodity named when asked", () => {
    const structure = {
      state: "contango" as const,
      front_label: "Dec 26",
      front_price: 100,
      later_label: "Dec 27",
      later_price: 105,
      later_months_out: 12,
      spread_pct: 5,
    };
    expect(structureReading({ structure })).toBe("Dec 2027 delivery costs 5.0% more than Dec 2026.");
    expect(structureReading({ structure }, "Gold")).toBe(
      "Gold for Dec 2027 delivery costs 5.0% more than for Dec 2026.",
    );
    expect(structureReading({ structure: { ...structure, state: "backwardation", spread_pct: -2 } }, "WTI crude oil")).toBe(
      "WTI crude oil for Dec 2027 delivery costs 2.0% less than for Dec 2026.",
    );
    expect(structureReading({ structure: { ...structure, state: "flat", spread_pct: 0.2 } }, "Gold")).toBe(
      "Gold's Dec 2026 and Dec 2027 contracts trade within 0.2% of each other.",
    );
    expect(structureReading({ structure: null })).toBeNull();
  });

  it("names the sector funds that led and trailed", () => {
    const sectors = [
      asset({ id: "smh", symbol: "SMH", group: "sector", change: { d1: 5.54, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "xlk", symbol: "XLK", group: "sector", change: { d1: 4.12, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "xlu", symbol: "XLU", group: "sector", change: { d1: -0.4, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "xle", symbol: "XLE", group: "sector", change: { d1: -1.1, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "arkk", group: "thematic", change: { d1: 9, w1: null, m1: null, ytd: null, y1: null } }),
    ];
    const withFinancials = [
      ...sectors,
      asset({ id: "xlf", symbol: "XLF", group: "sector", change: { d1: 0.3, w1: null, m1: null, ytd: null, y1: null } }),
    ];
    // SMH is a chip fund that shares the sector grid; it is not one of the eleven sectors.
    expect(sectorReading(withFinancials, NOW)).toBe(
      "2 of 4 sectors rose today. Tech (XLK) led at +4.12%; Energy (XLE) trailed at −1.10%.",
    );
    expect(sectorReading(sectors, NOW)).toBeNull();
    const allUp = withFinancials.map((item) => ({ ...item, change: { ...item.change, d1: Math.abs(item.change.d1 ?? 0) + 0.5 } }));
    expect(sectorReading(allUp, NOW)).toMatch(/^All 4 sectors rose today\./);
  });

  it("ranks the biggest percent moves and leaves out yields, ratios and the VIX", () => {
    const moves = biggestMoves([
      asset({ id: "a", change: { d1: 1, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "b", change: { d1: -6.5, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "vix", class: "index", change: { d1: -22, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "us10y", class: "rate", change_mode: "bps", change: { d1: 40, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "pc", class: "option", change_mode: "abs", change: { d1: 9, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "c", change: { d1: null, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "d", change: { d1: 0.001, w1: null, m1: null, ytd: null, y1: null } }),
    ]);
    expect(moves.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("sums up a prediction market in one sentence", () => {
    const fed = prediction({
      outcomes: [
        { label: "Fed maintains rate", probability: 0.195, strike: null, change_24h: -0.03 },
        { label: "Hike 25bps", probability: 0.805, strike: null, change_24h: 0.04 },
      ],
    });
    expect(predictionReading(fed)).toBe("Traders put 81% on Hike 25bps, then 20% on Fed maintains rate.");
    const binary = prediction({
      kind: "binary",
      outcomes: [
        { label: "Yes", probability: 0.025, strike: null, change_24h: 0 },
        { label: "No", probability: 0.975, strike: null, change_24h: 0 },
      ],
    });
    expect(predictionReading(binary)).toBe("Traders put 3% on yes.");
    const ladder = prediction({
      kind: "ladder",
      implied_range: { low: 3.6, high: 3.7 },
      outcomes: [{ label: "Above 3.6%", probability: 0.735, strike: 3.6, change_24h: null }],
    });
    expect(predictionReading(ladder)).toBe("Even odds sit between 3.6% and 3.7%.");
    expect(predictionReading(prediction({ outcomes: [] }))).toBeNull();
  });
});

describe("overview", () => {
  const data: MarketsData = {
    as_of: "2026-11-09T20:19:37+00:00",
    assets: [
      asset({ id: "sp500", class: "index", symbol: "SPX", name: "S&P 500", unit: "pts", price: 7576.22, change: { d1: 2.7, w1: null, m1: null, ytd: null, y1: null } }),
      asset({ id: "btc", class: "crypto", symbol: "BTC", name: "Bitcoin", price: 74918, change: { d1: -1.15, w1: null, m1: null, ytd: null, y1: null } }),
    ],
    predictions: [],
    treasury: TREASURY,
    volCurve: VOL,
  };

  it("builds tiles only for assets that exist and links them to their pages", () => {
    const overview = buildMarketsOverview(data, NOW);
    expect(overview.tiles.map((tile) => [tile.id, tile.level, tile.change, tile.changeLabel, tile.href])).toEqual([
      ["sp500", "7,576.22", "+2.70%", "today", "/markets/indices/sp500"],
      ["btc", "$74,918", "−1.15%", "24h", "/markets/crypto/btc"],
    ]);
    expect(overview.prediction).toBeNull();
  });

  it("writes readings only from numbers it has, and dates the once-a-day ones", () => {
    const lines = headlineReadings(data, NOW);
    expect(lines.map((line) => line.key)).toEqual(["stocks", "rates", "crypto", "options"]);
    expect(lines[0].text).toBe("The S&P 500 is up 2.70% today at 7,576.22.");
    expect(lines[1].text).toMatch(/slopes upward\. \(Nov 6 close\)$/);
    expect(lines[3].href).toBe("/markets/options");
    // The sentences that need a word to say good or bad carry one; the plain moves do not.
    expect(lines[0].verdict).toBeUndefined();
    expect(lines[1].verdict).toEqual({ tone: "up", word: "Normal" });
    expect(lines[3].verdict).toEqual({ tone: "down", word: "Stressed" });
    expect(headlineReadings({ as_of: null, assets: [], predictions: [], treasury: null, volCurve: null }, NOW)).toEqual([]);
  });

  it("colours a yield tile by what its day's move means for stocks, not by its sign", () => {
    const change = (d1: number | null) => ({ d1, w1: null, m1: null, ytd: null, y1: null });
    const rate = (d1: number | null, unit = "%") => ({ class: "rate" as const, unit, change_mode: "bps" as const, change: change(d1) });
    // Up 0.10 points is costlier borrowing: bad for stocks, red.
    expect(tileTone(rate(10))).toBe("down");
    expect(tileTone(rate(-10))).toBe("up");
    // 2 bps or less is no verdict: plain, judged on the whole bps that are printed (2.4 shows as "+2 bps").
    expect(tileTone(rate(2))).toBe("flat");
    expect(tileTone(rate(2.4))).toBe("flat");
    expect(tileTone(rate(null))).toBe("flat");
    // A spread between two yields is not borrowing costs: it keeps its sign.
    expect(tileTone(rate(10, "pp"))).toBe("up");
    // Prices keep their sign.
    expect(tileTone({ class: "index", unit: "pts", change_mode: "pct", change: change(1.2) })).toBe("up");
  });
});

describe("followed assets", () => {
  it("cleans a stored list and applies one change", () => {
    expect(normalizeFollowedIds(["btc", "BTC", "btc", 7, "us10y", "../x", "kalshi-kxfeddecision-26dec"])).toEqual([
      "btc",
      "us10y",
      "kalshi-kxfeddecision-26dec",
    ]);
    expect(normalizeFollowedIds("btc")).toEqual([]);
    expect(applyFollowChange(["btc", "eth"], "eth", true)).toEqual(["eth", "btc"]);
    expect(applyFollowChange(["btc", "eth"], "btc", false)).toEqual(["eth"]);
    expect(applyFollowChange(["btc"], "sol", false)).toEqual(["btc"]);
  });
});
