import { describe, expect, it } from "vitest";

import { parseByRules } from "@/lib/agents-plain/parse";
import { buildCatalog } from "@/lib/agents-plain/stocks";
import type { ScreenerRow } from "@/lib/screener-shared";
import { buildXray, type FundDoc } from "@/lib/xray";

import { buildLosses, similarFunds, similarStocks } from "./losses";
import { buildIdeasRead } from "./read";
import { COMPANY_LINE, buildRebalance } from "./rebalance";
import { DEFAULT_RATES, parseRates, saleTax } from "./tax";
import type { IdeaHolding, IdeasResult } from "./types";
import { dropRequest, levelBelow, watchDropHref } from "./watch";

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
      holding({ ticker: "NVDA", shares: 100, price: 200, cost: 150, call: "Hold" }), // 20,000
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

  it("trims a tilted sector from Sell some before Keep, never Buy more, then adds to Buy more elsewhere", () => {
    const tech = { sector: "Technology" };
    // Six tech names at 10% each (60% against 35% for the index), none over the company line.
    const holdings = [
      holding({ ticker: "T1", shares: 50, price: 100, cost: 80, call: "Add", ...tech }),
      holding({ ticker: "T2", shares: 50, price: 100, cost: 80, call: "Hold", ...tech }),
      holding({ ticker: "T3", shares: 50, price: 100, cost: 80, call: "Trim", ...tech }),
      holding({ ticker: "T4", shares: 50, price: 100, cost: 80, call: "Add", ...tech }),
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
      holding({ ticker: "RUN", shares: 10, price: 900, cost: 300, call: "Hold" }), // 3,000 in, 9,000 now
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
    call: "Hold",
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
      holding({ ticker: "NVDA", name: "NVIDIA", shares: 100, price: 200, cost: 150, call: "Hold" }),
      ...["A", "B", "C", "D", "E", "F", "G", "H"].map((t) => holding({ ticker: t, shares: 100, price: 100, cost: 100 })),
    ];
    const plan = buildRebalance({ holdings, xray: xrayOf(holdings, {}), rates: RATES, today: TODAY, subject: "mine" });
    const read = buildIdeasRead({ subject: "mine", today: TODAY, rates: RATES, plan, losses: [], basis: "saved" })!;
    expect(read.headline).toBe("NVIDIA is 20% of your portfolio once the funds are counted, above the 10% line we use for one company.");
    expect(read.insights[0]!.text).toContain("about $600 at the 24% short-term rate");
    expect(read.insights[0]!.soWhat).toBe("Our call on it is Keep.");
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
      holding({ ticker: "BIG", shares: 30, price: 100, cost: 50, call: "Hold" }),
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
