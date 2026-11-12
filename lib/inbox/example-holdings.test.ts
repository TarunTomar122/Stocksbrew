import { describe, expect, it } from "vitest";

import { exampleHoldings } from "./example-holdings";

type Position = { ticker: string; kind: "holding" | "watchlist"; dayPct: number | null };

function example(all: Position[], marketPct: number | null = 1.31, pricesAsOf: string | null = "2026-11-11") {
  const positions = all.filter((position) => position.kind === "holding");
  const watching = all.filter((position) => position.kind === "watchlist");
  return { portfolio: { positions, watching } as never, pricesAsOf, marketPct };
}

describe("the example inbox's other stocks", () => {
  it("lists every stock the page does not already say, held then watched, biggest move first, with confirmed reasons", () => {
    const out = exampleHoldings(
      example([
        { ticker: "NVDA", kind: "holding", dayPct: 2.9 },
        { ticker: "MSFT", kind: "holding", dayPct: -2.2 },
        { ticker: "XOM", kind: "holding", dayPct: 1.3 },
        { ticker: "AMD", kind: "watchlist", dayPct: 7.3 },
        { ticker: "VOO", kind: "holding", dayPct: null },
      ]),
      ["nvda"],
      { XOM: " Exxon rose with oil after OPEC held output. ", MSFT: "" },
      { MSFT: ["A normal day moves it about 1.3%", "Still down 4.1% over the past month"], XOM: ["About twice a normal 0.7% day"], AMD: ["About twice a normal 3.8% day"] },
    )!;
    expect(out.title).toBe("The example's other stocks on Nov 11");
    expect(out.market).toBe("S&P 500 +1.3%");
    // No confirmed reason: one measured fact, in the briefing's short words; a confirmed reason keeps just that.
    expect(out.rows).toEqual([
      { ticker: "MSFT", dayPct: -2.2, reason: null, fact: "Down 4.1% in a month" },
      { ticker: "XOM", dayPct: 1.3, reason: "Exxon rose with oil after OPEC held output.", fact: null },
    ]);
    expect(out.watching).toEqual([{ ticker: "AMD", dayPct: 7.3, reason: null, fact: "Twice a normal day" }]);
  });

  it("is nothing with fewer than two lines, or without a price day", () => {
    const one = [{ ticker: "MSFT", kind: "holding" as const, dayPct: -2.2 }];
    expect(exampleHoldings(example(one), [])).toBeNull();
    expect(exampleHoldings(example([...one, { ticker: "XOM", kind: "holding", dayPct: 1 }], null, null), [])).toBeNull();
    expect(exampleHoldings(null, [])).toBeNull();
  });
});
