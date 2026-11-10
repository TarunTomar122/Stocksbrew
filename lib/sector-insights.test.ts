import { describe, expect, it } from "vitest";

import type { ScreenerRow } from "@/lib/screener-shared";
import { buildSectorRead, callCounts, medianPe, weightedChange } from "@/lib/sector-insights";

const row = (symbol: string, over: Partial<ScreenerRow> = {}): ScreenerRow => ({ symbol, sector: "Energy", market_cap: 100, day_pct: 1, ret_1m: 2, ret_ytd: 10, pe: 15, call: "Add", ...over });

describe("sector read", () => {
  it("weights changes by market value and skips missing numbers", () => {
    expect(weightedChange([row("A", { day_pct: 1, market_cap: 300 }), row("B", { day_pct: -1, market_cap: 100 }), row("C", { day_pct: undefined })], "day_pct")).toBe(0.5);
    expect(weightedChange([row("A", { market_cap: undefined })], "day_pct")).toBeNull();
  });

  it("reads the sector against the S&P 500 with leaders, the trend and our calls", () => {
    const rows = [
      row("XOM", { day_pct: 3, market_cap: 500 }),
      row("CVX", { day_pct: 2 }),
      row("COP", { day_pct: -1, call: "Hold" }),
      row("OXY", { day_pct: -4, call: "Trim" }),
      row("EOG", { day_pct: 0.5 }),
    ];
    const all = [...rows, row("AAPL", { sector: "Technology", call: "Hold" }), row("MSFT", { sector: "Technology", call: "Hold" })];
    const read = buildSectorRead({ name: "Energy", rows, all, spy: row("SPY", { day_pct: 0.4, ret_1m: 1, ret_ytd: 12 }), priceDay: "2026-11-09", moveHrefs: new Map([["OXY", "/stock/OXY/moves/2026-11-09"]]) })!;
    expect(read.headline).toBe("Energy stocks rose 1.4% on the last session, ahead of the S&P 500 (+0.4%); 60% of its 5 stocks rose.");
    expect(read.insights.map((insight) => insight.id)).toEqual(["movers", "trend", "calls"]);
    expect(read.insights[0]!.text).toBe("XOM +3.0%, CVX +2.0% led; OXY −4.0%, COP −1.0% were the weakest.");
    expect(read.insights[0]!.action).toEqual({ label: "Why OXY moved", href: "/stock/OXY/moves/2026-11-09" });
    expect(read.insights[2]!.text).toBe("Our calls on its 5 stocks: 3 Add, 1 Hold, 1 Trim.");
    expect(read.insights[2]!.soWhat).toBe("That is 60% Add, against 43% across every stock we cover.");
  });

  it("counts calls and takes the median of positive P/Es", () => {
    expect(callCounts([row("A"), row("B", { call: undefined }), row("C", { call: "Trim" })])).toEqual({ Add: 1, Hold: 0, Trim: 1, total: 2 });
    expect(medianPe([row("A", { pe: 10 }), row("B", { pe: 30 }), row("C", { pe: -5 })])).toEqual({ value: 20, count: 2 });
    expect(buildSectorRead({ name: "Energy", rows: [], all: [], spy: null, priceDay: null })).toBeNull();
  });
});
