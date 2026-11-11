import { describe, expect, it } from "vitest";

import { parseByRules } from "@/lib/agents-plain/parse";
import { buildCatalog } from "@/lib/agents-plain/stocks";
import type { ScreenerRow } from "@/lib/screener-shared";
import { buildXray, type FundDoc } from "@/lib/xray";

import { buildLosses, similarFunds, similarStocks } from "./losses";
import { buildIdeasRead } from "./read";
import { COMPANY_LINE, TRIM_MIN_POINTS, TRIM_MIN_USD, buildRebalance } from "./rebalance";
import { DEFAULT_RATES, parseRates, saleTax } from "./tax";
import type { IdeaHolding, IdeasResult, RebalancePlan } from "./types";
import { fmtPct } from "./words";
import { dropRequest, levelBelow, watchDropHref, watchDropsHref } from "./watch";

const TODAY = "2026-11-11";
const RATES = DEFAULT_RATES;

function holding(partial: Partial<IdeaHolding> & { ticker: string; shares: number; price: number; cost?: number; acquired?: string | null }): IdeaHolding {
  const { cost, acquired = "2026-02-03", ...rest } = partial;
  return {
    name: partial.ticker,
    instrumentId: `US_${partial.ticker}`,
    fund: false,
    value: partial.shares * partial.price,
    lots: cost !== undefined ? [{ acquired, shares: partial.shares, costPerShare: cost }] : [],
    basis: cost !== undefined ? "saved" : "none",
    recentBuys: [],
    call: null,
    callReason: null,
    sector: null,
    industry: null,
    marketCap: null,
    ret1y: null,
    ...rest,
  };
}

function xrayOf(holdings: IdeaHolding[], sectors: Record<string, string>, bench: Record<string, number> = {}, funds: Record<string, FundDoc> = {}) {
  return buildXray(
    holdings.map((h) => ({ ticker: h.ticker, name: h.name, value: h.value, looksLikeFund: h.fund })),
    { funds, sectorOf: sectors, benchmarkSectors: bench },
  );
}

describe("tax on a sale", () => {
  it("sells the oldest shares first and splits the gain by term", () => {
    const lots = [
      { acquired: "2024-01-10", shares: 10, costPerShare: 50 },
      { acquired: "2026-06-01", shares: 10, costPerShare: 90 },
    ];
    const tax = saleTax(lots, 15, 100, TODAY, RATES)!;
    expect(tax.long).toBeCloseTo(500);
    expect(tax.short).toBeCloseTo(50);
    expect(tax.tax).toBeCloseTo(500 * 0.15 + 50 * 0.24);
    expect(tax.unmatchedShares).toBe(0);
  });

  it("highest-cost first keeps the gain smaller", () => {
    const lots = [
      { acquired: "2024-01-10", shares: 10, costPerShare: 50 },
      { acquired: "2026-06-01", shares: 10, costPerShare: 90 },
    ];
    expect(saleTax(lots, 10, 100, TODAY, RATES, "highest")!.gain).toBeCloseTo(100);
  });

  it("counts shares beyond the lots as unmatched and a loss as negative tax", () => {
    const tax = saleTax([{ acquired: "2026-01-02", shares: 5, costPerShare: 120 }], 8, 100, TODAY, RATES)!;
    expect(tax.unmatchedShares).toBe(3);
    expect(tax.tax).toBeLessThan(0);
  });

  it("says when waiting turns a gain long term within 90 days", () => {
    const tax = saleTax([{ acquired: "2026-01-20", shares: 10, costPerShare: 50 }], 10, 100, TODAY, RATES)!;
    expect(tax.waitUntil).toBe("2027-01-21");
    expect(tax.waitTax).toBeCloseTo(500 * 0.15);
    expect(saleTax([{ acquired: "2026-06-20", shares: 10, costPerShare: 50 }], 10, 100, TODAY, RATES)!.waitUntil).toBeNull();
  });

  it("treats an undated lot as short term", () => {
    const tax = saleTax([{ acquired: null, shares: 10, costPerShare: 50 }], 10, 100, TODAY, RATES)!;
    expect(tax.unknown).toBeCloseTo(500);
    expect(tax.tax).toBeCloseTo(120);
  });

  it("reads rates from the address and ignores anything off the list", () => {
    expect(parseRates({ short: "32", long: "20" })).toEqual({ short: 32, long: 20 });
    expect(parseRates({ short: "99", long: ["0"] })).toEqual({ short: 24, long: 0 });
    expect(parseRates({})).toEqual(DEFAULT_RATES);
  });
});

