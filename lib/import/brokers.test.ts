import { describe, expect, it } from "vitest";

import {
  ETRADE_FIXTURE,
  FIDELITY_FIXTURE,
  IBKR_FLEX_FIXTURE,
  IBKR_STATEMENT_FIXTURE,
  M1_FIXTURE,
  MORGAN_STANLEY_FIXTURE,
  ROBINHOOD_FIXTURE,
  SCHWAB_FIXTURE,
  UNKNOWN_FIXTURE,
  VANGUARD_FIXTURE,
  WEBULL_FIXTURE,
} from "./broker-fixtures";
import { csvTable, guessColumns, parseBrokerCsv, parseMappedCsv, readCsvRows, skippedGroups, type BrokerCsv, type SkipReason } from "./brokers";
import { MAX_IMPORT_ROWS } from "./normalize";
import { parseHoldingsText, parseLines } from "./text";

function parsed(text: string): BrokerCsv {
  const out = parseBrokerCsv(text);
  if (!out) throw new Error("not read");
  return out;
}

const holdings = (out: BrokerCsv) => out.rows.map((row) => [row.ticker, row.shares, row.averageCost]);
const skippedAs = (out: BrokerCsv, reason: SkipReason) => out.skipped.filter((row) => row.reason === reason).map((row) => row.label);

describe("readCsvRows", () => {
  it("keeps quoted commas, doubled quotes and line breaks inside a cell", () => {
    expect(readCsvRows('a,"1,234.50","say ""hi""","two\nlines"\r\nb,2,,')).toEqual([
      ["a", "1,234.50", 'say "hi"', "two\nlines"],
      ["b", "2", "", ""],
    ]);
  });

  it("reads tab and semicolon files", () => {
    expect(readCsvRows("Symbol\tQuantity\nAAPL\t3")).toEqual([["Symbol", "Quantity"], ["AAPL", "3"]]);
    expect(readCsvRows("Symbol;Quantity\nAAPL;3")).toEqual([["Symbol", "Quantity"], ["AAPL", "3"]]);
  });
});

