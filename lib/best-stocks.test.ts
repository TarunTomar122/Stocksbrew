import { describe, expect, it } from "vitest";

import {
  BEST_LISTS,
  EMPTY_INPUT,
  FUND_PERIOD_MAX_AGE_DAYS,
  LIST_MIN_STOCKS,
  LIST_SHOW,
  buildHubRead,
  buildList,
  buildListRead,
  bestListHref,
  fcfYield,
  fundQuarter,
  getBestList,
  inSentence,
  itemListLd,
  listDescription,
  listIsIndexable,
  listTitle,
  monthYear,
  quarterWords,
  relatedLists,
  tallyFundBuys,
  tallyInsiderBuys,
  whySentence,
  type BestInput,
  type FundTally,
  type InsiderTally,
} from "@/lib/best-stocks";
import type { ScreenerRow } from "@/lib/screener-shared";

const TODAY = "2026-11-10";
const CLOSE = "2026-11-09";

/** A plain covered stock that meets no list's rule, so each case below sets only what its rule needs. */
function row(symbol: string, overrides: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    symbol,
    name: `${symbol} Corp`,
    sector: "Industrials",
    price: 100,
    market_cap: 50e9,
    ret_ytd: 5,
    from_hi_pct: -20,
    from_lo_pct: 40,
    rsi: 50,
    analyst_count: 4,
    buy_pct: 50,
    upside: 5,
    score: 50,
    call: "Hold",
    ...overrides,
  };
}

function input(rows: ScreenerRow[], extra: Partial<BestInput> = {}): BestInput {
  return {
    ...EMPTY_INPUT,
    rows,
    spy: { symbol: "SPY", benchmark: true, ret_ytd: 11.5 },
    priceDay: CLOSE,
    generatedAt: `${TODAY}T22:00:00Z`,
    ...extra,
  };
}

const insider = (symbol: string, value: number): InsiderTally => ({ symbol, value, insiders: ["A Person"], trades: 1, lastFiled: "2026-11-05" });
const fund = (symbol: string, opened: number, added: number): FundTally => ({
  symbol,
  opened: Array.from({ length: opened }, (_, i) => `Fund O${i}`),
  added: Array.from({ length: added }, (_, i) => `Fund A${i}`),
});

