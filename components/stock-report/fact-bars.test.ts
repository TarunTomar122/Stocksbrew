import { describe, expect, it } from "vitest";

import { barGeometry } from "./fact-bars";

describe("barGeometry", () => {
  it("runs both bars right from a zero line at the left when both values are positive", () => {
    const { zero, bars } = barGeometry([83, 65]);
    expect(zero).toBe(0);
    expect(bars[0]).toEqual({ left: 0, width: 100, negative: false, tiny: false });
    expect(bars[1]!.left).toBe(0);
    expect(bars[1]!.width).toBeCloseTo((65 / 83) * 100, 6);
  });

  it("runs both bars left from a zero line at the right when both values are negative", () => {
    const { zero, bars } = barGeometry([-13, -0.9]);
    expect(zero).toBe(100);
    expect(bars[0]).toEqual({ left: 0, width: 100, negative: true, tiny: false });
    // −0.9% is short, still drawn, and ends at the zero line.
    expect(bars[1]!.negative).toBe(true);
    expect(bars[1]!.left + bars[1]!.width).toBeCloseTo(100, 6);
    expect(bars[1]!.width).toBeLessThan(10);
  });

  it("points a fall left and a rise right from one shared zero line on one scale", () => {
    const { zero, bars } = barGeometry([-6, 2]);
    // The scale spans −6 to +2, so zero sits three quarters of the way across.
    expect(zero).toBeCloseTo(75, 6);
    expect(bars[0]).toEqual({ left: 0, width: 75, negative: true, tiny: false });
    expect(bars[1]).toEqual({ left: 75, width: 25, negative: false, tiny: false });
  });

  it("draws nothing for zero and keeps every bar inside the track", () => {
    const { bars } = barGeometry([0, 0]);
    expect(bars.every((bar) => bar.width === 0)).toBe(true);
    const mixed = barGeometry([5, -0.01]);
    for (const bar of mixed.bars) {
      expect(bar.left).toBeGreaterThanOrEqual(0);
      expect(bar.left + bar.width).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
});

describe("barGeometry, tiny values", () => {
  it("keeps a tiny value at its true width and flags it for a dot, never padding it", () => {
    const { bars } = barGeometry([100, 0.1]);
    expect(bars[1]!.width).toBeCloseTo(0.1, 5);
    expect(bars[1]!.tiny).toBe(true);
    expect(bars[0]!.tiny).toBe(false);
  });
});
