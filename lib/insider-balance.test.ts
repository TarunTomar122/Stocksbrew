import { describe, expect, it } from "vitest";

import type { InsiderTrade } from "@/lib/follow-shared";
import { balanceWindow, insiderBalance, mergeTrades } from "@/lib/insider-balance";

function row(id: string, side: "buy" | "sell", day: string, value: number, extra: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    id,
    symbol: id.toUpperCase().slice(0, 4),
    company: "",
    insider: id,
    insider_id: id,
    role: "Director",
    tx_type: side,
    shares: 1,
    price: value,
    value,
    transaction_date: day,
    filing_date: day,
    filed_at: `${day}T16:00:00`,
    lag_days: 0,
    shares_after: null,
    ownership: "direct",
    plan_10b5_1: false,
    url: "",
    ...extra,
  };
}

// Wed Nov 11, 2026, 3 PM in New York.
const now = Date.parse("2026-11-11T20:00:00Z");

describe("insiderBalance", () => {
  it("counts the last 7 New York days, today included", () => {
    expect(balanceWindow(now)).toEqual(["2026-11-05", "2026-11-11"]);
    // 1 AM UTC on Nov 12 is still Nov 11 in New York.
    expect(balanceWindow(Date.parse("2026-11-12T01:00:00Z"))).toEqual(["2026-11-05", "2026-11-11"]);
  });

  it("counts every sale, plan sales too, with the planned share, and each buy once", () => {
    const buy = row("aaa", "buy", "2026-11-10", 100_000);
    const trades = [
      buy,
      row("bbb", "sell", "2026-11-09", 2_000_000),
      row("ccc", "sell", "2026-11-06", 1_000_000, { plan_10b5_1: true }),
      row("old", "sell", "2026-11-04", 9_000_000),
    ];
    const balance = insiderBalance({ trades, buys: [buy, row("ddd", "buy", "2026-11-05", 50_000)], now });
    expect(balance).toMatchObject({ bought: 150_000, sold: 3_000_000, plannedSold: 1_000_000, ratio: 20, plannedPct: 33, buyCompanies: 2, sellCompanies: 2 });
  });

  it("gives no balance when a full trade list stops inside the window", () => {
    const trades = [row("aaa", "sell", "2026-11-10", 1), row("bbb", "sell", "2026-11-08", 1)];
    expect(insiderBalance({ trades, now, tradesLimit: 2 })).toBeNull();
    // Rows the loader drops after its query leave a capped read short of the limit; it still has to reach back.
    expect(insiderBalance({ trades, now, tradesLimit: 5 })).toBeNull();
    expect(insiderBalance({ trades: [...trades, row("ccc", "sell", "2026-11-01", 1)], now, tradesLimit: 3 })).not.toBeNull();
    expect(insiderBalance({ trades, now })).not.toBeNull();
  });

  it("has no ratio when nothing was bought and no planned share when nothing was sold", () => {
    expect(insiderBalance({ trades: [row("a", "sell", "2026-11-10", 5)], now })).toMatchObject({ ratio: null, plannedPct: 0 });
    expect(insiderBalance({ trades: [row("a", "buy", "2026-11-10", 5)], now })).toMatchObject({ ratio: 0, plannedPct: null });
  });

  it("merges lists without repeats", () => {
    const a = row("a", "buy", "2026-11-10", 1);
    expect(mergeTrades([a], [a, row("b", "buy", "2026-11-10", 1)]).map((t) => t.id)).toEqual(["a", "b"]);
  });
});
