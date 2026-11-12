import { describe, expect, it } from "vitest";

import {
  RULES,
  SIGNAL_IDS,
  STOCK_SIGNALS_VERSION,
  alignedOneYear,
  buildStockSignals,
  pePercentile,
  peerRank,
  reportReaction,
  type SignalId,
  type StockSignalsInput,
} from "./stock-signals";

const TODAY = "2026-11-12";

/** A stock with nothing on file: every signal neutral and not eligible. */
function empty(overrides: Partial<StockSignalsInput> = {}): StockSignalsInput {
  return {
    today: TODAY,
    currency: "$",
    price: 100,
    priceAsOf: TODAY,
    bank: false,
    history: [],
    ttmRevenueGrowth: null,
    roe: null,
    nii: null,
    pe: null,
    sectorPe: null,
    peHistory: null,
    target: null,
    ratings: [],
    lastReport: null,
    guidance: null,
    reaction: null,
    sma50: null,
    sma200: null,
    rsi: null,
    high52: null,
    oneYear: null,
    insiders: null,
    funds: null,
    newsEvents: [],
    self: { revenueGrowth: null, pe: null },
    peers: [],
    ...overrides,
  };
}

function verdict(input: Partial<StockSignalsInput>, id: SignalId) {
  const found = buildStockSignals(empty(input)).byId[id];
  return found ? (found.eligible ? found.verdict : "ineligible") : "absent";
}

/** Fiscal years with revenue growing by the given percents, oldest step first, ending at FY2025. */
function revenue(...growth: number[]) {
  let value = 100;
  const first = 2025 - growth.length;
  const rows = [{ period: `FY ${first}`, revenue: value }];
  growth.forEach((pct, index) => {
    value *= 1 + pct / 100;
    rows.push({ period: `FY ${first + 1 + index}`, revenue: value });
  });
  return rows;
}

describe("contract", () => {
  it("is versioned and returns every id once, in the fixed order", () => {
    const result = buildStockSignals(empty());
    expect(result.version).toBe(STOCK_SIGNALS_VERSION);
    const ids = result.signals.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(SIGNAL_IDS.filter((id) => ids.includes(id)));
  });

  it("treats missing data as neutral and not eligible, never as zero, and shows no tally", () => {
    const result = buildStockSignals(empty());
    expect(result.signals.every((item) => item.verdict === "neutral" && !item.eligible && item.reason)).toBe(true);
    expect(result.tally).toBeNull();
    expect(Object.values(result.tabs).every((tab) => tab.dot === null)).toBe(true);
  });
});