describe("rebalancing ideas", () => {
  it("trims a company over the line back to it, in whole shares", () => {
    const holdings = [
      holding({ ticker: "NVDA", shares: 100, price: 200, cost: 150, call: "Trim" }), // 20,000
      ...["A", "B", "C", "D", "E", "F", "G", "H"].map((t) => holding({ ticker: t, shares: 100, price: 100, cost: 100 })), // 8 x 10,000
    ];
    const xray = xrayOf(holdings, { NVDA: "Technology" });
    const plan = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
    const trim = plan.trims.find((t) => t.ticker === "NVDA")!;
    expect(trim.kind).toBe("company");
    expect(trim.before).toBeCloseTo(20);
    expect(trim.shares).toBe(50); // (20% - 10%) of 100,000 = 10,000 / $200
    expect(trim.after).toBeCloseTo(COMPANY_LINE);
    expect(trim.reached).toBe(true);
    expect(trim.tax!.gain).toBeCloseTo(50 * 50);
    expect(trim.sentence).toBe("Selling about 50 NVDA shares would bring it from 20% to 10% of your portfolio.");
  });

  it("never sells more than half a holding, and says so", () => {
    const holdings = [holding({ ticker: "BIG", shares: 10, price: 1000, cost: 900 }), holding({ ticker: "S", shares: 10, price: 100, cost: 100 })];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    const trim = plan.trims[0]!;
    expect(trim.shares).toBe(5);
    expect(trim.reached).toBe(false);
    expect(trim.sentence).toContain("half the holding");
  });

  it("never trims a fund", () => {
    const holdings = [holding({ ticker: "VOO", shares: 100, price: 600, fund: true }), holding({ ticker: "X", shares: 10, price: 100 })];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims.some((t) => t.ticker === "VOO")).toBe(false);
  });

  it("trims a tilted sector from Sell some before no call, never Keep or Buy more, then adds to Buy more elsewhere", () => {
    const tech = { sector: "Technology" };
    // Six tech names at 10% each (60% against 35% for the index), none over the company line.
    const holdings = [
      holding({ ticker: "T1", shares: 50, price: 100, cost: 80, call: "Add", ...tech }),
      holding({ ticker: "T2", shares: 50, price: 100, cost: 80, ...tech }),
      holding({ ticker: "T3", shares: 50, price: 100, cost: 80, call: "Trim", ...tech }),
      holding({ ticker: "T4", shares: 50, price: 100, cost: 80, call: "Hold", ...tech }),
      holding({ ticker: "T5", shares: 50, price: 100, cost: 80, call: "Add", ...tech }),
      holding({ ticker: "T6", shares: 50, price: 100, cost: 80, call: "Add", ...tech }),
      holding({ ticker: "H1", shares: 20, price: 100, cost: 100, call: "Add", sector: "Health Care" }),
      ...["E1", "E2", "E3", "E4"].map((t) => holding({ ticker: t, shares: 45, price: 100, cost: 100, call: "Hold", sector: "Energy" })),
    ];
    const sectors = Object.fromEntries(holdings.map((h) => [h.ticker, h.sector!]));
    const xray = xrayOf(holdings, sectors, { Technology: 35, "Health Care": 10, Energy: 30 });
    const plan = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
    const sectorTrims = plan.trims.filter((t) => t.kind === "sector");
    expect(sectorTrims.map((t) => t.ticker)).toEqual(["T3", "T2"]);
    expect(sectorTrims[0]!.shares).toBe(25);
    expect(plan.trims.some((t) => t.call === "Hold" || t.call === "Add")).toBe(false);
    expect(plan.sectors[0]!.sector).toBe("Technology");
    expect(plan.sectors[0]!.after).toBeLessThan(plan.sectors[0]!.before);
    // H1 (Buy more, Health Care under its weight) gets the money, but never above the 8% ceiling.
    const add = plan.adds.find((a) => a.ticker === "H1")!;
    expect(add).toBeTruthy();
    expect(add.after).toBeLessThanOrEqual(8.01);
    expect(plan.leftover).toBeCloseTo(plan.proceeds - add.amount);
  });

  it("says doing nothing is fine when nothing is out of line", () => {
    const holdings = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((t) => holding({ ticker: t, shares: 10, price: 100, cost: 100 }));
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "example" });
    expect(plan.trims).toEqual([]);
    expect(plan.quiet).toMatch(/fine answer/);
  });

  it("finds a holding that drifted well past its share of the money put in", () => {
    const holdings = [
      holding({ ticker: "RUN", shares: 10, price: 900, cost: 300, call: "Trim" }), // 3,000 in, 9,000 now
      ...["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((t) => holding({ ticker: t, shares: 10, price: 100, cost: 110 })),
    ];
    // RUN is 9,000 of 19,000: it trips the company line first, so it gets one idea, not two.
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims[0]!.ticker).toBe("RUN");
    // Not double-counted as a drift idea too.
    expect(plan.trims.filter((t) => t.ticker === "RUN")).toHaveLength(1);
  });
});