/** For each list: a row that meets its rule, and one change that breaks it. */
const CASES: Record<string, { pass: Partial<ScreenerRow>; fail: Partial<ScreenerRow>; symbol?: string; extra?: Partial<BestInput> }> = {
  "dividend-stocks": { pass: { div_yield: 3, div_growth_years: 8, payout: 60 }, fail: { div_yield: 3, div_growth_years: 8, payout: 85 } },
  "dividend-stocks-under-50": { pass: { div_yield: 4, price: 30, eps_growth: 5, payout: 60 }, fail: { div_yield: 4, price: 55, eps_growth: 5, payout: 60 } },
  "high-dividend-yield-stocks": { pass: { div_yield: 5, payout: 90 }, fail: { div_yield: 18, payout: 90 } },
  "dividend-growth-stocks": { pass: { div_growth_years: 12, div_growth: 7, payout: 50 }, fail: { div_growth_years: 9, div_growth: 7, payout: 50 } },
  "dividend-raised-25-years": { pass: { div_growth_years: 30 }, fail: { div_growth_years: 24 } },
  "undervalued-stocks": { pass: { peg: 0.8, fwd_pe: 12, net_margin: 10 }, fail: { peg: 0.8, fwd_pe: 12, net_margin: -1 } },
  "undervalued-tech-stocks": { pass: { sector: "Technology", peg: 1.2, fwd_pe: 25, net_margin: 10 }, fail: { sector: "Industrials", peg: 1.2, fwd_pe: 25, net_margin: 10 } },
  "low-pe-stocks": { pass: { pe: 10, fwd_pe: 11, eps_growth: 5 }, fail: { pe: 10, fwd_pe: 22, eps_growth: 5 } },
  "high-free-cash-flow-yield-stocks": { pass: { p_fcf: 10, fcf: 5e9 }, fail: { p_fcf: 10, fcf: 5e9, sector: "Financials" } },
  "cheapest-ai-stocks": { symbol: "NVDA", pass: { fwd_pe: 25 }, fail: { fwd_pe: -5 } },
  "growth-stocks": { pass: { rev_growth: 30, revenue: 5e9, eps_next_y: 20 }, fail: { rev_growth: 30, revenue: 0.5e9, eps_next_y: 20 } },
  "best-performing-stocks-this-year": { pass: { ret_ytd: 40 }, fail: { ret_ytd: 10 } },
  "worst-performing-stocks-this-year": { pass: { ret_ytd: -20 }, fail: { ret_ytd: -20, market_cap: 1e9 } },
  "stocks-near-52-week-highs": { pass: { from_hi_pct: -1 }, fail: { from_hi_pct: -4 } },
  "long-term-stocks": { pass: { roic: 25, op_margin: 30, rev_growth: 8, debt_equity: 0.5 }, fail: { roic: 25, op_margin: 30, rev_growth: 8, debt_equity: 2 } },
  "near-52-week-lows-analysts-like": { pass: { from_lo_pct: 5, buy_pct: 80, analyst_count: 10 }, fail: { from_lo_pct: 5, buy_pct: 60, analyst_count: 10 } },
  "strong-buy-stocks": { pass: { buy_pct: 90, analyst_count: 12 }, fail: { buy_pct: 90, analyst_count: 9 } },
  "most-upside-to-analyst-targets": { pass: { upside: 40, analyst_count: 10 }, fail: { upside: 140, analyst_count: 10 } },
  "oversold-stocks": { pass: { rsi: 25 }, fail: { rsi: 31 } },
  "most-shorted-stocks": { pass: { short_float: 15 }, fail: { short_float: 15, market_cap: 0.5e9 } },
  "stocks-under-10": { pass: { price: 8, market_cap: 1e9 }, fail: { price: 8, market_cap: 0.2e9 } },
  "stocks-under-20": { pass: { price: 15, market_cap: 2e9 }, fail: { price: 25, market_cap: 2e9 } },
  "stocks-under-50": { pass: { price: 40 }, fail: { price: 40, score: undefined } },
  "ai-stocks": { symbol: "MSFT", pass: {}, fail: { score: undefined } },
  "semiconductor-stocks": { symbol: "AMD", pass: {}, fail: { score: undefined } },
  "stocks-insiders-are-buying": { pass: {}, fail: {}, extra: {} },
  "stocks-hedge-funds-bought": { pass: {}, fail: {}, extra: {} },
};

describe("the list catalogue", () => {
  it("has one case per list and between 20 and 30 lists", () => {
    expect(BEST_LISTS.length).toBeGreaterThanOrEqual(20);
    expect(BEST_LISTS.length).toBeLessThanOrEqual(30);
    expect(Object.keys(CASES).sort()).toEqual(BEST_LISTS.map((list) => list.slug).sort());
  });

  it("uses unique, lower-case slugs and finds lists by them", () => {
    const slugs = BEST_LISTS.map((list) => list.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(getBestList(slug)?.slug).toBe(slug);
      expect(bestListHref(slug)).toBe(`/best/${slug}`);
    }
    expect(getBestList("DIVIDEND-STOCKS")?.slug).toBe("dividend-stocks");
    expect(getBestList("nope")).toBeNull();
  });

  it("says every rule as a full sentence and every order as 'Ranked by'", () => {
    for (const list of BEST_LISTS) {
      const rule = typeof list.rule === "function" ? list.rule(EMPTY_INPUT) : list.rule;
      expect(rule).toMatch(/^[A-Z].*\.$/);
      // The title adds "(Month Year): ..." after the heading, so the heading carries no colon or brackets of its own.
      expect(list.heading).not.toMatch(/[:()]/);
      expect(list.ranked).toMatch(/^Ranked by .*\.$/);
      expect(`${rule} ${list.heading}`).not.toMatch(/will (?:go up|rise|beat)/i);
    }
  });

  it("links related lists from the same group first, never the list itself", () => {
    const list = getBestList("dividend-stocks")!;
    const related = relatedLists(list);
    expect(related.some((item) => item.slug === list.slug)).toBe(false);
    expect(related[0]!.group).toBe("Dividends");
    expect(related.length).toBeLessThanOrEqual(6);
  });
});

