import { describe, expect, it } from "vitest";

import { heldFromUserDoc, mergeChanges, mergeHolding } from "./merge";

const mine = { quantity: 10, average_cost: 150, market_value: null };
const imported = { shares: 12, average_cost: 170, market_value: 4000 };

describe("mergeHolding", () => {
  it("keeps saved numbers by default and only fills blanks", () => {
    expect(mergeHolding(mine, imported, "keep")).toEqual({ quantity: 10, average_cost: 150, market_value: null });
    expect(mergeHolding({ quantity: 10, average_cost: null }, imported, "keep")).toEqual({ quantity: 10, average_cost: 170, market_value: null });
    expect(mergeChanges(mine, mergeHolding(mine, imported, "keep"))).toBe(false);
    // A saved value next to saved shares is left alone too, so "keep" reports nothing changed.
    const withValue = { quantity: 10, average_cost: 150, market_value: 1500 };
    expect(mergeHolding(withValue, imported, "keep")).toEqual(withValue);
    expect(mergeChanges(withValue, mergeHolding(withValue, imported, "keep"))).toBe(false);
  });

  it("replaces with the imported numbers, but a blank never wipes a saved one", () => {
    expect(mergeHolding(mine, imported, "replace")).toEqual({ quantity: 12, average_cost: 170, market_value: null });
    expect(mergeHolding(mine, { shares: 12, average_cost: null, market_value: null }, "replace")).toEqual({ quantity: 12, average_cost: 150, market_value: null });
  });

  it("adds shares and weights the cost, keeping the saved cost when one is missing", () => {
    expect(mergeHolding(mine, imported, "add")).toEqual({ quantity: 22, average_cost: 160.9091, market_value: null });
    expect(mergeHolding(mine, { shares: 5, average_cost: null, market_value: null }, "add")).toEqual({ quantity: 15, average_cost: 150, market_value: null });
    // Nothing to add to: same as keep.
    expect(mergeHolding({ quantity: null, average_cost: 150 }, imported, "add")).toEqual({ quantity: 12, average_cost: 150, market_value: null });
  });

  it("uses a typed-in value only while there are no shares", () => {
    expect(mergeHolding(null, { shares: null, average_cost: null, market_value: 500 }, "replace")).toEqual({ quantity: null, average_cost: null, market_value: 500 });
  });
});

describe("heldFromUserDoc", () => {
  it("lists tracked stocks with their saved numbers", () => {
    expect(
      heldFromUserDoc({
        tracked_stocks: ["US_AAPL", "US_MSFT", 4],
        watchlist_positions: { US_AAPL: "holding", US_MSFT: "watchlist" },
        watchlist_holdings: { US_AAPL: { quantity: 10, average_cost: "x" } },
      }),
    ).toEqual({ US_AAPL: { kind: "holding", shares: 10, average_cost: null }, US_MSFT: { kind: "watchlist", shares: null, average_cost: null } });
    expect(heldFromUserDoc(null)).toEqual({});
  });
});
