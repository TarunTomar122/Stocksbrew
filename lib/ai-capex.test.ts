import { describe, expect, it } from "vitest";

import { AI_CAPEX_BENEFICIARIES, AI_CAPEX_WATCHLIST } from "@/lib/ai-capex";

describe("AI capex beneficiary map", () => {
  it("keeps ten ranked public beneficiaries with unique tickers", () => {
    expect(AI_CAPEX_BENEFICIARIES).toHaveLength(10);
    expect(AI_CAPEX_BENEFICIARIES.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(AI_CAPEX_BENEFICIARIES.map((row) => row.ticker)).size).toBe(10);
  });

  it("keeps an explicit failure case for every core thesis", () => {
    expect(AI_CAPEX_BENEFICIARIES.every((row) => row.breaksThesis.length > 0)).toBe(true);
    expect(AI_CAPEX_BENEFICIARIES.find((row) => row.ticker === "VRT")).toMatchObject({
      stocksbrewLabel: "Not covered",
      coverageNote: "1/3 coverage",
    });
  });

  it("keeps higher-risk names separate from the ranked list", () => {
    expect(AI_CAPEX_WATCHLIST.map((row) => row.ticker)).toEqual(["MOD", "COHR", "PWR", "CEG", "DLR", "EQIX"]);
    expect(AI_CAPEX_WATCHLIST.some((row) => row.ticker === "NVDA")).toBe(false);
  });
});
