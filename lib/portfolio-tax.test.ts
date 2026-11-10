import { describe, expect, it } from "vitest";

import {
  addDays,
  buildTaxPicture,
  computeInstrument,
  harvestRows,
  holdingTerm,
  isIsoDay,
  longTermFrom,
  oneYearAfter,
  parseTaxLotEntry,
  readTaxLotsField,
  realisedCsv,
  summariseYears,
  type TaxLotEntry,
} from "@/lib/portfolio-tax";

const ID = "US_AAPL";

function entry(partial: Partial<TaxLotEntry>): TaxLotEntry {
  return { ticker: "AAPL", buys: [], sells: [], splits: [], ...partial };
}

describe("dates and terms", () => {
  it("validates real calendar days only", () => {
    expect(isIsoDay("2025-02-28")).toBe(true);
    expect(isIsoDay("2025-02-29")).toBe(false);
    expect(isIsoDay("2024-02-29")).toBe(true);
    expect(isIsoDay("2025-2-1")).toBe(false);
    expect(isIsoDay(20250201)).toBe(false);
  });

  it("is short term on the one-year anniversary and long term the day after", () => {
    expect(holdingTerm("2024-03-01", "2025-03-01")).toBe("short");
    expect(holdingTerm("2024-03-01", "2025-03-02")).toBe("long");
    expect(longTermFrom("2024-03-01")).toBe("2025-03-02");
  });

  it("treats a Feb 29 buy as long term from Mar 1 the next year", () => {
    expect(oneYearAfter("2024-02-29")).toBe("2025-02-28");
    expect(holdingTerm("2024-02-29", "2025-02-28")).toBe("short");
    expect(holdingTerm("2024-02-29", "2025-03-01")).toBe("long");
  });

  it("does not know the term without a buy date", () => {
    expect(holdingTerm(null, "2025-01-01")).toBe("unknown");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2025-12-15", 30)).toBe("2026-01-14");
    expect(addDays("2025-03-31", -30)).toBe("2025-03-01");
  });
});

describe("FIFO matching", () => {
  it("sells the oldest lot first and splits a lot on a partial sell", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b2", date: "2024-06-01", shares: 10, price: 200 },
          { id: "b1", date: "2023-01-10", shares: 10, price: 100 },
        ],
        sells: [{ id: "s1", date: "2024-07-01", shares: 15, price: 150, method: "fifo" }],
      }),
    );
    expect(result.realised).toHaveLength(2);
    const [first, second] = result.realised;
    expect(first).toMatchObject({ lotId: "b1", shares: 10, basis: 1000, proceeds: 1500, gain: 500, term: "long" });
    expect(second).toMatchObject({ lotId: "b2", shares: 5, basis: 1000, proceeds: 750, gain: -250, term: "short" });
    expect(result.open).toHaveLength(1);
    expect(result.open[0]).toMatchObject({ lotId: "b2", shares: 5, basis: 1000, costPerShare: 200 });
    expect(result.issues).toEqual([]);
  });

  it("never matches a sell to a lot bought after it", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-01-02", shares: 5, price: 10 },
          { id: "b2", date: "2024-03-01", shares: 5, price: 20 },
        ],
        sells: [{ id: "s1", date: "2024-02-01", shares: 8, price: 15, method: "fifo" }],
      }),
    );
    expect(result.realised.map((piece) => [piece.lotId, piece.shares])).toEqual([
      ["b1", 5],
      [null, 3],
    ]);
    expect(result.issues).toEqual([expect.objectContaining({ kind: "oversold", shares: 3 })]);
    expect(result.realised[1]).toMatchObject({ basis: null, gain: null, term: "unknown" });
  });

  it("spreads fees: buy fees raise the basis, sell fees cut the proceeds", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [{ id: "b1", date: "2024-01-02", shares: 10, price: 10, fee: 5 }],
        sells: [{ id: "s1", date: "2024-02-01", shares: 4, price: 12, fee: 2, method: "fifo" }],
      }),
    );
    expect(result.realised[0]!.basis).toBeCloseTo(42);
    expect(result.realised[0]!.proceeds).toBeCloseTo(46);
    expect(result.realised[0]!.gain).toBeCloseTo(4);
    expect(result.open[0]!.basis).toBeCloseTo(63);
  });

  it("sells across several sells in date order, whatever order they were entered", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-01-02", shares: 10, price: 10 },
          { id: "b2", date: "2024-01-03", shares: 10, price: 20 },
        ],
        sells: [
          { id: "s2", date: "2024-03-01", shares: 10, price: 30, method: "fifo" },
          { id: "s1", date: "2024-02-01", shares: 5, price: 30, method: "fifo" },
        ],
      }),
    );
    expect(result.realised.map((piece) => `${piece.sellId}:${piece.lotId}:${piece.shares}`)).toEqual([
      "s1:b1:5",
      "s2:b1:5",
      "s2:b2:5",
    ]);
  });
});

