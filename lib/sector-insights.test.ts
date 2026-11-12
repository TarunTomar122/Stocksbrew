import { describe, expect, it } from "vitest";

import type { ScreenerRow } from "@/lib/screener-shared";
import { callCounts, medianPe, weightedChange } from "@/lib/sector-insights";

const row = (symbol: string, over: Partial<ScreenerRow> = {}): ScreenerRow => ({ symbol, sector: "Energy", market_cap: 100, day_pct: 1, ret_1m: 2, ret_ytd: 10, pe: 15, call: "Add", ...over });

describe("sector figures", () => {
  it("weights changes by market value and skips missing numbers", () => {
    expect(weightedChange([row("A", { day_pct: 1, market_cap: 300 }), row("B", { day_pct: -1, market_cap: 100 }), row("C", { day_pct: undefined })], "day_pct")).toBe(0.5);
    expect(weightedChange([row("A", { market_cap: undefined })], "day_pct")).toBeNull();
  });

  it("counts calls and takes the median of positive P/Es", () => {
    expect(callCounts([row("A"), row("B", { call: undefined }), row("C", { call: "Trim" })])).toEqual({ Add: 1, Hold: 0, Trim: 1, total: 2 });
    expect(medianPe([row("A", { pe: 10 }), row("B", { pe: 30 }), row("C", { pe: -5 })])).toEqual({ value: 20, count: 2 });
  });
});
