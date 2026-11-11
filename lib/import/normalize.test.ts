import { describe, expect, it } from "vitest";

import { cleanTicker, mergeDuplicates, normalizeModelHoldings, parseAmount, type ParsedHolding } from "./normalize";
import { parseCsv, parseHoldingsText, parseLines, splitCsvLine } from "./text";

const row = (patch: Partial<ParsedHolding>): ParsedHolding => ({
  ticker: "AAPL",
  name: null,
  shares: null,
  averageCost: null,
  marketValue: null,
  confidence: "high",
  ...patch,
});

describe("cleanTicker", () => {
  it.each([
    ["aapl", "AAPL"],
    ["$NVDA", "NVDA"],
    [" msft ", "MSFT"],
    ["NASDAQ:AAPL", "AAPL"],
    ["AAPL:US", "AAPL"],
    ["AAPL US", "AAPL"],
    ["BRK B", "BRK.B"],
    ["brk/b", "BRK.B"],
    ["BRK-B", "BRK.B"],
    ["BRK.B", "BRK.B"],
  ])("%s -> %s", (raw, clean) => {
    expect(cleanTicker(raw)).toBe(clean);
  });

  it.each([[""], ["Apple Inc."], ["123"], ["TOOLONGX"], [null], [42]])("refuses %s", (raw) => {
    expect(cleanTicker(raw)).toBeNull();
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,234.50", 1234.5],
    ["$12.30", 12.3],
    ["12 sh", 12],
    ["10 shares", 10],
    ["1.5K", 1500],
    ["(12.30)", -12.3],
    ["−4.2", -4.2],
    ["USD 99", 99],
    [7, 7],
  ])("%s -> %s", (raw, value) => {
    expect(parseAmount(raw)).toBeCloseTo(value as number);
  });

  it.each([["-"], ["—"], ["n/a"], [""], ["abc"], [Number.NaN], [null]])("%s is unknown", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("normalizeModelHoldings", () => {
  it("cleans tickers and numbers, keeps names without tickers, drops empty rows", () => {
    const out = normalizeModelHoldings([
      { ticker: "$aapl", name: "Apple", shares: "10", average_cost: "$182.50", market_value: "2,700", confidence: "high" },
      { ticker: null, name: "Vanguard S&P 500 ETF", shares: 4, average_cost: null, market_value: null, confidence: "medium" },
      { ticker: null, name: null, shares: 3, average_cost: 1, market_value: null, confidence: "high" },
      "junk",
    ]);
    expect(out).toEqual([
      { ticker: "AAPL", name: "Apple", shares: 10, averageCost: 182.5, marketValue: 2700, confidence: "high" },
      { ticker: null, name: "Vanguard S&P 500 ETF", shares: 4, averageCost: null, marketValue: null, confidence: "medium" },
    ]);
  });

  it("turns negative or impossible numbers into unknowns and lowers confidence", () => {
    const [out] = normalizeModelHoldings([{ ticker: "TSLA", name: null, shares: -5, average_cost: 5_000_000, market_value: null, confidence: "high" }]);
    expect(out).toMatchObject({ shares: null, averageCost: null, confidence: "medium" });
  });

  it("reads an unknown confidence as medium", () => {
    expect(normalizeModelHoldings([{ ticker: "KO", name: null, shares: 1, average_cost: null, market_value: null, confidence: "sure" }])[0]!.confidence).toBe("medium");
  });

  it("returns nothing for something that is not a list", () => {
    expect(normalizeModelHoldings({ holdings: [] })).toEqual([]);
  });
});

describe("mergeDuplicates", () => {
  it("keeps one row when the same position shows on two screenshots", () => {
    const out = mergeDuplicates([row({ shares: 10, averageCost: 100, confidence: "medium" }), row({ shares: 10, averageCost: 100 })]);
    expect(out).toEqual([row({ shares: 10, averageCost: 100, confidence: "high" })]);
  });

  it("adds two lots and weights the cost by shares, and never calls the sum high confidence", () => {
    const out = mergeDuplicates([row({ shares: 10, averageCost: 100 }), row({ shares: 30, averageCost: 200 })]);
    expect(out).toEqual([row({ shares: 40, averageCost: 175, confidence: "medium" })]);
  });

  it("keeps the order rows came in", () => {
    const out = mergeDuplicates([row({ ticker: "MSFT" }), row({ ticker: "AAPL" }), row({ ticker: "MSFT", shares: 2 })]);
    expect(out.map((r) => r.ticker)).toEqual(["MSFT", "AAPL"]);
  });
});

describe("text parsing", () => {
  it("splits quoted CSV cells", () => {
    expect(splitCsvLine('AAPL,"1,234.50","Apple, Inc."', ",")).toEqual(["AAPL", "1,234.50", "Apple, Inc."]);
  });

  it("reads a broker CSV with a title line, a total cost column and a totals row", () => {
    const csv = [
      "Positions for account Individual ...1234",
      "Symbol,Description,Quantity,Cost Basis,Market Value",
      'AAPL,APPLE INC,10,"$1,825.00","$3,481.20"',
      "NVDA,NVIDIA CORP,25,$2950.00,$4162.87",
      "Cash & Cash Investments,--,--,--,$1200",
      "Account Total,,,,$8844.07",
    ].join("\n");
    expect(parseCsv(csv)).toEqual([
      { ticker: "AAPL", name: "APPLE INC", shares: 10, averageCost: 182.5, marketValue: 3481.2, confidence: "high" },
      { ticker: "NVDA", name: "NVIDIA CORP", shares: 25, averageCost: 118, marketValue: 4162.87, confidence: "high" },
    ]);
  });

  it("is not a CSV without a ticker column", () => {
    expect(parseCsv("hello,world\n1,2")).toBeNull();
  });

  it("reads a list of tickers in any case, marking lowercase words as guesses", () => {
    const out = parseLines("aapl, msft NVDA");
    expect(out.map((r) => r.ticker)).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(out.map((r) => Boolean(r.guess))).toEqual([true, true, false]);
  });

  it("reads holdings lines, with @ for the cost", () => {
    const out = parseLines("AAPL 10 @ 182.50\nNVDA 25 118\nTESLA INC TSLA 3 $250.10\nMy notes: bought 3 in May");
    expect(out).toEqual([
      { ticker: "AAPL", name: null, shares: 10, averageCost: 182.5, marketValue: null, confidence: "high" },
      { ticker: "NVDA", name: null, shares: 25, averageCost: 118, marketValue: null, confidence: "high" },
      { ticker: "TSLA", name: null, shares: 3, averageCost: 250.1, marketValue: null, confidence: "high" },
    ]);
  });

  it("says which kind of input it was", () => {
    expect(parseHoldingsText("Ticker,Shares\nKO,4").input).toBe("csv");
    expect(parseHoldingsText("KO 4").input).toBe("text");
  });
});

describe("what the vision test turned up (Nov 11)", () => {
  it("drops a money market line the reader listed without a ticker", () => {
    const rows = normalizeModelHoldings([
      { ticker: "SPAXX**", name: "HELD IN MONEY MARKET", shares: null, average_cost: null, market_value: 2310.55, confidence: "low" },
      { ticker: null, name: "Vanguard Total Stock Market ETF", shares: 3, average_cost: null, market_value: null, confidence: "medium" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Vanguard Total Stock Market ETF"]);
  });

  it("keeps the shares but not the euros from a German screen", () => {
    const [row] = normalizeModelHoldings([{ ticker: null, name: "Apple", shares: 25, average_cost: 158.4, market_value: 7512.63, currency: "EUR", confidence: "high" }]);
    expect(row).toMatchObject({ shares: 25, averageCost: null, marketValue: null, currency: "EUR", confidence: "medium" });
    const [usd] = normalizeModelHoldings([{ ticker: "AAPL", name: null, shares: 2, average_cost: 150, market_value: null, currency: "usd", confidence: "high" }]);
    expect(usd).toMatchObject({ averageCost: 150, confidence: "high" });
    expect(usd).not.toHaveProperty("currency");
  });

  it("reads BRK B with a space and a lowercase holding line", () => {
    expect(parseLines("BRK B 3").map((r) => r.ticker)).toEqual(["BRK.B"]);
    expect(parseLines("nvda, 25, $118")).toMatchObject([{ ticker: "NVDA", shares: 25, averageCost: 118, guess: true }]);
  });
});
