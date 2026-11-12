import { describe, expect, it } from "vitest";

import { callHeading, callMeaning } from "./call-line";

describe("callMeaning", () => {
  it("says a known action another way when it starts with the call word, as a full sentence", () => {
    expect(callMeaning("Keep", "Keep what you own, don't buy more now")).toBe("Keep what you own, but don't buy more for now.");
    expect(callMeaning("Buy more", "Buy more on a dip, not here")).toBe("Wait for a dip before adding.");
    expect(callMeaning("Sell some", "Sell some if it rises")).toBe("Take some profit if the price rises.");
  });

  it("goes on from the chip in sentence case for any other action that starts with the word", () => {
    expect(callMeaning("Keep", "Keep — for now")).toBe("For now.");
    expect(callMeaning("Sell some", "Sell some: it ran too far")).toBe("It ran too far.");
  });

  it("keeps a line that does not start with the word, whole, as a sentence", () => {
    expect(callMeaning("Sell some", "Don't buy more at this price")).toBe("Don't buy more at this price.");
    expect(callMeaning("Keep", "Keeping it is fine")).toBe("Keeping it is fine.");
    expect(callMeaning("Keep", "We'd keep it, not buy more")).toBe("We'd keep it, not buy more.");
  });

  it("is null when the action is only the word, or there is no action", () => {
    expect(callMeaning("Keep", "Keep.")).toBeNull();
    expect(callMeaning("Keep", null)).toBeNull();
    expect(callMeaning(null, "We'd keep it")).toBe("We'd keep it.");
  });
});

describe("callHeading", () => {
  it("says the call word and what it means as one sentence", () => {
    expect(callHeading("Buy more", "Buy more on a dip, not here")).toEqual({ word: "Buy more", rest: " on a dip, not at today's price." });
    expect(callHeading("Keep", "Keep what you own, don't buy more now")).toEqual({ word: "Keep", rest: " what you own, but don't buy more for now." });
    expect(callHeading("Sell some", "Sell some if it rises")).toEqual({ word: "Sell some", rest: " if the price rises." });
  });

  it("goes on from the word for any other action that starts with it", () => {
    expect(callHeading("Keep", "Keep, for now")).toEqual({ word: "Keep", rest: ", for now." });
    expect(callHeading("Sell some", "Sell some: it ran too far")).toEqual({ word: "Sell some", rest: ": it ran too far." });
  });

  it("puts an action that does not start with the word after it as its own sentence", () => {
    expect(callHeading("Keep", "Wait and watch")).toEqual({ word: "Keep", rest: ". Wait and watch." });
    expect(callHeading("Keep", null)).toEqual({ word: "Keep", rest: "" });
    expect(callHeading("Keep", "Keep.")).toEqual({ word: "Keep", rest: "" });
  });

  it("never says the call twice for the default meanings", () => {
    expect(callHeading("Buy more", "We'd buy more")).toEqual({ word: "Buy more", rest: "." });
    expect(callHeading("Keep", "We'd keep it, not buy more")).toEqual({ word: "Keep", rest: " what you own, but don't buy more for now." });
    expect(callHeading("Buy more", "A good price to buy more")).toEqual({ word: "Buy more", rest: ": today's price is a good one to add at." });
    expect(callHeading("Sell some", "We'd sell some, not buy more")).toEqual({ word: "Sell some", rest: ", and don't buy more." });
    expect(callHeading("Sell some", "Don't buy more at this price")).toEqual({ word: "Sell some", rest: ", but don't buy more at this price." });
  });
});