describe("tax-loss ideas", () => {
  const universe: ScreenerRow[] = [
    { symbol: "UNH", name: "UnitedHealth Group", industry: "Healthcare Plans", sector: "Health Care", market_cap: 300e9, ret_1y: -30, call: "Hold" },
    { symbol: "CI", name: "Cigna Group", industry: "Healthcare Plans", sector: "Health Care", market_cap: 80e9, ret_1y: -5, call: "Add" },
    { symbol: "ELV", name: "Elevance Health", industry: "Healthcare Plans", sector: "Health Care", market_cap: 90e9, ret_1y: -20, call: "Trim" },
    { symbol: "TINY", name: "Tiny Health", industry: "Healthcare Plans", sector: "Health Care", market_cap: 1e9, call: "Hold" },
    { symbol: "ABT", name: "Abbott", industry: "Medical Devices", sector: "Health Care", market_cap: 200e9, call: "Hold" },
  ];
  const unh = holding({
    ticker: "UNH",
    name: "UnitedHealth",
    shares: 12,
    price: 300,
    cost: 360,
    acquired: "2026-06-22",
    call: null,
    sector: "Health Care",
    industry: "Healthcare Plans",
    marketCap: 300e9,
    ret1y: -30,
  });

  it("lists a real loss with its term, the tax it could save and when to buy back", () => {
    const [loss] = buildLosses({ holdings: [unh], universe, funds: {}, rates: RATES, today: TODAY });
    expect(loss!.loss).toBeCloseTo(-720);
    expect(loss!.term).toBe("short");
    expect(loss!.taxSaved).toBeCloseTo(720 * 0.24);
    expect(loss!.buyBackFrom).toBe("2026-12-12");
    expect(loss!.recentBuy).toBeNull();
    expect(loss!.watch!.href).toBe("/agents?q=Tell%20me%20if%20UNH%20drops%20below%20%24285");
  });

  it("skips small losses and gains", () => {
    const small = { ...unh, lots: [{ acquired: "2026-06-22", shares: 12, costPerShare: 305 }] };
    expect(buildLosses({ holdings: [small], universe, funds: {}, rates: RATES, today: TODAY })).toEqual([]);
  });

  it("flags a buy in the last 30 days as a possible wash sale", () => {
    const [loss] = buildLosses({ holdings: [{ ...unh, recentBuys: ["2026-10-30"] }], universe, funds: {}, rates: RATES, today: TODAY });
    expect(loss!.recentBuy).toBe("2026-10-30");
  });

  it("picks look-alikes in the same industry and size, never our Sell some calls", () => {
    const picks = similarStocks(unh, universe, new Set(["UNH"]));
    expect(picks.map((p) => p.ticker)).toEqual(["CI", "ABT"]);
    expect(picks[1]!.why).toContain("Also in Health Care, in Medical Devices");
    expect(picks.some((p) => p.ticker === "ELV")).toBe(false);
    expect(picks.some((p) => p.ticker === "TINY")).toBe(false);
    expect(picks[0]!.why).toContain("Also in Healthcare Plans");
    expect(picks[0]!.why).toContain("$80B against $300B");
  });

  it("names no look-alike without data", () => {
    expect(similarStocks({ ...unh, marketCap: null }, universe, new Set())).toEqual([]);
  });

  it("offers overlapping funds but never one on the same index", () => {
    const fund = (ticker: string, holdings: Array<[string, number]>): FundDoc => ({
      ticker,
      fundName: `${ticker} fund`,
      asOf: "2026-06-30",
      filedAt: null,
      sourceUrl: null,
      status: "ok",
      note: null,
      holdings: holdings.map(([t, weight]) => ({ ticker: t, name: t, weight })),
    });
    const funds = {
      VOO: fund("VOO", [["AAPL", 0.5], ["MSFT", 0.5]]),
      IVV: fund("IVV", [["AAPL", 0.5], ["MSFT", 0.5]]),
      VTI: fund("VTI", [["AAPL", 0.4], ["MSFT", 0.4], ["XOM", 0.2]]),
      XLE: fund("XLE", [["XOM", 1]]),
    };
    const picks = similarFunds("VOO", funds, new Set());
    expect(picks.map((p) => p.ticker)).toEqual(["VTI"]);
    expect(picks[0]!.why).toMatch(/^80% of the two funds/);
  });
});