describe("financials", () => {
  it("calls revenue good at 5% growth that keeps up with the year before", () => {
    expect(verdict({ history: revenue(4, 5) }, "fin.revenue")).toBe("good");
    expect(verdict({ history: revenue(6, 5) }, "fin.revenue")).toBe("neutral"); // slower than the year before
    expect(verdict({ history: revenue(4, 4.99) }, "fin.revenue")).toBe("neutral");
  });

  it("calls revenue a watch at −5%, or when positive growth slowed by 5 points", () => {
    expect(verdict({ history: revenue(0, -5) }, "fin.revenue")).toBe("watch");
    expect(verdict({ history: revenue(0, -4.99) }, "fin.revenue")).toBe("neutral");
    expect(verdict({ history: revenue(12, 7) }, "fin.revenue")).toBe("watch");
    expect(verdict({ history: revenue(12, 7.01) }, "fin.revenue")).toBe("neutral");
  });

  it("drops a fiscal-year revenue verdict that the newer twelve months contradict", () => {
    // JPM: +0.9% in FY25 after +14% the year before reads "slowing", but the last twelve months grew 14.1%.
    expect(verdict({ history: revenue(14, 0.9), ttmRevenueGrowth: 14.1 }, "fin.revenue")).toBe("ineligible");
    // Within five points of the fiscal year, the twelve months agree and the verdict stands.
    expect(verdict({ history: revenue(14, 0.9), ttmRevenueGrowth: 5.89 }, "fin.revenue")).toBe("watch");
    // A good fiscal year that the twelve months undercut by five points or more is dropped too.
    expect(verdict({ history: revenue(8, 12), ttmRevenueGrowth: 7 }, "fin.revenue")).toBe("ineligible");
    expect(verdict({ history: revenue(8, 12), ttmRevenueGrowth: 7.01 }, "fin.revenue")).toBe("good");
    // No twelve-month figure: the fiscal-year verdict stands.
    expect(verdict({ history: revenue(14, 0.9) }, "fin.revenue")).toBe("watch");
  });

  it("needs the preceding year to call growth good", () => {
    expect(verdict({ history: [{ period: "FY 2024", revenue: 100 }, { period: "FY 2025", revenue: 120 }] }, "fin.revenue")).toBe("neutral");
  });

  it("compares consecutive fiscal years only, and never the trailing twelve months", () => {
    const gap = [{ period: "FY 2022", revenue: 100 }, { period: "FY 2025", revenue: 200 }, { period: "TTM", revenue: 300 }];
    expect(verdict({ history: gap }, "fin.revenue")).toBe("ineligible");
  });

  it("leaves an out-of-date fiscal year out", () => {
    // FY2024 is the latest year read in 2025, but two years back in November 2026: a newer year is missing.
    const old = [{ period: "FY 2022", revenue: 100 }, { period: "FY 2023", revenue: 110 }, { period: "FY 2024", revenue: 130 }];
    expect(verdict({ history: old }, "fin.revenue")).toBe("ineligible");
    expect(verdict({ history: old, today: "2025-06-01" }, "fin.revenue")).toBe("good");
  });

  it("calls net income and EPS on a 5% change, and a loss to a profit good, the reverse a watch", () => {
    const rows = (prior: number, current: number) => [
      { period: "FY 2024", net_income: prior, eps_diluted: prior },
      { period: "FY 2025", net_income: current, eps_diluted: current },
    ];
    expect(verdict({ history: rows(100, 105) }, "fin.net_income")).toBe("good");
    expect(verdict({ history: rows(100, 104.99) }, "fin.net_income")).toBe("neutral");
    expect(verdict({ history: rows(100, 95) }, "fin.eps")).toBe("watch");
    expect(verdict({ history: rows(100, 95.01) }, "fin.eps")).toBe("neutral");
    expect(verdict({ history: rows(-10, 5) }, "fin.net_income")).toBe("good");
    expect(verdict({ history: rows(0, 5) }, "fin.eps")).toBe("good");
    expect(verdict({ history: rows(10, -5) }, "fin.net_income")).toBe("watch");
    expect(verdict({ history: rows(-10, -5) }, "fin.net_income")).toBe("neutral");
  });

  it("calls the net margin on a 2-point move", () => {
    const rows = (prior: number, current: number) => [
      { period: "FY 2024", profit_margin_pct: prior },
      { period: "FY 2025", profit_margin_pct: current },
    ];
    expect(verdict({ history: rows(20, 22) }, "fin.net_margin")).toBe("good");
    expect(verdict({ history: rows(20, 21.99) }, "fin.net_margin")).toBe("neutral");
    expect(verdict({ history: rows(20, 18) }, "fin.net_margin")).toBe("watch");
  });

  it("gives a bank no margin item and judges ROE and net interest income only when they are on file", () => {
    const history = [
      { period: "FY 2024", profit_margin_pct: 20, revenue: 100 },
      { period: "FY 2025", profit_margin_pct: 30, revenue: 110 },
    ];
    expect(verdict({ bank: true, history }, "fin.net_margin")).toBe("absent");
    expect(verdict({ bank: true, history }, "fin.roe")).toBe("ineligible");
    expect(verdict({ bank: true, history }, "fin.nii")).toBe("ineligible");
    expect(verdict({ bank: false, history }, "fin.roe")).toBe("absent");
    expect(verdict({ bank: true, roe: { current: 17, prior: 15, period: "FY2025 vs FY2024" } }, "fin.roe")).toBe("good");
    expect(verdict({ bank: true, roe: { current: 13.01, prior: 15, period: "" } }, "fin.roe")).toBe("neutral");
    expect(verdict({ bank: true, nii: { current: 95, prior: 100, period: "" } }, "fin.nii")).toBe("watch");
  });
});