describe("specific lots", () => {
  const buys = [
    { id: "old", date: "2022-01-03", shares: 10, price: 50 },
    { id: "new", date: "2024-05-01", shares: 10, price: 120 },
  ];

  it("sells the lots the user picked", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys,
        sells: [{ id: "s1", date: "2024-06-03", shares: 4, price: 100, method: "specific", picks: [{ lot_id: "new", shares: 4 }] }],
      }),
    );
    expect(result.realised).toEqual([expect.objectContaining({ lotId: "new", shares: 4, gain: -80, term: "short", method: "specific" })]);
    expect(result.open.find((lot) => lot.lotId === "old")!.shares).toBe(10);
    expect(result.open.find((lot) => lot.lotId === "new")!.shares).toBe(6);
  });

  it("covers the rest by FIFO when the picks are short, and says so", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys,
        sells: [{ id: "s1", date: "2024-06-03", shares: 15, price: 100, method: "specific", picks: [{ lot_id: "new", shares: 12 }] }],
      }),
    );
    expect(result.realised.map((piece) => [piece.lotId, piece.shares])).toEqual([
      ["new", 10],
      ["old", 5],
    ]);
    expect(result.issues).toEqual([expect.objectContaining({ kind: "pick_short", lotId: "new", shares: 2 })]);
  });

  it("will not pick a lot bought after the sell", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys,
        sells: [{ id: "s1", date: "2023-01-03", shares: 2, price: 60, method: "specific", picks: [{ lot_id: "new", shares: 2 }] }],
      }),
    );
    expect(result.realised).toEqual([expect.objectContaining({ lotId: "old", shares: 2 })]);
    expect(result.issues[0]).toMatchObject({ kind: "pick_short", lotId: "new" });
  });
});

describe("splits", () => {
  it("scales open shares at the same dollar basis and keeps the holding period", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [{ id: "b1", date: "2020-01-02", shares: 10, price: 400 }],
        splits: [{ id: "x1", date: "2020-08-31", ratio: 4 }],
        sells: [{ id: "s1", date: "2021-01-04", shares: 20, price: 130, method: "fifo" }],
      }),
    );
    expect(result.realised[0]).toMatchObject({ shares: 20, basis: 2000, proceeds: 2600, gain: 600, acquired: "2020-01-02", term: "long" });
    expect(result.open[0]).toMatchObject({ shares: 20, basis: 2000, costPerShare: 100 });
  });

  it("applies a split before a buy and a sell on the same day", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-01-02", shares: 1, price: 100 },
          { id: "b2", date: "2024-06-10", shares: 1, price: 10 },
        ],
        splits: [{ id: "x1", date: "2024-06-10", ratio: 10 }],
        sells: [{ id: "s1", date: "2024-06-10", shares: 10, price: 11, method: "fifo" }],
      }),
    );
    expect(result.realised).toEqual([expect.objectContaining({ lotId: "b1", shares: 10, basis: 100 })]);
    expect(result.open).toEqual([expect.objectContaining({ lotId: "b2", shares: 1, basis: 10 })]);
  });

  it("handles a reverse split", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [{ id: "b1", date: "2024-01-02", shares: 100, price: 2 }],
        splits: [{ id: "x1", date: "2024-03-01", ratio: 0.1 }],
      }),
    );
    expect(result.open[0]!.shares).toBeCloseTo(10);
    expect(result.open[0]!.costPerShare).toBeCloseTo(20);
  });
});

