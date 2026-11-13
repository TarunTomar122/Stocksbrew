import { describe, expect, it } from "vitest";

import { figuresIn, newFacts, repeatsFigure, shownFigures } from "@/lib/no-repeat";

describe("figuresIn", () => {
  it("reads prices, moves and multiples the way a person sees them", () => {
    expect([...figuresIn("$1,431 −0.5% yesterday · 3.1x a normal day")]).toEqual(["$1431", "%0.5", "%-0.5", "x3.1"]);
    // the sign of a move is its colour: −1.8% and 1.8% are one figure, and $1,431.00 is $1,431
    expect(repeatsFigure("Fell 1.8% yesterday.", figuresIn("−1.8%"))).toBe(true);
    expect(repeatsFigure("+1.8% on Thursday", figuresIn("−1.8%"))).toBe(false);
    expect(figuresIn("$1,431.00")).toEqual(figuresIn("$1,431"));
  });
});

describe("newFacts", () => {
  const card = shownFigures("$50.77", "−1.8% yesterday", "Buy more under $50.79");

  it("drops a sentence the card's figures already say (the owner's CGNX card, Nov 13)", () => {
    expect(newFacts("Fell 1.8% to $50.77.", card)).toBe("");
    // the level in another role stays unless asked to go (the email builders no longer write that clause)
    expect(newFacts("Fell 1.8% to $50.77, below its $50.79 buy-more level.", card)).toBe("Below its $50.79 buy-more level.");
    expect(newFacts("Fell 1.8% to $50.77, below its $50.79 buy-more level.", card, { strict: true })).toBe("Below its buy-more level.");
    expect(repeatsFigure(newFacts("Fell 1.8% to $50.77, below its $50.79 buy-more level.", card, { strict: true }), card)).toBe(false);
  });

  it("keeps a line that adds a fact, and text with no shown figure untouched", () => {
    expect(newFacts("Up 1.8% before the open this morning.", shownFigures("$36.60", "−4.2%"))).toBe(
      "Up 1.8% before the open this morning.",
    );
    expect(newFacts("Down 8.8% over the last 20 sessions.", card)).toBe("Down 8.8% over the last 20 sessions.");
  });

  it("keeps a reason without the move the card shows", () => {
    expect(newFacts("Sandisk surges 12.3% as AI trade revives.", shownFigures("+12.3%"))).toBe("Sandisk surges as AI trade revives.");
    expect(newFacts("Rose 32.9% to $35.87, at its $35.87 sell-some level.", shownFigures("$35.87", "+32.9%"))).toBe(
      "At its $35.87 sell-some level.",
    );
  });

  it("matches backend/mail/kit.py new_facts on the shared cases", () => {
    expect(newFacts("Its biggest day was Tuesday, −3.0%.", shownFigures("−3.0%"))).toBe("Its biggest day was Tuesday.");
    expect(newFacts("Its biggest day was Thursday, +0.5%.", shownFigures("−0.5%"))).toBe("Its biggest day was Thursday, +0.5%.");
    expect(newFacts("Closed at $1,431.00.", shownFigures("$1,431"))).toBe("");
    expect(newFacts("", card)).toBe("");
    expect(newFacts("U.S. stocks fell 1.8% as yields rose.", shownFigures("1.8%"))).toBe("U.S. stocks fell as yields rose.");
    expect(newFacts("Fell 4.3% to $166.19; below your $168 alert.", shownFigures("$166.19", "−4.3%"))).toBe("Below your $168 alert.");
  });

  it("leaves a figure that measures something else, even when its value matches the card's", () => {
    const cases: Array<[string, string]> = [
      ["A normal day moves it 4.2%.", "4.2%"],
      ["Now 3.0% over our sell-some price.", "3.0%"],
      ["Up 1.8% over the last 20 sessions.", "−1.8%"],
      ["About 3.1x its usual daily move.", "3.1x"],
      ["S&P 500 fell 1.8%, the stock held up.", "1.8%"],
      ["Up 1.8% before the open this morning.", "1.8%"],
    ];
    for (const [line, shown] of cases) expect(newFacts(line, shownFigures(shown))).toBe(line);
  });
});