describe("valuation", () => {
  it("calls the P/E against its sector at 20% either way, and never for a negative P/E", () => {
    expect(verdict({ pe: 8, sectorPe: 10 }, "val.pe_sector")).toBe("good");
    expect(verdict({ pe: 8.01, sectorPe: 10 }, "val.pe_sector")).toBe("neutral");
    expect(verdict({ pe: 12, sectorPe: 10 }, "val.pe_sector")).toBe("watch");
    expect(verdict({ pe: 11.99, sectorPe: 10 }, "val.pe_sector")).toBe("neutral");
    expect(verdict({ pe: -5, sectorPe: 10 }, "val.pe_sector")).toBe("ineligible");
  });

  it("judges the P/E against its own history only over 252 current daily readings", () => {
    const points = (count: number, last = TODAY) =>
      Array.from({ length: count }, (_, index) => ({ date: new Date(Date.parse(`${last}T00:00:00Z`) - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10), value: 10 + index }));
    expect(verdict({ pe: 10, peHistory: { points: points(251) } }, "val.pe_history")).toBe("ineligible");
    expect(verdict({ pe: 10, peHistory: { points: points(260) } }, "val.pe_history")).toBe("good");
    expect(verdict({ pe: 10_000, peHistory: { points: points(260) } }, "val.pe_history")).toBe("watch");
    expect(verdict({ pe: 10 + 130, peHistory: { points: points(260) } }, "val.pe_history")).toBe("neutral");
    // A window that ended over a month ago is not today's baseline.
    expect(verdict({ pe: 10, peHistory: { points: points(260, "2026-09-01") } }, "val.pe_history")).toBe("ineligible");
  });

  it("places the 20th and 80th percentiles on the line", () => {
    const values = Array.from({ length: 10 }, (_, index) => index + 1);
    expect(pePercentile(values, 2.5)).toBe(20);
    expect(pePercentile(values, 8.5)).toBe(80);
  });

  it("calls the median target at 15% either way, with at least five targets", () => {
    expect(verdict({ target: { median: 115, count: 5 } }, "val.target")).toBe("good");
    expect(verdict({ target: { median: 114.99, count: 5 } }, "val.target")).toBe("neutral");
    expect(verdict({ target: { median: 85, count: 5 } }, "val.target")).toBe("watch");
    expect(verdict({ target: { median: 130, count: 4 } }, "val.target")).toBe("ineligible");
  });

  it("calls the ratings on a 10-point change in the buy share over three months, with five ratings each time", () => {
    const ratings = (buyNow: number, buyThen: number, total = 10) => [
      { month: "2026-11", buy: buyNow, hold: total - buyNow, sell: 0 },
      { month: "2026-08", buy: buyThen, hold: total - buyThen, sell: 0 },
    ];
    expect(verdict({ ratings: ratings(6, 5) }, "val.ratings")).toBe("good");
    expect(verdict({ ratings: ratings(4, 5) }, "val.ratings")).toBe("watch");
    expect(verdict({ ratings: ratings(11, 10, 20) }, "val.ratings")).toBe("neutral");
    expect(verdict({ ratings: ratings(4, 2, 4) }, "val.ratings")).toBe("ineligible");
    expect(verdict({ ratings: [{ month: "2026-11", buy: 9, hold: 1, sell: 0 }] }, "val.ratings")).toBe("ineligible");
  });
});

