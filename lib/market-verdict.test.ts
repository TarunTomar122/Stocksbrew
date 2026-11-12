import { describe, expect, it } from "vitest";

import { dollarVerdict, fedVerdict, goldVerdict, movesVerdict, putCallVerdict, verdictTally, vixVerdict, yieldVerdict } from "./market-verdict";

const v = (line: { verdict: string } | null) => line?.verdict ?? null;

describe("vixVerdict", () => {
  it("reads under 15 as good, 15 to 25 as neutral and over 25 as bad", () => {
    expect(v(vixVerdict(12.4))).toBe("good");
    expect(v(vixVerdict(15))).toBe("neutral");
    expect(v(vixVerdict(25))).toBe("neutral");
    expect(v(vixVerdict(25.1))).toBe("bad");
  });
  it("gives no verdict without a number", () => {
    expect(vixVerdict(null)).toBeNull();
    expect(vixVerdict(Number.NaN)).toBeNull();
    expect(vixVerdict(0)).toBeNull();
  });
});

describe("yieldVerdict", () => {
  it("reads a falling yield as good, a rising one as bad and a flat one as neutral", () => {
    expect(v(yieldVerdict(-0.2))).toBe("good");
    expect(v(yieldVerdict(0.06))).toBe("bad");
    expect(v(yieldVerdict(0.05))).toBe("neutral");
    expect(v(yieldVerdict(-0.05))).toBe("neutral");
    expect(yieldVerdict(undefined)).toBeNull();
  });
});

describe("putCallVerdict", () => {
  it("compares the ratio with its usual level", () => {
    expect(v(putCallVerdict(0.55, 0.62))).toBe("good");
    expect(v(putCallVerdict(0.7, 0.62))).toBe("bad");
    expect(v(putCallVerdict(0.63, 0.62))).toBe("neutral");
  });
  it("gives no verdict without the usual level", () => {
    expect(putCallVerdict(0.59, null)).toBeNull();
  });
});

describe("goldVerdict and dollarVerdict", () => {
  it("reads a 5% month in gold as a rush to safety", () => {
    expect(v(goldVerdict(5))).toBe("bad");
    expect(v(goldVerdict(2))).toBe("neutral");
    expect(goldVerdict(null)).toBeNull();
  });
  it("reads the dollar at its one-year high as mildly bad", () => {
    expect(v(dollarVerdict(109.9, 99, 110))).toBe("bad");
    expect(v(dollarVerdict(104, 99, 110))).toBe("neutral");
    expect(dollarVerdict(104, 110, 99)).toBeNull();
  });
});

describe("fedVerdict", () => {
  it("reads a hike as bad, a cut as good and a hold as neutral", () => {
    expect(v(fedVerdict("raises rates by 0.25 percentage points"))).toBe("bad");
    expect(v(fedVerdict("cuts rates by 0.25 percentage points"))).toBe("good");
    expect(v(fedVerdict("holds rates where they are"))).toBe("neutral");
    expect(fedVerdict(null)).toBeNull();
  });
});

describe("movesVerdict", () => {
  it("reads mostly gains as good and mostly losses as bad", () => {
    expect(v(movesVerdict(5, 7))).toBe("good");
    expect(v(movesVerdict(2, 7))).toBe("bad");
    expect(v(movesVerdict(4, 7))).toBe("neutral");
    expect(movesVerdict(5, 7)?.why).toBe("5 of the 7 biggest stock moves were gains.");
  });
  it("gives no verdict on too few moves", () => {
    expect(movesVerdict(2, 2)).toBeNull();
  });
});

describe("verdictTally", () => {
  it("counts the good ones among the cards with a verdict", () => {
    expect(verdictTally(["good", "bad", null, "good", "neutral"])).toBe("2 of 4 good for stocks");
    expect(verdictTally([null, undefined])).toBeNull();
  });
});
