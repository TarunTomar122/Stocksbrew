import { describe, expect, it } from "vitest";

import { FIT_MAX, FIT_MIN, STOCK_LOGO, fitStep, monoWidth, nameWidth, stockTileNeeds, tickerWidth } from "@/lib/treemap-fit-math";

describe("the widths a tile's words need", () => {
  it("rounds up to the stylesheet's 10px steps, after the tile's 2px border, within its range", () => {
    expect(fitStep(28)).toBe(30);
    expect(fitStep(29)).toBe(40);
    expect(fitStep(0)).toBe(FIT_MIN);
    expect(fitStep(5000)).toBe(FIT_MAX);
  });

  it("grows with the text and with the type size", () => {
    expect(monoWidth("−1234.5%", 12, 8)).toBeGreaterThan(monoWidth("+1.2%", 12, 8));
    expect(monoWidth("+1.2%", 22, 20)).toBeGreaterThan(monoWidth("+1.2%", 15, 20));
    expect(nameWidth("Communication services", 20)).toBeGreaterThan(nameWidth("Communication", 20));
  });

  it("counts the logo on a stock tile's first line, so a tile that shows its ticker has room for its logo", () => {
    expect(tickerWidth("AAPL")).toBeCloseTo(monoWidth("AAPL", 12, 8) + STOCK_LOGO);
    const need = stockTileNeeds({ symbol: "GOOGL", price: "$1.00", move: "+1.0%" });
    expect(need.w).toBe(fitStep(tickerWidth("GOOGL")));
  });
});