describe("earnings", () => {
  it("calls a beat good, a miss a watch and a match neutral, for a current report only", () => {
    expect(verdict({ lastReport: { date: "2026-11-04", actual: 1.01, estimate: 1 } }, "earn.surprise")).toBe("good");
    expect(verdict({ lastReport: { date: "2026-11-04", actual: 0.99, estimate: 1 } }, "earn.surprise")).toBe("watch");
    expect(verdict({ lastReport: { date: "2026-11-04", actual: 1, estimate: 1 } }, "earn.surprise")).toBe("neutral");
    expect(verdict({ lastReport: { date: "2026-05-01", actual: 2, estimate: 1 } }, "earn.surprise")).toBe("ineligible");
    expect(verdict({ lastReport: { date: "2026-11-04", actual: null, estimate: 1 } }, "earn.surprise")).toBe("ineligible");
  });

  it("writes EPS in the stock's own currency", () => {
    const rupees = buildStockSignals(empty({ currency: "₹", lastReport: { date: "2026-11-04", actual: -0.12, estimate: 0.2 } })).byId["earn.surprise"]!;
    expect(rupees.display).toBe("−₹0.12 vs ₹0.20");
    expect(rupees.display).not.toContain("$");
  });

  it("judges guidance only when it is sourced", () => {
    expect(verdict({}, "earn.guidance")).toBe("ineligible");
    expect(verdict({ guidance: { outcome: "raised", date: "2026-11-04", source: "8-K" } }, "earn.guidance")).toBe("good");
    expect(verdict({ guidance: { outcome: "cut", date: "2026-11-04", source: "8-K" } }, "earn.guidance")).toBe("watch");
    expect(verdict({ guidance: { outcome: "maintained", date: "2026-11-04", source: "8-K" } }, "earn.guidance")).toBe("neutral");
  });

  it("calls the first day against the S&P 500 at 2 points either way", () => {
    const reaction = (stock: number, market: number) => ({ date: "2026-11-05", reportDate: "2026-11-04", stockPct: stock, marketPct: market });
    expect(verdict({ reaction: reaction(3, 1) }, "earn.reaction")).toBe("good");
    expect(verdict({ reaction: reaction(2.99, 1) }, "earn.reaction")).toBe("neutral");
    expect(verdict({ reaction: reaction(-1, 1) }, "earn.reaction")).toBe("watch");
  });

  it("finds the first full session after a report from aligned closes", () => {
    const closes = [
      { date: "2026-11-03", close: 100 },
      { date: "2026-11-04", close: 101 },
      { date: "2026-11-05", close: 110 },
    ];
    const spy = [
      { date: "2026-11-03", close: 500 },
      { date: "2026-11-04", close: 500 },
      { date: "2026-11-05", close: 505 },
    ];
    const after = reportReaction(closes, spy, { date: "2026-11-04", time: "amc" })!;
    expect(after.date).toBe("2026-11-05");
    expect(after.stockPct).toBeCloseTo((110 / 101 - 1) * 100, 6);
    expect(after.marketPct).toBeCloseTo(1, 6);
    expect(reportReaction(closes, spy, { date: "2026-11-04", time: "bmo" })!.date).toBe("2026-11-04");
    expect(reportReaction(closes, spy, { date: "2026-11-04", time: "during" })).toBeNull();
  });

  it("needs two consecutive sessions, never a move over a missing close", () => {
    // Report Thursday Nov 5 after the close; Friday's close is missing, so Monday against Thursday is a multi-day move.
    const closes = [
      { date: "2026-11-05", close: 100 },
      { date: "2026-11-09", close: 120 },
    ];
    const spy = [
      { date: "2026-11-05", close: 500 },
      { date: "2026-11-06", close: 501 },
      { date: "2026-11-09", close: 502 },
    ];
    expect(reportReaction(closes, spy, { date: "2026-11-05", time: "amc" })).toBeNull();
    // Before the open on Monday Nov 9, the prior close must be Friday's, not Thursday's.
    expect(reportReaction(closes, spy, { date: "2026-11-09", time: "bmo" })).toBeNull();
    // A Friday report after the close reads Monday, the next weekday.
    const friday = [
      { date: "2026-11-06", close: 100 },
      { date: "2026-11-09", close: 103 },
    ];
    const fridaySpy = [
      { date: "2026-11-06", close: 500 },
      { date: "2026-11-09", close: 500 },
    ];
    expect(reportReaction(friday, fridaySpy, { date: "2026-11-06", time: "amc" })).toMatchObject({ date: "2026-11-09", reportDate: "2026-11-06" });
  });
});

