import { describe, expect, it } from "vitest";

import { followMeaning, followWords, pairMeaning, pairWords } from "./together";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("pairWords", () => {
  it("says how a pair moves in plain words", () => {
    expect(pairWords(0.93)).toBe("move almost as one");
    expect(pairWords(0.66)).toBe("move closely together");
    expect(pairWords(0.45)).toBe("move loosely together");
    expect(pairWords(0.2)).toBe("barely move together");
    expect(pairWords(-0.32)).toBe("move apart");
  });
});

describe("the insight lines", () => {
  it("say what the steadiest name and the closest pair mean, briefly and without figures", () => {
    for (const value of [-0.2, 0.1, 0.35, 0.5, 0.7, 0.9]) {
      for (const line of [followWords(value), followMeaning(value), pairMeaning(value)]) {
        expect(words(line)).toBeLessThanOrEqual(12);
        expect(line).not.toMatch(/\d/);
      }
    }
    expect(followWords(0.12)).toBe("Barely follows the others");
    expect(followWords(0.45)).toBe("Loosely follows the others");
  });
});
