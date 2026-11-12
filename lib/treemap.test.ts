import { describe, expect, it } from "vitest";

import { squarify } from "@/lib/treemap";

describe("squarify", () => {
  it("fills the rectangle exactly, with areas following the weights", () => {
    const boxes = squarify(
      [
        { key: "A", weight: 6 },
        { key: "B", weight: 6 },
        { key: "C", weight: 4 },
        { key: "D", weight: 3 },
        { key: "E", weight: 2 },
        { key: "F", weight: 2 },
        { key: "G", weight: 1 },
      ],
      600,
      400,
      0,
    );
    const area = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
    expect(area).toBeCloseTo(100 * 100, 3);
    const a = boxes.find((box) => box.key === "A")!;
    const g = boxes.find((box) => box.key === "G")!;
    expect((a.w * a.h) / (g.w * g.h)).toBeCloseTo(6, 3);
    for (const box of boxes) {
      expect(box.x + box.w).toBeLessThanOrEqual(100.0001);
      expect(box.y + box.h).toBeLessThanOrEqual(100.0001);
    }
  });

  it("uses the size of a move, up or down, and gives a flat item a floor", () => {
    const boxes = squarify(
      [
        { key: "UP", weight: 1.1 },
        { key: "DOWN", weight: -1.1 },
        { key: "FLAT", weight: 0 },
      ],
      300,
      100,
    );
    const up = boxes.find((box) => box.key === "UP")!;
    const down = boxes.find((box) => box.key === "DOWN")!;
    const flat = boxes.find((box) => box.key === "FLAT")!;
    expect(up.w * up.h).toBeCloseTo(down.w * down.h, 3);
    expect(flat.w * flat.h).toBeGreaterThan(0);
  });

  it("keeps the floor small, so a 0.04% move is not drawn as big as a 0.4% one", () => {
    const boxes = squarify(
      [
        { key: "BIG", weight: 1.6 },
        { key: "MID", weight: 1.1 },
        { key: "SMALL", weight: 0.4 },
        { key: "TINY", weight: 0.04 },
        { key: "FLAT", weight: 0 },
      ],
      320,
      250,
    );
    const area = (key: string) => {
      const box = boxes.find((item) => item.key === key)!;
      return box.w * box.h;
    };
    expect(area("SMALL") / area("TINY")).toBeGreaterThan(4);
    expect(area("FLAT")).toBeGreaterThan(0);
    expect(area("FLAT") / (100 * 100)).toBeLessThan(0.02);
  });

  it("returns nothing for no items", () => {
    expect(squarify([], 100, 100)).toEqual([]);
  });
});