describe("price trend", () => {
  it("judges nothing against a quote more than a week old", () => {
    expect(verdict({ price: 110, priceAsOf: "2026-11-05", sma50: 100 }, "price.sma50")).toBe("good");
    expect(verdict({ price: 110, priceAsOf: "2026-11-04", sma50: 100 }, "price.sma50")).toBe("ineligible");
    expect(verdict({ price: 110, priceAsOf: null, target: { median: 140, count: 9 } }, "val.target")).toBe("ineligible");
  });

  it("calls each average at 2% either way", () => {
    expect(verdict({ price: 102, sma50: 100 }, "price.sma50")).toBe("good");
    expect(verdict({ price: 101.99, sma50: 100 }, "price.sma50")).toBe("neutral");
    expect(verdict({ price: 98, sma200: 100 }, "price.sma200")).toBe("watch");
  });

  it("watches RSI at either extreme and never calls it good", () => {
    expect(verdict({ rsi: 70 }, "price.rsi")).toBe("watch");
    expect(verdict({ rsi: 69.9 }, "price.rsi")).toBe("neutral");
    expect(verdict({ rsi: 30 }, "price.rsi")).toBe("watch");
    expect(verdict({ rsi: 30.1 }, "price.rsi")).toBe("neutral");
  });

  it("watches a price 20% under its 52-week high", () => {
    expect(verdict({ price: 80, high52: 100 }, "price.off_high")).toBe("watch");
    expect(verdict({ price: 80.01, high52: 100 }, "price.off_high")).toBe("neutral");
  });

  it("calls the year against the S&P 500 at 5 points either way, from current closes", () => {
    const year = (stock: number, market: number, to = "2026-11-11") => ({ from: "2025-11-11", to, stockPct: stock, marketPct: market });
    expect(verdict({ oneYear: year(15, 10) }, "price.vs_sp500")).toBe("good");
    expect(verdict({ oneYear: year(14.99, 10) }, "price.vs_sp500")).toBe("neutral");
    expect(verdict({ oneYear: year(5, 10) }, "price.vs_sp500")).toBe("watch");
    expect(verdict({ oneYear: year(50, 10, "2026-10-01") }, "price.vs_sp500")).toBe("ineligible");
  });

  it("aligns the year on dates both series have", () => {
    const day = (offset: number) => new Date(Date.parse("2026-11-11T00:00:00Z") - offset * 86_400_000).toISOString().slice(0, 10);
    const stock = [{ date: day(366), close: 100 }, { date: day(0), close: 120 }];
    const spy = [{ date: day(366), close: 500 }, { date: day(0), close: 550 }];
    const result = alignedOneYear(stock, spy)!;
    expect(result.stockPct).toBeCloseTo(20, 6);
    expect(result.marketPct).toBeCloseTo(10, 6);
    // A start more than a week before the year mark is a gap, not a year.
    expect(alignedOneYear([{ date: day(400), close: 100 }, stock[1]!], [{ date: day(400), close: 500 }, spy[1]!])).toBeNull();
  });
});

