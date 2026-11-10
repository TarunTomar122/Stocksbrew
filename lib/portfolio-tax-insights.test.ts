import { describe, expect, it } from "vitest";

import { buildTaxPicture, type TaxLotEntry } from "@/lib/portfolio-tax";
import { buildTaxRead } from "@/lib/portfolio-tax-insights";

const entry = (overrides: Partial<TaxLotEntry> & Pick<TaxLotEntry, "ticker">): TaxLotEntry => ({ buys: [], sells: [], splits: [], ...overrides });

describe("buildTaxRead", () => {
  it("is null with no lots", () => {
    expect(buildTaxRead(buildTaxPicture({ lots: {}, holdings: null, prices: new Map(), today: "2026-11-10" }), 2026)).toBeNull();
  });

  it("weighs open losses against this year's gains and flags a wash-sale risk", () => {
    const picture = buildTaxPicture({
      lots: {
        // Bought at 100, sold half at 150 this year: +$500 short term.
        US_AAPL: entry({
          ticker: "AAPL",
          buys: [{ id: "a1", date: "2026-01-05", shares: 20, price: 100 }],
          sells: [{ id: "s1", date: "2026-06-01", shares: 10, price: 150, method: "fifo" }],
        }),
        // Two lots under water, one bought 10 days ago: a sale now could be a wash sale.
        US_INTC: entry({
          ticker: "INTC",
          buys: [
            { id: "i1", date: "2025-12-01", shares: 10, price: 50 },
            { id: "i2", date: "2026-11-01", shares: 10, price: 45 },
          ],
        }),
      },
      holdings: null,
      prices: new Map([
        ["US_AAPL", 160],
        ["US_INTC", 30],
      ]),
      today: "2026-11-10",
    });
    const read = buildTaxRead(picture, 2026);
    expect(read?.headline).toBe("You have realised $500 in 2026; open losses of $350 could offset 70% of it.");
    expect(read?.insights.map((insight) => insight.id)).toEqual(["term", "harvest", "wash-risk"]);
    expect(read?.insights[1].text).toBe("$350 of losses across 2 open lots: INTC.");
    expect(read?.insights[2].text).toBe("INTC was bought in the last 30 days, so selling at a loss now could be a wash sale.");
  });

  it("names a losing lot that turns long term soon when there is room", () => {
    const picture = buildTaxPicture({
      lots: { US_INTC: entry({ ticker: "INTC", buys: [{ id: "i1", date: "2025-12-01", shares: 10, price: 50 }] }) },
      holdings: null,
      prices: new Map([["US_INTC", 30]]),
      today: "2026-11-10",
    });
    const read = buildTaxRead(picture, 2026);
    expect(read?.headline).toBe("No gains realised in 2026; $200 of losses sit in open lots.");
    expect(read?.insights.find((insight) => insight.id === "turning")?.text).toMatch(/^INTC lot at a \$200 loss turns long term in \d+ days\.$/);
  });
});
