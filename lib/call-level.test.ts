import { describe, expect, it } from "vitest";

import { ownCallLevel } from "@/lib/call-level";

describe("a call's own price level", () => {
  const levels = { addBelow: 169, trimAbove: 240 };

  it("shows the buy-more level on Buy more and the sell-some level on Sell some", () => {
    expect(ownCallLevel("Add", levels)).toEqual({ label: "We'd buy more below", price: 169 });
    expect(ownCallLevel("Trim", levels)).toEqual({ label: "We'd sell some above", price: 240 });
    expect(ownCallLevel("Add", { addAbove: 180 })).toEqual({ label: "We'd buy more above", price: 180 });
  });

  it("shows no level on Keep or without a call", () => {
    expect(ownCallLevel("Hold", levels)).toBeNull();
    expect(ownCallLevel(null, levels)).toBeNull();
  });

  it("shows nothing for a missing or broken level", () => {
    expect(ownCallLevel("Add", { trimAbove: 240 })).toBeNull();
    expect(ownCallLevel("Trim", { addBelow: 169, trimAbove: Number.NaN })).toBeNull();
    expect(ownCallLevel("Add", { addBelow: 0 })).toBeNull();
  });
});