describe("watch link", () => {
  const catalog = buildCatalog([{ ticker: "UNH", name: "UnitedHealth Group", aliases: ["UNH", "UnitedHealth"], price: 300 }]);

  it("is read by the agents page as one price-below agent", () => {
    const request = dropRequest("UNH", 300, 5)!;
    expect(request).toBe("Tell me if UNH drops below $285");
    const result = parseByRules(request, catalog, { hidden: [] });
    expect(result.spec.watches).toHaveLength(1);
    expect(result.spec.watches[0]!.draft.trigger).toMatchObject({ type: "price" });
    expect(result.spec.cannot).toEqual([]);
  });

  it("keeps cents below $20 and refuses nonsense", () => {
    expect(levelBelow(10, 5)).toBe(9.5);
    expect(dropRequest("UNH", 0)).toBeNull();
    expect(watchDropHref("not a ticker", 100)).toBeNull();
  });

  it("asks for every loss in one request the agents page reads as one agent per stock", () => {
    const many = buildCatalog([
      { ticker: "UNH", name: "UnitedHealth Group", aliases: ["UNH", "UnitedHealth"], price: 300 },
      { ticker: "PYPL", name: "PayPal", aliases: ["PYPL", "PayPal"], price: 60 },
      { ticker: "NKE", name: "Nike", aliases: ["NKE", "Nike"], price: 70 },
    ]);
    const href = watchDropsHref([{ ticker: "UNH", price: 300 }, { ticker: "PYPL", price: 60 }, { ticker: "NKE", price: 70 }, { ticker: "UNH", price: 300 }])!;
    const request = decodeURIComponent(href.replace("/agents?q=", ""));
    expect(request).toBe("Tell me if UNH drops below $285, PYPL drops below $57 or NKE drops below $67");
    const result = parseByRules(request, many, { hidden: [] });
    expect(result.spec.watches.map((watch) => watch.draft.scope)).toEqual([
      { kind: "tickers", tickers: ["UNH"] },
      { kind: "tickers", tickers: ["PYPL"] },
      { kind: "tickers", tickers: ["NKE"] },
    ]);
    expect(result.spec.cannot).toEqual([]);
    expect(watchDropsHref([{ ticker: "UNH", price: 300 }])).toBe(watchDropHref("UNH", 300));
    expect(watchDropsHref([])).toBeNull();
  });
});

