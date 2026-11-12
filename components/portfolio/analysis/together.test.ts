import { describe, expect, it } from "vitest";

import { namedPairs, pairWords } from "./together";

const order = ["NVDA", "TSM", "XOM", "AAPL"].map((ticker) => ({ ticker })) as Parameters<typeof namedPairs>[0]["order"];

describe("namedPairs", () => {
  it("names the closest pairs, then the one that moves most apart", () => {
    const matrix = [
      [1, 0.66, -0.32, 0.45],
      [0.66, 1, -0.1, 0.2],
      [-0.32, -0.1, 1, 0.05],
      [0.45, 0.2, 0.05, 1],
    ];
    expect(namedPairs({ order, matrix })).toEqual([
      { a: "NVDA", b: "TSM", value: 0.66 },
      { a: "NVDA", b: "AAPL", value: 0.45 },
      { a: "NVDA", b: "XOM", value: -0.32 },
    ]);
  });

  it("names nothing when no pair is close or apart enough", () => {
    const matrix = order.map((_, i) => order.map((__, j) => (i === j ? 1 : 0.1)));
    expect(namedPairs({ order, matrix })).toEqual([]);
  });
});

describe("pairWords", () => {
  it("says how a pair moves in plain words", () => {
    expect(pairWords(0.93)).toBe("move almost as one");
    expect(pairWords(0.66)).toBe("move closely");
    expect(pairWords(0.45)).toBe("move somewhat alike");
    expect(pairWords(-0.32)).toBe("move apart");
  });
});