describe("old single-cost holdings", () => {
  it("count as one lot with no date when the holding has no lots", () => {
    const result = computeInstrument(ID, null, { quantity: 12, average_cost: 150 });
    expect(result.fromHolding).toBe(true);
    expect(result.open).toEqual([expect.objectContaining({ lotId: "holding", acquired: null, shares: 12, basis: 1800 })]);
  });

  it("are ignored once the holding has lots of its own", () => {
    const result = computeInstrument(ID, entry({ buys: [{ id: "b1", date: "2024-01-02", shares: 1, price: 1 }] }), {
      quantity: 12,
      average_cost: 150,
    });
    expect(result.fromHolding).toBe(false);
    expect(result.open).toHaveLength(1);
  });

  it("need shares and a cost to count", () => {
    expect(computeInstrument(ID, null, { quantity: 12, average_cost: null }).open).toEqual([]);
    expect(computeInstrument(ID, null, { quantity: 0, average_cost: 10 }).open).toEqual([]);
  });
});

describe("wash sales", () => {
  const base = { id: "b1", date: "2024-01-02", shares: 10, price: 100 };
  const sell = { id: "s1", date: "2024-06-01", shares: 10, price: 80, method: "fifo" as const };

  it("flags a buy 30 days after a loss sale", () => {
    const result = computeInstrument(ID, entry({ buys: [base, { id: "b2", date: "2024-07-01", shares: 10, price: 82 }], sells: [sell] }));
    expect(addDays("2024-06-01", 30)).toBe("2024-07-01");
    expect(result.realised[0]!.washSale).toMatchObject({
      windowStart: "2024-05-02",
      windowEnd: "2024-07-01",
      replacementShares: 10,
      disallowed: 200,
    });
  });

  it("does not flag a buy 31 days after", () => {
    const result = computeInstrument(ID, entry({ buys: [base, { id: "b2", date: "2024-07-02", shares: 10, price: 82 }], sells: [sell] }));
    expect(result.realised[0]!.washSale).toBeNull();
  });

  it("flags a buy 30 days before and not 31 days before", () => {
    const thirty = computeInstrument(
      ID,
      entry({ buys: [base, { id: "b2", date: "2024-05-02", shares: 5, price: 90 }], sells: [{ ...sell, method: "specific", picks: [{ lot_id: "b1", shares: 10 }] }] }),
    );
    expect(thirty.realised[0]!.washSale).toMatchObject({ replacementShares: 5, disallowed: 100 });
    const thirtyOne = computeInstrument(
      ID,
      entry({ buys: [base, { id: "b2", date: "2024-05-01", shares: 5, price: 90 }], sells: [{ ...sell, method: "specific", picks: [{ lot_id: "b1", shares: 10 }] }] }),
    );
    expect(thirtyOne.realised[0]!.washSale).toBeNull();
  });

  it("never treats the lots a sale closes as their own replacement", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-05-20", shares: 5, price: 100 },
          { id: "b2", date: "2024-05-25", shares: 5, price: 100 },
        ],
        sells: [{ id: "s1", date: "2024-06-01", shares: 10, price: 80, method: "fifo" }],
      }),
    );
    expect(result.realised.every((piece) => piece.washSale === null)).toBe(true);
  });

  it("does not flag gains", () => {
    const result = computeInstrument(ID, entry({ buys: [base, { id: "b2", date: "2024-06-05", shares: 10, price: 120 }], sells: [{ ...sell, price: 120 }] }));
    expect(result.realised[0]!.washSale).toBeNull();
  });

  it("uses each replacement share once across loss sales", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-01-02", shares: 20, price: 100 },
          { id: "b2", date: "2024-06-10", shares: 10, price: 70 },
        ],
        sells: [
          { id: "s1", date: "2024-06-01", shares: 10, price: 80, method: "fifo" },
          { id: "s2", date: "2024-06-05", shares: 10, price: 75, method: "fifo" },
        ],
      }),
    );
    const [first, second] = result.realised;
    expect(first!.washSale).toMatchObject({ replacementShares: 10, disallowed: 200 });
    expect(second!.washSale).toMatchObject({ replacementShares: 0, disallowed: 0 });
    // Counted per sale, not per lot piece.
    expect(summariseYears(result.realised)[0]!.washSales).toBe(2);
  });
});

