import { describe, expect, it } from "vitest";

import { bigDollars, cardHeadline, topMarketNews, type TopNewsInput } from "@/lib/briefing-top-news";
import type { WireItem } from "@/lib/wire-shared";

const TODAY = "2026-11-12";
const SINCE = Date.parse("2026-11-11T21:00:00Z");

let next = 0;
function story(overrides: Partial<WireItem> & { title: string }): WireItem {
  next += 1;
  return {
    id: `s${next}`,
    url: `https://example.com/${next}`,
    source: "Reuters",
    sourceKind: "publisher",
    publishedAt: "2026-11-12T14:00:00Z",
    excerpt: "",
    excerptOrigin: "",
    tickers: [],
    tone: null,
    topics: [],
    ...overrides,
  };
}

function input(items: WireItem[], overrides: Partial<TopNewsInput> = {}): TopNewsInput {
  return {
    items,
    quotes: {
      NVDA: { pct: -6.7, price: 162.04, name: "NVIDIA Corporation" },
      AVGO: { pct: 4.9, price: 362.26, name: "Broadcom Inc." },
      MU: { pct: -4.6, price: 773.93, name: "Micron Technology" },
      TINY: { pct: 40, price: 2.1, name: "Tiny Bio" },
    },
    caps: { NVDA: 3.9e12, AVGO: 1.7e12, MU: 8.6e11, TINY: 2e8 },
    indexWeights: { NVDA: 7.6, AVGO: 2.5 },
    sp500: -0.4,
    tenYear: { level: 4.98, bps: 10 },
    sectors: { up: 3, down: 8, total: 11 },
    sinceMs: SINCE,
    today: TODAY,
    ...overrides,
  };
}

describe("cardHeadline", () => {
  it("drops desk tags, a source tail and a roundup prefix, and never cuts a long headline", () => {
    expect(cardHeadline("UPDATE 2-Nvidia CEO Jensen Huang resigns - Reuters")).toBe("Nvidia CEO Jensen Huang resigns");
    expect(cardHeadline("Stock market today: Nasdaq slides as Nvidia CEO steps down")).toBe("Nasdaq slides as Nvidia CEO steps down");
    expect(cardHeadline("One two three four five six seven eight nine ten eleven twelve thirteen")).toBeNull();
  });

  it("says big money short", () => {
    expect(bigDollars(-2.8e11)).toBe("$280B");
    expect(bigDollars(1.25e12)).toBe("$1.3T");
    expect(bigDollars(4.2e9)).toBe("$4.2B");
  });
});

describe("topMarketNews", () => {
  const nvda = story({ title: "Nvidia CEO Jensen Huang resigns, Colette Kress named interim chief", tickers: ["NVDA"], source: "CNBC" });
  const avgo = story({ title: "Broadcom shares rally after earnings beat and upbeat guidance", tickers: ["AVGO"], source: "Investing.com" });
  const mu = story({ title: "Micron cuts its revenue outlook on weaker memory prices", tickers: ["MU"], source: "Yahoo Finance" });

  it("ranks stocks by the dollars their move added or took, each with a measured line", () => {
    const stories = topMarketNews(input([mu, avgo, nvda]));
    expect(stories.map((entry) => entry.ticker)).toEqual(["NVDA", "AVGO", "MU"]);
    const [first, second, third] = stories;
    expect(first).toMatchObject({ headline: nvda.title, reaction: { label: "NVDA", pct: -6.7, price: 162.04 }, day: "today", source: "CNBC" });
    // A big S&P 500 holding: how much it moved the index on its own.
    expect(first?.why).toBe("On its own it moved the S&P 500 down about 0.51%.");
    expect(second?.why).toBe("On its own it moved the S&P 500 up about 0.12%.");
    // Not in the index's top holdings: the market value it lost.
    expect(third?.why).toBe("It lost about $41B in market value.");
  });

  it("leads with a macro event, says the 10-year beside it, and leaves out previews", () => {
    const fed = story({ title: "Fed holds rates steady, signals patience on cuts", topics: ["macro"] });
    const preview = story({ title: "Jobless claims, existing home sales due Thursday", topics: ["macro"], publishedAt: "2026-11-12T15:00:00Z" });
    const stories = topMarketNews(input([nvda, avgo, mu, fed, preview]));
    expect(stories.map((entry) => entry.kind)).toEqual(["macro", "stock", "stock"]);
    expect(stories[0]).toMatchObject({ icon: "capitol", reaction: { label: "S&P 500", pct: -0.4 }, why: "The 10-year yield rose 10.0 bps to 4.98%." });
  });

  it("takes a market wrap only on a big index day, with the sectors as its line", () => {
    const wrap = story({ title: "Wall Street falls as Nvidia drags tech lower", topics: ["macro"] });
    expect(topMarketNews(input([nvda, avgo, mu, wrap])).some((entry) => entry.kind === "macro")).toBe(false);
    const big = topMarketNews(input([nvda, avgo, mu, wrap], { sp500: -1.4 }));
    expect(big.map((entry) => entry.kind)).toEqual(["stock", "macro", "stock"]);
    expect(big[1]?.why).toBe("8 of 11 sectors fell.");
  });

  it("needs a confirmed reason that agrees with the move, today's news only, one story each", () => {
    const against = story({ title: "Micron shares jump on record demand", tickers: ["MU"] });
    const old = story({ title: "Broadcom raises its dividend", tickers: ["AVGO"], publishedAt: "2026-11-10T14:00:00Z" });
    const copy = story({ title: "Nvidia CEO Jensen Huang resigns, Colette Kress named interim chief - Reuters", tickers: ["NVDA"] });
    const tiny = story({ title: "Tiny Bio wins FDA approval for its lead drug", tickers: ["TINY"] });
    // Only NVDA and the small stock qualify: fewer than three stories means no section at all.
    expect(topMarketNews(input([nvda, copy, against, old, tiny]))).toEqual([]);
    const stories = topMarketNews(input([nvda, copy, avgo, mu, tiny]));
    expect(stories.map((entry) => entry.ticker)).toEqual(["NVDA", "AVGO", "MU"]);
  });

  it("leaves a line out rather than make one up", () => {
    const stories = topMarketNews(input([nvda, avgo, mu], { indexWeights: {}, caps: { NVDA: 3.9e12, AVGO: 1.7e12, MU: 8.6e11 } }));
    expect(stories.every((entry) => entry.why?.startsWith("It "))).toBe(true);
    const fed = story({ title: "Fed holds rates steady, signals patience on cuts", topics: ["macro"] });
    const [lead] = topMarketNews(input([nvda, avgo, mu, fed], { tenYear: null }));
    expect(lead?.why).toBeNull();
  });
});
