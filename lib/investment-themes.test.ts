import { describe, expect, it } from "vitest";

import { FREE_THEME_VISIBLE_LIMIT } from "@/lib/pro-features";
import { INVESTMENT_THEMES, getInvestmentTheme } from "@/lib/investment-themes";

describe("investment themes", () => {
  it("contains the five Explore theme destinations", () => {
    expect(INVESTMENT_THEMES.map((theme) => theme.slug)).toEqual([
      "ai-capex",
      "energy",
      "healthcare",
      "defense",
      "financials",
    ]);
  });

  it("keeps ten primary candidates and unique tickers per theme", () => {
    for (const theme of INVESTMENT_THEMES) {
      const tickers = theme.candidates.map((candidate) => candidate.ticker);
      expect(tickers).toHaveLength(10);
      expect(new Set(tickers).size).toBe(tickers.length);
      expect(theme.candidates.slice(0, FREE_THEME_VISIBLE_LIMIT)).toHaveLength(
        4,
      );
    }
  });

  it("resolves slugs case-insensitively", () => {
    expect(getInvestmentTheme("ENERGY")?.name).toBe("Energy");
    expect(getInvestmentTheme("missing-theme")).toBeNull();
  });
});
