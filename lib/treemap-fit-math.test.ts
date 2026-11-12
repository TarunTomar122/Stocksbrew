import { describe, expect, it } from "vitest";

import { FIT_MAX, FIT_MIN, LABEL_H, PRICED_H, STEPS, figureWidth, fitStep, headWidth, nameFromWidth, priceFromWidth, tileNeed } from "@/lib/treemap-fit-math";

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
