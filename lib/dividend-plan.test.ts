import { describe, expect, it } from "vitest";

import {
  addMonths,
  buildDividendPlan,
  buildDividendRead,
  fmtDollars,
  joinNames,
  parseAnnouncedRow,
  parseHistoryDoc,
  planMonths,
  planStock,
  type DividendHistory,
  type PlanHoldingInput,
} from "./dividend-plan";

const TODAY = "2026-11-11";

function history(symbol: string, payments: Array<[string, number, boolean?]>, extra: Partial<DividendHistory> = {}): DividendHistory {
  const list = payments.map(([exDate, amount, special]) => ({ exDate, amount, special: special ?? false }));
  const regular = list.filter((p) => !p.special);
  return {
    symbol,
    payments: list,
    frequency: "quarterly",
    perYear: 4,
    latestAmount: regular.at(-1)?.amount ?? null,
    yearAgoAmount: null,
    payLagDays: 21,
    fetchedAt: "2026-11-11T12:00:00Z",
    ...extra,
  };
}

function holding(ticker: string, extra: Partial<PlanHoldingInput> = {}): PlanHoldingInput {
  return { ticker, name: ticker, shares: 10, avgCost: null, price: 100, history: null, announced: [], payout: 50, ...extra };
}

// Microsoft-like: quarterly, ex mid Feb/May/Aug/Nov, paid three weeks later.
const MSFT = history("MSFT", [
  ["2025-11-20", 0.91],
  ["2026-02-19", 0.91],
  ["2026-05-21", 0.91],
  ["2026-08-20", 0.91],
]);

describe("dates", () => {
  it("adds months and clamps to the month's end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-20", 3)).toBe("2027-02-20");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("plans twelve months starting with this one", () => {
    expect(planMonths(TODAY)).toEqual([
      "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04",
      "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10",
    ]);
  });
});