describe("harvestable losses", () => {
  const lots = entry({
    buys: [
      { id: "b1", date: "2023-01-03", shares: 10, price: 200 },
      { id: "b2", date: "2025-10-20", shares: 5, price: 180 },
      { id: "b3", date: "2025-01-02", shares: 5, price: 100 },
    ],
  });
  const result = computeInstrument(ID, lots);

  it("lists lots below cost with term and amount, biggest loss first", () => {
    const rows = harvestRows([result], new Map([[ID, 150]]), "2025-11-10");
    expect(rows.map((row) => [row.lotId, row.loss, row.term])).toEqual([
      ["b1", -500, "long"],
      ["b2", -150, "short"],
    ]);
    expect(rows[1]!.longTermOn).toBe("2026-10-21");
  });

  it("warns when another lot of the ticker was bought in the last 30 days", () => {
    const rows = harvestRows([result], new Map([[ID, 150]]), "2025-11-10");
    expect(rows[0]!.recentBuys).toEqual([{ lotId: "b2", date: "2025-10-20" }]);
    expect(rows[0]!.holdBackUntil).toBe("2025-12-10");
    // The recent lot is not its own warning.
    expect(rows[1]!.recentBuys).toEqual([]);
    const later = harvestRows([result], new Map([[ID, 150]]), "2025-11-20");
    expect(later[0]!.recentBuys).toEqual([]);
  });

  it("skips instruments without a price", () => {
    expect(harvestRows([result], new Map(), "2025-11-10")).toEqual([]);
  });
});

describe("summaries and the picture", () => {
  it("adds up per tax year and term", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2022-01-03", shares: 10, price: 10 },
          { id: "b2", date: "2024-11-01", shares: 10, price: 30 },
        ],
        sells: [
          { id: "s1", date: "2024-12-30", shares: 5, price: 20, method: "fifo" },
          { id: "s2", date: "2025-01-02", shares: 10, price: 20, method: "fifo" },
        ],
      }),
    );
    const years = summariseYears(result.realised);
    expect(years.map((year) => year.year)).toEqual([2025, 2024]);
    expect(years[1]).toMatchObject({ long: 50, short: 0, total: 50 });
    expect(years[0]).toMatchObject({ long: 50, short: -50, total: 0 });
  });

  it("joins lots and old holdings and lists what has no price", () => {
    const picture = buildTaxPicture({
      lots: { US_MSFT: entry({ ticker: "MSFT", buys: [{ id: "b1", date: "2025-01-02", shares: 1, price: 400 }] }) },
      holdings: { US_AAPL: { quantity: 2, average_cost: 250 }, US_NVDA: { quantity: 3, average_cost: null }, IN_TCS: { quantity: 1, average_cost: 1 } },
      prices: new Map([["US_AAPL", 200]]),
      today: "2025-11-10",
    });
    expect(picture.instruments.map((item) => item.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(picture.undatedHoldings).toBe(1);
    expect(picture.unpriced).toEqual(["MSFT"]);
    expect(picture.harvest).toEqual([expect.objectContaining({ ticker: "AAPL", loss: -100, term: "unknown" })]);
    expect(picture.harvestTotals).toMatchObject({ unknown: -100, total: -100 });
  });

  it("is empty with no lots and no holdings", () => {
    const picture = buildTaxPicture({ lots: {}, holdings: null, prices: new Map(), today: "2025-11-10" });
    expect(picture.instruments).toEqual([]);
    expect(picture.years).toEqual([]);
  });
});