describe("the read", () => {
  it("leads with doing nothing when there is nothing to do", () => {
    const holdings = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((t) => holding({ ticker: t, shares: 10, price: 100, cost: 100 }));
    const xray = xrayOf(holdings, {});
    const plan = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
    const result: IdeasResult = { subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" };
    const read = buildIdeasRead(result)!;
    expect(read.headline).toBe("Nothing needs rebalancing, and no holding is far enough below its cost to be worth selling for tax.");
    expect(read.insights[0]!.id).toBe("quiet");
  });

  it("names the company and the tax on the lead trim", () => {
    const holdings = [
      holding({ ticker: "NVDA", name: "NVIDIA", shares: 100, price: 200, cost: 150, call: "Trim" }),
      ...["A", "B", "C", "D", "E", "F", "G", "H"].map((t) => holding({ ticker: t, shares: 100, price: 100, cost: 100 })),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("NVIDIA is 20% of your portfolio once the funds are counted, above the 10% line we use for one company.");
    expect(read.insights[0]!.text).toContain("about $600 at the 24% short-term rate");
    expect(read.insights[0]!.soWhat).toBe("Our call on it is Sell some.");
  });

  it("never says Keep and sell at once: a Keep call above the line is named, not sold", () => {
    // The owner's Microsoft case: "Our call is to keep it" next to "See where to sell some".
    const holdings = [
      holding({ ticker: "MSFT", name: "Microsoft", shares: 100, price: 200, cost: 150, call: "Hold", callReason: "Cloud demand still growing." }),
      ...["A", "B", "C", "D", "E", "F", "G", "H"].map((t) => holding({ ticker: t, shares: 100, price: 100, cost: 100 })),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.buyMoreOver).toEqual([{ ticker: "MSFT", name: "Microsoft", pct: 20, callReason: "Cloud demand still growing.", call: "Hold" }]);
    expect(plan.quiet).toBe(
      "Your portfolio is concentrated, with Microsoft at 20%, above the 10% line, but our call on MSFT is Keep and we would not sell it, so doing nothing is a fine answer.",
    );
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("Microsoft is 20% of your portfolio, but our call is Keep, so we would not sell.");
    const all = `${read.headline} ${read.insights.map((i) => `${i.text} ${i.soWhat ?? ""}`).join(" ")}`;
    expect(all).not.toMatch(/sell some|selling about/i);
  });
});

describe("edge cases from the quality pass", () => {
  const filler = (n: number, value = 1000) =>
    Array.from({ length: n }, (_, i) => holding({ ticker: `F${i}`, shares: 10, price: value / 10, cost: value / 10 }));

  it("never calls a 50% holding fine when it cannot be sized", () => {
    const big = { ...holding({ ticker: "AAPL", name: "Apple", shares: 0, price: 100 }), shares: null, value: 10_000, lots: [] };
    const holdings = [big, ...filler(10)];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.unsized.map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(plan.quiet).toContain("no share count and price");
    expect(plan.quiet).not.toMatch(/fine answer/);
  });

  it("sells across share classes of one company until it reaches the line", () => {
    const holdings = [
      holding({ ticker: "GOOGL", name: "Alphabet", shares: 30, price: 100, cost: 90 }),
      holding({ ticker: "GOOG", name: "Alphabet", shares: 30, price: 100, cost: 90 }),
      ...filler(14),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    // 6,000 of 20,000 is 30%; reaching 10% needs 4,000 sold, more than half of one class.
    const sold = plan.trims.filter((t) => t.subject === "Alphabet");
    expect(sold.map((t) => t.ticker).sort()).toEqual(["GOOG", "GOOGL"]);
    expect(sold.reduce((sum, t) => sum + t.amount, 0)).toBeCloseTo(3000);
    expect(sold[0]!.sentence).toContain("Alphabet (");
  });

  it("gives ideas for the biggest three companies and names the rest", () => {
    const holdings = Array.from({ length: 6 }, (_, i) => holding({ ticker: `B${i}`, shares: 10, price: 100 + i, cost: 100 }));
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(new Set(plan.trims.map((t) => t.subject)).size).toBe(3);
    expect(plan.moreOver).toHaveLength(3);
  });

  it("reports only the sectors the trims move", () => {
    // Technology tilted, but every stock in it is a Buy more call, so nothing moves it.
    const holdings = [
      ...Array.from({ length: 6 }, (_, i) => holding({ ticker: `T${i}`, shares: 10, price: 100, cost: 100, call: "Add", sector: "Technology" })),
      ...Array.from({ length: 4 }, (_, i) => holding({ ticker: `E${i}`, shares: 10, price: 100, cost: 100, sector: "Energy" })),
    ];
    const sectors = Object.fromEntries(holdings.map((h) => [h.ticker, h.sector!]));
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, sectors, { Technology: 35, Energy: 30 }), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.sectors).toEqual([]);
    expect(plan.quiet).toContain("Technology");
  });

  it("never adds to a stock listed as a loss to sell", () => {
    const holdings = [
      holding({ ticker: "BIG", shares: 30, price: 100, cost: 50, call: "Trim" }),
      holding({ ticker: "ADD", shares: 5, price: 100, cost: 150, call: "Add" }),
      ...filler(15),
    ];
    const xray = xrayOf(holdings, {});
    const free = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
    expect(free.adds.map((a) => a.ticker)).toContain("ADD");
    const avoided = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine", avoidAdds: new Set(["ADD"]) });
    expect(avoided.adds.map((a) => a.ticker)).not.toContain("ADD");
  });

  it("marks a recent day that is only a save date", () => {
    const unh = holding({ ticker: "UNH", shares: 10, price: 90, cost: 100, acquired: "2026-11-01", recentBuys: ["2026-11-01"] });
    const [loss] = buildLosses({ holdings: [unh], universe: [], funds: {}, rates: RATES, today: TODAY });
    expect(loss!.recentIsSave).toBe(true);
    expect(loss!.similar).toEqual([]);
  });
});

describe("tax netting across short and long parts", () => {
  it("offsets a short-term loss against a long-term gain before applying rates", async () => {
    const { nettedTax } = await import("./tax");
    expect(nettedTax(-1000, 1000, { short: 24, long: 15 })).toBe(0);
    expect(nettedTax(-400, 1000, { short: 24, long: 15 })).toBeCloseTo(90);
    expect(nettedTax(1000, -1000, { short: 24, long: 15 })).toBe(0);
    expect(nettedTax(500, 500, { short: 24, long: 15 })).toBeCloseTo(195);
    expect(nettedTax(-200, -100, { short: 24, long: 15 })).toBeCloseTo(-63);
  });
});

describe("the owner's portfolio: no contradictions on a card", () => {
  // Like the owner's own: TSM 13% Buy more, NVDA 17% Keep (19% with a fund's NVDA), GOOGL 13% Sell some,
  // AVGO just over the line (Sell some), a small ORCL (Sell some), and a Nasdaq-style fund full of Technology.
  const qqq: FundDoc = {
    ticker: "QQQ",
    fundName: "Nasdaq fund",
    asOf: "2026-06-30",
    filedAt: null,
    sourceUrl: null,
    status: "ok",
    note: null,
    holdings: [
      { ticker: "AAPL", name: "Apple", weight: 0.4 },
      { ticker: "MSFT", name: "Microsoft", weight: 0.4 },
      { ticker: "NVDA", name: "NVIDIA", weight: 0.1 },
      { ticker: "PEP", name: "PepsiCo", weight: 0.1 },
    ],
  };
  const tech = { sector: "Technology" };
  const holdings = [
    holding({ ticker: "TSM", name: "Taiwan Semiconductor", shares: 65, price: 200, cost: 196.5, call: "Add", ...tech }), // 13,000
    holding({ ticker: "NVDA", name: "NVIDIA", shares: 100, price: 170, cost: 120, call: "Hold", ...tech }), // 17,000
    holding({ ticker: "ORCL", name: "Oracle", shares: 25, price: 200, cost: 180, call: "Trim", ...tech }), // 5,000
    holding({ ticker: "GOOGL", name: "Alphabet", shares: 100, price: 130, cost: 100, call: "Trim", sector: "Communication Services" }), // 13,000
    holding({ ticker: "AVGO", name: "Broadcom", shares: 50, price: 230, cost: 200, call: "Trim", ...tech }), // 11,500
    holding({ ticker: "QQQ", name: "Nasdaq fund", shares: 40, price: 500, fund: true }), // 20,000
    holding({ ticker: "XOM", name: "Exxon", shares: 65, price: 100, cost: 100, call: "Hold", sector: "Energy" }), // 6,500
    holding({ ticker: "JNJ", name: "Johnson & Johnson", shares: 40, price: 150, cost: 150, call: "Add", sector: "Health Care" }), // 6,000
    holding({ ticker: "LLY", name: "Eli Lilly", shares: 10, price: 800, cost: 800, call: "Hold", sector: "Health Care" }), // 8,000
  ];
  const sectors = {
    ...Object.fromEntries(holdings.filter((h) => !h.fund).map((h) => [h.ticker, h.sector!])),
    AAPL: "Technology",
    MSFT: "Technology",
    PEP: "Consumer Staples",
  };
  const bench = { Technology: 33, "Communication Services": 9, Energy: 3, "Health Care": 10, "Consumer Staples": 6 };
  const xray = xrayOf(holdings, sectors, bench, { QQQ: qqq });
  const plan = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
  const pctIn = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => `${m[1]}%`);

  it("never sells a Buy more or Keep call, and names it as information instead", () => {
    expect(plan.trims.some((t) => t.call === "Add" || t.call === "Hold")).toBe(false);
    expect(plan.trims.some((t) => t.ticker === "TSM" || t.ticker === "NVDA")).toBe(false);
    expect(plan.buyMoreOver.map((row) => [row.ticker, row.call])).toEqual([
      ["NVDA", "Hold"],
      ["TSM", "Add"],
    ]);
    expect(plan.buyMoreOver[0]!.pct).toBeCloseTo(19);
    expect(plan.buyMoreOver[1]!.pct).toBeCloseTo(13);
    // Broadcom's own 1.5-point trim was too small, but it was trimmed for Technology, so it is not listed as left out.
    expect(plan.trims.some((t) => t.ticker === "AVGO")).toBe(true);
    expect(plan.small).toEqual([]);
  });

  it("puts every percentage on a card on one base: today's portfolio, funds counted", () => {
    expect(plan.trims.length).toBeGreaterThan(0);
    for (const trim of plan.trims) {
      // The weight the card starts from is the x-ray's weight today, for the company or the sector.
      const today =
        trim.kind === "sector"
          ? xray.sectors.find((row) => row.sector === trim.subject)!.pct
          : trim.kind === "company"
            ? xray.companies.find((row) => row.name === trim.subject)!.pct
            : trim.before;
      expect(trim.before).toBeCloseTo(today);
      // "After" is this one sale on its own, so before - after is the sale's share of the portfolio.
      expect(trim.before - trim.after).toBeCloseTo((trim.amount / plan.total) * 100);
      // The headline sentence and the explanation quote the same "now".
      expect(pctIn(trim.sentence).slice(0, 2)).toEqual([fmtPct(trim.before), fmtPct(trim.after)]);
      if (trim.kind !== "drift") expect(pctIn(trim.why)[0]).toBe(fmtPct(trim.before));
    }
    const techTrims = plan.trims.filter((t) => t.kind === "sector" && t.subject === "Technology");
    expect(techTrims.length).toBeGreaterThan(0);
    for (const trim of techTrims) expect(fmtPct(trim.before)).toBe(fmtPct(xray.sectors.find((row) => row.sector === "Technology")!.pct));
  });

  it("drops trims too small to matter and keeps the rest above the minimum", () => {
    for (const trim of plan.trims) {
      expect(trim.amount).toBeGreaterThanOrEqual(TRIM_MIN_USD);
      expect((trim.amount / plan.total) * 100).toBeGreaterThanOrEqual(TRIM_MIN_POINTS);
    }
  });

  it("reports the sector's combined move separately from the cards", () => {
    const shift = plan.sectors.find((row) => row.sector === "Technology")!;
    expect(shift.before).toBeCloseTo(xray.sectors.find((row) => row.sector === "Technology")!.pct);
    const techSold = plan.trims.filter((t) => ["TSM", "NVDA", "ORCL", "AVGO"].includes(t.ticker)).reduce((sum, t) => sum + t.amount, 0);
    expect(shift.after).toBeCloseTo(shift.before - (techSold / plan.total) * 100);
  });

  it("explains the Keep name in the read without a sale, and keeps the headline short", () => {
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline.split(/\s+/).length).toBeLessThanOrEqual(18);
    // Led by the biggest company over the line, whatever order the trims come in.
    expect(read.headline).toBe("4 companies are each above 10% of your portfolio once funds are counted, led by NVIDIA at 19%.");
    const all = read.insights.map((i) => `${i.text} ${i.soWhat ?? ""}`).join(" ");
    expect(all).not.toMatch(/Selling about \d+ (Taiwan|NVIDIA)/);
    expect(read.insights.find((i) => i.id === "held-NVDA")?.text).toBe(
      "NVDA is 19% of your portfolio, above the 10% line too, but our call on it is Keep, so there is no trim idea for it.",
    );
  });

  it("never pairs a Keep or Buy more call with a sale, on a card or in the read", () => {
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    const heldTickers = new Set(holdings.filter((h) => h.call === "Add" || h.call === "Hold").map((h) => h.ticker));
    expect(heldTickers.size).toBeGreaterThan(0);
    for (const trim of plan.trims) {
      expect(heldTickers.has(trim.ticker)).toBe(false);
      expect(`${trim.sentence} ${trim.why}`).not.toMatch(/\b(Keep|Buy more)\b/);
    }
    for (const insight of read.insights) {
      const text = `${insight.text} ${insight.soWhat ?? ""}`;
      if (/\b(Keep|Buy more)\b/.test(text) && !insight.id.startsWith("adds")) expect(text).not.toMatch(/\bsell(ing)? (about|some)\b/i);
      if (insight.id.startsWith("trim-")) expect(insight.soWhat ?? "").not.toMatch(/Keep|Buy more/);
    }
    // The same rule on the owner's real calls, where every stock over the line is Keep or Buy more: no sales at all.
    const asOwned = holdings.map((h) => (["ORCL", "GOOGL", "AVGO"].includes(h.ticker) ? { ...h, call: "Hold" as const } : h));
    const owned = buildRebalance({ holdings: asOwned, xray, rates: RATES, today: TODAY, subject: "mine" });
    expect(owned.trims).toEqual([]);
    expect(owned.adds).toEqual([]);
    expect(owned.buyMoreOver.map((row) => `${row.ticker} ${row.call}`)).toEqual(["NVDA Hold", "GOOGL Hold", "TSM Add", "AVGO Hold"]);
    expect(owned.quiet).toMatch(/so doing nothing is a fine answer\.$/);
    const ownedRead = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan: owned, losses: [], basis: "saved" })!;
    expect(ownedRead.headline).toBe("NVDA, GOOGL, TSM and AVGO are each above 10%, but our call is Buy more on TSM and Keep on NVDA, GOOGL and AVGO, so we would not sell.");
    expect(ownedRead.insights.map((i) => `${i.text} ${i.soWhat ?? ""}`).join(" ")).not.toMatch(/sell(ing)? (about|some)/i);
  });
});