describe("each list rule", () => {
  for (const list of BEST_LISTS) {
    const testCase = CASES[list.slug]!;
    it(`${list.slug}: meets and breaks the rule`, () => {
      const symbol = testCase.symbol ?? "TEST";
      let passInput = input([row(symbol, testCase.pass)]);
      let failInput = input([row(symbol, testCase.fail)]);
      if (list.source === "insiders") {
        passInput = { ...passInput, insiders: new Map([[symbol, insider(symbol, 250_000)]]) };
        failInput = { ...failInput, insiders: new Map([[symbol, insider(symbol, 50_000)]]) };
      }
      if (list.source === "funds") {
        passInput = { ...passInput, funds: new Map([[symbol, fund(symbol, 1, 2)]]), fundPeriod: "2026-09-30", fundCount: 60 };
        failInput = { ...failInput, funds: new Map([[symbol, fund(symbol, 1, 1)]]), fundPeriod: "2026-09-30", fundCount: 60 };
      }
      expect(buildList(list, passInput).count).toBe(1);
      expect(buildList(list, failInput).count).toBe(0);
    });
  }

  it("a plain stock meets no rule", () => {
    const plain = input([row("PLAIN")]);
    for (const list of BEST_LISTS) expect(buildList(list, plain).count, list.slug).toBe(0);
  });

  it("never picks or orders by our call", () => {
    const base = [row("AAA", { div_yield: 5, payout: 50 }), row("BBB", { div_yield: 4, payout: 50 })];
    const list = getBestList("high-dividend-yield-stocks")!;
    const asHold = buildList(list, input(base.map((item) => ({ ...item, call: "Hold" as const }))));
    const asMixed = buildList(list, input([{ ...base[0]!, call: "Trim" }, { ...base[1]!, call: "Add" }]));
    expect(asMixed.ranked.map((item) => item.symbol)).toEqual(asHold.ranked.map((item) => item.symbol));
  });

  it("leaves benchmarks and uncovered lines out", () => {
    const list = getBestList("oversold-stocks")!;
    const built = buildList(list, input([row("SPY", { rsi: 10, benchmark: true }), row("ZZZ", { rsi: 10, uncovered: true }), row("OK", { rsi: 20 })]));
    expect(built.ranked.map((item) => item.symbol)).toEqual(["OK"]);
  });
});

describe("ranking", () => {
  it("orders by the metric, then by market value, then by ticker", () => {
    const list = getBestList("high-dividend-yield-stocks")!;
    const built = buildList(
      list,
      input([
        row("LOW", { div_yield: 4.5, payout: 50 }),
        row("TOP", { div_yield: 7, payout: 50 }),
        row("BIG", { div_yield: 5, payout: 50, market_cap: 90e9 }),
        row("SMALL", { div_yield: 5, payout: 50, market_cap: 10e9 }),
      ]),
    );
    expect(built.ranked.map((item) => item.symbol)).toEqual(["TOP", "BIG", "SMALL", "LOW"]);
    expect(built.ranked.map((item) => item.rank)).toEqual([1, 2, 3, 4]);
  });

  it("puts the lowest first for a lowest-first list", () => {
    const built = buildList(getBestList("oversold-stocks")!, input([row("A", { rsi: 28 }), row("B", { rsi: 12 }), row("C", { rsi: 20 })]));
    expect(built.ranked.map((item) => item.symbol)).toEqual(["B", "C", "A"]);
  });

  it("splits equal buy shares by the distance to the target", () => {
    const built = buildList(
      getBestList("strong-buy-stocks")!,
      input([row("A", { buy_pct: 100, analyst_count: 20, upside: 10 }), row("B", { buy_pct: 100, analyst_count: 20, upside: 30 }), row("C", { buy_pct: 95, analyst_count: 20, upside: 90 })]),
    );
    expect(built.ranked.map((item) => item.symbol)).toEqual(["B", "A", "C"]);
  });

  it("keeps one line per company when two share classes qualify", () => {
    const built = buildList(getBestList("oversold-stocks")!, input([row("GOOGL", { name: "Alphabet Inc.", rsi: 20 }), row("GOOG", { name: "Alphabet Inc.", rsi: 22 })]));
    expect(built.ranked.map((item) => item.symbol)).toEqual(["GOOGL"]);
  });

  it("shows at most LIST_SHOW rows but counts them all", () => {
    const rows = Array.from({ length: LIST_SHOW + 7 }, (_, i) => row(`S${String(i).padStart(2, "0")}`, { rsi: 10 + i / 10 }));
    const built = buildList(getBestList("oversold-stocks")!, input(rows));
    expect(built.count).toBe(LIST_SHOW + 7);
    expect(built.shown).toHaveLength(LIST_SHOW);
  });

  it("treats a price past the stored high or low as a new high or low", () => {
    const highs = buildList(getBestList("stocks-near-52-week-highs")!, input([row("NEW", { from_hi_pct: 2 }), row("NEAR", { from_hi_pct: -1 })]));
    expect(highs.ranked.map((item) => [item.symbol, item.value])).toEqual([
      ["NEW", 0],
      ["NEAR", 1],
    ]);
    expect(highs.ranked[0]!.why).toMatch(/^Trades at a new 52-week high/);
  });

  it("ships no price zone fields in a ranked row", () => {
    const built = buildList(getBestList("oversold-stocks")!, input([row("Z", { rsi: 20, add_below: 90, trim_above: 120, zone: "add", to_add_pct: 3 })]));
    const keys = Object.keys(built.ranked[0]!);
    for (const key of ["add_below", "trim_above", "zone", "to_add_pct", "to_trim_pct"]) expect(keys).not.toContain(key);
  });
});

