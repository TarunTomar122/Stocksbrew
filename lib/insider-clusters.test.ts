import { describe, expect, it } from "vitest";

import type { InsiderTrade } from "@/lib/follow-shared";
import { clustersFromBuys, mergeClusters } from "@/lib/insider-clusters";

function buy(symbol: string, day: string, insider: string, value: number | null = 10_000): InsiderTrade {
  return {
    id: `${symbol}-${day}-${insider}`, symbol, company: `${symbol} Inc`, insider, insider_id: insider, role: "Director", tx_type: "buy",
    shares: 100, price: value === null ? null : value / 100, value, transaction_date: day, filing_date: day, filed_at: `${day}T16:00:00`,
    lag_days: 1, shares_after: null, ownership: "D", plan_10b5_1: false, url: "",
  };
}

describe("clustersFromBuys", () => {
  it("finds three insiders buying one stock within 30 days, across job runs", () => {
    const clusters = clustersFromBuys([buy("LKQ", "2026-10-28", "a"), buy("LKQ", "2026-11-03", "b"), buy("LKQ", "2026-11-05", "c", null), buy("ACN", "2026-11-04", "x"), buy("ACN", "2026-11-05", "y")], "2026-11-11");
    expect(clusters.map((cluster) => cluster.symbol)).toEqual(["LKQ"]);
    expect(clusters[0]).toMatchObject({ insiders: 3, filings: 3, first_date: "2026-10-28", last_date: "2026-11-05", total_value: 20_000 });
  });

  it("counts a person once and leaves out buys older than the window", () => {
    expect(clustersFromBuys([buy("LKQ", "2026-11-03", "a"), buy("LKQ", "2026-11-04", "a"), buy("LKQ", "2026-11-05", "b")], "2026-11-11")).toEqual([]);
    expect(clustersFromBuys([buy("LKQ", "2026-09-01", "a"), buy("LKQ", "2026-09-02", "b"), buy("LKQ", "2026-09-03", "c")], "2026-11-11")).toEqual([]);
  });

  it("merges with the stored ones, one per stock", () => {
    const computed = clustersFromBuys([buy("LKQ", "2026-11-03", "a"), buy("LKQ", "2026-11-04", "b"), buy("LKQ", "2026-11-05", "c")], "2026-11-11");
    const stored = [{ ...computed[0]!, insiders: 4 }];
    expect(mergeClusters(stored, computed)).toHaveLength(1);
    expect(mergeClusters(stored, computed)[0]!.insiders).toBe(4);
  });
});
