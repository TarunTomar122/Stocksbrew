import { describe, expect, it } from "vitest";

import { BASKET_EXAMPLES } from "./examples";
import { mergeModelParse, parseBasketRequest, settleLeftover } from "./parse";
import { SLUG_PATTERN, normalizeSpec, rankWords, specKey, specSentence, specSlug, specTitle, themeSlugFor } from "./spec";

function read(text: string) {
  const parse = parseBasketRequest(text);
  return { parse, sentence: specSentence(parse.spec), title: specTitle(parse.spec) };
}

describe("parseBasketRequest: the owner's examples", () => {
  it("reads AI power stocks under $50B as power, grid and cooling tied to AI or power demand", () => {
    const { parse, sentence, title } = read("AI power stocks under $50B");
    expect(parse.spec.topics).toEqual(["power", "grid", "cooling"]);
    expect(parse.spec.ties).toEqual(["power_demand"]);
    expect(parse.spec.ranges.market_cap).toEqual({ max: 50e9 });
    expect(parse.cannot).toEqual([]);
    expect(parse.leftover).toEqual([]);
    expect(sentence).toBe(
      "Companies in power generation, grid equipment or data-center cooling that are worth less than $50 billion, that our research ties to AI or to rising electricity demand.",
    );
    expect(title).toBe("AI power stocks under $50B");
  });

  it("reads dividend payers that grew sales 10% a year as a three-year growth rate plus a dividend", () => {
    const { parse, sentence } = read("dividend payers that grew sales 10% a year");
    expect(parse.spec.ranges.rev_cagr_3y).toEqual({ min: 10 });
    expect(parse.spec.ranges.div_yield).toEqual({ min: 0.01 });
    expect(parse.spec.ranges.rev_growth).toBeUndefined();
    expect(parse.spec.rank).toEqual({ field: "rev_cagr_3y", dir: "desc" });
    expect(sentence).toBe("Companies we cover that grew sales 10% or more a year over the last three years and pay a dividend.");
  });

  it("reads cheap banks as banks below their sector's middle P/E, cheapest first", () => {
    const { parse, sentence } = read("cheap banks");
    expect(parse.spec.topics).toEqual(["banks"]);
    expect(parse.spec.cheap).toBe(true);
    expect(sentence).toBe("Banks that trade on a lower P/E than the middle of their sector.");
    expect(rankWords(parse.spec.rank)).toBe("Ranked by P/E, cheapest first.");
  });
});