describe("ownership", () => {
  const trade = (id: string, action: "buy" | "sell", valueUsd: number | null, planned = false, date = "2026-10-01") => ({ id, action, valueUsd, planned, date });

  it("weighs unplanned insider buys against sells by dollars over 90 days", () => {
    expect(verdict({ insiders: [trade("a", "buy", 2_000_000), trade("b", "sell", 1_000_000)] }, "own.insiders")).toBe("good");
    expect(verdict({ insiders: [trade("a", "buy", 1_000_000), trade("b", "sell", 2_000_000)] }, "own.insiders")).toBe("watch");
    expect(verdict({ insiders: [trade("a", "buy", 1_000_000), trade("b", "sell", 1_000_000)] }, "own.insiders")).toBe("neutral");
    expect(verdict({ insiders: [] }, "own.insiders")).toBe("neutral");
  });

  it("leaves out planned trades and older ones, counts a filing once, and needs every value", () => {
    expect(verdict({ insiders: [trade("a", "buy", 100), trade("b", "sell", 10_000_000, true)] }, "own.insiders")).toBe("good");
    expect(verdict({ insiders: [trade("a", "buy", 100), trade("b", "sell", 10_000_000, false, "2026-07-01")] }, "own.insiders")).toBe("good");
    expect(verdict({ insiders: [trade("a", "buy", 300), trade("b", "sell", 200), trade("b", "sell", 200)] }, "own.insiders")).toBe("good");
    expect(verdict({ insiders: [trade("a", "buy", 300), trade("b", "sell", null)] }, "own.insiders")).toBe("ineligible");
  });

  it("counts followed funds adding against trimming in their latest quarter only", () => {
    const row = (fund: string, action: "new" | "added" | "trimmed" | "held" | "exited", quarter = "2026-09-30") => ({ fund, action, quarter });
    expect(verdict({ funds: [row("a", "added"), row("b", "new"), row("c", "trimmed")] }, "own.funds")).toBe("good");
    expect(verdict({ funds: [row("a", "added"), row("c", "trimmed"), row("d", "exited")] }, "own.funds")).toBe("watch");
    expect(verdict({ funds: [row("a", "added"), row("c", "trimmed")] }, "own.funds")).toBe("neutral");
    // Another quarter's filings are a different period: only the quarter most funds have filed for counts.
    expect(verdict({ funds: [row("a", "added"), row("b", "added"), row("c", "trimmed", "2026-06-30")] }, "own.funds")).toBe("good");
    // Two early filers for the new quarter do not outweigh the full quarter before it.
    const early = [row("a", "added"), row("b", "held"), row("c", "trimmed", "2026-06-30"), row("d", "trimmed", "2026-06-30"), row("e", "added", "2026-06-30")];
    expect(verdict({ funds: early }, "own.funds")).toBe("watch");
    // On a tie, the newer quarter.
    expect(verdict({ funds: [row("a", "added"), row("c", "trimmed", "2026-06-30")] }, "own.funds")).toBe("good");
    expect(verdict({ funds: [] }, "own.funds")).toBe("ineligible");
  });
});

describe("news", () => {
  const event = (id: string, effect: "favorable" | "adverse" | "mixed", verified = true, date = "2026-11-10") => ({ id, date, source: "8-K", role: "issuer", effect, verified, title: "FDA approval" });

  it("judges only a verified company event, never a headline's tone", () => {
    expect(verdict({}, "news.event")).toBe("ineligible");
    expect(verdict({ newsEvents: [event("a", "favorable", false)] }, "news.event")).toBe("ineligible");
    expect(verdict({ newsEvents: [event("a", "favorable")] }, "news.event")).toBe("good");
    expect(verdict({ newsEvents: [event("a", "adverse")] }, "news.event")).toBe("watch");
    expect(verdict({ newsEvents: [event("a", "mixed")] }, "news.event")).toBe("neutral");
  });

  it("counts one event covered twice once", () => {
    const result = buildStockSignals(empty({ newsEvents: [event("a", "adverse"), event("a", "adverse")] }));
    expect(result.tally?.watch).toBe(1);
  });
});

