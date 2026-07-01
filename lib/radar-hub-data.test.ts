import { describe, expect, it } from "vitest";

import { resolveBookCallHint } from "@/lib/radar-hub-data";
import type { WatchlistRow } from "@/lib/watchlist-view";
import type { Directive } from "@/lib/stock";

function row(price: number): WatchlistRow {
  return {
    instrument_id: "US_AVGO",
    ticker: "AVGO",
    position_type: "holding",
    market: "US",
    price,
    scores: {},
  } as WatchlistRow;
}

describe("resolveBookCallHint", () => {
  it("prefers nearer buy-below zone over distant trim-above when stance is trim", () => {
    const directive: Directive = {
      text: "Trim strength",
      stance: "trim",
      trigger_type: "price_above",
      trigger_value: "430",
      add_on: {
        text: "Add below $372.10",
        trigger_type: "price_below",
        trigger_value: "372.10",
      },
      trim_on: {
        text: "Trim above $430",
        trigger_type: "price_above",
        trigger_value: "430",
      },
    };

    const hint = resolveBookCallHint(row(372.45), directive);
    expect(hint?.callKind).toBe("buy_dip");
    expect(hint?.hint).toContain("372");
  });

  it("shows trim when price is inside trim-above zone", () => {
    const directive: Directive = {
      text: "Trim strength",
      stance: "trim",
      trigger_type: "price_above",
      trigger_value: "430",
      add_on: {
        text: "Add below $372.10",
        trigger_type: "price_below",
        trigger_value: "372.10",
      },
      trim_on: {
        text: "Trim above $430",
        trigger_type: "price_above",
        trigger_value: "430",
      },
    };

    const hint = resolveBookCallHint(row(435), directive);
    expect(hint?.callKind).toBe("trim");
    expect(hint?.urgent).toBe(true);
  });
});
