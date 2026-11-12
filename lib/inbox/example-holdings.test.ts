import { describe, expect, it } from "vitest";

import { exampleHoldings } from "./example-holdings";

type Position = { ticker: string; kind: "holding" | "watchlist"; dayPct: number | null; weight: number | null; gainPct: number | null };

function example(positions: Position[], marketPct: number | null = 1.31, pricesAsOf: string | null = "2026-11-11") {
  return { portfolio: { positions } as never, pricesAsOf, marketPct };
}

describe("the example inbox's other holdings", () => {
  it("lists every holding the page does not already say, biggest move first", () => {
    const out = exampleHoldings(
      example([
        { ticker: "NVDA", kind: "holding", dayPct: 2.9, weight: 21, gainPct: 30 },
        { ticker: "MSFT", kind: "holding", dayPct: -2.2, weight: 14.2, gainPct: 9.24 },
        { ticker: "XOM", kind: "holding", dayPct: 1.3, weight: 6.04, gainPct: -3.1 },
        { ticker: "AMD", kind: "watchlist", dayPct: 7.3, weight: null, gainPct: null },
        { ticker: "VOO", kind: "holding", dayPct: null, weight: 20, gainPct: 4 },
      ]),
      ["nvda"],
    )!;
    expect(out.title).toBe("The example's other holdings on Nov 11");
    expect(out.market).toBe("S&P 500 +1.3%");
    expect(out.rows).toEqual([
      { ticker: "MSFT", dayPct: -2.2, weight: 14.2, gainPct: 9.24 },
      { ticker: "XOM", dayPct: 1.3, weight: 6.04, gainPct: -3.1 },
    ]);
  });

  it("is nothing with fewer than two lines, or without a price day", () => {
    const one = [{ ticker: "MSFT", kind: "holding" as const, dayPct: -2.2, weight: 14, gainPct: 9 }];
    expect(exampleHoldings(example(one), [])).toBeNull();
    expect(exampleHoldings(example([...one, { ticker: "XOM", kind: "holding", dayPct: 1, weight: null, gainPct: null }], null, null), [])).toBeNull();
    expect(exampleHoldings(null, [])).toBeNull();
  });
});
