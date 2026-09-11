import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }),
  },
}));

vi.mock("@/lib/firestore", () => ({
  batchGetRefs: vi.fn(),
  getLatestPrices: vi.fn(),
  getLatestPriceCore: vi.fn(),
  getLatestPriceCores: vi.fn(),
  getLatestPriceFundamentals: vi.fn(),
  getLatestPriceHistory: vi.fn(),
  getAiUniverse: vi.fn(),
  getInstrument: vi.fn(),
  getPriceUniverse: vi.fn(),
}));

import { resolveStockPageViewSections, type StockPageViewDoc } from "@/lib/stock";

const DAY_MS = 86_400_000;

function view(overrides: Partial<StockPageViewDoc> = {}): StockPageViewDoc {
  return { instrument_id: "US_AAPL", ...overrides };
}

describe("stock page view resolution", () => {
  it("uses fresh sections and masks stale sections before fallback", () => {
    const now = 10 * DAY_MS;
    const result = resolveStockPageViewSections(
      view({
        facts: { instrument_id: "US_AAPL", market: "US", ticker: "AAPL" },
        facts_stamp: new Date(now - DAY_MS).toISOString(),
        intelligence: { instrument_id: "US_AAPL" },
        intelligence_stamp: new Date(now - 2 * DAY_MS).toISOString(),
      }),
      now,
      "US_AAPL",
    );

    expect(result.sections.facts).not.toBeNull();
    expect(result.directNeeded.facts).toBe(false);
    expect(result.sections.intelligence).toBeNull();
    expect(result.directNeeded.intelligence).toBe(true);
  });

  it("rejects a view for another instrument", () => {
    const result = resolveStockPageViewSections(view({ instrument_id: "US_KO" }), 10 * DAY_MS, "US_AAPL");
    expect(result.view).toBeNull();
    expect(Object.values(result.directNeeded).every(Boolean)).toBe(true);
  });
});
