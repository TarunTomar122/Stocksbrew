import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/firestore", () => ({ getLatestPriceQuotes: vi.fn(), getInstrumentIdsThatExist: vi.fn() }));

import { getInstrumentIdsThatExist, getLatestPriceQuotes } from "@/lib/firestore";
import { forgetStockPages, hasStockPage, stockPagesAmong } from "@/lib/stock-page-set";

const quotes = vi.mocked(getLatestPriceQuotes);
const instruments = vi.mocked(getInstrumentIdsThatExist);

describe("stockPagesAmong", () => {
  beforeEach(() => {
    quotes.mockReset();
    instruments.mockReset();
    // Every instrument exists unless a test says otherwise.
    instruments.mockImplementation(async (ids: string[]) => new Set(ids));
    forgetStockPages();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps catalogue stocks and funds without a read, and reads the rest once", async () => {
    quotes.mockResolvedValue(
      new Map([
        ["US_NOK", { quote: { current: 7.5 } }],
        ["US_TSEM", { quote: {} }],
      ]) as never,
    );
    const pages = await stockPagesAmong(["AAPL", "spy", "NOK", "TSEM", "SHEL", null, "", "nok", "bad ticker!"]);
    expect(quotes).toHaveBeenCalledTimes(1);
    expect(quotes.mock.calls[0]![0].sort()).toEqual(["US_NOK", "US_SHEL", "US_TSEM"]);
    expect(pages && [...pages].sort()).toEqual(["AAPL", "NOK", "SPY"]);
  });

  it("leaves out a stock with a price and no instrument, which the stock page answers with a 404", async () => {
    quotes.mockResolvedValue(new Map([["US_FOSL", { quote: { current: 95 } }], ["US_NOK", { quote: { current: 7.5 } }]]) as never);
    instruments.mockResolvedValue(new Set(["US_NOK"]));
    const pages = await stockPagesAmong(["FOSL", "NOK"]);
    expect(pages && [...pages]).toEqual(["NOK"]);
  });

  it("skips the read when every ticker is already known", async () => {
    const pages = await stockPagesAmong(["AAPL", "MSFT", "BRK.B"]);
    expect(quotes).not.toHaveBeenCalled();
    expect(pages && [...pages].sort()).toEqual(["AAPL", "BRK.B", "MSFT"]);
  });

  it("remembers each answer for ten minutes, then reads again", async () => {
    quotes.mockResolvedValue(new Map([["US_NOK", { quote: { current: 7.5 } }]]) as never);
    const start = Date.parse("2026-11-20T12:00:00Z");
    expect([...((await stockPagesAmong(["NOK", "SHEL"], start)) ?? [])]).toEqual(["NOK"]);
    expect([...((await stockPagesAmong(["NOK", "SHEL"], start + 5 * 60_000)) ?? [])]).toEqual(["NOK"]);
    expect(quotes).toHaveBeenCalledTimes(1);
    await stockPagesAmong(["NOK", "SHEL"], start + 11 * 60_000);
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
    const pages = await stockPagesAmong(["TSEM"]);
    expect(pages).toBeNull();
    expect(hasStockPage(pages, "TSEM")).toBe(true);
  });
});

describe("hasStockPage", () => {
  it("matches tickers case-insensitively and never links an empty one", () => {
    const pages = new Set(["NOK"]);
    expect(hasStockPage(pages, "nok")).toBe(true);
    expect(hasStockPage(pages, "TSEM")).toBe(false);
    expect(hasStockPage(pages, null)).toBe(false);
    expect(hasStockPage(null, "")).toBe(false);
    expect(hasStockPage(pages, "bad ticker!")).toBe(false);
    expect(hasStockPage(null, "%E0%A4%A")).toBe(false);
  });
});