describe("parseBasketRequest: shapes", () => {
  it("tells a share price from a company value by the unit", () => {
    expect(parseBasketRequest("stocks under $20 a share").spec.ranges.price).toEqual({ max: 20 });
    expect(parseBasketRequest("stocks under $20").spec.ranges.price).toEqual({ max: 20 });
    expect(parseBasketRequest("stocks under $20B").spec.ranges.market_cap).toEqual({ max: 20e9 });
    expect(parseBasketRequest("worth more than 1.5 trillion").spec.ranges.market_cap).toEqual({ min: 1.5e12 });
    expect(parseBasketRequest("market cap between $2B and $10B").spec.ranges.market_cap).toEqual({ min: 2e9, max: 10e9 });
  });

  it("reads size words as cap tiers", () => {
    expect(parseBasketRequest("small cap biotech").spec.caps).toEqual(["small"]);
    expect(parseBasketRequest("blue chips").spec.caps).toEqual(["mega", "large"]);
  });

  it("reads a P/E ceiling as positive and under the number, without a strange floor in the sentence", () => {
    const { parse, sentence } = read("dividend aristocrats with a P/E under 20");
    expect(parse.spec.ranges.pe).toEqual({ min: 0.01, max: 20 });
    expect(parse.spec.ranges.div_growth_years).toEqual({ min: 25 });
    expect(sentence).toBe("Companies we cover that have a P/E under 20 and have raised their dividend at least 25 years in a row.");
  });

  it("reads one-year growth when no yearly rate is named", () => {
    expect(parseBasketRequest("revenue growth over 20% yoy").spec.ranges.rev_growth).toEqual({ min: 20 });
    expect(parseBasketRequest("earnings growth of 15%").spec.ranges.eps_growth).toEqual({ min: 15 });
    expect(parseBasketRequest("fast growing software").spec.ranges.rev_growth).toEqual({ min: 20 });
  });

  it("reads exclusions after except, and keeps the wider sector", () => {
    const { parse, sentence } = read("tech stocks except semiconductors growing revenue 20% yoy");
    expect(parse.spec.topics).toEqual(["sector_technology"]);
    expect(parse.spec.exclude).toEqual(["semiconductors"]);
    expect(parse.leftover).toEqual([]);
    expect(sentence).toBe("Technology companies that grew sales 20% or more over the last year, leaving out chips.");
  });

  it("drops a whole sector next to a narrower subject inside it", () => {
    expect(parseBasketRequest("tech software companies").spec.topics).toEqual(["software"]);
  });

  it("reads AI next to another subject as a tie, and AI alone as the tie on everything", () => {
    expect(read("AI chip stocks").sentence).toBe("Chipmakers that our research ties to AI demand.");
    const alone = parseBasketRequest("AI stocks").spec;
    expect(alone.topics).toEqual([]);
    expect(alone.ties).toEqual(["ai"]);
    expect(specSentence(alone)).toBe("Companies that our research ties to AI demand.");
  });

  it("reads momentum, highs and lows, risk and analysts", () => {
    const spec = parseBasketRequest("chipmakers with momentum near 52-week highs").spec;
    expect(spec.ranges.ret_6m).toEqual({ min: 15 });
    expect(spec.ranges.vs_200d).toEqual({ min: 0 });
    expect(spec.ranges.from_hi_pct).toEqual({ min: -5 });
    expect(parseBasketRequest("beaten down retailers").spec.ranges.from_hi_pct).toEqual({ max: -30 });
    expect(parseBasketRequest("low volatility utilities").spec.ranges.vol_90d).toEqual({ max: 25 });
    expect(parseBasketRequest("defense companies analysts love").spec.ranges.buy_pct).toEqual({ min: 70 });
    expect(parseBasketRequest("heavily shorted stocks").spec.ranges.short_float).toEqual({ min: 15 });
    expect(parseBasketRequest("yield over 4%").spec.ranges.div_yield).toEqual({ min: 4 });
  });

  it("reads index membership and our call", () => {
    const spec = parseBasketRequest("S&P 500 stocks rated add").spec;
    expect(spec.indexes).toEqual(["S&P 500"]);
    expect(spec.calls).toEqual(["Add"]);
    expect(parseBasketRequest("sp500 banks").spec.indexes).toEqual(["S&P 500"]);
  });

  it("says plainly what it cannot filter on", () => {
    const parse = parseBasketRequest("Chinese EV stocks");
    expect(parse.cannot.map((item) => item.code)).toEqual(["geography", "ev"]);
    expect(parse.cannot[0]!.line).toMatch(/^I can't filter on that yet: /);
    expect(normalizeSpec(parse.spec).topics).toEqual([]);
  });

  it("turns leftover words into an I-didn't-use line when no model read them", () => {
    const parse = settleLeftover(parseBasketRequest("banks for grandma"));
    expect(parse.spec.topics).toEqual(["banks"]);
    expect(parse.cannot.at(-1)?.line).toBe("I didn't use “grandma”: it doesn't match a field or an industry we hold.");
  });
});

describe("mergeModelParse", () => {
  it("only fills gaps, from known ids, with numbers written in the request", () => {
    const base = parseBasketRequest("banks with a juicy 50 thing");
    const merged = mergeModelParse(base, {
      topics: ["insurance", "made_up"],
      ties: [],
      exclude: [],
      filters: [
        { field: "div_yield", min: 50, max: null },
        { field: "pe", min: null, max: 12 },
        { field: "not_a_field", min: 1, max: null },
      ],
      cannot: [{ quote: "juicy", reason: "unclear" }],
    });
    expect(merged.spec.topics).toEqual(["banks", "insurance"]);
    expect(merged.spec.ranges.div_yield).toEqual({ min: 50 });
    // 12 is not in the request, so the model cannot bring it.
    expect(merged.spec.ranges.pe).toBeUndefined();
    expect(merged.via).toBe("model");
    expect(merged.leftover).toEqual([]);
  });
});

describe("spec keys and slugs", () => {
  it("gives the same key whatever order the subjects came in", () => {
    const a = normalizeSpec({ topics: ["power", "grid"], ranges: { market_cap: { max: 5e10 } } });
    const b = normalizeSpec({ ranges: { market_cap: { max: 5e10 } }, topics: ["grid", "power"] });
    expect(specKey(a)).toBe(specKey(b));
    expect(specSlug(a)).toMatch(SLUG_PATTERN);
  });

  it("drops unknown parts of a stored spec", () => {
    const spec = normalizeSpec({ topics: ["banks", "nope"], ranges: { pe: { min: 30, max: 10 }, bogus: { min: 1 } }, calls: ["Add", "Sell"] });
    expect(spec.topics).toEqual(["banks"]);
    expect(spec.ranges).toEqual({ pe: { min: 10, max: 30 } });
    expect(spec.calls).toEqual(["Add"]);
  });

  it("points a whole research theme at its theme page, and nothing narrower", () => {
    expect(themeSlugFor(parseBasketRequest("defense stocks").spec)).toBe("defense");
    expect(themeSlugFor(parseBasketRequest("cheap defense stocks").spec)).toBeNull();
    expect(themeSlugFor(parseBasketRequest("banks").spec)).toBeNull();
  });
});

describe("quality-pass cases", () => {
  it("reads every example chip fully with the rules", () => {
    for (const text of BASKET_EXAMPLES) {
      const parse = parseBasketRequest(text);
      expect({ text, leftover: parse.leftover, cannot: parse.cannot }).toEqual({ text, leftover: [], cannot: [] });
    }
  });

  it("never reads a negation as its opposite", () => {
    for (const text of ["stocks with no dividend", "growth stocks that don't pay dividends", "non-dividend payers"]) {
      const parse = parseBasketRequest(text);
      expect(parse.spec.ranges.div_yield).toBeUndefined();
      expect(parse.cannot.map((item) => item.code)).toContain("negation");
    }
    expect(parseBasketRequest("not profitable biotech").spec.ranges.net_margin).toEqual({ max: 0 });
    expect(parseBasketRequest("banks with no debt").spec.ranges.net_cash).toEqual({ min: 0 });
  });

  it("keeps numbers it could not use in the leftovers", () => {
    expect(parseBasketRequest("banks trading under 50").leftover).toEqual(["trading", "under", "50"]);
    expect(parseBasketRequest("banks with a P/E of 10 or less").spec.ranges.pe).toEqual({ min: 0.01, max: 10 });
    expect(parseBasketRequest("dividend growth of 10% a year").spec.ranges.div_growth).toEqual({ min: 10 });
    expect(parseBasketRequest("yield under 3%").spec.ranges.div_yield).toEqual({ min: 0.01, max: 3 });
    expect(parseBasketRequest("banks between $10 and $50 a share").spec.ranges.price).toEqual({ min: 10, max: 50 });
    expect(parseBasketRequest("net margins above 10%").spec.ranges.net_margin).toEqual({ min: 10 });
  });

  it("picks the right subject for common phrases", () => {
    expect(parseBasketRequest("health insurers").spec.topics).toEqual(["health_insurers"]);
    expect(parseBasketRequest("wireless carriers").spec.topics).toEqual(["telecom"]);
    expect(parseBasketRequest("energy storage").spec.topics).toEqual(["sector_energy"]);
    expect(parseBasketRequest("companies with pricing power").spec.topics).toEqual([]);
    expect(parseBasketRequest("intellectual property").spec.topics).toEqual([]);
    expect(parseBasketRequest("uranium miners").spec.topics).toEqual(["nuclear"]);
    expect(parseBasketRequest("water utilities").spec.topics).toEqual(["water"]);
    expect(parseBasketRequest("oil and gas stocks paying dividends").leftover).toEqual([]);
    expect(parseBasketRequest("a.i. stocks").spec.ties).toEqual(["ai"]);
    expect(parseBasketRequest("data centers").spec.ties).toEqual(["ai"]);
    expect(parseBasketRequest("AI infrastructure").leftover).toEqual([]);
    expect(parseBasketRequest("companies benefiting from rising power demand").spec.ranges.ret_6m).toBeUndefined();
  });

  it("does not mistake other fields and indexes", () => {
    expect(parseBasketRequest("sales multiple under 5").spec.ranges.pe).toBeUndefined();
    const sp600 = parseBasketRequest("s&p 600 small caps");
    expect(sp600.spec.indexes).toEqual([]);
    expect(sp600.cannot.map((item) => item.code)).toEqual(["other_index"]);
    expect(parseBasketRequest("EV/EBITDA under 10").cannot.map((item) => item.code)).not.toContain("ev");
  });

  it("writes the call in the words the tags use, and a comma before leaving out", () => {
    expect(specSentence(parseBasketRequest("S&P 500 stocks rated add").spec)).toBe("Companies in the S&P 500 where our call says buy more.");
    expect(specSentence(parseBasketRequest("health care except biotech").spec)).toBe("Health care companies, leaving out biotech.");
    expect(specTitle(parseBasketRequest("oversold nasdaq 100").spec)).toBe("Nasdaq 100 stocks that look oversold");
  });
});
