import { describe, expect, it } from "vitest";
import { buildLandingPriceMovers } from "./landing-sector-data";
import type { SnapshotRow } from "./types";

const now = new Date("2026-10-23T13:45:00Z");
function row(symbol: string, changePct = 3, lastUpdated = "2026-10-23T13:40:00Z"): SnapshotRow {
  return { instrumentId: `US_${symbol}`, symbol, name: symbol, market: "US", lastUpdated,
    price: { current: 100, changePct } };
}

describe("opening price movers", () => {
  it("excludes stale, future, invalid and other-market prices", () => {
    expect(buildLandingPriceMovers([
      row("FRESH"), row("OLD", 20, "2026-10-22T20:00:00Z"),
      row("FUTURE", 20, "2026-10-23T14:00:00Z"), row("INVALID", NaN),
      row("NO_DATE", 10, ""), row("SPIKE", 101), row("FLAT", 0),
      { ...row("WRONG_MARKET"), market: "IN" },
      { ...row("BAD_PRICE"), price: { current: 0, changePct: 5 } },
    ], "US", now).map((r) => r.symbol)).toEqual(["FRESH"]);
  });

  it("ranks gainers and losers by magnitude and limits the list", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`STOCK${i}`, i % 2 ? -i : i));
    const selected = buildLandingPriceMovers(rows, "US", now);
    expect(selected).toHaveLength(8);
    expect(selected.slice(0, 2).map((r) => r.price.changePct)).toEqual([-11, 10]);
    expect(rows[0].symbol).toBe("STOCK0");
  });
});
