import { describe, expect, it } from "vitest";

import { parseJobDraft } from "@/lib/agent-jobs";

import { ModelLimitError, parseByRules, parsePlainRequest, specFromModel, withLeftover, type ModelParse, type ModelWatch } from "./parse";
import { sameJob, savedSentence } from "./save";
import { buildCatalog, findStocks, resolveStock } from "./stocks";

const catalog = buildCatalog([
  { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
  { ticker: "AAPL", name: "Apple Inc.", aliases: ["AAPL", "Apple"], price: 348.63 },
  { ticker: "MSFT", name: "Microsoft Corporation", aliases: ["MSFT", "Microsoft"], price: 420 },
  { ticker: "AMD", name: "Advanced Micro Devices", aliases: ["AMD"], price: 240 },
  { ticker: "TSLA", name: "Tesla, Inc.", aliases: ["TSLA", "Tesla"], price: 410 },
  { ticker: "TGT", name: "Target Corporation", price: 130 },
  { ticker: "NOW", name: "ServiceNow, Inc.", aliases: ["NOW", "ServiceNow"], price: 900 },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", price: 750 },
  { ticker: "BRK.B", name: "Berkshire Hathaway", price: 480 },
  { ticker: "T", name: "AT&T Inc.", aliases: ["T", "AT&T"], price: 25 },
]);

const SHOWN = { hidden: [] as string[] };
const EARNINGS_OFF = { hidden: ["earnings-out"] };

function rules(text: string, ctx = EARNINGS_OFF) {
  return parseByRules(text, catalog, ctx);
}

describe("finding stocks", () => {
  it("reads tickers, $tickers, lowercase tickers and company names", () => {
    expect(findStocks("NVDA, $tsla, nvda and Apple's chips", catalog).hits.map((hit) => hit.ticker)).toEqual(["NVDA", "TSLA", "AAPL"]);
    expect(findStocks("tell me about microsoft and amd", catalog).hits.map((hit) => hit.ticker)).toEqual(["MSFT", "AMD"]);
  });

  it("does not read ordinary words as tickers", () => {
    expect(findStocks("tell me now if anything I own falls", catalog).hits).toEqual([]);
    expect(findStocks("hits my target price", catalog).hits).toEqual([]);
    expect(findStocks("Target drops", catalog).hits.map((hit) => hit.ticker)).toEqual(["TGT"]);
    // "NOW" in capitals is usually emphasis; with a $ it is ServiceNow.
    expect(findStocks("NOW drops", catalog).hits).toEqual([]);
    expect(findStocks("$NOW drops", catalog).hits.map((hit) => hit.ticker)).toEqual(["NOW"]);
  });

  it("keeps capital words it can't find, and never treats acronyms as missing stocks", () => {
    expect(findStocks("ping me if XYZQ drops", catalog).unknown.map((word) => word.text)).toEqual(["XYZQ"]);
    expect(findStocks("when the CEO sells or a 13F ETF", catalog).unknown).toEqual([]);
    // A request in capitals is shouting, not a list of tickers.
    expect(findStocks("TELL ME IF APPLE DROPS BELOW 300", catalog).hits.map((hit) => hit.ticker)).toEqual(["AAPL"]);
    expect(findStocks("TELL ME IF APPLE DROPS BELOW 300", catalog).unknown).toEqual([]);
  });

  it("resolves one stock as written", () => {
    expect(resolveStock("Nvidia", catalog)?.ticker).toBe("NVDA");
    expect(resolveStock("$brk.b", catalog)?.ticker).toBe("BRK.B");
    expect(resolveStock("Rivian", catalog)).toBeNull();
  });
});

describe("rules: the common shapes", () => {
  it("a price level or a fund selling, on one stock", () => {
    const result = rules("tell me if NVDA drops below 150 or a fund sells it");
    expect(result.confident).toBe(true);
    expect(result.spec.via).toBe("rules");
    expect(result.spec.lead).toBe("I'll watch NVIDIA (NVDA) and tell you:");
    expect(result.spec.watches.map((watch) => watch.draft)).toEqual([
      { template: "price-level", name: "NVDA below $150", trigger: { type: "price", rule: "crosses_below", level: 150 }, scope: { kind: "tickers", tickers: ["NVDA"] } },
      { template: "fund-filing", name: "NVDA: new 13F filings", trigger: { type: "event", event: "fund_13f" }, scope: { kind: "tickers", tickers: ["NVDA"] } },
    ]);
    expect(result.spec.watches[0].line).toBe("when it closes below $150");
    expect(result.spec.watches[1].line).toBe("when a fund we track files a new 13F, and whether NVIDIA is among its biggest changes");
    // We can't tell a sale from a purchase in a 13F, and we say so instead of pretending.
    expect(result.spec.watches[1].note).toMatch(/can't yet tell a sale from a purchase/);
    expect(result.spec.cannot).toEqual([]);
  });

  it("anything I own moving 5% in a day", () => {
    const result = rules("Ping me when anything I own moves more than 5% in a day");
    expect(result.confident).toBe(true);
    expect(result.spec.watches).toHaveLength(1);
    expect(result.spec.watches[0].draft).toMatchObject({ template: "big-move", trigger: { rule: "moves_pct", pct: 5 }, scope: { kind: "watchlist" } });
    expect(result.spec.sentence).toBe("I'll watch the stocks you track and tell you when any of them moves 5% or more in a day, up or down.");
    expect(result.spec.uses_watchlist).toBe(true);
  });

  it("before a company reports earnings, with the number of days", () => {
    expect(rules("let me know before Apple reports earnings").spec.watches[0].draft).toMatchObject({
      template: "earnings-ahead",
      trigger: { event: "earnings_approaching", days_before: 3 },
      scope: { kind: "tickers", tickers: ["AAPL"] },
    });
    expect(rules("let me know before Apple reports").spec.watches[0].draft.template).toBe("earnings-ahead");
    expect(rules("warn me 2 days before nvidia and amd report").spec.watches[0].draft).toMatchObject({
      trigger: { days_before: 2 },
      scope: { kind: "tickers", tickers: ["NVDA", "AMD"] },
    });
    expect(rules("remind me a week before my stocks report earnings").spec.watches[0].draft).toMatchObject({ trigger: { days_before: 7 }, scope: { kind: "watchlist" } });
    expect(rules("tell me the day before Tesla reports earnings").spec.watches[0].line).toBe("when it is a day away from reporting earnings");
  });

  it("after earnings: offered only when that agent is switched on", () => {
    const off = rules("tell me when Apple reports earnings");
    expect(off.spec.watches).toEqual([]);
    expect(off.spec.cannot[0]).toMatchObject({ code: "earnings_out_off", suggest: "Tell me 3 days before Apple reports earnings" });
    expect(off.spec.cannot[0].line).toMatch(/^I can't watch that yet: /);
    expect(rules("tell me when Apple reports earnings", SHOWN).spec.watches[0].draft.template).toBe("earnings-out");
  });

  it("Congress, insiders and the movers list", () => {
    expect(rules("Tell me when a member of Congress trades Microsoft").spec.watches[0].draft).toMatchObject({
      template: "congress-trade",
      scope: { kind: "tickers", tickers: ["MSFT"] },
    });
    const pelosi = rules("tell me when pelosi buys anything");
    expect(pelosi.spec.watches[0].draft.scope).toEqual({ kind: "any" });
    expect(pelosi.spec.watches[0].note).toMatch(/can't follow one member yet.*Nancy Pelosi/);
    const insiders = rules("let me know when insiders sell AAPL");
    expect(insiders.spec.watches[0].draft).toMatchObject({ template: "insider-trade", scope: { kind: "tickers", tickers: ["AAPL"] } });
    expect(insiders.spec.watches[0].note).toMatch(/buys and sells alike/);
    expect(rules("tell me when an insider buys").spec.watches[0].draft.scope).toEqual({ kind: "watchlist" });
    expect(rules("tell me when Tesla shows up on the movers list").spec.watches[0].draft.template).toBe("mover");
    expect(rules("tell me when AAPL is a good price to buy").spec.watches[0].draft.template).toBe("buy-zone");
  });

  it("schedules", () => {
    const weekly = rules("every friday sum up my week");
    expect(weekly.spec.watches[0].draft).toMatchObject({ template: "weekly-review", trigger: { cadence: "weekly", weekday: 5 } });
    expect(weekly.spec.sentence).toBe(
      "Every Friday, I'll send you a review of the stocks you track: moves of 5% or more over five sessions, earnings in the week ahead and trades by members of Congress.",
    );
    expect(rules("every morning send me a summary").spec.watches[0].draft.template).toBe("morning-check");
    expect(rules("ping me every saturday").spec.cannot[0]).toMatchObject({ code: "weekend", suggest: "Every Friday, sum up my week" });
  });

  it("one price level per stock, and 'hits' read against where the stock trades", () => {
    const two = rules("tell me if apple or microsoft falls under 300");
    expect(two.spec.watches.map((watch) => watch.draft.scope)).toEqual([
      { kind: "tickers", tickers: ["AAPL"] },
      { kind: "tickers", tickers: ["MSFT"] },
    ]);
    expect(two.spec.lead).toBe("I'll tell you:");
    expect(rules("alert me if tesla hits 500").spec.watches[0].draft.trigger).toEqual({ type: "price", rule: "crosses_above", level: 500 });
    expect(rules("alert me if tesla hits 300").spec.watches[0].draft.trigger).toEqual({ type: "price", rule: "crosses_below", level: 300 });
    const mixed = rules("tell me if NVDA goes over 200 and if AMD goes under 100");
    expect(mixed.spec.watches.map((watch) => watch.full)).toEqual(["when NVIDIA closes above $200", "when Advanced Micro Devices closes below $100"]);
  });

  it("says what to expect: one-way moves, closes only, a level already passed", () => {
    const drop = rules("text me the moment AMD drops 3%");
    expect(drop.spec.watches[0].note).toMatch(/You asked about drops/);
    expect(drop.spec.watches[0].note).toMatch(/after the market closes/);
    expect(rules("tell me if NVDA falls below 200").spec.watches[0].note).toMatch(/already below \$200/);
    expect(rules("tell me if NVDA falls below 2").spec.watches[0].note).toMatch(/check the number/);
    expect(rules("tell me if Tesla makes a big move").spec.watches[0].note).toMatch(/I picked 5%/);
  });

  it("reads the S&P 500 as SPY and says so", () => {
    const result = rules("tell me when the S&P 500 drops 2%");
    expect(result.spec.watches[0].draft.scope).toEqual({ kind: "tickers", tickers: ["SPY"] });
    expect(result.spec.watches[0].note).toMatch(/I'll watch SPY, the fund that tracks the S&P 500/);
  });
});

describe("rules: found in review", () => {
  const scopes = (text: string) => rules(text).spec.watches.map((watch) => watch.draft.scope);

  it("stocks named after the trigger join it", () => {
    expect(scopes("tell me when insiders buy NVDA or AMD")).toEqual([{ kind: "tickers", tickers: ["NVDA", "AMD"] }]);
    expect(scopes("every friday give me a recap of NVDA and AMD")).toEqual([{ kind: "tickers", tickers: ["NVDA", "AMD"] }]);
    expect(scopes("NVDA drops 5% or AMD does")).toEqual([{ kind: "tickers", tickers: ["NVDA", "AMD"] }]);
    expect(scopes("NVDA drops below 150, AMD too")).toEqual([
      { kind: "tickers", tickers: ["NVDA"] },
      { kind: "tickers", tickers: ["AMD"] },
    ]);
    // A new request after "and" is not folded into the one before.
    const two = rules("tell me if NVDA drops below 150 and before Apple reports earnings");
    expect(two.spec.watches.map((watch) => watch.draft.template)).toEqual(["price-level", "earnings-ahead"]);
    expect(two.spec.watches[1].draft.scope).toEqual({ kind: "tickers", tickers: ["AAPL"] });
  });

  it("a company we don't recognise is never turned into your whole list", () => {
    const lucid = rules("tell me if lucid drops 10%");
    expect(lucid.confident).toBe(false);
    const fallback = withLeftover("tell me if lucid drops 10%", lucid, EARNINGS_OFF);
    expect(fallback.watches).toEqual([]);
    expect(fallback.cannot.map((entry) => entry.line)).toEqual([
      "I didn't follow “lucid”. Name a stock and what should happen, like “tell me if NVDA closes below 150”.",
    ]);
  });

  it("a refused clause adds no watch of its own", () => {
    const pe = rules("tell me if NVDA's P/E goes below 30");
    expect(pe.spec.watches).toEqual([]);
    expect(pe.spec.cannot.map((entry) => entry.code)).toEqual(["fundamentals"]);
    const crypto = rules("tell me if NVDA drops below 150 and sell it if bitcoin crashes");
    expect(crypto.spec.watches.map((watch) => watch.draft.template)).toEqual(["price-level"]);
  });

  it("reads numbers with commas, a second price, and refuses a dollar move", () => {
    expect(rules("tell me if AAPL goes above $1,200.50").spec.watches[0].draft.trigger).toEqual({ type: "price", rule: "crosses_above", level: 1200.5 });
    expect(rules("tell me if NVDA drops below 150 or 140").spec.watches.map((watch) => watch.draft.trigger)).toEqual([
      { type: "price", rule: "crosses_below", level: 150 },
      { type: "price", rule: "crosses_below", level: 140 },
    ]);
    expect(rules("nvda < 150").spec.watches[0].draft.trigger).toEqual({ type: "price", rule: "crosses_below", level: 150 });
    expect(rules("tell me if NVDA drops $5").confident).toBe(false);
    expect(rules("tell me if NVDA falls 10 dollars").confident).toBe(false);
    const sixty = rules("tell me if NVDA moves more than 60");
    expect(sixty.spec.watches).toEqual([]);
    expect(sixty.spec.cannot.map((entry) => entry.code)).toEqual(["out_of_range"]);
  });

  it("'only on Fridays' beside another agent is refused, not turned into a weekly review", () => {
    const result = rules("tell me if NVDA drops below 150 but only on fridays");
    expect(result.spec.watches.map((watch) => watch.draft.template)).toEqual(["price-level"]);
    expect(result.spec.cannot[0].line).toMatch(/can't be limited to some days/);
  });

  it("asks for a $ on one-letter tickers instead of guessing", () => {
    const bare = rules("T drops below 20");
    expect(bare.spec.watches).toEqual([]);
    expect(bare.spec.cannot[0].line).toMatch(/write it as \$T/);
    expect(rules("$T drops below 20").spec.watches[0].draft.scope).toEqual({ kind: "tickers", tickers: ["T"] });
  });

  it("Berkshire filing a 13F is the fund, not the shares", () => {
    const result = rules("tell me when Berkshire files a 13F");
    expect(result.spec.watches[0].draft.scope).toEqual({ kind: "any" });
    expect(result.spec.watches[0].note).toMatch(/not only Berkshire Hathaway/);
  });

  it("folds two move sizes on the same stocks into one agent", () => {
    const result = rules("tell me if NVDA goes up 5% or down 3%");
    expect(result.spec.watches).toHaveLength(1);
    expect(result.spec.watches[0].draft.trigger).toEqual({ type: "price", rule: "moves_pct", pct: 3 });
    expect(result.spec.watches[0].note).toMatch(/one agent at 3% covers them all/);
  });
});

describe("rules: what we can't watch", () => {
  const codes = (text: string) => rules(text).spec.cannot.map((entry) => entry.code);

  it("names the reason in plain words and never invents a watch", () => {
    for (const [text, code] of [
      ["tell me about any news on Tesla", "news"],
      ["tell me when NVDA crosses its 200 day moving average", "chart_signals"],
      ["tell me when analysts upgrade Apple", "analyst_ratings"],
      ["let me know when MSFT announces a dividend", "dividends"],
      ["tell me when bitcoin goes above 100k", "not_a_us_stock"],
      ["tell me if Apple is up 20% from what I paid", "cost_basis"],
      ["tell me if my stocks drop 10% in a week", "multi_day_move"],
    ] as const) {
      const result = rules(text);
      expect(result.spec.watches, text).toEqual([]);
      expect(codes(text), text).toContain(code);
      expect(result.spec.cannot[0].line, text).toMatch(/^I can't watch that yet: [a-z].*\.$|^I can't watch that yet: .*”\.$/);
    }
  });

  it("keeps the price alert next to a request to trade, and refuses the trade", () => {
    const result = rules("sell NVDA for me if it drops below 150");
    expect(result.spec.watches.map((watch) => watch.draft.trigger)).toEqual([{ type: "price", rule: "crosses_below", level: 150 }]);
    expect(result.spec.cannot.map((entry) => entry.code)).toEqual(["trading"]);
  });

  it("a stock we don't cover is named, and its rule is not moved onto your list", () => {
    const result = rules("tell me if XYZQ moves 5%");
    expect(result.spec.watches).toEqual([]);
    expect(result.spec.cannot.map((entry) => entry.line)).toEqual(["I can't watch that yet: I couldn't find “XYZQ” among the US stocks and funds we cover."]);
    const mixed = rules("tell me if XYZQ or AAPL drops 5%");
    expect(mixed.spec.watches[0].draft.scope).toEqual({ kind: "tickers", tickers: ["AAPL"] });
    expect(mixed.spec.cannot.map((entry) => entry.code)).toEqual(["not_a_us_stock"]);
  });

  it("out-of-range numbers are refused with the range", () => {
    expect(rules("tell me if NVDA drops 60%").spec.cannot[0].line).toBe("I can't watch that yet: agents watch daily moves between 1% and 50%.");
    expect(rules("tell me 20 days before earnings for AAPL").spec.cannot[0].line).toMatch(/between 1 and 14 days/);
  });

  it("is unsure, not wrong, when words are left over", () => {
    const result = rules("tell me when Bridgewater sells Apple");
    expect(result.confident).toBe(false);
    expect(result.leftover).toContain("Bridgewater");
    expect(rules("what's up with tesla").confident).toBe(false);
  });

  it("every watch it returns passes the agents API's own validation", () => {
    for (const text of [
      "tell me if NVDA drops below 150 or a fund sells it",
      "Ping me when anything I own moves more than 5% in a day",
      "Let me know 3 days before Apple reports earnings",
      "every monday sum up my week",
      "tell me when Congress trades Microsoft or insiders sell it",
    ]) {
      for (const watch of rules(text).spec.watches) expect(parseJobDraft(watch.draft, EARNINGS_OFF).ok, text).toBe(true);
    }
  });
});

function watch(partial: Partial<ModelWatch> & Pick<ModelWatch, "kind">): ModelWatch {
  return { stocks: [], my_stocks: false, any_stock: false, level: null, pct: null, direction: null, days_before: null, weekday: null, side: null, person: null, ...partial };
}

describe("the model's answer", () => {
  it("is resolved against the catalogue and validated, like the rules", () => {
    const parsed: ModelParse = {
      watches: [watch({ kind: "fund_13f", stocks: ["Apple"], side: "sell", person: "Bridgewater" })],
      cannot: [],
    };
    const spec = specFromModel("tell me when Bridgewater sells Apple", parsed, catalog, EARNINGS_OFF);
    expect(spec.via).toBe("model");
    expect(spec.watches[0].draft).toMatchObject({ template: "fund-filing", scope: { kind: "tickers", tickers: ["AAPL"] } });
    expect(spec.watches[0].note).toMatch(/can't follow one fund yet.*not only Bridgewater/);
  });

  it("drops invented kinds and stocks, and never widens a missing stock to your list", () => {
    const parsed = {
      watches: [
        watch({ kind: "daily_move", stocks: ["Rivian"], pct: 5 }),
        { ...watch({ kind: "price_below", stocks: ["NVDA"] }), kind: "options_flow" },
        watch({ kind: "price_below", stocks: ["NVDA"], level: -4 }),
      ],
      cannot: [{ quote: "something I never wrote", reason: "news" }],
    } as unknown as ModelParse;
    const spec = specFromModel("tell me if Rivian moves 5% or NVDA falls below -4", parsed, catalog, EARNINGS_OFF);
    expect(spec.watches).toEqual([]);
    expect(spec.cannot.map((entry) => entry.code)).toEqual(["not_a_us_stock", "news", "out_of_range"]);
    expect(spec.cannot[0].line).toBe("I can't watch that yet: I couldn't find “Rivian” among the US stocks and funds we cover.");
    // A quote that isn't in the request is not shown as if the person wrote it.
    expect(spec.cannot[1].what).toBeNull();
  });

  it("refuses a weekend schedule and unknown reasons fall back to a plain one", () => {
    const spec = specFromModel(
      "sum up my week every sunday and watch the vibes",
      { watches: [watch({ kind: "weekly_review", my_stocks: true, weekday: 0 })], cannot: [{ quote: "watch the vibes", reason: "made_up" as never }] },
      catalog,
    );
    expect(spec.watches).toEqual([]);
    expect(spec.cannot.map((entry) => entry.code)).toEqual(["weekend", "other"]);
    expect(spec.cannot[1]).toMatchObject({ what: "watch the vibes", line: "I can't watch that yet: it isn't something agents check." });
  });

  it("is asked only when the rules are unsure, and the rules stand when it fails or is out of reads", async () => {
    let calls = 0;
    const model = async () => {
      calls += 1;
      return { watches: [watch({ kind: "fund_13f", stocks: ["Apple"] })], cannot: [] };
    };
    await parsePlainRequest("tell me if NVDA drops below 150", catalog, { ...EARNINGS_OFF, model });
    expect(calls).toBe(0);
    const read = await parsePlainRequest("tell me when Bridgewater sells Apple", catalog, { ...EARNINGS_OFF, model });
    expect(calls).toBe(1);
    expect(read.via).toBe("model");

    const failing = await parsePlainRequest("tell me when Bridgewater sells Apple", catalog, {
      ...EARNINGS_OFF,
      model: async () => {
        throw new Error("timeout");
      },
    });
    expect(failing.via).toBe("rules");
    expect(failing.cannot.some((entry) => entry.code === "unclear" && entry.what?.includes("Bridgewater"))).toBe(true);

    const limited = await parsePlainRequest("tell me when Bridgewater sells Apple", catalog, {
      ...EARNINGS_OFF,
      model: async () => {
        throw new ModelLimitError();
      },
    });
    expect(limited.limited).toBe(true);
  });
});

describe("the model's answer: guarded", () => {
  it("drops stocks and numbers the person never wrote", () => {
    const invented = specFromModel(
      "tell me when my favourite chip stock drops a lot",
      { watches: [watch({ kind: "price_below", stocks: ["NVDA"], level: 100 }), watch({ kind: "daily_move", stocks: ["now"], pct: 5 })], cannot: [] },
      catalog,
      EARNINGS_OFF,
    );
    expect(invented.watches.every((entry) => entry.draft.scope.kind !== "tickers")).toBe(true);
    expect(invented.watches.some((entry) => entry.draft.template === "price-level")).toBe(false);
    // "now" in the request is a word, not ServiceNow.
    expect(resolveStock("now", catalog)).toBeNull();
    expect(resolveStock("$NOW", catalog)?.ticker).toBe("NOW");
    expect(resolveStock("ServiceNow", catalog)?.ticker).toBe("NOW");
  });

  it("does not quote fragments as the person's words", () => {
    const spec = specFromModel("tell me if NVDA drops", { watches: [], cannot: [{ quote: "e", reason: "other" }] }, catalog);
    expect(spec.cannot[0].what).toBeNull();
  });
});

describe("saving", () => {
  it("treats the same rule on the same stocks as one agent, whatever its name", () => {
    const a = { template: "big-move", trigger: { type: "price" as const, rule: "moves_pct" as const, pct: 5 }, scope: { kind: "tickers" as const, tickers: ["AAPL", "MSFT"] } };
    expect(sameJob(a, { ...a, scope: { kind: "tickers", tickers: ["MSFT", "AAPL"] } })).toBe(true);
    expect(sameJob(a, { ...a, trigger: { type: "price", rule: "moves_pct", pct: 4 } })).toBe(false);
    expect(sameJob(a, { ...a, scope: { kind: "watchlist" } })).toBe(false);
  });

  it("says what was saved, what was paused and what was already there", () => {
    expect(savedSentence({ saved: [{ name: "NVDA below $150", enabled: true }], already: [], limit: 2 })).toBe("“NVDA below $150” is on. Reports show up below after the next check.");
    expect(
      savedSentence({
        saved: [
          { name: "NVDA below $150", enabled: true },
          { name: "NVDA: new 13F filings", enabled: false },
        ],
        already: ["AAPL: insider trades"],
        limit: 2,
      }),
    ).toBe(
      "“NVDA below $150” is on. Reports show up below after the next check. Your plan runs two agents at a time, so “NVDA: new 13F filings” is saved and paused. Pause another agent to switch it on. You already had “AAPL: insider trades”, so it was left as it was.",
    );
  });
});

describe("index levels", () => {
  it("refuses an index level read onto the fund's price, and offers a move", () => {
    const result = parseByRules("tell me if the S&P 500 falls below 6,000", catalog, { hidden: [] });
    expect(result.spec.watches).toEqual([]);
    expect(result.spec.cannot[0]).toMatchObject({ code: "other", suggest: "Tell me when the S&P 500 drops 2%" });
    expect(result.spec.cannot[0].line).toMatch(/its price is not the index level/);
  });
});
