import { describe, expect, it } from "vitest";

import { sharePrice, signedPct } from "./format";

describe("signedPct", () => {
  it("signs a move at the digits asked for", () => {
    // The same toFixed rounding as the read, the movers page and the home cards, so 23.95 is +23.9% everywhere.
    expect(signedPct(23.95, 1)).toBe("+23.9%");
    expect(signedPct(-9.81, 1)).toBe("−9.8%");
    expect(signedPct(1.4234)).toBe("+1.42%");
  });

  it("never signs a move that rounds to zero", () => {
    expect(signedPct(-0.04, 1)).toBe("0.0%");
    expect(signedPct(0.004)).toBe("0.00%");
    expect(signedPct(0, 1)).toBe("0.0%");
  });
});

describe("sharePrice", () => {
  it("shows cents under $1,000 and none from $1,000 up", () => {
    expect(sharePrice(173.85)).toBe("$173.85");
    expect(sharePrice(9.5)).toBe("$9.50");
    expect(sharePrice(1204.4)).toBe("$1,204");
    expect(sharePrice(null)).toBeNull();
    expect(sharePrice(0)).toBeNull();
  });
});