describe("the index rule", () => {
  const list = getBestList("oversold-stocks")!;
  const rows = (n: number) => Array.from({ length: n }, (_, i) => row(`R${i}`, { rsi: 20 + i }));

  it("needs LIST_MIN_STOCKS stocks", () => {
    expect(listIsIndexable(buildList(list, input(rows(LIST_MIN_STOCKS))), TODAY)).toBe(true);
    expect(listIsIndexable(buildList(list, input(rows(LIST_MIN_STOCKS - 1))), TODAY)).toBe(false);
    expect(listIsIndexable(buildList(list, input([])), TODAY)).toBe(false);
  });

  it("needs prices from the last ten days", () => {
    expect(listIsIndexable(buildList(list, input(rows(8), { priceDay: "2026-10-20" })), TODAY)).toBe(false);
    expect(listIsIndexable(buildList(list, input(rows(8), { priceDay: null })), TODAY)).toBe(false);
  });

  it("needs a recent 13F quarter for the fund list", () => {
    const funds = getBestList("stocks-hedge-funds-bought")!;
    const fundRows = rows(6);
    const tallies = new Map(fundRows.map((item) => [item.symbol, fund(item.symbol, 0, 3)]));
    const built = buildList(funds, input(fundRows, { funds: tallies, fundPeriod: "2026-09-30", fundCount: 50 }));
    expect(built.count).toBe(6);
    expect(listIsIndexable(built, TODAY, "2026-09-30")).toBe(true);
    expect(listIsIndexable(built, TODAY, "2026-03-31")).toBe(false);
    expect(listIsIndexable(built, TODAY, null)).toBe(false);
    expect(FUND_PERIOD_MAX_AGE_DAYS).toBeGreaterThan(135);
  });
});

describe("title and description", () => {
  const list = getBestList("dividend-stocks-under-50")!;
  const built = (count: number) => ({ list, count, day: CLOSE });

  it("names the month and how many stocks there are", () => {
    expect(listTitle(built(14))).toBe("Best Dividend Stocks Under $50 (November 2026): 14 Picks, Ranked");
    expect(listTitle(built(40))).toBe(`Best Dividend Stocks Under $50 (November 2026): Top ${LIST_SHOW} of 40, Ranked`);
    expect(listTitle(built(3))).toBe("Best Dividend Stocks Under $50 (November 2026): Only 3 Qualify Today");
    expect(listTitle(built(1))).toBe("Best Dividend Stocks Under $50 (November 2026): Only 1 Qualifies Today");
    expect(listTitle(built(0))).toBe("Best Dividend Stocks Under $50 (November 2026): None Qualify Today");
    expect(listTitle({ list: getBestList("oversold-stocks")!, count: 9, day: CLOSE })).toBe("Oversold Stocks (November 2026): 9 Stocks, Ranked");
  });

  it("gives every list its own description with the rule, the day and the leaders", () => {
    const one = buildList(list, input([row("AAA", { name: "Alpha Inc.", div_yield: 4, price: 30, eps_growth: 5, payout: 60 })]));
    const description = listDescription(one);
    expect(description).toContain(one.rule);
    expect(description).toContain("1 US stock meets it as of the November 9, 2026 close, led by Alpha (AAA).");
    const all = BEST_LISTS.map((item) => listDescription(buildList(item, input([]))));
    expect(new Set(all).size).toBe(all.length);
  });

  it("writes months and quarters in words", () => {
    expect(monthYear("2026-11-09")).toBe("November 2026");
    expect(monthYear(null)).toBe("");
    expect(quarterWords("2026-06-30")).toBe("the April to June 2026 quarter");
    expect(quarterWords("2026-12-31")).toBe("the October to December 2026 quarter");
    expect(quarterWords(null)).toBe("their latest quarter");
  });
});