describe("planStock", () => {
  it("marks an announced dividend confirmed and estimates the rest on the cadence", () => {
    const stock = planStock(
      holding("MSFT", { history: MSFT, announced: [{ exDate: "2026-11-19", payDate: "2026-12-10", amount: 0.98 }] }),
      TODAY,
    );
    const rows = stock.payments.map((p) => [p.payDate, p.status, p.perShare]);
    expect(rows).toEqual([
      ["2026-12-10", "confirmed", 0.98],
      ["2027-03-12", "estimate", 0.98],
      ["2027-06-09", "estimate", 0.98],
      ["2027-09-09", "estimate", 0.98],
    ]);
    expect(stock.payments[0]!.payDateKnown).toBe(true);
    expect(stock.payments.slice(1).every((p) => !p.payDateKnown)).toBe(true);
    expect(stock.income).toBeCloseTo(39.2);
    expect(stock.confirmedIncome).toBeCloseTo(9.8);
    expect(stock.next?.payDate).toBe("2026-12-10");
    expect(stock.yieldOnPrice).toBeCloseTo(3.92);
  });

  it("never turns an estimate into an announcement when nothing is on the calendar", () => {
    const stock = planStock(holding("MSFT", { history: MSFT }), TODAY);
    expect(stock.payments.every((p) => p.status === "estimate")).toBe(true);
    // Nov 20 2026 is the next ex-date on the cadence; it lands as an estimate paid in December.
    expect(stock.payments.map((p) => p.payDate)).toEqual(["2026-12-11", "2027-03-13", "2027-06-10", "2027-09-10"]);
    expect(stock.confirmedIncome).toBe(0);
  });

  it("counts a passed ex-date as confirmed and a paid one this month as paid", () => {
    const monthly = history(
      "O",
      [
        ["2026-08-29", 0.27],
        ["2026-09-30", 0.27],
        ["2026-10-30", 0.272],
      ],
      { frequency: "monthly", perYear: 12, payLagDays: 15 },
    );
    const stock = planStock(holding("O", { history: monthly }), TODAY);
    const first = stock.payments[0]!;
    expect(first).toMatchObject({ exDate: "2026-10-30", payDate: "2026-11-14", status: "confirmed", paid: false });
    expect(stock.payments).toHaveLength(12);
    expect(stock.payments.filter((p) => p.status === "estimate")).toHaveLength(11);
    // A payment whose cash landed earlier this month is still this month's money, already paid.
    const early = planStock(holding("O", { history: { ...monthly, payLagDays: 5 } }), TODAY);
    expect(early.payments[0]).toMatchObject({ payDate: "2026-11-04", paid: true, status: "confirmed" });
    expect(early.next?.payDate).not.toBe("2026-11-04");
  });

  it("uses the default gap when the stock's own is unknown", () => {
    const stock = planStock(holding("MSFT", { history: { ...MSFT, payLagDays: null } }), TODAY);
    expect(stock.payments[0]!.payDate).toBe("2026-12-11");
  });

  it("does not repeat a special dividend", () => {
    const costco = history("COST", [
      ["2026-01-30", 1.3],
      ["2026-05-01", 1.47],
      ["2026-07-24", 1.47],
      ["2026-10-30", 1.47],
    ]);
    const stock = planStock(
      holding("COST", { history: costco, announced: [{ exDate: "2026-11-25", payDate: "2026-12-10", amount: 15 }] }),
      TODAY,
    );
    const special = stock.payments.find((p) => p.perShare === 15);
    expect(special?.status).toBe("confirmed");
    expect(stock.payments.filter((p) => p.status === "estimate").every((p) => p.perShare === 1.47)).toBe(true);
  });

  it("says when a stock pays nothing, stopped, is irregular, or is unknown", () => {
    expect(planStock(holding("AMZN", { history: history("AMZN", [], { frequency: "none", perYear: null }) }), TODAY).status).toBe("no_dividend");
    expect(planStock(holding("X", { history: history("X", [["2025-01-10", 0.5], ["2025-04-10", 0.5]]) }), TODAY).status).toBe("stopped");
    expect(planStock(holding("Y", { history: history("Y", [["2026-06-01", 0.5]], { frequency: "irregular", perYear: null }) }), TODAY).status).toBe("irregular");
    const unknown = planStock(holding("Z"), TODAY);
    expect(unknown.status).toBe("no_history");
    expect(unknown.payments).toEqual([]);
  });

  it("leaves dollars unknown without a share count, and works out yield on cost", () => {
    const stock = planStock(holding("MSFT", { history: MSFT, shares: null, avgCost: 50 }), TODAY);
    expect(stock.income).toBeNull();
    expect(stock.payments.every((p) => p.amount === null)).toBe(true);
    expect(stock.yieldOnCost).toBeCloseTo((0.91 * 4 * 100) / 50);
  });

  it("flags payout above 90% and a dividend paid while losing money", () => {
    expect(planStock(holding("MSFT", { history: MSFT, payout: 95 }), TODAY).atRisk).toBe(true);
    expect(planStock(holding("MSFT", { history: MSFT, payout: 90 }), TODAY).atRisk).toBe(false);
    expect(planStock(holding("MSFT", { history: MSFT, payout: -20 }), TODAY).atRisk).toBe(true);
    expect(planStock(holding("AMZN", { payout: 120 }), TODAY).atRisk).toBe(false);
  });
});

