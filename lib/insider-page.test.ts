import { describe, expect, it } from "vitest";

import type { InsiderTrade } from "@/lib/follow-shared";
import { insiderTotals } from "@/lib/insider-page";

const trade = (over: Partial<InsiderTrade>): InsiderTrade => ({
  id: Math.random().toString(36),
  symbol: "ABC",
  company: "ABC Corp",
  insider: "A",
  insider_id: "",
  role: "Director",
  tx_type: "buy",
  shares: 100,
  price: 50,
  value: 5000,
  transaction_date: "2026-10-01",
  filing_date: "2026-10-02",
  filed_at: "2026-10-02T16:00:00",
  lag_days: 1,
  shares_after: null,
  ownership: "D",
  plan_10b5_1: false,
  url: "https://www.sec.gov/x",
  ...over,
});

describe("insider totals", () => {
  it("totals buys, sales, insiders and plan sales", () => {
    const totals = insiderTotals([trade({}), trade({ insider: "B", tx_type: "sell", value: 20000, plan_10b5_1: true }), trade({ insider: "B", tx_type: "sell", value: 1000 })]);
    expect(totals).toMatchObject({ buys: 1, sells: 2, bought: 5000, sold: 21000, buyers: 1, sellers: 1, planSells: 1, avgBuyPrice: 50, first: "2026-10-02" });
  });
});
