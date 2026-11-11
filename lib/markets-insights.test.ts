import { describe, expect, it } from "vitest";

import { buildClassRead, buildMarketsRead, listTakeaway, marketRegime, moversTakeaway, outlier, sectorBreadth, sectorTakeaway, SECTOR_IDS, usHoldings } from "@/lib/markets-insights";
import type { MarketAsset, MarketsData } from "@/lib/markets-shared";

function asset(id: string, d1: number | null, extra: Partial<MarketAsset> = {}): MarketAsset {
  return {
    id, class: "etf", group: null, name: id.toUpperCase(), symbol: id.toUpperCase(), price: 100, prev_close: 99, unit: "USD", change_mode: "pct",
    change: { d1, w1: null, m1: null, ytd: null, y1: null }, high_1y: null, high_1y_date: null, low_1y: null, low_1y_date: null, spark: [], spark_start: null,
    spark_end: null, source: "yahoo", source_name: "Yahoo Finance", source_url: "", as_of: "2026-11-09T21:00:00Z", order: 0, contract: null, curve: [],
    structure: null, market_cap: null, volume_24h: null, ath: null, ath_date: null, image: null, tenor: null, expense_ratio_pct: null, total_assets: null,
    yield_pct: null, fund_family: null, category: null, holdings: [], holdings_weight_pct: null, sectors: [], profile_source_name: null,
    profile_source_url: null, profile_as_of: null, call_volume: null, put_volume: null, average_20d: null, daily_only: false, ...extra,
  };
}

const sectors = (moves: number[]) => SECTOR_IDS.map((id, index) => asset(id, moves[index] ?? 0, { group: "sector" }));
const data = (assets: MarketAsset[]): MarketsData => ({ as_of: "2026-11-10T12:00:00Z", assets, predictions: [], treasury: null, volCurve: null });
const NOW = new Date("2026-11-10T14:00:00Z");

describe("regime", () => {
  it("is risk-on only with a real gain and wide breadth", () => {
    expect(marketRegime(1, sectorBreadth(sectors(Array(11).fill(1))))).toBe("risk-on");
    expect(marketRegime(0.4, sectorBreadth(sectors(Array(11).fill(1))))).toBe("mixed");
    expect(marketRegime(1, sectorBreadth(sectors([1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1])))).toBe("mixed");
    expect(marketRegime(-1, sectorBreadth(sectors(Array(11).fill(-1))))).toBe("risk-off");
    expect(marketRegime(null, sectorBreadth([]))).toBe("mixed");
  });
});

describe("outlier", () => {
  it("is the fund moving hardest against the day, at least 1%", () => {
    const assets = [asset("uso", -3.9, { group: "commodity" }), asset("gld", -1.2, { group: "commodity" }), asset("tlt", 0.5, { group: "bond" })];
    expect(outlier(assets, 2)?.id).toBe("uso");
    expect(outlier([asset("gld", -0.9, { group: "commodity" })], 2)).toBeNull();
  });
});

describe("usHoldings", () => {
  it("keeps US symbols and spells class shares with a dot", () => {
    const fund = asset("xlf", 1, { holdings: [{ symbol: "BRK-B", name: "Berkshire", weight_pct: 10 }, { symbol: "ASML.AS", name: "ASML", weight_pct: 5 }, { symbol: "JPM", name: "JPM", weight_pct: 4 }] });
    expect(usHoldings(fund)).toEqual(["BRK.B", "JPM"]);
  });
});

describe("buildMarketsRead", () => {
  it("says the index fell even though every sector rose, instead of calling the day up", () => {
    const asset = (id: string, d1: number, extra: Record<string, unknown> = {}) =>
      ({ id, class: "etf", group: "sector", name: id, symbol: id.toUpperCase(), price: 100, change: { d1, w1: null, m1: null, ytd: null, y1: null }, as_of: "2026-11-10T21:00:00Z", holdings: [], ...extra }) as never;
    const sectors = ["xlk", "xlf", "xle", "xlv", "xli", "xly", "xlp", "xlu", "xlb", "xlre", "xlc"].map((id) => asset(id, 0.2));
    const read = buildMarketsRead({ as_of: null, assets: [asset("sp500", -0.38, { class: "index", group: null }), ...sectors], predictions: [], treasury: null, volCurve: null }, new Date("2026-11-10T22:00:00Z"));
    expect(read?.headline).toMatch(/^The S&P 500 lost 0\.38% today even though all 11 sectors rose\./);
    // Most sectors (not all) the other way is the same story, not a "mixed" day.
    const most = ["xlk", "xlf", "xle", "xlv", "xli", "xly", "xlp", "xlu", "xlb", "xlre", "xlc"].map((id, i) => asset(id, i < 6 ? 0.2 : -0.3));
    const mostRead = buildMarketsRead({ as_of: null, assets: [asset("sp500", -0.38, { class: "index", group: null }), ...most], predictions: [], treasury: null, volCurve: null }, new Date("2026-11-10T22:00:00Z"));
    expect(mostRead?.headline).toMatch(/^The S&P 500 lost 0\.38% today even though 6 of 11 sectors rose\./);
    // And the mirror image counts the sectors that fell.
    const fellMost = ["xlk", "xlf", "xle", "xlv", "xli", "xly", "xlp", "xlu", "xlb", "xlre", "xlc"].map((id, i) => asset(id, i < 4 ? 0.2 : -0.3));
    const upRead = buildMarketsRead({ as_of: null, assets: [asset("sp500", 0.4, { class: "index", group: null }), ...fellMost], predictions: [], treasury: null, volCurve: null }, new Date("2026-11-10T22:00:00Z"));
    expect(upRead?.headline).toMatch(/^The S&P 500 gained 0\.40% today even though 7 of 11 sectors fell\./);
  });

  it("returns null without a stock price", () => {
    expect(buildMarketsRead(data([]), NOW)).toBeNull();
  });

  it("names the day, the leader and the outlier", () => {
    const assets = [
      asset("sp500", 2.35, { class: "index" }),
      asset("spy", 2.37, { group: "broad" }),
      asset("iwm", 3.23, { group: "broad" }),
      ...sectors(Array(11).fill(2)),
      asset("soxx", 7.49, { group: "thematic", change: { d1: 7.49, w1: null, m1: -21.3, ytd: null, y1: null }, holdings: [{ symbol: "AMD", name: "AMD", weight_pct: 9 }] }),
      asset("uso", -3.87, { group: "commodity" }),
    ];
    const read = buildMarketsRead(data(assets), NOW)!;
    // The outlier is the second line under the headline, not a second sentence in it.
    expect(read.headline).toBe("Most stocks rose Monday: all 11 sectors rose and the S&P 500 gained 2.35%.");
    expect(read.insights.map((insight) => insight.id)).toEqual(["leader", "outlier", "size"]);
    expect(read.insights[0]!.text).toContain("SOXX rose 7.49%, 5.1 points better than the S&P 500");
    expect(read.insights[0]!.soWhat).toContain("bounce");
    expect(read.insights[0]!.tickers).toEqual(["AMD"]);
  });

  it("calls a quiet day mixed and leaves out what the data cannot carry", () => {
    const read = buildMarketsRead(data([asset("sp500", 0.1, { class: "index" }), ...sectors([0.2, -0.1, 0.3, 0, 0.1, -0.2, 0.1, 0.1, 0, 0.2, -0.3])]), NOW)!;
    expect(read.headline.startsWith("Stocks were mixed Monday: 6 of 11 sectors rose")).toBe(true);
    expect(read.insights).toEqual([]);
  });
});