describe("buildDividendPlan and the read", () => {
  const holdings: PlanHoldingInput[] = [
    holding("MSFT", { history: MSFT, shares: 30, avgCost: 50, announced: [{ exDate: "2026-11-19", payDate: "2026-12-10", amount: 0.98 }] }),
    holding("UNH", { history: history("UNH", [["2025-12-08", 2.21], ["2026-03-16", 2.21], ["2026-06-15", 2.32], ["2026-09-14", 2.32]], { yearAgoAmount: 2.21 }), shares: 12, avgCost: 348, price: 300, payout: 95 }),
    holding("AMZN", { history: history("AMZN", [], { frequency: "none", perYear: null }) }),
  ];
  const plan = buildDividendPlan(holdings, TODAY);

  it("buckets by pay month and splits announced from estimated", () => {
    expect(plan.months).toHaveLength(12);
    expect(plan.months[1]).toMatchObject({ month: "2026-12" });
    expect(plan.months[1]!.confirmed).toBeCloseTo(0.98 * 30);
    expect(plan.confirmed + plan.estimated).toBeCloseTo(plan.total);
    expect(plan.total).toBeCloseTo(0.98 * 4 * 30 + 2.32 * 4 * 12);
    // Largest twelve-month income first.
    expect(plan.stocks.map((s) => s.ticker)).toEqual(["MSFT", "UNH", "AMZN"]);
    expect(plan.missingShares).toEqual([]);
    expect(plan.costBasis).toBeCloseTo(30 * 50 + 12 * 348);
  });

  it("leads with the total and the announced part, then flags payout risk first", () => {
    const read = buildDividendRead(plan)!;
    expect(read.headline).toBe(`Your stocks should pay you about $229 from November to October, $29 of it already announced.`);
    expect(read.insights[0]!.id).toBe("payout-UNH");
    expect(read.insights[0]!.text).toContain("UNH pays out 95% of its earnings");
    expect(read.insights.length).toBeLessThanOrEqual(3);
    for (const insight of read.insights) {
      expect(insight.text).not.toMatch(/—|\.\.\./);
      expect(insight.text.trim().endsWith(".")).toBe(true);
    }
  });

  it("never claims an announcement when nothing is announced", () => {
    const estimatesOnly = buildDividendPlan([holding("MSFT", { history: MSFT, shares: 30 })], TODAY);
    const read = buildDividendRead(estimatesOnly, { example: true })!;
    expect(read.headline).toBe("This example portfolio should pay about $109 from November to October. None of it is announced yet, so every month is an estimate.");
    const next = read.insights.find((i) => i.id.startsWith("next-"));
    if (next) expect(next.text).toContain("an estimate");
  });

  it("asks for share counts when no holding has one", () => {
    const noShares = buildDividendPlan([holding("MSFT", { history: MSFT, shares: null })], TODAY);
    const read = buildDividendRead(noShares)!;
    expect(read.headline).toBe("Add how many shares you own to see what your dividends come to.");
    expect(read.insights.some((i) => i.id === "missing-shares" && i.action?.href === "/watchlist")).toBe(true);
  });

  it("says so when nothing pays", () => {
    const none = buildDividendPlan([holding("AMZN", { history: history("AMZN", [], { frequency: "none", perYear: null }) })], TODAY);
    expect(buildDividendRead(none)!.headline).toBe("None of your stocks pays a regular dividend, so there is nothing to plan yet.");
    expect(buildDividendRead(buildDividendPlan([], TODAY))).toBeNull();
  });
});

