import { describe, expect, it } from "vitest";

import { placeLabels } from "./swings";

describe("placeLabels", () => {
  it("labels the six biggest dots, on the right where it is free", () => {
    const points = ["A", "B", "C", "D", "E", "F", "G", "H"].map((ticker, index) => ({ ticker, x: 10 + index * 4, y: 10 + index * 10, size: index }));
    const labels = placeLabels(points);
    expect(labels.map((label) => label.ticker)).toEqual(["H", "G", "F", "E", "D", "C"]);
    expect(labels.every((label) => label.side === "right")).toBe(true);
  });

  it("moves a label off the plot's right edge and off a neighbour, and drops it when no side is free", () => {
    const edge = placeLabels([{ ticker: "NVDA", x: 98, y: 50, size: 1 }]);
    expect(edge).toEqual([{ ticker: "NVDA", side: "left" }]);
    // Four dots packed around a fifth: the middle one has no free side for its text.
    const packed = placeLabels(
      [
        { ticker: "MID", x: 50, y: 50, size: 1 },
        { ticker: "L", x: 43, y: 50, size: 0 },
        { ticker: "R", x: 57, y: 50, size: 0 },
        { ticker: "U", x: 50, y: 59, size: 0 },
        { ticker: "D", x: 50, y: 41, size: 0 },
      ],
      1,
    );
    expect(packed).toEqual([]);
  });
});
