import { describe, expect, it } from "vitest";

import type { ParsedHolding } from "./normalize";
import { aliasFor, buildDirectory, findTicker, nameKey, resolveHoldings } from "./resolve";

const directory = buildDirectory([
  { instrument_id: "US_AAPL", ticker: "AAPL", name: "Apple Inc." },
  { instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA Corporation" },
  { instrument_id: "US_GOOGL", ticker: "GOOGL", name: "Alphabet Inc." },
  { instrument_id: "US_BRK_B", ticker: "BRK.B", name: "Berkshire Hathaway" },
  { instrument_id: "US_META", ticker: "META", name: "Meta Platforms, Inc." },
  // Two companies whose names clean to the same words: neither may be matched by name.
  { instrument_id: "US_ABC", ticker: "ABC", name: "Acme Holdings" },
  { instrument_id: "US_ABD", ticker: "ABD", name: "Acme Group" },
]);

const h = (patch: Partial<ParsedHolding>): ParsedHolding => ({
  ticker: null,
  name: null,
  shares: 1,
  averageCost: null,
  marketValue: null,
  confidence: "high",
  ...patch,
});

describe("nameKey", () => {
  it("treats suffixes and punctuation as noise", () => {
    expect(nameKey("NVIDIA Corporation")).toBe(nameKey("Nvidia Corp."));
    expect(nameKey("Meta Platforms, Inc.")).toBe("meta platforms");
  });
});

describe("resolveHoldings", () => {
  it("matches covered tickers and keeps the reader's confidence", () => {
    const [row] = resolveHoldings([h({ ticker: "NVDA", confidence: "medium" })], directory);
    expect(row).toMatchObject({ status: "matched", instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA Corporation", confidence: "medium" });
  });

  it("matches class shares however they were written", () => {
    expect(resolveHoldings([h({ ticker: "BRK.B" })], directory)[0]).toMatchObject({ status: "matched", instrument_id: "US_BRK_B" });
  });

  it("suggests the tracked class for an alias and never calls it high", () => {
    const [row] = resolveHoldings([h({ ticker: "GOOG" })], directory);
    expect(row).toMatchObject({ status: "suggested", raw: "GOOG", ticker: "GOOGL", instrument_id: "US_GOOGL", confidence: "medium" });
    expect(resolveHoldings([h({ ticker: "FB" })], directory)[0]).toMatchObject({ status: "suggested", ticker: "META" });
  });

  it("suggests a stock from its name when there is no ticker", () => {
    expect(resolveHoldings([h({ name: "Apple Inc" })], directory)[0]).toMatchObject({ status: "suggested", instrument_id: "US_AAPL" });
  });

  it("does not match an ambiguous name", () => {
    expect(resolveHoldings([h({ name: "Acme" })], directory)[0]).toMatchObject({ status: "unknown", instrument_id: null });
  });

  it("marks stocks we do not cover as unknown and low, keeping what was read", () => {
    const [row] = resolveHoldings([h({ ticker: "VOO", shares: 12, averageCost: 400 })], directory);
    expect(row).toMatchObject({ status: "unknown", instrument_id: null, ticker: "VOO", shares: 12, average_cost: 400, confidence: "low" });
  });

  it("adds two rows that land on the same stock into one, with the cost weighted by shares", () => {
    const rows = resolveHoldings([h({ ticker: "GOOGL", shares: 10, averageCost: 100 }), h({ ticker: "GOOG", shares: 30, averageCost: 140 })], directory);
    expect(rows.map((r) => [r.status, r.instrument_id, r.shares, r.average_cost, r.confidence])).toEqual([["matched", "US_GOOGL", 40, 130, "medium"]]);
    // A missing cost on one side leaves the cost unknown rather than guessed.
    const partial = resolveHoldings([h({ ticker: "GOOGL", shares: 10, averageCost: 100 }), h({ ticker: "GOOG", shares: 5 })], directory);
    expect(partial.map((r) => [r.shares, r.average_cost])).toEqual([[15, null]]);
  });

  it("drops lowercase guesses that are not stocks, and keeps the ones that are", () => {
    const rows = resolveHoldings([h({ ticker: "OWN", guess: true }), h({ ticker: "AAPL", guess: true }), h({ ticker: "VOO" })], directory);
    expect(rows.map((r) => [r.ticker, r.status])).toEqual([
      ["AAPL", "matched"],
      ["VOO", "unknown"],
    ]);
  });

  it("gives every row its own key", () => {
    const rows = resolveHoldings([h({ ticker: "AAPL" }), h({ ticker: "NVDA" })], directory);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});

describe("findTicker", () => {
  it("finds typed tickers and aliases, and nothing for the unknown", () => {
    expect(findTicker(directory, " aapl ")?.instrument_id).toBe("US_AAPL");
    expect(findTicker(directory, "$goog")?.instrument_id).toBe("US_GOOGL");
    expect(findTicker(directory, "BRK-B")?.instrument_id).toBe("US_BRK_B");
    expect(findTicker(directory, "ZZZZ")).toBeNull();
    expect(findTicker(directory, "")).toBeNull();
  });
});

describe("cross-checks", () => {
  const priced = buildDirectory([
    { instrument_id: "US_AAPL", ticker: "AAPL", name: "Apple Inc.", price: 348.63 },
    { instrument_id: "US_BRK_B", ticker: "BRK.B", name: "Berkshire Hathaway", price: 583.61 },
  ]);
  const holding = (patch: Partial<ParsedHolding>): ParsedHolding => ({ ticker: "AAPL", name: null, shares: 25, averageCost: 172.4, marketValue: 8715.75, confidence: "high", ...patch });

  it("flags a row whose value per share is far from today's price", () => {
    expect(resolveHoldings([holding({})], priced)[0]!.confidence).toBe("high");
    // A blurry 8 read as a 6: $6,715.75 for 25 shares is $268, against $349.
    expect(resolveHoldings([holding({ marketValue: 6715.75 })], priced)[0]!.confidence).toBe("medium");
    expect(resolveHoldings([holding({ marketValue: 4401, confidence: "medium" })], priced)[0]!.confidence).toBe("low");
  });

  it("matches a class share written after the name", () => {
    expect(resolveHoldings([holding({ ticker: null, name: "Berkshire Hathaway B", marketValue: null })], priced)[0]).toMatchObject({ status: "suggested", ticker: "BRK.B" });
  });

  it("carries the currency note through", () => {
    expect(resolveHoldings([holding({ currency: "EUR", averageCost: null, marketValue: null })], priced)[0]).toMatchObject({ currency: "EUR" });
  });
});

describe("aliasFor", () => {
  it("maps the classes and old names we keep under another ticker", () => {
    expect(aliasFor("goog")).toBe("GOOGL");
    expect(aliasFor("BRK-B")).toBe("BRK.B");
    expect(aliasFor("$FB")).toBe("META");
    expect(aliasFor("AAPL")).toBeNull();
  });
});