describe("small and blocked trims", () => {
  const filler = (n: number, value: number) =>
    Array.from({ length: n }, (_, i) => holding({ ticker: `F${i}`, shares: 10, price: value / 10, cost: value / 10, call: "Hold" }));

  it("leaves out a trim under $500 even when it is 2+ points", () => {
    // A $10,004 portfolio: AAA at 14% needs a $400 sale (4 points).
    const holdings = [holding({ ticker: "AAA", name: "Triple A", shares: 14, price: 100, cost: 80, call: "Trim" }), ...filler(9, 956)];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.small.map((row) => row.ticker)).toEqual(["AAA"]);
    expect(plan.quiet).toContain("too small to be worth making");
    expect(plan.quiet).toMatch(/fine answer/);
  });

  it("leaves out a trim under 2 points even when it is over $500", () => {
    // $100,000: BBB at 11.5% needs 1.5 points ($1,500).
    const holdings = [holding({ ticker: "BBB", name: "Bee", shares: 115, price: 100, cost: 80, call: "Trim" }), ...filler(11, 8045.45)];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.small.map((row) => row.ticker)).toEqual(["BBB"]);
  });

  it("says plainly when the only name over the line is a Buy more call", () => {
    const holdings = [
      holding({ ticker: "TSM", name: "Taiwan Semiconductor", shares: 65, price: 200, cost: 150, call: "Add", sector: "Technology" }),
      ...filler(10, 8700),
    ];
    const plan: RebalancePlan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.buyMoreOver.map((row) => row.ticker)).toEqual(["TSM"]);
    expect(plan.quiet).toBe(
      "Your portfolio is concentrated, with Taiwan Semiconductor at 13%, above the 10% line, but our call on TSM is Buy more and we would not sell it, so doing nothing is a fine answer.",
    );
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("Taiwan Semiconductor is 13% of your portfolio, but our call is Buy more, so we would not sell.");
    expect(read.headline.split(/\s+/).length).toBeLessThanOrEqual(18);
    // The quiet line would repeat the headline; the read says what adding would do instead.
    expect(read.insights.map((i) => i.text)).toEqual(["Adding more would make your portfolio lean on TSM even harder, so doing nothing is a fine answer here."]);
  });

  it("gives the company ideas to the biggest companies we would sell, and skips a Keep call", () => {
    const holdings = [
      holding({ ticker: "BIG", shares: 25, price: 1000, cost: 900 }), // 25%, no call
      holding({ ticker: "KEEP", shares: 20, price: 1000, cost: 900, call: "Hold" }), // 20%
      holding({ ticker: "MID", shares: 18, price: 1000, cost: 900, call: "Trim" }), // 18%
      holding({ ticker: "SELL", shares: 13, price: 1000, cost: 900, call: "Trim" }), // 13%
      holding({ ticker: "LAST", shares: 12, price: 1000, cost: 900, call: "Trim" }), // 12%
      ...filler(3, 4000),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims.map((t) => t.ticker)).toEqual(["BIG", "MID", "SELL"]);
    expect(plan.buyMoreOver.map((row) => [row.ticker, row.call])).toEqual([["KEEP", "Hold"]]);
    expect(plan.moreOver.map((row) => row.ticker)).toEqual(["LAST"]);
  });

  it("never sells a company when either share class is a Buy more call", () => {
    const holdings = [
      holding({ ticker: "GOOGL", name: "Alphabet", shares: 100, price: 100, cost: 90, call: "Add" }),
      holding({ ticker: "GOOG", name: "Alphabet", shares: 100, price: 100, cost: 90, call: "Hold" }),
      ...filler(16, 5000),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.buyMoreOver.map((row) => row.ticker)).toEqual(["GOOGL"]);
  });

  it("never sells a company when either share class is a Keep call, and names the Keep class", () => {
    const holdings = [
      holding({ ticker: "GOOGL", name: "Alphabet", shares: 100, price: 100, cost: 90, call: "Trim" }),
      holding({ ticker: "GOOG", name: "Alphabet", shares: 100, price: 100, cost: 90, call: "Hold" }),
      ...filler(16, 5000),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.buyMoreOver.map((row) => [row.ticker, row.call])).toEqual([["GOOG", "Hold"]]);
  });

  it("does not count a company a hair over the line, which would read as 10% above the 10% line", () => {
    const holdings = [holding({ ticker: "EDGE", shares: 103, price: 100, cost: 90, call: "Add" }), ...filler(9, 10300 * 0.9693)];
    const xray = xrayOf(holdings, {});
    expect(xray.companies[0]!.pct).toBeGreaterThan(10);
    expect(xray.companies[0]!.pct).toBeLessThan(10.5);
    const plan = buildRebalance({ holdings, xray, rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.companiesOver).toEqual([]);
    expect(plan.buyMoreOver).toEqual([]);
    expect(plan.quiet).not.toContain("above the 10% line,");
  });

  it("names every Buy more call in the headline when there are several", () => {
    const holdings = [
      holding({ ticker: "AAA", shares: 15, price: 1000, cost: 900, call: "Add" }),
      holding({ ticker: "BBB", shares: 12, price: 1000, cost: 900, call: "Add" }),
      ...filler(10, 7300),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("AAA and BBB are each above 10%, but our call on each is Buy more, so we would not sell.");
    expect(read.insights.map((i) => i.id)).toEqual(["held"]);
  });

  it("names both calls when the names over the line are a mix of Buy more and Keep", () => {
    const holdings = [
      holding({ ticker: "AAA", shares: 15, price: 1000, cost: 900, call: "Add" }),
      holding({ ticker: "BBB", shares: 12, price: 1000, cost: 900, call: "Hold" }),
      ...filler(10, 7300),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    expect(plan.trims).toEqual([]);
    expect(plan.buyMoreOver.map((row) => row.call)).toEqual(["Add", "Hold"]);
    expect(plan.quiet).toContain("our call is Buy more on AAA and Keep on BBB and we would not sell them");
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("AAA and BBB are each above 10%, but our call is Buy more on AAA and Keep on BBB, so we would not sell.");
    expect(read.headline).not.toContain("Buy more or Keep");
  });

  it("never suggests a tax-loss sale on a Buy more or Keep call", () => {
    for (const call of ["Add", "Hold"] as const) {
      const loser = holding({ ticker: "CI", name: "Cigna", shares: 10, price: 250, cost: 300, call, sector: "Health Care" });
      expect(buildLosses({ holdings: [loser], universe: [], funds: {}, rates: RATES, today: TODAY })).toEqual([]);
    }
    const sellSome = holding({ ticker: "CI", name: "Cigna", shares: 10, price: 250, cost: 300, call: "Trim", sector: "Health Care" });
    expect(buildLosses({ holdings: [sellSome], universe: [], funds: {}, rates: RATES, today: TODAY })).toHaveLength(1);
  });
});