describe("the read", () => {
  it("leads with the count and the first stock, then the S&P 500 baselines", () => {
    const rows = [
      row("AAA", { name: "Alpha Inc.", div_yield: 6, payout: 50, ret_ytd: 20, sector: "Utilities" }),
      row("BBB", { div_yield: 5, payout: 50, ret_ytd: 2, sector: "Utilities" }),
      row("CCC", { div_yield: 4.5, payout: 50, ret_ytd: 15, sector: "Energy" }),
      row("DDD", { div_yield: 4.2, payout: 50, ret_ytd: 1, sector: "Utilities" }),
      ...Array.from({ length: 20 }, (_, i) => row(`SP${i}`, { div_yield: 1 + i / 10, indexes: ["S&P 500"] })),
    ];
    const data = input(rows);
    const read = buildListRead(buildList(getBestList("high-dividend-yield-stocks")!, data), data);
    expect(read.headline).toBe("4 stocks meet this rule today, and Alpha ranks first with a 6.00% dividend yield.");
    const texts = read.insights.map((insight) => insight.text);
    expect(texts[0]).toBe("The typical dividend yield on this list is 4.75%, against 1.95% for the typical S&P 500 stock we cover (dividend payers only).");
    expect(texts[1]).toBe("2 of the 4 are ahead of the S&P 500 this year (+11.5%), led by Alpha at +20%.");
    expect(texts[2]).toBe("3 of the 4 are utilities companies, more than any other sector.");
    expect(read.insights.length).toBeLessThanOrEqual(3);
  });

  it("says plainly when nothing qualifies", () => {
    const data = input([row("X")]);
    const read = buildListRead(buildList(getBestList("oversold-stocks")!, data), data);
    expect(read.headline).toBe("No stock we cover meets this rule today.");
    expect(read.insights).toEqual([]);
  });

  it("sets a list ranked by this year's change against the S&P 500 itself", () => {
    const data = input([row("A", { ret_ytd: 40 }), row("B", { ret_ytd: 30 }), row("C", { ret_ytd: 20 })]);
    const read = buildListRead(buildList(getBestList("best-performing-stocks-this-year")!, data), data);
    expect(read.insights[0]!.text).toBe("The typical stock here is up 30% this year, against +11.5% for the S&P 500.");
    expect(read.insights.some((insight) => insight.id === "ytd")).toBe(false);
  });

  it("finds the stock on the most lists for the hub", () => {
    const rows = [row("NVDA", { name: "NVIDIA Corporation", rsi: 20, fwd_pe: 20, score: 80, ret_ytd: 40 })];
    const data = input(rows);
    const read = buildHubRead(
      BEST_LISTS.map((list) => buildList(list, data)),
      data,
    );
    expect(read?.insights[0]?.text).toMatch(/^NVIDIA makes \d+ of the lists/);
    expect(read?.headline).toMatch(/lists have five or more stocks/);
  });
});

describe("sentences", () => {
  it("joins reasons into one capitalised sentence", () => {
    expect(whySentence(["pays 5.0% a year in dividends", null, "is up 3.0% this year"])).toBe("Pays 5.0% a year in dividends and is up 3.0% this year.");
    expect(whySentence([null])).toBe("");
  });

  it("keeps capitals that belong to the name", () => {
    expect(inSentence("AI stocks")).toBe("AI stocks");
    expect(inSentence("Dividend stocks under $50")).toBe("dividend stocks under $50");
    expect(inSentence("Low P/E stocks")).toBe("low P/E stocks");
  });

  it("reads free cash flow yield from price to free cash flow, only when cash flow is positive", () => {
    expect(fcfYield(row("A", { p_fcf: 10, fcf: 1e9 }))).toBe(10);
    expect(fcfYield(row("A", { p_fcf: 10, fcf: -1e9 }))).toBeNull();
    expect(fcfYield(row("A", { p_fcf: -4 }))).toBeNull();
  });
});