describe("parsing", () => {
  it("accepts a clean entry", () => {
    const { entry: parsed, errors } = parseTaxLotEntry(
      {
        buys: [{ id: "b1", date: "2025-01-02", shares: "10", price: "100.5", fee: "" }],
        sells: [{ id: "s1", date: "2025-02-03", shares: 2, price: 110, method: "specific", picks: [{ lot_id: "b1", shares: 2 }] }],
        splits: [{ id: "x1", date: "2025-03-03", ratio: 2 }],
      },
      "2025-11-10",
      "AAPL",
    );
    expect(errors).toEqual([]);
    expect(parsed.buys[0]).toEqual({ id: "b1", date: "2025-01-02", shares: 10, price: 100.5 });
    expect(parsed.sells[0]!.picks).toEqual([{ lot_id: "b1", shares: 2 }]);
  });

  it("reports bad rows", () => {
    const { errors } = parseTaxLotEntry(
      {
        buys: [
          { id: "b1", date: "2025-13-01", shares: 1, price: 1 },
          { id: "b1", date: "2025-01-01", shares: 0, price: 1 },
          { id: "b3", date: "2030-01-01", shares: 1, price: -1 },
        ],
        sells: [{ id: "s1", date: "2025-01-02", shares: 1, price: 1, method: "specific", picks: [{ lot_id: "nope", shares: 1 }] }],
        splits: [{ id: "x1", date: "2025-01-02", ratio: 1 }],
      },
      "2025-11-10",
      "AAPL",
    );
    expect(errors.join(" ")).toMatch(/YYYY-MM-DD/);
    expect(errors.join(" ")).toMatch(/used twice/);
    expect(errors.join(" ")).toMatch(/future/);
    expect(errors.join(" ")).toMatch(/does not exist/);
    expect(errors.join(" ")).toMatch(/4-for-1/);
  });

  it("reserves the holding lot id", () => {
    const { errors } = parseTaxLotEntry({ buys: [{ id: "holding", date: "2025-01-02", shares: 1, price: 1 }] }, "2025-11-10", "AAPL");
    expect(errors.join(" ")).toMatch(/reserved/);
  });

  it("rejects picks that add up to more than the sell", () => {
    const { errors } = parseTaxLotEntry(
      {
        buys: [{ id: "b1", date: "2025-01-02", shares: 10, price: 1 }],
        sells: [{ id: "s1", date: "2025-02-03", shares: 2, price: 1, method: "specific", picks: [{ lot_id: "b1", shares: 3 }] }],
      },
      "2025-11-10",
      "AAPL",
    );
    expect(errors.join(" ")).toMatch(/more than the shares sold/);
  });

  it("reads the stored field defensively", () => {
    const field = readTaxLotsField(
      {
        US_AAPL: { ticker: "aapl", buys: [{ id: "b1", date: "2025-01-02", shares: 1, price: 1 }, { id: "bad" }], sells: [], splits: [] },
        IN_TCS: { buys: [] },
        "bad id": {},
      },
      "2025-11-10",
    );
    expect(Object.keys(field)).toEqual(["US_AAPL"]);
    expect(field.US_AAPL!.ticker).toBe("AAPL");
    expect(field.US_AAPL!.buys).toHaveLength(1);
    expect(readTaxLotsField(null, "2025-11-10")).toEqual({});
  });
});

describe("CSV", () => {
  it("writes one row per lot closed, escaped, with wash-sale flags", () => {
    const result = computeInstrument(
      ID,
      entry({
        buys: [
          { id: "b1", date: "2024-01-02", shares: 10, price: 100 },
          { id: "b2", date: "2024-06-20", shares: 10, price: 70 },
        ],
        sells: [{ id: "s1", date: "2024-06-01", shares: 10, price: 80, method: "fifo" }],
      }),
    );
    const csv = realisedCsv(result.realised);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "Description,Date acquired,Date sold,Proceeds,Cost basis,Gain or loss,Term,Tax year,Lot matching,Possible wash sale,Wash-sale window,Loss possibly disallowed",
    );
    expect(lines[1]).toBe("10 sh AAPL,2024-01-02,2024-06-01,800,1000,-200,Short term,2024,\"First in, first out\",Yes,2024-05-02 to 2024-07-01,200");
  });

  it("writes fractional shares and unmatched rows", () => {
    const csv = realisedCsv([
      {
        key: "k",
        instrumentId: "US_X",
        ticker: "=HYPERLINK(1)",
        sellId: "s",
        lotId: null,
        acquired: null,
        sold: "2025-01-02",
        shares: 1.5,
        proceeds: 10.123,
        basis: null,
        gain: null,
        term: "unknown",
        taxYear: 2025,
        method: "fifo",
        washSale: null,
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe("1.5 sh =HYPERLINK(1),Not matched,2025-01-02,10.12,,,Unknown,2025,\"First in, first out\",No,,");
  });
});
