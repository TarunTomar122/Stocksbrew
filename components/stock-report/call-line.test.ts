import { describe, expect, it } from "vitest";

import { callLine, callMeaning } from "./call-line";

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

  it("never says a word twice at the start (a judge read \"Wait wait for a dip\")", () => {
    expect(callMeaning(null, "Wait wait for a dip")).toBe("Wait for a dip.");
    expect(callMeaning("Keep", "wait wait for a dip")).toBe("Wait for a dip.");
    expect(callMeaning("Buy more", "Buy more on a dip, not here")).toBe("Wait for a dip before adding.");
  });
});

const money = (value: number) => `$${value.toFixed(2)}`;
const base = { callWord: "Buy more", callAction: "Buy more on a dip, not here", level: null, hidden: null, price: 343.37, money, plan: "free" };

describe("callLine", () => {
  it("says the call's own price against today's in plain words", () => {
    expect(callLine({ ...base, level: { label: "We'd buy more below", price: 330 } })).toEqual({ text: "We'd buy more below $330.00, 3.9% under today's $343.37.", gate: null });
    expect(callLine({ ...base, callWord: "Sell some", level: { label: "We'd sell some above", price: 420 } })?.text).toBe("We'd sell some above $420.00, 22% over today's $343.37.");
    expect(callLine({ ...base, level: { label: "We'd buy more below", price: 350 } })?.text).toBe("We'd buy more below $350.00, and today's $343.37 is already under it.");
    expect(callLine({ ...base, level: { label: "We'd buy more below", price: 344 } })?.text).toBe("We'd buy more below $344.00, right about today's $343.37.");
    expect(callLine({ ...base, price: null, level: { label: "We'd buy more above", price: 360 } })?.text).toBe("We'd buy more above $360.00.");
  });

  it("says what a hidden level waits for without its number, and points to the gate once", () => {
    const line = callLine({ ...base, plan: "anon", hidden: { label: "We'd buy more below", reached: false } });
    expect(line).toEqual({ text: "We'd wait for a dip from today's $343.37 before buying more.", gate: "The price we'd buy at comes with a free account." });
    expect(callLine({ ...base, hidden: { label: "We'd buy more below", reached: true } })).toEqual({
      text: "Today's $343.37 is low enough that we'd buy more.",
      gate: "The price we'd buy at is in the full report.",
    });
    const sell = callLine({ ...base, callWord: "Sell some", hidden: { label: "We'd sell some above", reached: false } });
    expect(sell?.text).toBe("We'd sell some if it rises from today's $343.37.");
    expect(sell?.gate).toBe("The price we'd sell at is in the full report.");
    // With the ticker, the gate names the stock: it is the lock's title.
    expect(callLine({ ...base, plan: "anon", ticker: "JPM", hidden: { label: "We'd buy more below", reached: false } })?.gate).toBe(
      "The price we'd buy JPM at comes with a free account.",
    );
    // No dollar figure in a hidden line besides today's price.
    for (const hidden of [
      { label: "We'd buy more above", reached: false },
      { label: "We'd buy more above", reached: true },
      { label: "We'd sell some above", reached: true },
    ] as const) {
      expect(JSON.stringify(callLine({ ...base, hidden }))).not.toMatch(/\$(?!343\.37)\d/);
    }
  });

  it("says what the call means when there is no level, and nothing when that only repeats the word", () => {
    expect(callLine(base)).toEqual({ text: "Wait for a dip before adding.", gate: null });
    expect(callLine({ ...base, callWord: "Keep", callAction: "Keep what you own, don't buy more now" })?.text).toBe("Keep what you own, but don't buy more for now.");
    expect(callLine({ ...base, callAction: "We'd buy more" })).toBeNull();
    expect(callLine({ ...base, callAction: "A good price to buy more" })?.text).toBe("Today's $343.37 is a good price to buy more at.");
    // A meaning that says not to buy more never sits under Buy more.
    expect(callLine({ ...base, callAction: "We'd keep it, not buy more" })).toBeNull();
    expect(callLine({ ...base, callAction: "We'd sell some, not buy more" })).toBeNull();
    expect(callLine({ ...base, callAction: "Don't buy more at this price" })).toBeNull();
    expect(callLine({ ...base, callWord: "Keep", callAction: "We'd keep it, not buy more" })?.text).toBe("Keep what you own, but don't buy more for now.");
    expect(callLine({ ...base, callAction: null })).toBeNull();
  });
});
