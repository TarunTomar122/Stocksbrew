import { describe, expect, it } from "vitest";

import { moversTakeaway, usHoldings } from "@/lib/markets-insights";
import { sparkTone, type MarketAsset, type MarketsData } from "@/lib/markets-shared";

import { packMarkets, unpackMarkets } from "./compact";
import { ROW_SPARK_WIDTH, sparkValues } from "./widgets";

function asset(id: string, extra: Partial<MarketAsset> = {}): MarketAsset {
  return {
    id, class: "etf", group: null, name: id.toUpperCase(), symbol: id.toUpperCase(), price: 100, prev_close: 99, unit: "USD", change_mode: "pct",
    change: { d1: 1.2, w1: null, m1: null, ytd: null, y1: null }, high_1y: 120, high_1y_date: "2026-03-01", low_1y: 80, low_1y_date: null,
    spark: Array.from({ length: 250 }, (_, index) => 80 + index / 5), spark_start: "2025-11-10", spark_end: "2026-11-10", source: "yahoo",
    source_name: "Yahoo Finance", source_url: "https://example.com", as_of: "2026-11-10T21:00:00Z", order: 0, contract: null, curve: [],
    structure: null, market_cap: null, volume_24h: null, ath: null, ath_date: null, image: null, tenor: null, expense_ratio_pct: 0.09,
    total_assets: 1e9, yield_pct: null, fund_family: "Vanguard", category: null,
    holdings: [
      { symbol: "ASML.AS", name: "ASML", weight_pct: 9 },
      { symbol: "NVDA", name: "NVIDIA", weight_pct: 8 },
      { symbol: "BRK-B", name: "Berkshire", weight_pct: 7 },
      { symbol: "AAPL", name: "Apple", weight_pct: 6 },
      { symbol: "MSFT", name: "Microsoft", weight_pct: 5 },
    ],
    holdings_weight_pct: 35, sectors: [{ sector: "Tech", weight_pct: 40 }], profile_source_name: "x", profile_source_url: "y", profile_as_of: "z",
    call_volume: null, put_volume: null, average_20d: null, daily_only: false, ...extra,
  };
}

const data: MarketsData = {
  as_of: "2026-11-10T21:00:00Z",
  assets: [asset("smh"), asset("tlt", { change: { d1: -2.5, w1: null, m1: null, ytd: null, y1: null }, daily_only: true, group: "bond" })],
  predictions: [],
  treasury: null,
  volCurve: null,
};

describe("packMarkets", () => {
  const round = unpackMarkets(packMarkets(data));

  it("round-trips every field the cards read", () => {
    for (const [index, original] of data.assets.entries()) {
      const back = round.assets[index]!;
      for (const key of ["id", "class", "group", "name", "symbol", "price", "unit", "change_mode", "change", "high_1y", "high_1y_date", "low_1y", "as_of", "order", "source", "source_name", "daily_only"] as const) {
        expect(back[key]).toEqual(original[key]);
      }
    }
  });

  it("thins sparklines to what their width draws, keeping the line and its tone", () => {
    const back = round.assets[0]!;
    const drawn = sparkValues(data.assets[0]!.spark, ROW_SPARK_WIDTH);
    expect(back.spark).toHaveLength(drawn.length);
    back.spark.forEach((value, index) => expect(value).toBeCloseTo(drawn[index]!, 3));
    // Thinning the sent values again to the same width keeps them all.
    expect(sparkValues(back.spark, ROW_SPARK_WIDTH)).toEqual(back.spark);
    expect(sparkTone(back.spark)).toBe(sparkTone(data.assets[0]!.spark));
  });

  it("keeps the holdings the takeaways name, and the takeaways read the same", () => {
    expect(usHoldings(round.assets[0])).toEqual(usHoldings(data.assets[0]));
    expect(moversTakeaway(round.assets)).toBe(moversTakeaway(data.assets));
  });

  it("leaves out empty and unused fields on the wire", () => {
    const wire = packMarkets(data).assets[0]!;
    expect(wire).not.toHaveProperty("prev_close");
    expect(wire).not.toHaveProperty("sectors");
    expect(wire).not.toHaveProperty("curve");
    expect(wire).not.toHaveProperty("market_cap");
    expect(wire).not.toHaveProperty("daily_only");
    expect(round.assets[0]!.sectors).toEqual([]);
    expect(round.assets[1]!.daily_only).toBe(true);
  });
});
