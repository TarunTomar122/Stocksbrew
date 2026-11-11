import { describe, expect, it } from "vitest";

import { deriveFigure, figureOf } from "./insights";

const value = (text: string) => deriveFigure(text)?.value ?? null;

describe("deriveFigure", () => {
  it("reads a signed percentage, with a real minus sign", () => {
    expect(value("NVDA (−5.5%) and MSFT (−2.2%) did 78% of that move.")).toBe("−5.5%");
    expect(value("Water infrastructure is +12.5% this month.")).toBe("+12.5%");
    expect(value("RKLB -6.6% on the day")).toBe("−6.6%");
  });
  it("signs a percentage from the word in front of it", () => {
    expect(value("Hims & Hers Health fell 16.5% on Tuesday: earnings missed.")).toBe("−16.5%");
    expect(value("The S&P 500 is down 0.38%.")).toBe("−0.38%");
    expect(value("The 10 biggest companies lost 0.7% of their combined value.")).toBe("−0.7%");
    expect(value("SMR rose 7% today")).toBe("+7%");
  });
  it("reads a count against its whole", () => {
    expect(value("So far 19 of 28 companies beat what analysts expected (68%).")).toBe("19 of 28");
    expect(value("NVDA is the stock Reddit talks about most: 11 of 56 mentions (20%).")).toBe("11 of 56");
    expect(value("Only 2 of the 9 rules beat it.")).toBe("2 of 9");
    expect(value("3 of your 8 holdings have no alert of any kind.")).toBe("3 of 8");
    expect(value("Beats so far: 19 of 28.")).toBe("19 of 28");
    expect(value("So far 19 of 28, which is more than usual.")).toBe("19 of 28");
  });
  it("reads money with its scale, and multiples", () => {
    expect(value("Insiders bought $38.7M of their own stock, down from $73.8M.")).toBe("$38.7M");
    expect(value("They sold $1.3 billion outside plans.")).toBe("$1.3B");
    expect(value("Insiders sold 29x what they bought.")).toBe("29×");
    expect(value("At $1,234, it is above the level.")).toBe("$1,234");
    expect(value("At $168, it trades below.")).toBe("$168");
  });
  it("takes whichever qualifying number comes first", () => {
    expect(value("39% of them rose. Biggest: MRLN +31% and HUMA +29%.")).toBe("39%");
    expect(value("Cisco Systems ($443.3B) is the biggest. Last time it fell 8.4%.")).toBe("$443.3B");
  });
  it("skips distances, ranges, dates, times and bare counts", () => {
    expect(value("8 stocks are at or within 3% of the price where we'd buy more.")).toBeNull();
    expect(value("PPI Friday at 8:30 AM, on Nov 14, 2026.")).toBeNull();
    expect(value("We found the reason for 27 big moves: 18 stocks rose and 9 fell.")).toBeNull();
    expect(value("Growth of 3-5% a year")).toBeNull();
    // A share, not a move: no sign.
    expect(value("Technology makes up 38% of the portfolio.")).toBe("38%");
    expect(value("It picked up 2% of the market.")).toBe("2%");
    expect(value("")).toBeNull();
    expect(deriveFigure(undefined)).toBeNull();
  });
});

describe("figureOf", () => {
  it("prefers the insight's own figure, honours null and falls back to the sentence", () => {
    expect(figureOf({ text: "fell 5%", figure: { value: "Nov 17", label: "reports" } })).toEqual({ value: "Nov 17", label: "reports" });
    expect(figureOf({ text: "fell 5%", figure: null })).toBeNull();
    expect(figureOf({ text: "fell 5%", figure: { value: "  " } })).toEqual({ value: "−5%" });
    expect(figureOf({ text: "fell 5%" })).toEqual({ value: "−5%" });
  });
});