describe("rivals", () => {
  it("ranks the top third good and the bottom third a watch, with a tie across a boundary neutral", () => {
    expect(peerRank(30, [10, 20, 5], "higher").verdict).toBe("good");
    expect(peerRank(1, [10, 20, 5], "higher").verdict).toBe("watch");
    expect(peerRank(10, [10, 20, 5, 30, 1], "higher").verdict).toBe("neutral");
    // Tied for first and second of six: the top third is two places, so the tie stays inside it.
    expect(peerRank(30, [30, 20, 10, 5, 1], "higher").verdict).toBe("good");
    // Tied at the edge of the top third (second and third of six): crosses the boundary.
    expect(peerRank(20, [30, 20, 10, 5, 1], "higher").verdict).toBe("neutral");
    expect(peerRank(8, [12, 20, 30], "lower").verdict).toBe("good");
  });

  it("needs three peers with the metric, and a positive P/E", () => {
    expect(verdict({ self: { revenueGrowth: 30, pe: null }, peers: [{ ticker: "A", revenueGrowth: 10, pe: null }, { ticker: "B", revenueGrowth: 5, pe: null }] }, "peers.revenue_growth")).toBe("ineligible");
    const peers = [
      { ticker: "A", revenueGrowth: 10, pe: 20 },
      { ticker: "B", revenueGrowth: 5, pe: 25 },
      { ticker: "C", revenueGrowth: 1, pe: -4 },
      { ticker: "D", revenueGrowth: 2, pe: 30 },
    ];
    expect(verdict({ self: { revenueGrowth: 30, pe: 12 }, peers }, "peers.revenue_growth")).toBe("good");
    expect(verdict({ self: { revenueGrowth: 30, pe: 12 }, peers }, "peers.pe")).toBe("good");
    expect(verdict({ self: { revenueGrowth: 30, pe: -3 }, peers }, "peers.pe")).toBe("ineligible");
  });
});

describe("the tally", () => {
  const goodies: Partial<StockSignalsInput> = { price: 110, sma50: 100, sma200: 100, target: { median: 140, count: 9 } };

  it("counts each signal once, names the first by priority, and dots each tab", () => {
    const result = buildStockSignals(empty({ ...goodies, rsi: 75, lastReport: { date: "2026-11-04", actual: 2, estimate: 1 } }));
    expect(result.tally).toMatchObject({ good: 4, watch: 1 });
    // Earnings come first in the priority, then valuation, then price.
    expect(result.tally!.topGood).toEqual({ id: "earn.surprise", name: "Earnings beat" });
    expect(result.tally!.topWatch).toEqual({ id: "price.rsi", name: "RSI over 70" });
    expect(result.tabs.technicals).toEqual({ good: 2, watch: 1, dot: "good" });
    expect(result.tabs.valuation.dot).toBe("good");
    expect(result.tabs.news.dot).toBeNull();
  });

  it("keeps the counts as observations and never sets them against the call", () => {
    // Related measures (both averages) are not independent votes, so the tally carries no verdict on the call.
    const tally = buildStockSignals(empty({ price: 70, sma50: 100, sma200: 100, high52: 100 })).tally!;
    expect(Object.keys(tally).sort()).toEqual(["good", "topGood", "topWatch", "watch"]);
    expect(tally.watch).toBe(3);
  });

  it("puts a tie on a tab without a dot", () => {
    const result = buildStockSignals(empty({ price: 102, sma50: 100, sma200: 104.1 }));
    expect(result.tabs.technicals).toEqual({ good: 1, watch: 1, dot: null });
  });

  it("uses the council's thresholds", () => {
    expect(RULES).toMatchObject({ revenueGood: 5, earningsChange: 5, marginPoints: 2, peSectorGap: 20, peHistoryMinDays: 252, targetGap: 15, targetMinCount: 5, ratingsPoints: 10, reactionPoints: 2, averageGap: 2, rsiHigh: 70, rsiLow: 30, offHigh: -20, vsMarketPoints: 5, insiderDays: 90 });
  });
});