describe("fixes from the quality pass", () => {
  it("keeps the regular estimate next to an announced special", () => {
    const costco = history("COST", [
      ["2026-05-01", 1.47],
      ["2026-07-24", 1.47],
      ["2026-10-30", 1.47],
    ]);
    // A $15 special announced about two weeks before the next regular ex-date would be due.
    const stock = planStock(
      holding("COST", { history: costco, announced: [{ exDate: "2027-01-15", payDate: "2027-01-29", amount: 15 }] }),
      TODAY,
    );
    const special = stock.payments.find((p) => p.special);
    expect(special).toMatchObject({ perShare: 15, status: "confirmed" });
    expect(stock.payments.some((p) => !p.special && p.exDate === "2027-01-30")).toBe(true);
    // Yields describe the regular dividend only.
    expect(stock.regularPerShare).toBeCloseTo(stock.perShare - 15);
    expect(stock.yieldOnPrice).toBeCloseTo((stock.regularPerShare / 100) * 100);
  });

  it("never counts a stock it cannot plan as zero income", () => {
    expect(planStock(holding("ZZZZ"), TODAY).income).toBeNull();
    expect(planStock(holding("X", { history: history("X", [["2025-01-10", 0.5], ["2025-04-10", 0.5]]) }), TODAY).income).toBeNull();
    expect(planStock(holding("AMZN", { history: history("AMZN", [], { frequency: "none", perYear: null }) }), TODAY).income).toBe(0);
    // The unknown stock's cost does not drag the yield on cost down.
    const plan = buildDividendPlan([holding("MSFT", { history: MSFT, avgCost: 50 }), holding("ZZZZ", { shares: 1000, avgCost: 10 })], TODAY);
    expect(plan.costBasis).toBe(500);
  });

  it("leaves real estate trusts out of the payout warning", () => {
    expect(planStock(holding("O", { history: MSFT, payout: 250, sector: "Real Estate" }), TODAY).atRisk).toBe(false);
    expect(planStock(holding("O", { history: MSFT, payout: 250, sector: "Utilities" }), TODAY).atRisk).toBe(true);
  });

  it("names every month that ties for the biggest", () => {
    const plan = buildDividendPlan([holding("MSFT", { history: MSFT, shares: 30 })], TODAY);
    const text = buildDividendRead(plan)!.insights.find((i) => i.id === "month-top")!.text;
    expect(text).toBe("December, March, June and September are your biggest months, with about $27 each. 8 of the 12 months have nothing expected.");
  });

  it("puts missing share counts ahead of the other points", () => {
    const plan = buildDividendPlan(
      [
        holding("MSFT", { history: MSFT, shares: 30, avgCost: 50 }),
        holding("KO", { history: history("KO", [["2026-03-13", 0.51], ["2026-06-13", 0.51], ["2026-09-12", 0.51]], { yearAgoAmount: 0.485 }), shares: null }),
      ],
      TODAY,
    );
    const ids = buildDividendRead(plan)!.insights.map((i) => i.id);
    expect(ids[0]).toBe("missing-shares");
  });

  it("writes split-adjusted amounts with enough digits", () => {
    const nvda = history("NVDA", [["2025-12-04", 0.004], ["2026-03-11", 0.004], ["2026-06-04", 0.01], ["2026-09-10", 0.01]], { yearAgoAmount: 0.004 });
    const read = buildDividendRead(buildDividendPlan([holding("NVDA", { history: nvda, shares: 100 })], TODAY))!;
    const raise = read.insights.find((i) => i.id === "raise-NVDA");
    expect(raise?.text).toBe("NVDA raised its dividend from $0.004 to $0.01 a share over the past year.");
  });
});

describe("formatting and parsing", () => {
  it("formats dollars and lists", () => {
    expect(fmtDollars(1243.4)).toBe("$1,240");
    expect(fmtDollars(29.4)).toBe("$29");
    expect(fmtDollars(4.8)).toBe("$4.80");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(joinNames(["A"])).toBe("A");
  });

  it("parses the stored documents and drops bad rows", () => {
    const parsed = parseHistoryDoc({
      symbol: "msft",
      payments: [{ ex_date: "2026-08-20", amount: 0.91 }, { ex_date: "bad", amount: 1 }, { ex_date: "2026-05-21", amount: 0.91, special: true }, null],
      frequency: "quarterly",
      per_year: 4,
      latest_amount: 0.91,
      year_ago_amount: 0.83,
      pay_lag_days: 21,
      fetched_at: "2026-11-11T00:00:00Z",
    });
    expect(parsed?.symbol).toBe("MSFT");
    expect(parsed?.payments).toEqual([
      { exDate: "2026-05-21", amount: 0.91, special: true },
      { exDate: "2026-08-20", amount: 0.91, special: false },
    ]);
    expect(parseHistoryDoc({ symbol: "X" })).toBeNull();
    expect(parseHistoryDoc({ symbol: "X", payments: [], frequency: "weird" })?.frequency).toBe("none");
    expect(parseAnnouncedRow({ kind: "dividend", ticker: "msft", date: "2026-11-19", payment_date: "2026-12-10", amount: 0.98 })).toEqual({
      ticker: "MSFT",
      exDate: "2026-11-19",
      payDate: "2026-12-10",
      amount: 0.98,
    });
    expect(parseAnnouncedRow({ kind: "dividend", ticker: "X", date: "2026-11-19", amount: 0.98, superseded: true })).toBeNull();
    expect(parseAnnouncedRow({ kind: "ipo", ticker: "X", date: "2026-11-19", amount: 1 })).toBeNull();
  });
});