describe("parseBrokerCsv, one export per broker", () => {
  it("Fidelity: adds AAPL across two accounts, reads BRK B, leaves out cash, the option and pending activity", () => {
    const out = parsed(FIDELITY_FIXTURE);
    expect(out.broker).toBe("fidelity");
    expect(holdings(out)).toEqual([
      ["AAPL", 50, 170],
      ["NVDA", 25, 120],
      ["VOO", 12.5, 420],
      ["BRK.B", 3, 400],
    ]);
    expect(out.rows.find((row) => row.ticker === "AAPL")?.marketValue).toBeCloseTo(11376);
    expect(skippedAs(out, "cash")).toEqual(["SPAXX**", "FDRXX**"]);
    expect(skippedAs(out, "option")).toEqual(["-AAPL261218C250"]);
    expect(skippedAs(out, "total")).toEqual(["Pending Activity"]);
    expect(out.trades).toBe(false);
  });

  it("Schwab: skips the title line, works out the cost per share from the total, leaves out the option, the T-bill, cash and the total", () => {
    const out = parsed(SCHWAB_FIXTURE);
    expect(out.broker).toBe("schwab");
    expect(holdings(out)).toEqual([
      ["MSFT", 15, 300],
      ["SCHD", 100, 26],
      ["JPM", 20, 150],
    ]);
    expect(skippedAs(out, "option")).toEqual(["TSLA 12/18/2026 300.00 C"]);
    expect(skippedAs(out, "not-stock")).toEqual(["912797LN5"]);
    expect(skippedAs(out, "cash")).toEqual(["Cash & Cash Investments"]);
    expect(skippedAs(out, "total")).toEqual(["Account Total"]);
  });

  it("Schwab: an all-accounts file repeats the header for each account", () => {
    const lines = SCHWAB_FIXTURE.trim().split("\n");
    const header = lines[2]!;
    const twice = [...lines, '"Joint ...111"', header, '"AAPL","APPLE INC","5","$227.00","","","$1,135.00","","","$900.00","","","","","","","Equity"'].join("\n");
    const out = parsed(twice);
    expect(out.rows.map((row) => row.ticker)).toEqual(["MSFT", "SCHD", "JPM", "AAPL"]);
  });

  it("Vanguard: reads the holdings and stops before the trades section", () => {
    const out = parsed(VANGUARD_FIXTURE);
    expect(out.broker).toBe("vanguard");
    expect(holdings(out)).toEqual([
      ["VTI", 30, null],
      ["COST", 4, null],
    ]);
    expect(skippedAs(out, "cash")).toEqual(["VMFXX"]);
  });

  it("Robinhood: adds up buys and sells oldest first, leaves out sold-out stocks and options, marks every row for a look", () => {
    const out = parsed(ROBINHOOD_FIXTURE);
    expect(out.broker).toBe("robinhood");
    expect(out.trades).toBe(true);
    // AMD: 10 at $120 and 10 at $140, then 5 sold: 15 left at an average of $130.
    expect(holdings(out)).toEqual([
      ["HOOD", 8.5, 40],
      ["AMD", 15, 130],
    ]);
    expect(out.rows.find((row) => row.ticker === "AMD")?.name).toBe("Advanced Micro Devices");
    expect(out.rows.every((row) => row.confidence === "medium")).toBe(true);
    expect(skippedAs(out, "closed")).toEqual(["SOFI"]);
    expect(skippedAs(out, "option")).toEqual(["PLTR 12/18/2026 Call $60.00"]);
  });

  it("E*TRADE: finds the positions under the account summary and reads Price Paid as the cost", () => {
    const out = parsed(ETRADE_FIXTURE);
    expect(out.broker).toBe("etrade");
    expect(holdings(out)).toEqual([
      ["GOOGL", 30, 140],
      ["KO", 50, 55],
      ["META", 10, 410],
    ]);
    expect(skippedAs(out, "cash")).toEqual(["CASH"]);
    expect(skippedAs(out, "total")).toEqual(["TOTAL"]);
  });

  it("Morgan Stanley: reads Unit Cost and leaves out the bank deposit sweep", () => {
    const out = parsed(MORGAN_STANLEY_FIXTURE);
    expect(out.broker).toBe("morganstanley");
    expect(holdings(out)).toEqual([
      ["PG", 25, 150],
      ["UNH", 6, 560],
    ]);
    expect(skippedAs(out, "cash")).toEqual(["MSBNK"]);
    expect(skippedAs(out, "total")).toEqual(["Total"]);
  });

  it("Interactive Brokers activity statement: Summary lines only, the option left out, the euro cost dropped", () => {
    const out = parsed(IBKR_STATEMENT_FIXTURE);
    expect(out.broker).toBe("ibkr");
    expect(holdings(out)).toEqual([
      ["AMZN", 20, 150],
      ["TSM", 15, 110],
      ["ASML", 2, null],
    ]);
    const asml = out.rows.find((row) => row.ticker === "ASML")!;
    expect(asml.currency).toBe("EUR");
    expect(asml.marketValue).toBeNull();
    expect(asml.confidence).toBe("medium");
    expect(skippedAs(out, "option")).toEqual(["SPY 19DEC26 600 P"]);
  });

  it("Interactive Brokers Flex query: the option and the short position are left out", () => {
    const out = parsed(IBKR_FLEX_FIXTURE);
    expect(out.broker).toBe("ibkr");
    expect(holdings(out)).toEqual([["V", 12, 250]]);
    expect(skippedAs(out, "option")).toHaveLength(1);
    expect(skippedAs(out, "short")).toEqual(["SHOP"]);
  });

  it("Webull: only filled orders count, the option is left out", () => {
    const out = parsed(WEBULL_FIXTURE);
    expect(out.broker).toBe("webull");
    expect(out.trades).toBe(true);
    expect(holdings(out)).toEqual([
      ["F", 100, 11],
      ["PLTR", 20, 40],
    ]);
    expect(skippedAs(out, "option")).toEqual(["SPY261218P00550000"]);
  });

  it("M1: fractional shares and the average price", () => {
    const out = parsed(M1_FIXTURE);
    expect(out.broker).toBe("m1");
    expect(holdings(out)).toEqual([
      ["VTI", 14.2153, 250.1],
      ["O", 40.5, 55],
      ["QQQ", 3.0002, 430],
    ]);
  });

  it("a plain CSV with a ticker and a shares column", () => {
    const out = parsed("Ticker,Shares,Average cost\nKO,4,60\nPEP,2,");
    expect(out.broker).toBe("generic");
    expect(holdings(out)).toEqual([
      ["KO", 4, 60],
      ["PEP", 2, null],
    ]);
  });

  it("does not read pasted lines as a CSV", () => {
    expect(parseBrokerCsv("NVDA 25 @ 120\nAAPL, 10")).toBeNull();
    expect(parseBrokerCsv("")).toBeNull();
  });

  it("keeps the biggest holdings when a file has more than we read at once", () => {
    const lines = ["Symbol,Quantity,Market Value"];
    const letters = (n: number) => String.fromCharCode(65 + Math.floor(n / 26 / 26) % 26, 65 + (Math.floor(n / 26) % 26), 65 + (n % 26));
    for (let i = 0; i < MAX_IMPORT_ROWS + 5; i += 1) lines.push(`${letters(i)},1,${i + 1}`);
    const out = parsed(lines.join("\n"));
    expect(out.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(out.truncated).toBe(5);
    expect(out.rows[0]!.marketValue).toBe(MAX_IMPORT_ROWS + 5);
  });

  it("a ticker that is not a stock we could read is reported, not dropped", () => {
    const out = parsed("Symbol,Quantity\nTOOLONGNAME,3\nAAPL,1");
    expect(skippedAs(out, "no-ticker")).toEqual(["TOOLONGNAME"]);
  });
});

describe("what the quality pass turned up", () => {
  it("reads decimal commas in a semicolon file, and marks a number that could be either", () => {
    const out = parsed("Symbol;Quantity;Average cost\nSAP;10,5;1.234,56\nASML;1.000;650\nAAPL;3;180,5");
    expect(holdings(out)).toEqual([
      ["SAP", 10.5, 1234.56],
      ["ASML", 1000, 650],
      ["AAPL", 3, 180.5],
    ]);
    expect(out.rows.map((row) => row.confidence)).toEqual(["high", "medium", "high"]);
  });

  it("Robinhood: a merge or exchange goes by its sign, and is skipped when the line does not say", () => {
    const head = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';
    const out = parsed(
      [
        head,
        '"03/01/2026","03/01/2026","03/01/2026","NEWCO","Merger","MRGS","10","",""',
        '"03/01/2026","03/01/2026","03/01/2026","OLDCO","Merger","MRGS","-10","",""',
        '"02/01/2026","02/01/2026","02/03/2026","OLDCO","Old Co","Buy","10","$5.00","($50.00)"',
      ].join("\n"),
    );
    expect(holdings(out)).toEqual([]);
    expect(skippedAs(out, "closed")).toEqual(["OLDCO"]);
  });

  it("Robinhood: shares transferred in without a price leave the cost unknown; a split keeps it", () => {
    const head = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';
    const transfer = parsed([head, '"02/01/2026","","","KO","Coca-Cola","ACATI","10","",""', '"01/01/2026","","","KO","Coca-Cola","Buy","10","$60.00","($600.00)"'].join("\n"));
    expect(holdings(transfer)).toEqual([["KO", 20, null]]);
    const split = parsed([head, '"02/01/2026","","","NVDA","Nvidia","SPL","9","",""', '"01/01/2026","","","NVDA","Nvidia","Buy","1","$1000.00","($1000.00)"'].join("\n"));
    expect(holdings(split)).toEqual([["NVDA", 10, 100]]);
  });

  it("does not read an account-type column (Cash, Margin) as cash lines", () => {
    const out = parsed("Symbol,Quantity,Type\nAAPL,3,Cash\nMSFT,2,Margin");
    expect(holdings(out)).toEqual([
      ["AAPL", 3, null],
      ["MSFT", 2, null],
    ]);
    // A real security-type column still leaves the cash line out.
    expect(holdings(parsed("Symbol,Quantity,Type\nAAPL,3,Equity\nSWVXX,100,Money Market Fund"))).toEqual([["AAPL", 3, null]]);
  });

  it("prefers Quantity over Position when a file has both", () => {
    expect(holdings(parsed("Symbol,Position,Quantity\nAAPL,5400,30"))).toEqual([["AAPL", 30, null]]);
  });

  it("keeps the stock CASH (Pathward Financial) and leaves out a CASH line with no name", () => {
    const out = parsed("Symbol,Description,Quantity,Value\nCASH,PATHWARD FINANCIAL INC,12,900\nCASH,,,1200");
    expect(holdings(out)).toEqual([["CASH", 12, null]]);
    expect(skippedAs(out, "cash")).toEqual(["CASH"]);
  });

  it("IBKR: each line is read against the header above it", () => {
    const text = [
      "Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Cost Price",
      "Open Positions,Data,Summary,Stocks,USD,AMZN,20,150",
      "Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Cost Price,Quantity",
      "Open Positions,Data,Summary,Stocks,USD,TSM,110,15",
    ].join("\n");
    expect(holdings(parsed(text))).toEqual([
      ["AMZN", 20, 150],
      ["TSM", 15, 110],
    ]);
  });

  it("never guesses a column with one value on every line as the tickers", () => {
    const table = csvTable("Ccy,Name,Held\nUSD,AAPL,3\nUSD,MSFT,2\nUSD,NVDA,1")!;
    expect(guessColumns(table).ticker).toBe(1);
  });
});

describe("an unknown CSV, mapped in two picks", () => {
  it("finds the header under a title line and guesses ticker and shares", () => {
    expect(parseBrokerCsv(UNKNOWN_FIXTURE)).toBeNull();
    const table = csvTable(UNKNOWN_FIXTURE)!;
    expect(table.headers).toEqual(["Stock", "Owned", "Paid each", "Notes"]);
    expect(table.rows).toHaveLength(3);
    expect(guessColumns(table)).toEqual({ ticker: 0, shares: 1 });
  });

  it("reads the picked columns", () => {
    const table = csvTable(UNKNOWN_FIXTURE)!;
    const out = parseMappedCsv(table, { ticker: 0, shares: 1 });
    expect(out.broker).toBe("mapped");
    expect(holdings(out)).toEqual([
      ["AMZN", 12, null],
      ["AAPL", 5, null],
      ["CRM", 3, null],
    ]);
  });

  it("uses a cost column whose header says so", () => {
    const table = csvTable("Stock,Owned,Avg cost\nAMZN,12,150\n")!;
    expect(holdings(parseMappedCsv(table, { ticker: 0, shares: 1 }))).toEqual([["AMZN", 12, 150]]);
  });

  it("has no table without a header and a data line", () => {
    expect(csvTable("just one line")).toBeNull();
  });
});

describe("skippedGroups", () => {
  it("groups by reason in a fixed order with a count past the limit", () => {
    const groups = skippedGroups(
      [
        { label: "TOTAL", reason: "total" },
        ...["A", "B", "C"].map((label) => ({ label: `${label}XX**`, reason: "cash" as const })),
      ],
      2,
    );
    expect(groups.map((group) => [group.reason, group.labels, group.more])).toEqual([
      ["cash", ["AXX", "BXX"], 1],
      ["total", ["TOTAL"], 0],
    ]);
  });
});

describe("pasted holdings", () => {
  it("reads 'NVDA 25 @ 120' and 'AAPL, 10'", () => {
    expect(parseLines("NVDA 25 @ 120\nAAPL, 10")).toEqual([
      { ticker: "NVDA", name: null, shares: 25, averageCost: 120, marketValue: null, confidence: "high" },
      { ticker: "AAPL", name: null, shares: 10, averageCost: null, marketValue: null, confidence: "high" },
    ]);
  });

  it("reads other ways people type it", () => {
    const out = parseLines("msft 3 @410.5\n$TSLA 2 shares\nBRK B 1, 450\nGOOGL x 4");
    expect(out.map((row) => [row.ticker, row.shares, row.averageCost])).toEqual([
      ["MSFT", 3, 410.5],
      ["TSLA", 2, null],
      ["BRK.B", 1, 450],
      ["GOOGL", 4, null],
    ]);
  });

  it("goes through the broker reader when the text is an export", () => {
    const out = parseHoldingsText(FIDELITY_FIXTURE);
    expect(out.input).toBe("csv");
    expect(out.csv?.broker).toBe("fidelity");
    expect(out.rows.map((row) => row.ticker)).toEqual(["AAPL", "NVDA", "VOO", "BRK.B"]);
    expect(parseHoldingsText("NVDA 25 @ 120").input).toBe("text");
  });
});
