import { describe, expect, it } from "vitest";

import { buildClassRead, buildMarketsRead, fedOutcomeWords, listTakeaway, marketRegime, moversTakeaway, nextReports, outlier, reportCard, reportsWhen, sectorBreadth, sectorTakeaway, SECTOR_IDS, usHoldings, withWatchNext } from "@/lib/markets-insights";
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

describe("Market today: what to watch next", () => {
  const today = "2026-11-11";
  const reports = nextReports(
    [
      { ticker: "NVDA", date: "2026-11-19", time: "amc" },
      { ticker: "CSCO", date: "2026-11-12", time: "amc" },
      { ticker: "WMT", date: "2026-11-11", time: "bmo" },
      { ticker: "AMD", date: "2026-11-25", time: "during" },
    ],
    today,
  );

  it("keeps only reports still to come", () => {
    expect([...reports.keys()].sort()).toEqual(["AMD", "CSCO", "NVDA"]);
    expect(reportsWhen(reports.get("CSCO")!, today)).toBe("reports tomorrow after the close");
    expect(reportsWhen(reports.get("NVDA")!, today)).toBe("reports on Nov 19 after the close");
    expect(reportsWhen({ ticker: "X", date: "2026-11-13", time: "bmo" }, today)).toBe("reports on Friday before the open");
    // Past the weekend a weekday is ambiguous, so the date is said.
    expect(reportsWhen({ ticker: "X", date: "2026-11-17", time: "amc" }, today)).toBe("reports on Nov 17 after the close");
  });

  it("ends a card with the next report on its stocks, once per stock, and only when there is one", () => {
    const cards = withWatchNext(
      [
        { id: "giants", tone: "down", text: "The 10 biggest companies lost 0.7%.", soWhat: "They carry the most weight in the S&P 500.", tickers: ["NVDA"] },
        { id: "sector", tone: "up", text: "Chips led.", soWhat: "Still down 14% over the month.", tickers: ["AMD", "NVDA"] },
        { id: "loudest", tone: "flat", text: "NVDA is the stock Reddit talks about most.", tickers: ["NVDA"] },
        { id: "quiet", tone: "flat", text: "Nothing to watch.", tickers: ["MSFT"] },
      ],
      reports,
      today,
    );
    expect(cards[0]!.soWhat).toBe("Watch next: NVDA reports on Nov 19 after the close.");
    expect(cards[1]!.soWhat).toBe("Still down 14% over the month. Watch next: AMD reports on Nov 25.");
    expect(cards[2]!.soWhat).toBeUndefined();
    expect(cards[3]!.soWhat).toBeUndefined();
  });

  it("never repeats a report the calendar card already tells", () => {
    const cards = withWatchNext(
      [
        { id: "biggest", tone: "flat", text: "Cisco reports tomorrow.", tickers: ["CSCO"] },
        { id: "loudest", tone: "flat", text: "CSCO is loud on Reddit.", tickers: ["CSCO"] },
      ],
      reports,
      today,
    );
    expect(cards[1]!.soWhat).toBeUndefined();
  });

  it("shortens the biggest report still to come to its figure and one sentence", () => {
    const long = { id: "biggest", tone: "flat" as const, text: "Cisco Systems ($443.3B) is the biggest company still to report this week, tomorrow after the close. Last time it fell 8.4% the day after its Aug 12 report, about 5 times its normal daily move. The next biggest is NU, tomorrow.", tickers: ["CSCO", "NU"] };
    const card = reportCard(long, reports.get("CSCO")!, { last: { pct: -8.4 }, typicalDayPct: 1.6 }, today);
    expect(card.text).toBe("CSCO reports tomorrow after the close; its last report moved it about 5 times as much as a normal day.");
    expect(card.figure).toEqual({ value: "−8.4%", label: "after its last report", tone: "down" });
    expect(card.tickers).toEqual(["CSCO"]);
    const plain = reportCard(long, reports.get("CSCO")!, undefined, today);
    expect(plain.text).toBe("CSCO reports tomorrow after the close, the biggest company still to report this week.");
    expect(plain.figure).toEqual({ value: "Tomorrow", label: "after the close" });
  });

  it("says what analysts expect from a report still to come, and nothing without an estimate", () => {
    const long = { id: "biggest", tone: "flat" as const, text: "Cisco reports tomorrow.", tickers: ["CSCO"] };
    expect(reportCard(long, { ...reports.get("CSCO")!, epsEstimate: 1.15 }, { last: { pct: -8.4 }, typicalDayPct: 1.6 }, today).soWhat).toBe("Analysts expect a profit of $1.15 a share.");
    expect(reportCard(long, { ...reports.get("CSCO")!, epsEstimate: -0.13 }, undefined, today).soWhat).toBe("Analysts expect a loss of $0.13 a share.");
    expect(reportCard(long, { ...reports.get("CSCO")!, epsEstimate: null }, undefined, today).soWhat).toBeUndefined();
  });
});

describe("fedOutcomeWords", () => {
  it("says a Fed outcome in plain words", () => {
    expect(fedOutcomeWords("Hike 25bps")).toBe("raises rates by 0.25 percentage points");
    expect(fedOutcomeWords("Hike >25bps")).toBe("raises rates by more than 0.25 percentage points");
    expect(fedOutcomeWords("Cut 50 bps")).toBe("cuts rates by 0.5 percentage points");
    expect(fedOutcomeWords("Cut 100bps")).toBe("cuts rates by 1 percentage point");
    expect(fedOutcomeWords("No change")).toBe("holds rates where they are");
    expect(fedOutcomeWords("Fed maintains rate")).toBe("holds rates where they are");
    expect(fedOutcomeWords("Cut 50+bps")).toBe("cuts rates by more than 0.5 percentage points");
    expect(fedOutcomeWords("25 bps decrease")).toBe("cuts rates by 0.25 percentage points");
    expect(fedOutcomeWords("50+ bps decrease")).toBe("cuts rates by more than 0.5 percentage points");
    expect(fedOutcomeWords("Yes")).toBeNull();
  });
});
