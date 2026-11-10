import { describe, expect, it } from "vitest";

import type { PracticeView } from "@/lib/practice";
import { buildPracticeRead } from "@/lib/practice-insights";

function row(symbol: string, cost: number, value: number, equity: number) {
  return { symbol, shares: 1, cost, average_cost: cost, price: value, price_date: "2026-11-09", value, pnl: value - cost, pnl_pct: value / cost - 1, weight: value / equity };
}

describe("practice read", () => {
  it("compares with SPY and names what drove it and the cash drag", () => {
    const equity = 102_000;
    const view: PracticeView = {
      started_at: "2026-08-01",
      start_cash: 100_000,
      cash: 40_000,
      rows: [row("AAPL", 30_000, 33_000, equity), row("TLT", 30_000, 29_000, equity)],
      equity,
      total_pnl: 2_000,
      total_return: 0.02,
      unpriced: [],
      benchmark: { symbol: "SPY", start_date: "2026-08-01", start_close: 500, close: 520, date: "2026-11-09", return: 0.04, value: 104_000 },
      price_as_of: "2026-11-09",
      trades: [],
      curve: null,
    };
    const read = buildPracticeRead(view);
    expect(read.headline).toBe("Your account is +2.0% since Aug 1, 2.0 pts behind SPY.");
    expect(read.insights[0].text).toBe("AAPL made the most: +$3,000 (+10.0%).");
    expect(read.insights[0].soWhat).toBe("TLT cost the most: −$1,000 (−3.3%).");
    expect(read.insights[1].text).toBe("39% of the account is cash, which earns nothing here while SPY rose +4.0%.");
  });

  it("says nothing is invested on an empty account", () => {
    const view = {
      rows: [],
      trades: [],
      benchmark: { symbol: "SPY", return: 0.01, start_date: "2026-11-01" },
    } as unknown as PracticeView;
    expect(buildPracticeRead(view)).toEqual({ headline: "Nothing invested yet; SPY is +1.0% since the account opened.", insights: [] });
  });
});
