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

import {
  STOCK_PAGE_VIEW_MAX_AGE_MS,
  resolveStockPageViewSections,
  stockPageViewDocId,
  type StockPageViewDoc,
} from "@/lib/stock";

const DAY_MS = 86_400_000;

function makeView(overrides: Partial<StockPageViewDoc> = {}): StockPageViewDoc {
  return {
    instrument_id: "US_AAPL",
    ticker: "AAPL",
    market: "US",
    built_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("stock page view resolution", () => {
  it("builds the doc id the python writers use", () => {
    expect(stockPageViewDocId("US", "US_AAPL")).toBe("US__US_AAPL");
  });

  it("trusts fresh sections and skips direct reads", () => {
    const now = 10 * DAY_MS;
    const view = makeView({
      facts: { instrument_id: "US_AAPL", market: "US", ticker: "AAPL" },
      facts_stamp: new Date(now - 2 * DAY_MS).toISOString(),
      pre_earnings: null,
      pre_earnings_stamp: new Date(now - 2 * DAY_MS).toISOString(),
    });
    const { sections, directNeeded } = resolveStockPageViewSections(view, now);
    expect(sections.facts).toMatchObject({ instrument_id: "US_AAPL" });
    expect(directNeeded.facts).toBe(false);
    expect(directNeeded.pre_earnings).toBe(false);
    expect(directNeeded.intelligence).toBe(true);
    expect(directNeeded.intel_pro).toBe(true);
    expect(sections.intelligence).toBeNull();
  });

  it("falls back to direct reads when a stamp is missing or too old", () => {
    const now = 10 * DAY_MS;
    const view = makeView({
      intelligence: { instrument_id: "US_AAPL" } as never,
      intelligence_stamp: new Date(now - 12 * 3600_000).toISOString(),
      facts: { instrument_id: "US_AAPL", market: "US", ticker: "AAPL" },
      facts_stamp: new Date(now - 20 * DAY_MS).toISOString(),
      technicals: { instrument_id: "US_AAPL" } as never,
    });
    const { directNeeded } = resolveStockPageViewSections(view, now);
    expect(directNeeded.intelligence).toBe(false);
    expect(directNeeded.facts).toBe(true);
    expect(directNeeded.technicals).toBe(true);
  });

  it("rejects the whole view when the instrument id mismatches", () => {
    const now = 10 * DAY_MS;
    const view = makeView({
      instrument_id: "US_KO",
      facts: { instrument_id: "US_KO", market: "US", ticker: "KO" },
      facts_stamp: new Date(now - DAY_MS).toISOString(),
    });
    const { sections, directNeeded } = resolveStockPageViewSections(view, now, "US_AAPL");
    expect(sections.facts).toBeNull();
    for (const key of Object.keys(directNeeded)) {
      expect(directNeeded[key as keyof typeof directNeeded]).toBe(true);
    }
  });

  it("handles a missing view entirely", () => {
    const { sections, directNeeded, view } = resolveStockPageViewSections(null, 10 * DAY_MS);
    expect(view).toBeNull();
    expect(sections.intel_pro).toBeNull();
    for (const key of Object.keys(directNeeded)) {
      expect(directNeeded[key as keyof typeof directNeeded]).toBe(true);
    }
  });

  it("honors the per-section max ages", () => {
    expect(STOCK_PAGE_VIEW_MAX_AGE_MS.intelligence).toBe(DAY_MS);
    expect(STOCK_PAGE_VIEW_MAX_AGE_MS.earnings_intel).toBeGreaterThan(STOCK_PAGE_VIEW_MAX_AGE_MS.intelligence);
  });

  it("treats an unparseable stamp as stale", () => {
    const now = 10 * DAY_MS;
    const view = makeView({
      facts: { instrument_id: "US_AAPL", market: "US", ticker: "AAPL" },
      facts_stamp: "not-a-date",
    });
    const { directNeeded } = resolveStockPageViewSections(view, now);
    expect(directNeeded.facts).toBe(true);
  });
});
