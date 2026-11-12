import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));

import { includedRows, saveableRows } from "@/components/import/client";

import { FIDELITY_FIXTURE } from "./broker-fixtures";
import { parseBrokerCsv } from "./brokers";
import { cleanClientHoldings } from "./normalize";
import { buildDirectory, resolveHoldings } from "./resolve";
import { cleanSaveRows, mergeImport } from "./save";

const NOW = new Date("2026-11-12T15:00:00Z");

const directory = buildDirectory([
  { instrument_id: "US_AAPL", ticker: "AAPL", name: "Apple Inc.", price: 230 },
  { instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA Corporation", price: 145 },
  { instrument_id: "US_VOO", ticker: "VOO", name: "Vanguard S&P 500 ETF", price: 540 },
  { instrument_id: "US_MSFT", ticker: "MSFT", name: "Microsoft", price: 420 },
]);

/** A Free account that owns AAPL with numbers, owns MSFT (not in the file) and watches NVDA. */
function existing(): Record<string, unknown> {
  return {
    tracked_stocks: ["US_AAPL", "US_MSFT", "US_NVDA"],
    watchlist_positions: { US_AAPL: "holding", US_MSFT: "holding", US_NVDA: "watchlist" },
    watchlist_holdings: {
      US_AAPL: { quantity: 10, average_cost: 150, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-01" },
      US_MSFT: { quantity: 4, average_cost: 300, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-01" },
    },
    covered_stocks: ["US_AAPL", "US_MSFT", "US_NVDA"],
    watchlist_version: 3,
  };
}

/** The browser reads the file, the route cleans and checks what it sends: the rows the review shows. */
function reviewRows() {
  const csv = parseBrokerCsv(FIDELITY_FIXTURE)!;
  const sent = JSON.parse(JSON.stringify(csv.rows));
  return resolveHoldings(cleanClientHoldings(sent)!, directory);
}

describe("a broker CSV, from file to the write", () => {
  it("shows today's value from the index price and flags the stock we do not cover", () => {
    const rows = reviewRows();
    expect(rows.map((row) => [row.ticker, row.status, row.shares, row.price])).toEqual([
      ["AAPL", "matched", 50, 230],
      ["NVDA", "matched", 25, 145],
      ["VOO", "matched", 12.5, 540],
      ["BRK.B", "unknown", 3, null],
    ]);
    expect(includedRows(rows)).toHaveLength(3);
  });

  it("by default adds new holdings, fills a watched stock, keeps saved numbers and never drops a stock that is not in the file", () => {
    const payload = cleanSaveRows(saveableRows(reviewRows()))!;
    const merge = mergeImport(existing(), payload, "manual", NOW);
    expect(merge.added).toEqual(["US_VOO"]);
    expect(merge.updated).toEqual(["US_NVDA"]);
    expect(merge.kept).toEqual(["US_AAPL"]);
    const holdings = merge.write.watchlist_holdings as Record<string, Record<string, unknown>>;
    // The person's AAPL numbers stay: the review did not say otherwise.
    expect(holdings.US_AAPL).toMatchObject({ quantity: 10, average_cost: 150 });
    // MSFT is not in the file and is left exactly as it was.
    expect(holdings.US_MSFT).toEqual(existing().watchlist_holdings && (existing().watchlist_holdings as Record<string, unknown>).US_MSFT);
    expect(merge.write.tracked_stocks).toEqual(["US_AAPL", "US_MSFT", "US_NVDA", "US_VOO"]);
    expect((merge.write.watchlist_positions as Record<string, string>).US_NVDA).toBe("holding");
    expect(holdings.US_NVDA).toMatchObject({ quantity: 25, average_cost: 120 });
    expect(holdings.US_VOO).toMatchObject({ quantity: 12.5, average_cost: 420 });
  });

  it("updates the shares of a stock already owned only when the person chose the new numbers", () => {
    const rows = reviewRows().map((row) => (row.instrument_id === "US_AAPL" ? { ...row, merge: "replace" as const } : row));
    const merge = mergeImport(existing(), cleanSaveRows(saveableRows(rows))!, "manual", NOW);
    expect(merge.updated).toContain("US_AAPL");
    expect((merge.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_AAPL).toMatchObject({ quantity: 50, average_cost: 170 });
    expect((merge.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_MSFT).toMatchObject({ quantity: 4, average_cost: 300 });
  });

  it("never sends the index price to the save", () => {
    for (const row of saveableRows(reviewRows())) expect(Object.keys(row).sort()).toEqual(["average_cost", "instrument_id", "market_value", "merge", "shares"]);
  });
});
