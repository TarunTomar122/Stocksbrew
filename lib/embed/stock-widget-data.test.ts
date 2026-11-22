import { beforeEach, describe, expect, it, vi } from "vitest";

// Every per-symbol read the card makes, plus the checks that come before them. unstable_cache runs the function
// straight through here, so a call to a mocked loader is a call the real cache would have stored under the symbol.
const mocks = vi.hoisted(() => ({
  getScreenerSnapshot: vi.fn(),
  getScreenerRows: vi.fn(),
  getDailySeries: vi.fn(),
  getStockSummary: vi.fn(),
  unstableCache: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    mocks.unstableCache(...args);
    return fn(...args);
  },
}));
vi.mock("@/lib/screener", () => ({ getScreenerSnapshot: mocks.getScreenerSnapshot, getScreenerRows: mocks.getScreenerRows }));
vi.mock("@/lib/screener-series", () => ({ getDailySeries: mocks.getDailySeries }));
vi.mock("@/lib/stock", () => ({ getStockSummary: mocks.getStockSummary }));

import { loadWidgetStock, resolveWidgetTicker } from "@/lib/embed/stock-widget-data";

const SNAPSHOT = { rows: [{ symbol: "ZETA", name: "Zeta Global", price: 20, day_pct: 1, call: "Hold" }], extras: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getScreenerSnapshot.mockResolvedValue(SNAPSHOT);
  mocks.getStockSummary.mockResolvedValue(null);
  mocks.getScreenerRows.mockImplementation(async (symbols: string[]) => new Map(SNAPSHOT.rows.filter((row) => symbols.includes(row.symbol)).map((row) => [row.symbol, row])));
  mocks.getDailySeries.mockResolvedValue({ series: {}, source: "test", lastDate: null });
});

describe("loadWidgetStock for a made-up ticker", () => {
  it("answers 404 without touching any per-symbol cache", async () => {
    expect(await loadWidgetStock("QZXQZX")).toEqual({ kind: "missing" });
    expect(mocks.unstableCache).not.toHaveBeenCalled();
    expect(mocks.getScreenerRows).not.toHaveBeenCalled();
    expect(mocks.getDailySeries).not.toHaveBeenCalled();
    // One uncached existence read, the same check the stock page makes.
    expect(mocks.getStockSummary).toHaveBeenCalledTimes(1);
  });

  it("says unavailable, not missing, when it could not check", async () => {
    mocks.getStockSummary.mockRejectedValue(new Error("store down"));
    expect(await resolveWidgetTicker("QZXQZX")).toBe("unavailable");
    mocks.getStockSummary.mockResolvedValue(null);
    mocks.getScreenerSnapshot.mockResolvedValue(null);
    expect(await resolveWidgetTicker("QZXQZX")).toBe("unavailable");
    expect(mocks.unstableCache).not.toHaveBeenCalled();
  });
});

describe("loadWidgetStock for a ticker we know", () => {
  it("knows catalogue stocks without a read", async () => {
    expect(await resolveWidgetTicker("NVDA")).toBe("known");
    expect(mocks.getScreenerSnapshot).not.toHaveBeenCalled();
  });

  it("knows covered stocks from the shared snapshot, then builds the card", async () => {
    const loaded = await loadWidgetStock("ZETA");
    expect(loaded.kind).toBe("ok");
    expect(loaded.kind === "ok" && loaded.stock.call).toBe("Hold");
    expect(mocks.getScreenerRows).toHaveBeenCalledWith(["ZETA"]);
  });

  it("knows a long-tail stock the summary store holds", async () => {
    mocks.getStockSummary.mockResolvedValue({ ticker: "NOK", name: "Nokia", price: 4.5, day_change_pct: 0.5, source: "instrument" });
    expect(await resolveWidgetTicker("NOK")).toBe("known");
  });
});