describe("insider and fund tallies", () => {
  it("adds open-market buys filed in the window, counting each insider once", () => {
    const trades = [
      { symbol: "abc", insider: "Jane Roe", insider_id: "1", tx_type: "buy" as const, value: 200_000, filing_date: "2026-11-01" },
      { symbol: "ABC", insider: "Jane Roe", insider_id: "1", tx_type: "buy" as const, value: 100_000, filing_date: "2026-10-01" },
      { symbol: "ABC", insider: "John Doe", insider_id: "2", tx_type: "buy" as const, value: 50_000, filed_at: "2026-11-06T10:00:00" },
      { symbol: "ABC", insider: "Old Buy", insider_id: "3", tx_type: "buy" as const, value: 900_000, filing_date: "2026-08-01" },
      { symbol: "ABC", insider: "A Seller", insider_id: "4", tx_type: "sell" as const, value: 900_000, filing_date: "2026-11-02" },
      { symbol: "ABC", insider: "No Value", insider_id: "5", tx_type: "buy" as const, value: null, filing_date: "2026-11-02" },
    ];
    const tally = tallyInsiderBuys(trades, TODAY).get("ABC")!;
    expect(tally.value).toBe(350_000);
    expect(tally.insiders).toEqual(["Jane Roe", "John Doe"]);
    expect(tally.trades).toBe(3);
    expect(tally.lastFiled).toBe("2026-11-06");
  });

  it("counts each fund once per stock in the quarter most funds filed for", () => {
    const digests = [
      { name: "One", period: "2026-06-30", opened: [{ ticker: "AAA" }], added: [{ ticker: "AAA" }, { ticker: "BBB" }] },
      { name: "Two", period: "2026-06-30", opened: [], added: [{ ticker: "aaa" }] },
      { name: "Early", period: "2026-09-30", opened: [{ ticker: "AAA" }], added: [] },
    ];
    const period = fundQuarter(digests);
    expect(period).toBe("2026-06-30");
    const { funds, fundCount } = tallyFundBuys(digests, period);
    expect(fundCount).toBe(2);
    expect(funds.get("AAA")).toEqual({ symbol: "AAA", opened: ["One"], added: ["Two"] });
    expect(funds.get("BBB")).toEqual({ symbol: "BBB", opened: [], added: ["One"] });
    expect(tallyFundBuys(digests, null).fundCount).toBe(0);
  });
});

describe("structured data", () => {
  it("lists the shown stocks in rank order with their pages", () => {
    const built = buildList(getBestList("oversold-stocks")!, input([row("B", { name: "Bravo Inc.", rsi: 20 }), row("A", { name: "Alpha Inc.", rsi: 10 })]));
    const ld = JSON.parse(JSON.stringify(itemListLd(built))) as { "@type": string; numberOfItems: number; itemListElement: Array<{ position: number; name: string; url: string }> };
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement[0]).toEqual({ "@type": "ListItem", position: 1, name: "Alpha (A)", url: "https://www.stocksbrew.online/stock/A" });
  });
});

describe("quality pass fixes", () => {
  const base = { symbol: "X", benchmark: false, uncovered: false, market_cap: 5e9 } as const;
  it("keeps negative equity off the compounder list", () => {
    const list = getBestList("long-term-stocks")!;
    const row = { ...base, roic: 25, op_margin: 30, rev_growth: 8, debt_equity: -3 } as unknown as ScreenerRow;
    expect(list.qualifies(row, EMPTY_INPUT)).toBe(false);
  });
  it("keeps health insurers off the free cash flow list", () => {
    const list = getBestList("high-free-cash-flow-yield-stocks")!;
    const row = { ...base, symbol: "OSCR", sector: "Healthcare", p_fcf: 2.3, fcf: 4e9 } as unknown as ScreenerRow;
    expect(list.qualifies(row, EMPTY_INPUT)).toBe(false);
    expect(list.qualifies({ ...row, symbol: "ZZZ" } as ScreenerRow, EMPTY_INPUT)).toBe(true);
  });
  it("says tenfold growth in words and drops feed name tails", () => {
    const list = getBestList("low-pe-stocks")!;
    const row = { ...base, symbol: "MOMO", name: "Hello Group Inc. Sponsored", pe: 3, fwd_pe: 8, eps_growth: 5135 } as unknown as ScreenerRow;
    const built = buildList(list, { ...EMPTY_INPUT, rows: [row] });
    expect(built.ranked[0]!.name).toBe("Hello Group");
    expect(built.ranked[0]!.why).toContain("grew earnings per share tenfold or more");
  });
});
