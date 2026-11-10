import { describe, expect, it } from "vitest";

import { balancePct, pickInsights, sharePct, toneOfChange } from "./insights";

describe("insights helpers", () => {
  it("sharePct rounds and refuses an empty base", () => {
    expect(sharePct(1, 3)).toBe(33);
    expect(sharePct(5, 0)).toBeNull();
  });
  it("balancePct always sums to 100", () => {
    const out = balancePct({ pos: 1, neg: 1, neu: 1 });
    expect(out.pos + out.neg + out.neu).toBe(100);
    expect(balancePct({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
  it("toneOfChange uses the dead band", () => {
    expect(toneOfChange(0.2, 0.5)).toBe("flat");
    expect(toneOfChange(-2)).toBe("down");
    expect(toneOfChange(null)).toBe("flat");
  });
  it("pickInsights drops empties and caps", () => {
    const one = { id: "a", tone: "up" as const, text: "x" };
    expect(pickInsights([one, null, false, { ...one, id: "b", text: " " }, one, one, one], 3)).toHaveLength(3);
  });
});
