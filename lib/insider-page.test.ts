import { describe, expect, it } from "vitest";

import type { InsiderTrade } from "@/lib/follow-shared";
import { buildInsiderPageRead, insiderTotals } from "@/lib/insider-page";

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

describe("insider page read", () => {
  it("totals buys, sales, insiders and plan sales", () => {
    const totals = insiderTotals([trade({}), trade({ insider: "B", tx_type: "sell", value: 20000, plan_10b5_1: true }), trade({ insider: "B", tx_type: "sell", value: 1000 })]);
    expect(totals).toMatchObject({ buys: 1, sells: 2, bought: 5000, sold: 21000, buyers: 1, sellers: 1, planSells: 1, avgBuyPrice: 50, first: "2026-10-02" });
  });

  it("calls out net selling and the largest trade", () => {
    const read = buildInsiderPageRead({ ticker: "ABC", trades: [trade({ tx_type: "sell", value: 9_000_000, insider: "CEO Person", role: "CEO" }), trade({ value: 10_000 })], price: 55 })!;
    expect(read.headline).toBe("Insiders were net sellers of ABC since Oct 2, 2026: $10K bought against $9.00M sold.");
    expect(read.insights.some((insight) => insight.text.startsWith("The largest trade: CEO Person (CEO) sold $9.00M"))).toBe(true);
    expect(read.insights.some((insight) => insight.id === "price" && insight.text.includes("$55 now (+10%)"))).toBe(true);
  });

  it("leaves out the price comparison when filing prices are not in the listed share's terms", () => {
    const read = buildInsiderPageRead({ ticker: "TSM", trades: [trade({ price: 70.5 }), trade({ insider: "B", price: 357 })], price: 388 })!;
    expect(read.insights.some((insight) => insight.id === "price")).toBe(false);
  });

  it("has no read without trades", () => {
    expect(buildInsiderPageRead({ ticker: "ABC", trades: [], price: 10 })).toBeNull();
  });
});
