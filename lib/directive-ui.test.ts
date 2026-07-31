import { describe, expect, it } from "vitest";

import { buildDirectiveSmartAlerts, pickVisibleChartZoneKeys, resolvePriceAwareCall } from "@/lib/directive-ui";
import type { Directive } from "@/lib/stock";

const trimDirective: Directive = {
  text: "Trim into strength",
  stance: "trim",
  confidence: "med",
  trigger_type: "price_above",
  trigger_value: "17.87",
  add_on: {
    text: "Buy below $13.87",
    trigger_type: "price_below",
    trigger_value: "13.87",
  },
  trim_on: {
    text: "Trim above $17.87",
    trigger_type: "price_above",
    trigger_value: "17.87",
  },
};

describe("directive-ui", () => {
  it("shows trim context instead of nearby add zones for trim calls", () => {
    expect(pickVisibleChartZoneKeys(trimDirective, 13.92)).toEqual(["trim"]);
    expect(buildDirectiveSmartAlerts(trimDirective, (value) => `$${value.toFixed(2)}`)).toMatchObject([
      { id: "trim", title: "Trim zone", detail: "above $17.87" },
    ]);
  });

  it("does not rewrite explicit avoid copy into trim copy below the trim zone", () => {
    const directive: Directive = {
      ...trimDirective,
      text: "Do not add here",
      action_now: "Risk/reward has weakened; avoid adding and use any bounce to reduce exposure.",
    };

    expect(resolvePriceAwareCall(directive, 13.92, (value) => `$${value.toFixed(2)}`)).toMatchObject({
      headline: "Do not add here",
      body: "Risk/reward has weakened; avoid adding and use any bounce to reduce exposure.",
    });
  });

  it("can round actionable levels without rounding the live price", () => {
    const formatPrice = (value: number) => `$${value.toFixed(2)}`;
    const formatLevel = (value: number) => `$${Math.round(value)}`;
    const call = resolvePriceAwareCall(
      {
        ...trimDirective,
        stance: "accumulate",
        add_on: {
          text: "Add after reclaim",
          trigger_type: "price_above",
          trigger_value: "14.49",
        },
      },
      13.92,
      formatPrice,
      formatLevel,
    );

    expect(call.body).toContain("$13.92");
    expect(call.body).toContain("$14");
    expect(call.body).not.toContain("$14.49");
  });
});
