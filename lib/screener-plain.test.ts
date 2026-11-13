import { describe, expect, it } from "vitest";

import { PLAIN_EXAMPLES } from "@/components/screener/plain-parts";
import {
  FIELD_BOUNDS,
  cleanPlainScreen,
  describeSort,
  looksLikeScreen,
  mergePlainScreens,
  parsePlainScreen,
  plainColumns,
  plainHasScreen,
  plainHref,
  plainView,
  readSaid,
  withSaid,
  withoutCallParts,
  type PlainScreen,
} from "@/lib/screener-plain";
import { cachedPlainRead, clearPlainCache, modelReplyToScreen, readOnce, rememberPlainRead } from "@/lib/screener-plain-model";
import { DEFAULT_SORT, FIELD_BY_ID, MAX_COLUMNS, applyFilters, parseView, sortRows, type ScreenerRow } from "@/lib/screener-shared";

type Expect = {
  q?: string;
  sectors?: string[];
  caps?: string[];
  calls?: string[];
  zones?: string[];
  ranges?: Record<string, { min?: number; max?: number }>;
  sort?: { id: string; dir: "asc" | "desc" } | null;
  leftover?: string[];
};

/** Each sentence and exactly what the rules make of it. */
const CASES: Array<[string, Expect]> = [
  // The owner's sentence, as typed.
  ["stock with lowest pe compared to their history", { ranges: { pe_hist_pctile: { min: 0, max: 100 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["stocks with the lowest P/E compared to their history", { ranges: { pe_hist_pctile: { min: 0, max: 100 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["Lowest P/E vs its history", { ranges: { pe_hist_pctile: { min: 0, max: 100 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["highest price to earnings relative to their own history", { ranges: { pe_hist_pctile: { min: 0, max: 100 } }, sort: { id: "pe_hist_pctile", dir: "desc" } }],
  ["P/E below its usual", { ranges: { pe_hist_pctile: { max: 25 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["cheaper than usual healthcare", { sectors: ["health-care"], ranges: { pe_hist_pctile: { max: 25 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["historically cheap software", { q: "software", ranges: { pe_hist_pctile: { max: 25 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["expensive compared to their history", { ranges: { pe_hist_pctile: { min: 75 } }, sort: { id: "pe_hist_pctile", dir: "desc" } }],
  // The other examples from the ask.
  ["cheap chip stocks still growing 20%+", { q: "semiconductor", ranges: { pe_hist_pctile: { max: 25 }, rev_growth: { min: 20 } }, sort: { id: "pe_hist_pctile", dir: "asc" } }],
  ["biggest companies down this year that we'd buy more", { calls: ["Add"], ranges: { ret_ytd: { max: 0 } }, sort: { id: "market_cap", dir: "desc" } }],
  ["small caps near a one-year low with analysts warming", { caps: ["small"], ranges: { from_lo_pct: { max: 20 }, buys_chg_3m: { min: 1 } }, sort: { id: "from_lo_pct", dir: "asc" } }],
  // Ranges.
  ["tech stocks with p/e under 20", { sectors: ["technology"], ranges: { pe: { max: 20 } }, sort: null }],
  ["p/e between 10 and 20", { ranges: { pe: { min: 10, max: 20 } } }],
  ["pe 10-20", { ranges: { pe: { min: 10, max: 20 } } }],
  ["revenue growth of at least 15%", { ranges: { rev_growth: { min: 15 } } }],
  ["sales growth over 30% and profitable", { ranges: { rev_growth: { min: 30 }, net_margin: { min: 0 } } }],
  ["fwd pe below 15 and eps growth above 20%", { ranges: { fwd_pe: { max: 15 }, eps_growth: { min: 20 } } }],
  ["3% yield", { ranges: { div_yield: { min: 3 } } }],
  ["energy stocks paying dividends over 3%", { sectors: ["energy"], ranges: { div_yield: { min: 3 } } }],
  ["buyback yield over 2%", { ranges: { buyback_yield: { min: 2 } } }],
  ["upside to target over 30%", { ranges: { upside: { min: 30 } } }],
  ["stocks under $20", { ranges: { price: { max: 20 } } }],
  ["companies under $50b with high margins", { ranges: { market_cap: { max: 50e9 }, net_margin: { min: 20 } }, sort: { id: "net_margin", dir: "desc" } }],
  ["market cap over $1 trillion", { ranges: { market_cap: { min: 1e12 } } }],
  ["mega caps up more than 50% this year", { caps: ["mega"], ranges: { ret_ytd: { min: 50 } } }],
  ["down 30% over the past year", { ranges: { ret_1y: { max: -30 } } }],
  // Sorts and directions.
  ["highest dividend yield in utilities", { sectors: ["utilities"], sort: { id: "div_yield", dir: "desc" } }],
  ["top 10 performers this month", { sort: { id: "ret_1m", dir: "desc" } }],
  ["worst performers this year", { sort: { id: "ret_ytd", dir: "asc" } }],
  ["biggest losers today", { sort: { id: "day_pct", dir: "asc" } }],
  ["least volatile stocks", { sort: { id: "vol_90d", dir: "asc" } }],
  ["most shorted small caps", { caps: ["small"], ranges: { short_float: { min: 15 } }, sort: { id: "short_float", dir: "desc" } }],
  ["best p/e in financials", { sectors: ["financials"], sort: { id: "pe", dir: "asc" } }],
  ["sorted by roic", { sort: { id: "roic", dir: "desc" } }],
  ["dividend growth stocks", { sort: { id: "div_growth", dir: "desc" } }],
  ["highest score", { ranges: { score: { min: 0, max: 100 } }, sort: { id: "score", dir: "desc" } }],
  // Adjectives and states.
  ["low debt banks", { q: "bank", ranges: { debt_equity: { max: 0.5 } }, sort: { id: "debt_equity", dir: "asc" } }],
  ["fast growing mid caps", { caps: ["mid"], ranges: { rev_growth: { min: 20 } } }],
  ["oversold large caps", { caps: ["large"], ranges: { rsi: { max: 30 } } }],
  ["above the 200 day moving average", { ranges: { vs_200d: { min: 0 } } }],
  ["stocks near 52 week highs", { ranges: { from_hi_pct: { min: -5 } }, sort: { id: "from_hi_pct", dir: "desc" } }],
  ["within 10% of their 52-week low", { ranges: { from_lo_pct: { max: 10 } }, sort: { id: "from_lo_pct", dir: "asc" } }],
  ["earnings this week", { ranges: { earnings_in_days: { min: 0, max: 7 } }, sort: { id: "earnings_in_days", dir: "asc" } }],
  ["reporting in the next 30 days", { ranges: { earnings_in_days: { min: 0, max: 30 } }, sort: { id: "earnings_in_days", dir: "asc" } }],
  ["unprofitable biotech", { q: "biotech", ranges: { net_margin: { max: 0 } } }],
  ["debt-free real estate", { sectors: ["real-estate"], ranges: { debt_equity: { max: 0.1 } } }],
  // Our call and zones (Pro on the page; the parser reads them for everyone).
  ["our call sell some", { calls: ["Trim"] }],
  ["in the buy zone", { zones: ["add"] }],
  // What the rules cannot read is handed back, never stretched.
  ["stocks with great management and a moat", { leftover: ["great management and a moat"] }],
  ["chip stocks run by founders", { q: "semiconductor", leftover: ["run by founders"] }],
];

function check(sentence: string, want: Expect, got: PlainScreen) {
  const f = got.filters;
  expect(f.q, sentence).toBe(want.q ?? "");
  expect(f.sectors, sentence).toEqual(want.sectors ?? []);
  expect(f.caps, sentence).toEqual(want.caps ?? []);
  expect(f.calls, sentence).toEqual(want.calls ?? []);
  expect(f.zones, sentence).toEqual(want.zones ?? []);
  expect(f.ranges, sentence).toEqual(want.ranges ?? {});
  if (want.sort !== undefined) expect(got.sort, sentence).toEqual(want.sort);
  expect(got.leftover, sentence).toEqual(want.leftover ?? []);
}

describe("parsePlainScreen", () => {
  for (const [sentence, want] of CASES) {
    it(`reads “${sentence.replace(/\$/g, "＄")}”`, () => check(sentence, want, parsePlainScreen(sentence)));
  }

  it("covers at least 30 phrasings", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });

  it("only ever names real fields", () => {
    for (const [sentence] of CASES) {
      const plain = parsePlainScreen(sentence);
      for (const id of Object.keys(plain.filters.ranges)) expect(FIELD_BY_ID.has(id), `${sentence}: ${id}`).toBe(true);
      if (plain.sort) expect(FIELD_BY_ID.has(plain.sort.id), sentence).toBe(true);
    }
  });

  it("reads every example under the box fully", () => {
    for (const example of PLAIN_EXAMPLES) {
      const plain = parsePlainScreen(example.text);
      expect(plain.leftover, example.text).toEqual([]);
      expect(plainHasScreen(plain), example.text).toBe(true);
    }
  });

  it("keeps the first industry and hands the second back", () => {
    const plain = parsePlainScreen("chip stocks and banks");
    expect(plain.filters.q).toBe("semiconductor");
    expect(plain.leftover).toEqual(["banks"]);
  });

  it("is empty for an empty box", () => {
    const plain = parsePlainScreen("   ");
    expect(plainHasScreen(plain)).toBe(false);
    expect(plain.leftover).toEqual([]);
  });

  it("brings what the sentence named forward as columns, the owner's sentence with the P/E beside it", () => {
    const columns = plainColumns(parsePlainScreen("stock with lowest pe compared to their history"));
    expect(columns.slice(0, 5)).toEqual(["spark", "price", "day_pct", "pe", "pe_hist_pctile"]);
    expect(columns.length).toBeLessThanOrEqual(10);
    const many = plainColumns(parsePlainScreen("p/e under 20, roe over 15%, roic over 15%, gross margin over 50%, debt to equity under 1, yield over 2%, beta under 1, rsi under 40, upside over 20%"));
    expect(many.length).toBeLessThanOrEqual(MAX_COLUMNS);
  });
});

describe("looksLikeScreen", () => {
  it.each([
    ["nvda", false],
    ["apple", false],
    ["bank of america", false],
    ["semiconductor", false],
    ["energy", false],
    ["chips", true],
    ["energy stocks", true],
    ["cheap", true],
    ["stock with lowest pe compared to their history", true],
    ["stocks with great management and a moat", true],
  ])("%s → %s", (text, want) => {
    expect(looksLikeScreen(text)).toBe(want);
  });
});

describe("cleanPlainScreen and the model's answer", () => {
  it("drops unknown fields, sectors, sizes and calls", () => {
    const plain = modelReplyToScreen({
      ranges: [
        { field: "pe", min: null, max: 20 },
        { field: "made_up_field", min: 1, max: 2 },
        { field: "__proto__", min: 1, max: 2 },
      ],
      sort: { field: "vibes", dir: "desc" },
      sectors: ["technology", "crypto", "Health Care"],
      caps: ["small", "giant"],
      calls: ["Add", "Strong buy"],
      search: "semiconductor",
      cannot: ["great management"],
    });
    expect(plain.filters.ranges).toEqual({ pe: { max: 20 } });
    expect(plain.sort).toBeNull();
    expect(plain.filters.sectors).toEqual(["technology", "health-care"]);
    expect(plain.filters.caps).toEqual(["small"]);
    expect(plain.filters.calls).toEqual(["Add"]);
    expect(plain.filters.q).toBe("semiconductor");
    expect(plain.leftover).toEqual(["great management"]);
  });

  it("clamps ranges to the field's ends and puts them in order", () => {
    const plain = modelReplyToScreen({
      ranges: [
        { field: "pe_hist_pctile", min: -40, max: 400 },
        { field: "buy_pct", min: 90, max: 10 },
        { field: "market_cap", min: 1e40, max: null },
        { field: "rev_growth", min: Number.NaN, max: null },
      ],
    });
    expect(plain.filters.ranges.pe_hist_pctile).toEqual({ min: FIELD_BOUNDS.pe_hist_pctile!.min, max: FIELD_BOUNDS.pe_hist_pctile!.max });
    expect(plain.filters.ranges.buy_pct).toEqual({ min: 10, max: 90 });
    expect(plain.filters.ranges.market_cap).toEqual({ min: 1e14 });
    expect(plain.filters.ranges.rev_growth).toBeUndefined();
  });

  it("survives anything that is not a reply", () => {
    for (const raw of [null, undefined, 42, "text", [], { ranges: "x", sectors: {}, sort: 7, cannot: [1, 2] }]) {
      const plain = modelReplyToScreen(raw);
      expect(plainHasScreen(plain)).toBe(false);
      expect(plain.leftover).toEqual([]);
    }
  });

  it("keeps a search word clean and short", () => {
    const plain = cleanPlainScreen({ filters: { q: "<script>alert(1)</script> chips".repeat(5) } });
    expect(plain.filters.q).not.toMatch(/[<>()]/);
    expect(plain.filters.q.length).toBeLessThanOrEqual(60);
  });

  it("drops fields the snapshot does not carry", () => {
    const plain = cleanPlainScreen({ filters: { ranges: { pe: { max: 20 }, iv_30d: { min: 1 } } }, sort: { id: "short_float", dir: "desc" } }, { available: new Set(["pe"]) });
    expect(plain.filters.ranges).toEqual({ pe: { max: 20 } });
    expect(plain.sort).toBeNull();
  });

  it("lets the rules win where both read the same thing", () => {
    const rules = parsePlainScreen("tech stocks with p/e under 20 and great management");
    const model = modelReplyToScreen({ ranges: [{ field: "pe", min: null, max: 35 }, { field: "roic", min: 15, max: null }], sectors: ["energy"], cannot: ["management"] });
    const merged = mergePlainScreens(rules, model);
    expect(merged.filters.ranges.pe).toEqual({ max: 20 });
    expect(merged.filters.ranges.roic).toEqual({ min: 15 });
    expect(merged.filters.sectors).toEqual(["technology", "energy"]);
    expect(merged.leftover).toEqual(["management"]);
  });
});

describe("plan gating", () => {
  it("takes our call out for a plan without call filters and says what it took", () => {
    const { plain, dropped } = withoutCallParts(parsePlainScreen("biggest companies down this year that we'd buy more"));
    expect(plain.filters.calls).toEqual([]);
    expect(plain.filters.ranges).toEqual({ ret_ytd: { max: 0 } });
    expect(dropped.calls).toEqual(["Add"]);
  });
});

describe("the link", () => {
  it("round-trips the owner's sentence through the URL", () => {
    const sentence = "stock with lowest pe compared to their history";
    const view = plainView(parsePlainScreen(sentence), { period: "day_pct" });
    const href = plainHref(view, sentence);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("pe_hist_pctile")).toBe("0..100");
    expect(params.get("sort")).toBe("pe_hist_pctile.asc");
    expect(readSaid(params.get("say"))).toBe(sentence);
    const back = parseView(params);
    expect(back.filters).toEqual(view.filters);
    expect(back.sort).toEqual(view.sort);
    expect(back.columns).toEqual(view.columns);
  });

  it("round-trips a screen with a sector, a size, a search and a money range", () => {
    const sentence = "cheap chip stocks under $500b in tech, small caps";
    const view = plainView(parsePlainScreen(sentence), { period: "day_pct" });
    const back = parseView(new URLSearchParams(plainHref(view, sentence).split("?")[1]));
    expect(back.filters).toEqual(view.filters);
    expect(back.sort).toEqual(view.sort);
  });

  it("gives a plain default sort when the sentence names none", () => {
    expect(plainView(parsePlainScreen("tech stocks"), { period: "day_pct" }).sort).toEqual(DEFAULT_SORT);
  });

  it("adds the sentence to any link, and never twice the words of a long one", () => {
    expect(withSaid("/screener", "chips")).toBe("/screener?say=chips");
    expect(withSaid("/screener?sort=pe.asc", "low pe")).toBe("/screener?sort=pe.asc&say=low%20pe");
    expect(withSaid("/screener", null)).toBe("/screener");
    expect(readSaid("x".repeat(500))!.length).toBe(200);
    expect(readSaid(["a\u0000b", "c"])).toBe("a b");
    expect(readSaid(undefined)).toBeNull();
  });

  it("names the order in words", () => {
    expect(describeSort({ id: "pe_hist_pctile", dir: "asc" })).toBe("P/E vs its history, lowest first");
    expect(describeSort({ id: "market_cap", dir: "desc" })).toBe("Company value, biggest first");
    expect(describeSort({ id: "earnings_in_days", dir: "asc" })).toBe("Earnings in, soonest first");
  });
});

describe("the owner's sentence on real-shaped rows", () => {
  it("sorts by P/E against its own history, lowest first, and keeps only stocks with that figure", () => {
    const rows: ScreenerRow[] = [
      { symbol: "AAPL", pe: 36, pe_hist_pctile: 100 },
      { symbol: "NVDA", pe: 45, pe_hist_pctile: 0 },
      { symbol: "INTC" },
      { symbol: "AMD", pe: 90, pe_hist_pctile: 22.9 },
    ];
    const view = plainView(parsePlainScreen("stock with lowest pe compared to their history"), { period: "day_pct" });
    expect(sortRows(applyFilters(rows, view.filters), view.sort).map((row) => row.symbol)).toEqual(["NVDA", "AMD", "AAPL"]);
  });
});

describe("the read cache", () => {
  it("answers the same sentence again without a second read, however it is spaced or cased", async () => {
    clearPlainCache();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return parsePlainScreen("p/e under 20");
    };
    const [a, b] = await Promise.all([readOnce("Boring stocks", read), readOnce("boring  STOCKS", read)]);
    expect(reads).toBe(1);
    expect(a).toEqual(b);
    expect(cachedPlainRead("boring stocks")).toEqual(a);
  });

  it("forgets a read after a day", () => {
    clearPlainCache();
    rememberPlainRead("x stocks", parsePlainScreen("p/e under 20"), 0);
    expect(cachedPlainRead("x stocks", 1000)).not.toBeNull();
    expect(cachedPlainRead("x stocks", 25 * 3600 * 1000)).toBeNull();
  });
});

describe("words outside the screen", () => {
  it("hands back the person's own holdings whole, never as our call", () => {
    const plain = parsePlainScreen("stocks we hold");
    expect(plain.filters.calls).toEqual([]);
    expect(plain.leftover).toEqual(["stocks we hold"]);
  });

  it("keeps the rules' leftover when the model placed nothing", () => {
    const rules = parsePlainScreen("stocks with great management and a moat");
    const merged = mergePlainScreens(rules, modelReplyToScreen({ ranges: [{ field: "roic", min: null, max: null }], cannot: ["great management"] }));
    expect(merged.leftover).toEqual(["great management and a moat"]);
  });
});

describe("QA cases", () => {
  it("leaves a negated phrase over instead of reading its opposite", () => {
    for (const sentence of ["stocks that don't pay dividends", "not profitable", "not in tech", "excluding banks", "companies without debt"]) {
      const plain = parsePlainScreen(sentence);
      expect(plainHasScreen(plain), sentence).toBe(false);
      expect(plain.leftover.length, sentence).toBeGreaterThan(0);
    }
    // A negation next to a screen it does not touch keeps the rest.
    const mixed = parsePlainScreen("small caps not in tech");
    expect(mixed.filters.caps).toEqual(["small"]);
    expect(mixed.filters.sectors).toEqual([]);
  });

  it("reads top 10 as an order, never as a 10% figure", () => {
    const plain = parsePlainScreen("top 10 dividend stocks");
    expect(plain.filters.ranges).toEqual({});
    expect(plain.sort).toEqual({ id: "div_yield", dir: "desc" });
    expect(plain.leftover).toEqual([]);
  });

  it("reads big numbers with commas and bare dollar amounts", () => {
    expect(parsePlainScreen("market cap over 2,000,000,000").filters.ranges.market_cap).toEqual({ min: 2e9 });
    expect(parsePlainScreen("market cap over 2000000000").filters.ranges.market_cap).toEqual({ min: 2e9 });
    expect(parsePlainScreen("market cap over 50").filters.ranges.market_cap).toEqual({ min: 50e9 });
    expect(parsePlainScreen("stocks under 10 dollars").filters.ranges.price).toEqual({ max: 10 });
  });

  it("only reads this year as this year", () => {
    const year = new Date().getUTCFullYear();
    expect(parsePlainScreen(`down in ${year}`).filters.ranges.ret_ytd).toEqual({ max: 0 });
    expect(parsePlainScreen(`down in ${year - 1}`).filters.ranges.ret_ytd).toBeUndefined();
  });

  it("reads two sizes, and the fastest growers as an order", () => {
    expect(parsePlainScreen("small and mid caps").filters.caps).toEqual(["small", "mid"]);
    expect(parsePlainScreen("fastest growing software").sort).toEqual({ id: "rev_growth", dir: "desc" });
  });

  it("treats long company names as names", () => {
    for (const name of ["Advanced Micro Devices Inc", "Bank of America Corp", "The Home Depot Inc", "Texas Pacific Land Corp", "Taiwan Semiconductor Manufacturing Company"]) {
      expect(looksLikeScreen(name), name).toBe(false);
    }
    expect(looksLikeScreen("boring stocks my grandma would like")).toBe(true);
  });
});

describe("name search", () => {
  it("finds a company typed with its legal suffix", () => {
    const rows: ScreenerRow[] = [{ symbol: "AMD", name: "Advanced Micro Devices" }, { symbol: "BAC", name: "Bank of America" }];
    const find = (q: string) => applyFilters(rows, { q, sectors: [], caps: [], calls: [], zones: [], ranges: {} }).map((row) => row.symbol);
    expect(find("advanced micro devices inc")).toEqual(["AMD"]);
    expect(find("bank of america corp")).toEqual(["BAC"]);
    expect(find("inc")).toEqual([]);
  });
});
