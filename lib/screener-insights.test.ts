import { describe, expect, it } from "vitest";

import { buildScreenerRead, buildSectorsRead } from "./screener-insights";
import { sectorStats, type ScreenerRow } from "./screener-shared";

const SPY: ScreenerRow = { symbol: "SPY", ret_1y: 14, day_pct: 1, benchmark: true };

describe("screener read", () => {
  const universe: ScreenerRow[] = [
    ...Array.from({ length: 6 }, (_, i): ScreenerRow => ({ symbol: `T${i}`, sector: "Technology", day_pct: 2 + i, market_cap: 100 - i, fwd_pe: 40 })),
    ...Array.from({ length: 6 }, (_, i): ScreenerRow => ({ symbol: `E${i}`, sector: "Energy", day_pct: -1, market_cap: 50 - i, fwd_pe: 12 })),
  ];

  it("describes the set against everything we cover", () => {
    const matched = [...universe.slice(0, 6), universe[6]!];
    const read = buildScreenerRead({ matched, universe, narrowed: true, priceDay: "2026-11-09", spy: SPY });
    expect(read?.headline).toBe("7 stocks match; 86% are Technology; the median one rose 4.0% on Nov 9 against +0.5% for all 12 stocks we cover.");
    expect(read?.insights.map((item) => item.id)).toContain("tilt");
  });

  it("counts covered stocks near an add zone, never stripped ones", () => {
    const matched = [{ ...universe[0]!, zone: "add" as const }, { ...universe[1]!, to_add_pct: 2 }, universe[2]!];
    const read = buildScreenerRead({ matched, universe, narrowed: true, priceDay: null });
    expect(read?.insights.find((item) => item.id === "zones")?.text).toBe("2 stocks are inside or within 3% of our add zone: T0 and T1.");
  });

  it("is null for an empty set", () => {
    expect(buildScreenerRead({ matched: [], universe, narrowed: true, priceDay: null })).toBeNull();
  });

  it("reads the Sectors tab", () => {
    const read = buildSectorsRead({ stats: sectorStats(universe), priceDay: "2026-11-09" });
    expect(read?.headline).toMatch(/^Technology led on Nov 9 \(\+\d\.\d%\) and Energy lagged \(−1\.0%\); 1 of 2 sectors rose\.$/);
  });
});
