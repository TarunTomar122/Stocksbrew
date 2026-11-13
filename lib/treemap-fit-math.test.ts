import { describe, expect, it } from "vitest";

import {
  CHIP_GAP,
  CHIP_H,
  FIT_MAX,
  FIT_MIN,
  LABEL_H,
  PAD_X,
  PAD_Y,
  PRICED_H,
  STEPS,
  chipWidth,
  chipsThatFit,
  figureWidth,
  fitStep,
  headWidth,
  labelHeight,
  nameFromWidth,
  priceFromWidth,
  tileNeed,
} from "@/lib/treemap-fit-math";

describe("what a tile's label needs", () => {
  it("rounds up to the stylesheet's 10px steps, within its range", () => {
    expect(fitStep(30)).toBe(30);
    expect(fitStep(31)).toBe(40);
    expect(fitStep(0)).toBe(FIT_MIN);
    expect(fitStep(5000)).toBe(FIT_MAX);
  });

  it("grows with the text and with the type size", () => {
    expect(figureWidth("−1234.5%", 14)).toBeGreaterThan(figureWidth("+1.2%", 14));
    expect(headWidth("Industrials", false, STEPS[2])).toBeGreaterThan(headWidth("Industrials", false, STEPS[0]));
    expect(headWidth("Communication services", false)).toBeGreaterThan(headWidth("Communication", false));
  });

  it("needs room for the icon, the name and the move, and for the price when there is one", () => {
    const need = tileNeed({ name: "GOOGL", mono: true, move: "+2.7%", price: "$301.32" });
    expect(need.w).toBeGreaterThanOrEqual(headWidth("GOOGL", true));
    expect(need.w).toBeGreaterThanOrEqual(figureWidth("+2.7%", STEPS[0].move));
    // The price shows from its class step, so a tile its need allows always shows it.
    expect(need.w).toBeGreaterThanOrEqual(fitStep(priceFromWidth("$301.32")));
    expect(need.h).toBe(PRICED_H);
    // A stock with a price but no move for the period still keeps its price.
    expect(tileNeed({ name: "GOOGL", mono: true, move: "", price: "$301.32" }).h).toBe(PRICED_H);
    // A sector tile has no price: name and move only.
    expect(tileNeed({ name: "GOOGL", mono: true, move: "+2.7%" }).h).toBe(LABEL_H);
    expect(PRICED_H).toBeGreaterThan(LABEL_H);
  });

  it("never steps the type up past what a 13-letter name and a 7-character move fit", () => {
    STEPS.slice(1).forEach((step, index) => {
      // A step that keeps the name's size cannot make it wider than the tile's own need already allows for.
      if (step.name > STEPS[index]!.name) expect(headWidth("Discretionary", false, step)).toBeLessThanOrEqual(step.w);
      expect(figureWidth("−12.34%", step.move)).toBeLessThanOrEqual(step.w);
      // Name, move and price, with their gaps and the padding, fit the step's height.
      expect(step.name + 4 + 2 + step.move + 4 + 2 + step.price + 3 + 10).toBeLessThanOrEqual(step.h);
    });
  });

  it("shows a full name only from a width it fits at every step above", () => {
    for (const name of ["Consumer discretionary", "Communication services", "Utilities", "Health care"]) {
      const from = nameFromWidth(name, false);
      for (let width = from; width <= 400; width += 1) {
        const step = [...STEPS].reverse().find((item) => width >= item.w)!;
        expect(headWidth(name, false, step)).toBeLessThanOrEqual(width + 1e-9);
      }
    }
    expect(nameFromWidth("Consumer discretionary", false)).toBeGreaterThan(nameFromWidth("Utilities", false));
    // A tile wide enough for its label at the smallest type is wide enough at every bigger step too.
    const need = tileNeed({ name: "Semiconductors", mono: false, move: "−1234.5%" });
    for (let width = need.w; width <= 400; width += 1) {
      const step = [...STEPS].reverse().find((item) => width >= item.w)!;
      expect(headWidth("Semiconductors", false, step)).toBeLessThanOrEqual(width + 1e-9);
      expect(figureWidth("−1234.5%", step.move)).toBeLessThanOrEqual(width + 1e-9);
    }
    expect(priceFromWidth("$12,346")).toBeGreaterThan(priceFromWidth("$5.07"));
  });
});

describe("chips under a label", () => {
  const widths = ["SMCI", "NVDA", "ORCL"].map((ticker) => chipWidth(ticker, "−11%"));

  it("fits none on a tile with room for its label only, and more as the tile grows, never more than given", () => {
    expect(chipsThatFit({ w: 130, h: 60 }, { move: "−0.34%" }, widths)).toBe(0);
    expect(chipsThatFit({ w: 300, h: 110 }, { move: "−0.34%" }, widths)).toBeGreaterThanOrEqual(2);
    expect(chipsThatFit({ w: 300, h: 400 }, { move: "−0.34%" }, widths)).toBe(3);
    expect(chipsThatFit({ w: 300, h: 400 }, { move: "−0.34%" }, [])).toBe(0);
    // A chip wider than the tile is never drawn, nor any after it.
    expect(chipsThatFit({ w: 60, h: 400 }, { move: "−0.34%" }, widths)).toBe(0);
  });

  it("never lets the label and its chips overflow the tile, even a type step bigger than laid out", () => {
    for (let w = 60; w <= 420; w += 7) {
      for (let h = 40; h <= 300; h += 5) {
        const count = chipsThatFit({ w, h }, { move: "−0.34%" }, widths);
        if (count === 0) continue;
        // Rows as the chips wrap across the tile's inner width.
        let rows = 1;
        let used = 0;
        for (const width of widths.slice(0, count)) {
          const next = used === 0 ? width : used + CHIP_GAP + width;
          if (next > w - 2 * PAD_X) {
            rows += 1;
            used = width;
          } else used = next;
          expect(width).toBeLessThanOrEqual(w - 2 * PAD_X);
        }
        // The tallest the label could print when drawn up to 1.2 times as big (one step up at most).
        const label = labelHeight({ w: w * 1.2, h: h * 1.2 }, { move: "−0.34%" });
        const chips = CHIP_GAP + rows * CHIP_H + (rows - 1) * CHIP_GAP;
        expect(2 * PAD_Y + label + chips).toBeLessThanOrEqual(h * 1.2 + 1e-9);
        expect(2 * PAD_Y + labelHeight({ w, h }, { move: "−0.34%" }) + chips).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });

  it("steps the label's height with the tile, as the stylesheet does", () => {
    expect(labelHeight({ w: 80, h: 50 }, { move: "+1%" })).toBe(STEPS[0].name + 4 + 2 + STEPS[0].move + 4);
    expect(labelHeight({ w: 400, h: 400 }, { move: "+1%" })).toBe(STEPS[4].name + 4 + 2 + STEPS[4].move + 4);
  });
});
