import { describe, expect, it } from "vitest";

import { plainRuleChange } from "@/lib/rule-copy";

describe("plainRuleChange on older stored sentences outside the hold", () => {
  it("keeps one 'or', at the end, once the market drop is gone", () => {
    expect(
      plainRuleChange(
        "We'd move to Keep if the case for buying fades for a few days, or sooner after its Dec 10 results or a day in which it falls 5% more than the S&P 500, a week in which it falls 9% more or a week in which the S&P 500 falls 4%.",
      ),
    ).toBe("We'd move to Keep if the case for buying fades for a few days, or sooner after its Dec 10 results, a day in which it falls 5% more than the S&P 500 or a week in which it falls 9% more.");
  });

  it("moves the 'or' to the last item when there was no market drop", () => {
    expect(
      plainRuleChange(
        "We'd move to Keep if the case for selling fades for a few days, or sooner after its next results or a day in which it rises 5% more than the S&P 500, a week in which it rises 9% more.",
      ),
    ).toBe("We'd move to Keep if the case for selling fades for a few days, or sooner after its next results, a day in which it rises 5% more than the S&P 500 or a week in which it rises 9% more.");
  });

  it("leaves a lone 'after its next results' alone", () => {
    const text = "We'd move to Buy more or Sell some once the case holds for a few days, or sooner after its next results.";
    expect(plainRuleChange(text)).toBe(text);
  });
});