describe("takeaways", () => {
  it("sector line handles all-up and ties", () => {
    expect(sectorTakeaway(sectors(Array(11).fill(1)))).toMatch(/^All 11 sectors rose\./);
    expect(sectorTakeaway([])).toBeNull();
  });
  it("list line needs three moves", () => {
    expect(listTakeaway([asset("a", 1), asset("b", 2)], "funds")).toBeNull();
    expect(listTakeaway([asset("a", 1), asset("b", -2), asset("c", 3)], "funds")).toBe("2 of 3 funds rose. C led at +3.0%, B trailed at −2.0%.");
  });
  it("movers line counts gains", () => {
    expect(moversTakeaway([asset("a", 5), asset("b", 4), asset("c", 3)])).toMatch(/^All 3 of the biggest moves were gains/);
    expect(moversTakeaway([asset("a", -5), asset("b", 4), asset("c", 3)])).toMatch(/^2 of the 3 biggest moves were gains/);
  });
});

describe("buildClassRead", () => {
  it("leads with how the class did and names the moves that beat or lagged the S&P 500", () => {
    const spx = asset("sp500", -0.57, { class: "index" });
    const coins = [
      asset("btc", -0.2, { class: "crypto", name: "Bitcoin", symbol: "BTC" }),
      asset("eth", -1.1, { class: "crypto", name: "Ether", symbol: "ETH" }),
      asset("sol", -3.11, { class: "crypto", name: "Solana", symbol: "SOL", change: { d1: -3.11, w1: null, m1: -12, ytd: null, y1: null } }),
      asset("avax", -4.68, { class: "crypto", name: "Avalanche", symbol: "AVAX" }),
    ];
    const read = buildClassRead({ slug: "crypto", assets: coins, data: data([spx, ...coins]) })!;
    expect(read.headline).toBe("All 4 coins fell; Avalanche fell most at \u22124.7%.");
    expect(read.insights.map((insight) => insight.id)).toEqual(["mover-avax", "mover-sol"]);
    expect(read.insights[0]!.text).toBe("Avalanche fell 4.68% in 24 hours, 4.5 pts worse than bitcoin (\u22120.20%).");
    expect(read.insights[1]!.soWhat).toBe("That extends a 12.0% drop over the month.");
  });

  it("uses the page's own reading as the headline and skips moves close to the baseline", () => {
    const spx = asset("sp500", 0.4, { class: "index" });
    const funds = [asset("xlk", 0.9, { group: "sector" }), asset("xle", 0.2, { group: "sector" }), asset("xlf", 0.5, { group: "sector" })];
    const read = buildClassRead({ slug: "etfs", assets: funds, data: data([spx, ...funds]), reading: "Tech led a calm day." })!;
    expect(read.headline).toBe("Tech led a calm day.");
    expect(read.insights).toEqual([]);
  });

  it("does not measure currencies against the S&P 500", () => {
    const spx = asset("sp500", -2, { class: "index" });
    const pairs = [asset("eurusd", 0.35, { class: "fx" }), asset("usdjpy", -1.2, { class: "fx" }), asset("dxy", 0.4, { class: "fx" })];
    const read = buildClassRead({ slug: "fx", assets: pairs, data: data([spx, ...pairs]) })!;
    expect(read.insights.map((insight) => insight.text)).toEqual(["USDJPY fell 1.20% today."]);
  });

  it("is null with nothing to say", () => {
    expect(buildClassRead({ slug: "fx", assets: [], data: data([]) })).toBeNull();
  });
});
