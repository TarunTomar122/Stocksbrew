import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/firestore", () => ({ getLatestPriceQuotes: vi.fn() }));

import { getLatestPriceQuotes } from "@/lib/firestore";
import { forgetStockPages, hasStockPage, stockPagesAmong } from "@/lib/stock-page-set";

const quotes = vi.mocked(getLatestPriceQuotes);

describe("stockPagesAmong", () => {
  beforeEach(() => {
    quotes.mockReset();
    forgetStockPages();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps catalogue stocks and funds without a read, and reads the rest once", async () => {
    quotes.mockResolvedValue(
      new Map([
        ["US_NOK", { quote: { current: 7.5 } }],
        ["US_ADP", { quote: {} }],
      ]) as never,
    );
    const pages = await stockPagesAmong(["AAPL", "spy", "NOK", "ADP", "KKR", null, "", "nok", "bad ticker!"]);
    expect(quotes).toHaveBeenCalledTimes(1);
    expect(quotes.mock.calls[0]![0].sort()).toEqual(["US_ADP", "US_KKR", "US_NOK"]);
    expect(pages && [...pages].sort()).toEqual(["AAPL", "NOK", "SPY"]);
  });

  it("skips the read when every ticker is already known", async () => {
    const pages = await stockPagesAmong(["AAPL", "MSFT", "BRK.B"]);
    expect(quotes).not.toHaveBeenCalled();
    expect(pages && [...pages].sort()).toEqual(["AAPL", "BRK.B", "MSFT"]);
  });

  it("remembers each answer for ten minutes, then reads again", async () => {
    quotes.mockResolvedValue(new Map([["US_NOK", { quote: { current: 7.5 } }]]) as never);
    const start = Date.parse("2026-11-20T12:00:00Z");
    expect([...((await stockPagesAmong(["NOK", "KKR"], start)) ?? [])]).toEqual(["NOK"]);
    expect([...((await stockPagesAmong(["NOK", "KKR"], start + 5 * 60_000)) ?? [])]).toEqual(["NOK"]);
    expect(quotes).toHaveBeenCalledTimes(1);
    await stockPagesAmong(["NOK", "KKR"], start + 11 * 60_000);
    expect(quotes).toHaveBeenCalledTimes(2);
  });

  it("drops tickers the stock page could never answer for, a stray % included", async () => {
    const pages = await stockPagesAmong(["bad ticker!", "%E0%A4%A", "AAPL"]);
    expect(quotes).not.toHaveBeenCalled();
    expect(pages && [...pages]).toEqual(["AAPL"]);
  });

  it("returns null when the store cannot be read, so every ticker stays linked", async () => {
    quotes.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pages = await stockPagesAmong(["ADP"]);
    expect(pages).toBeNull();
    expect(hasStockPage(pages, "ADP")).toBe(true);
  });
});

describe("hasStockPage", () => {
  it("matches tickers case-insensitively and never links an empty one", () => {
    const pages = new Set(["NOK"]);
    expect(hasStockPage(pages, "nok")).toBe(true);
    expect(hasStockPage(pages, "ADP")).toBe(false);
    expect(hasStockPage(pages, null)).toBe(false);
    expect(hasStockPage(null, "")).toBe(false);
    expect(hasStockPage(pages, "bad ticker!")).toBe(false);
    expect(hasStockPage(null, "%E0%A4%A")).toBe(false);
  });
});
