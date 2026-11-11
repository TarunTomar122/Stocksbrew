import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));

import type { ScreenerRow } from "@/lib/screener-shared";
import { screenerFacts } from "@/lib/thesis-watch/data";

describe("screenerFacts", () => {
  it("leaves a bank's free cash flow out, so no 'burned $148B of cash' warning is raised for it", () => {
    const jpm = { symbol: "JPM", sector: "Financials", industry: "Banks - Diversified", fcf: -147.8e9, div_yield: 1.9, market_cap: 888e9 } as ScreenerRow;
    expect(screenerFacts(jpm, "2026-11-11").fcf).toBeNull();
    const apple = { symbol: "AAPL", sector: "Technology", industry: "Consumer Electronics", fcf: 98e9, div_yield: 0.4, market_cap: 3.9e12 } as ScreenerRow;
    expect(screenerFacts(apple, "2026-11-11").fcf).toBe(98e9);
  });
});
