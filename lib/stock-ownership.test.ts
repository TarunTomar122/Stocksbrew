import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/follow", () => ({ getInsiderSummary: vi.fn(), getInsiderTradesForSymbol: vi.fn() }));

import { parseFundHolders, parseInsiderTrades } from "@/lib/stock-ownership";
import type { InsiderTrade } from "@/lib/follow-shared";

describe("parseFundHolders", () => {
  it("is null without a document", () => {
    expect(parseFundHolders(null)).toBeNull();
  });

  it("maps holders and exits, turning weights into percent", () => {
    const funds = parseFundHolders({
      holder_count: 12,
      latest_filed_at: "2026-08-14",
      source: "SEC EDGAR form 13F",
      holders: [
        {
          slug: "berkshire-hathaway",
          fund: "Berkshire Hathaway",
          manager: "Warren Buffett",
          period: "2026-06-30",
          quarter: "Q2 2026",
          filed_at: "2026-08-14",
          value: 65_950_296_923,
          weight: 0.220383,
          shares: 227_917_808,
          rank: 1,
          change: "reduced",
          shares_delta_pct: -5.5,
          held_since: "2016-03-31",
          url: "https://sec.gov/x",
        },
        { slug: "", fund: "No slug", period: "2026-06-30" },
        { slug: "no-period", fund: "No period" },
        "junk",
      ],
      sold: [{ slug: "scion", fund: "Scion", manager: "Michael Burry", period: "2026-06-30", prev_weight: 0.031 }],
    })!;
    expect(funds.rows).toHaveLength(1);
    expect(funds.rows[0]).toMatchObject({
      href: "/follow/berkshire-hathaway",
      portfolioPct: 22.0383,
      action: "trimmed",
      changePct: -5.5,
      reportDate: "2026-06-30",
      filedDate: "2026-08-14",
      heldSince: "2016-03-31",
    });
    expect(funds.exits[0]).toMatchObject({ slug: "scion", href: "/follow/scion", filedDate: null });
    expect(funds.exits[0]!.prevPortfolioPct).toBeCloseTo(3.1, 6);
    expect(funds.holderCount).toBe(12);
    expect(funds.asOf).toBe("2026-08-14");
  });

  it("leaves unknown numbers null, never zero", () => {
    const funds = parseFundHolders({ holders: [{ slug: "a", fund: "A", period: "2026-06-30", value: 0, weight: null, change: "mystery" }] })!;
    expect(funds.rows[0]).toMatchObject({ valueUsd: null, portfolioPct: null, shares: null, changePct: null, action: null });
    expect(funds.holderCount).toBe(1);
  });
});

describe("parseInsiderTrades", () => {
  const trade = (over: Partial<InsiderTrade>): InsiderTrade => ({
    id: "1",
    symbol: "NVDA",
    company: "NVIDIA",
    insider: "Jane Doe",
    insider_id: "jane",
    role: "CFO",
    tx_type: "sell",
    shares: 1000,
    price: 180,
    value: 180_000,
    transaction_date: "2026-10-01",
    filing_date: "2026-10-03",
    filed_at: "2026-10-03T16:30:00",
    lag_days: 2,
    shares_after: 5000,
    ownership: "D",
    plan_10b5_1: true,
    url: "https://sec.gov/f4",
    ...over,
  });

  it("maps rows newest first and skips rows without a date or a name", () => {
    const rows = parseInsiderTrades([
      trade({ id: "old", transaction_date: "2026-09-01" }),
      trade({ id: "new", tx_type: "buy", plan_10b5_1: false, price: null, value: null }),
      trade({ id: "nodate", transaction_date: "" }),
      trade({ id: "noname", insider: "" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ action: "buy", planned: false, price: null, valueUsd: null, filedDate: "2026-10-03" });
    expect(rows[1]).toMatchObject({ action: "sell", planned: true, valueUsd: 180_000 });
  });
});
