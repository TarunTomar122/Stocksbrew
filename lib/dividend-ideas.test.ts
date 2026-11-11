import { describe, expect, it } from "vitest";

import {
  addSentence,
  buildDividendIdeas,
  factsSentence,
  fillLead,
  fillsSentence,
  parseAmount,
  passesRule,
  payMonthsWords,
  pickFill,
  rankIdeas,
  targetMonths,
  watchLine,
  yearlyPayMonths,
  type IdeaInput,
  type IdeaStock,
} from "./dividend-ideas";
import { buildDividendPlan, planMonths, type DividendHistory, type PlanHoldingInput } from "./dividend-plan";

const TODAY = "2026-11-11";
const MONTHS = planMonths(TODAY); // 2026-11 .. 2027-10

function input(extra: Partial<IdeaInput> = {}): IdeaInput {
  return {
    ticker: "KO",
    name: "Coca-Cola",
    sector: "Consumer Staples",
    price: 78.46,
    perYear: 4,
    latestAmount: 0.51,
    yearAgoAmount: 0.485,
    payout: 62,
    raiseYears: 64,
    call: "Add",
    callReason: "Coca-Cola grew sales 5%.",
    payMonths: ["2026-12", "2027-04", "2027-07", "2027-10"],
    ...extra,
  };
}

function idea(ticker: string, yieldPct: number, payMonths: string[], extra: Partial<IdeaStock> = {}): IdeaStock {
  return {
    ticker,
    name: ticker,
    realEstate: false,
    price: 100,
    annualPerShare: yieldPct,
    yieldPct,
    payout: 50,
    raiseYears: 20,
    call: "Add",
    callReason: null,
    payMonths,
    ...extra,
  };
}

describe("the rule", () => {
  it("takes a steady payer and works out its current yield", () => {
    const stock = passesRule(input())!;
    expect(stock).not.toBeNull();
    expect(stock.yieldPct).toBeCloseTo(2.6, 1);
    expect(stock.annualPerShare).toBeCloseTo(2.04);
  });

  it("leaves out yields outside 2.5% to 7%", () => {
    expect(passesRule(input({ latestAmount: 0.45 }))).toBeNull(); // 2.29%
    expect(passesRule(input({ latestAmount: 1.5, yearAgoAmount: 1.4 }))).toBeNull(); // 7.6%
  });

  it("leaves out a payout of 75% or more, a loss, or no payout at all", () => {
    expect(passesRule(input({ payout: 75 }))).toBeNull();
    expect(passesRule(input({ payout: -20 }))).toBeNull();
    expect(passesRule(input({ payout: null }))).toBeNull();
  });

  it("judges a property trust without the payout test", () => {
    const reit = passesRule(input({ sector: "Real Estate", payout: 160 }))!;
    expect(reit.realEstate).toBe(true);
    expect(reit.payout).toBeNull();
    expect(factsSentence(reit)).toBe("It yields 2.6% at its current rate and has raised its dividend 64 years in a row. As a property trust, it has to pay out most of its income.");
  });

  it("needs ten years of raises, a call that is not Sell some, a cadence and no recent cut", () => {
    expect(passesRule(input({ raiseYears: 9 }))).toBeNull();
    expect(passesRule(input({ raiseYears: null }))).toBeNull();
    expect(passesRule(input({ call: "Trim" }))).toBeNull();
    expect(passesRule(input({ call: null }))).toBeNull();
    expect(passesRule(input({ perYear: null }))).toBeNull();
    expect(passesRule(input({ yearAgoAmount: 0.6 }))).toBeNull();
    expect(passesRule(input({ payMonths: [] }))).toBeNull();
    expect(passesRule(input({ price: null }))).toBeNull();
  });

  it("ranks the highest yield first, then the longer streak", () => {
    const ranked = rankIdeas([idea("A", 3, []), idea("B", 5, []), idea("C", 3, [], { raiseYears: 40 })]);
    expect(ranked.map((s) => s.ticker)).toEqual(["B", "C", "A"]);
  });
});

describe("the words", () => {
  it("says what an amount would add, months in calendar order", () => {
    const ko = passesRule(input({ price: 78, latestAmount: 0.51 }))!;
    expect(addSentence(ko, 1000)).toBe("Putting $1,000 in Coca-Cola would add about $26 a year, paid in Apr, Jul, Oct and Dec.");
    expect(addSentence(ko, 2500)).toBe("Putting $2,500 in Coca-Cola would add about $65 a year, paid in Apr, Jul, Oct and Dec.");
    expect(addSentence(ko, 0)).toBeNull();
  });

  it("says the facts as one sentence", () => {
    expect(factsSentence(passesRule(input())!)).toBe("It yields 2.6% at its current rate, has raised its dividend 64 years in a row and pays out 62% of its profit.");
    // Rounded down, so it never reads 75% under a "less than 75%" rule.
    expect(factsSentence(passesRule(input({ payout: 74.6 }))!)).toMatch(/pays out 74% of its profit\.$/);
  });

  it("reads typed amounts and refuses junk", () => {
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount("$2500")).toBe(2500);
    expect(parseAmount(" 750.50 ")).toBe(751);
    expect(parseAmount("0.4")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });

  it("names twelve months as every month", () => {
    expect(payMonthsWords(MONTHS)).toBe("every month");
    const monthly = passesRule(input({ payMonths: MONTHS }))!;
    expect(addSentence(monthly, 1000)).toMatch(/, paid every month\.$/);
  });
});

/* A plan whose holdings pay in Dec, Mar, Jun, Sep (MSFT-like) and Jan, Apr, Jul, Oct: Nov, Feb, May, Aug are empty. */
function history(symbol: string, exDates: string[]): DividendHistory {
  return {
    symbol,
    payments: exDates.map((exDate) => ({ exDate, amount: 1 })),
    frequency: "quarterly",
    perYear: 4,
    latestAmount: 1,
    yearAgoAmount: null,
    payLagDays: 21,
    fetchedAt: "2026-11-11T00:00:00Z",
  };
}
function holding(ticker: string, h: DividendHistory | null, extra: Partial<PlanHoldingInput> = {}): PlanHoldingInput {
  return { ticker, name: ticker, shares: 10, avgCost: null, price: 100, history: h, announced: [], payout: 50, ...extra };
}
const MSFT = history("MSFT", ["2025-11-20", "2026-02-19", "2026-05-21", "2026-08-20"]); // pays Dec, Mar, Jun, Sep
const JNJ = history("JNJ", ["2025-12-10", "2026-03-10", "2026-06-10", "2026-09-10"]);

describe("the person's months", () => {
  const plan = buildDividendPlan([holding("MSFT", MSFT)], TODAY);

  it("finds the months none of the holdings pays in", () => {
    const target = targetMonths(plan)!;
    expect(target.kind).toBe("empty");
    expect(target.months).toEqual(["2026-11", "2027-01", "2027-02", "2027-04", "2027-05", "2027-07", "2027-08", "2027-10"]);
  });

  it("counts a holding without a share count as paying, so its months are not empty", () => {
    const noShares = buildDividendPlan([holding("MSFT", MSFT, { shares: null })], TODAY);
    expect(targetMonths(noShares)!.months).toHaveLength(8);
  });

  it("falls back to the quiet months when none is empty", () => {
    const quietPlan = buildDividendPlan(
      [
        holding("MSFT", MSFT, { shares: 100 }),
        holding("X", history("X", ["2025-10-03", "2026-01-05", "2026-04-03", "2026-07-03", "2026-10-05"]), { shares: 100 }),
        holding("Y", history("Y", ["2025-10-27", "2026-01-26", "2026-04-27", "2026-07-27", "2026-10-27"]), { shares: 1 }),
      ],
      TODAY,
    );
    expect(targetMonths(quietPlan)).toEqual({ kind: "quiet", months: ["2026-11", "2027-02", "2027-05", "2027-08"] });
    const ideas = buildDividendIdeas(quietPlan, [idea("KO", 3, ["2026-11", "2027-02", "2027-05", "2027-08"]), idea("PEP", 4, ["2027-02"])]);
    expect(fillLead(ideas, false)).toBe("November, February, May and August are your quietest months. These steady payers pay in them.");
    expect(fillsSentence(ideas.fill[0]!.fills, ideas.target)).toBe("That adds to all four quiet months.");
    expect(fillsSentence(ideas.fill[1]!.fills, ideas.target)).toBe("That adds to February.");
  });

  it("returns nothing when every month already brings in money evenly", () => {
    const even = buildDividendPlan([holding("M", { ...history("M", []), payments: [{ exDate: "2026-10-20", amount: 1 }], frequency: "monthly", perYear: 12 })], TODAY);
    expect(targetMonths(even)).toBeNull();
  });
});

describe("filling the months", () => {
  const target = ["2027-02", "2027-05", "2027-08", "2027-11"].map((m) => m.replace("2027-11", "2026-11"));

  it("covers the empty months with as few names as it can, then adds alternatives up to three", () => {
    const pool = [
      idea("FEBQ", 4, ["2026-11", "2027-02", "2027-05", "2027-08"]),
      idea("MARQ", 6, ["2026-12", "2027-03", "2027-06", "2027-09"]),
      idea("ALT", 3, ["2027-02", "2027-08"]),
      idea("ALT2", 5, ["2027-05"]),
    ];
    const { fill, unfilled } = pickFill(target, pool);
    expect(fill.map((s) => s.ticker)).toEqual(["FEBQ", "ALT", "ALT2"]);
    expect(fill[0]!.fills).toEqual(["2026-11", "2027-02", "2027-05", "2027-08"]);
    expect(unfilled).toEqual([]);
  });

  it("stops at six names and says which months stay empty", () => {
    const months = MONTHS;
    const pool = months.slice(0, 10).map((m, i) => idea(`S${i}`, 3, [m]));
    const { fill, unfilled } = pickFill(months, pool);
    expect(fill).toHaveLength(6);
    expect(unfilled).toHaveLength(6);
  });

  it("leaves out stocks already held and keeps the fill names out of the longer list", () => {
    const plan = buildDividendPlan([holding("MSFT", MSFT)], TODAY);
    const pool = [
      idea("MSFT", 6, ["2026-11", "2027-02", "2027-05", "2027-08"]),
      idea("KO", 3, ["2026-11", "2027-02", "2027-05", "2027-08"]),
      idea("PEP", 4, ["2027-01", "2027-04", "2027-07", "2027-10"]),
      idea("VZ", 6, ["2026-12", "2027-03", "2027-06", "2027-09"]),
    ];
    const ideas = buildDividendIdeas(plan, pool);
    expect(ideas.fill.map((s) => s.ticker)).toEqual(["PEP", "KO"]);
    expect(ideas.unfilled).toEqual([]);
    expect(ideas.steady.map((s) => s.ticker)).toEqual(["VZ"]);
    expect(ideas.passed).toBe(4);
    expect(fillLead(ideas, false)).toBe(
      "Nothing is expected in November, January, February, April, May, July, August and October. These steady payers pay in those months, so with them money would come in every month.",
    );
    expect(fillsSentence(ideas.fill[0]!.fills, ideas.target)).toBe("That fills January, April, July and October.");
  });

  it("says when a month stays empty", () => {
    const plan = buildDividendPlan([holding("MSFT", MSFT)], TODAY);
    const ideas = buildDividendIdeas(plan, [idea("KO", 3, ["2026-11", "2027-02", "2027-05", "2027-08"])]);
    expect(fillLead(ideas, false)).toMatch(/every month except January, April, July and October\.$/);
  });

  it("speaks of a portfolio that pays nothing yet", () => {
    const plan = buildDividendPlan([holding("TSLA", { ...history("TSLA", []), frequency: "none", perYear: null, latestAmount: null })], TODAY);
    const ideas = buildDividendIdeas(plan, [idea("A", 3, MONTHS)], { example: true });
    expect(fillLead(ideas, true)).toBe("None of the example's stocks has a payment expected in the next twelve months. Between them, these steady payers would pay in every month.");
    expect(fillsSentence(ideas.fill[0]!.fills, ideas.target)).toBe("That fills all twelve empty months.");
  });
});

describe("the yearly pattern", () => {
  it("keeps a month whose ex-date has passed and fills a payment the planner skipped", () => {
    // Paid Nov 5 (ex Oct 15), then Feb, May, Aug; the history misses the May ex-date.
    const h = history("PNC", ["2025-10-15", "2026-01-15", "2026-07-15", "2026-10-15"]);
    const plan = buildDividendPlan([holding("PNC", h)], TODAY);
    const months = yearlyPayMonths(plan.stocks[0]!.payments, h, TODAY);
    expect(months).toEqual(["2026-11", "2027-02", "2027-05", "2027-08"]);
  });
});

describe("the watch line", () => {
  it("names the person's own payers that might cut", () => {
    const plan = buildDividendPlan(
      [
        holding("MO", MSFT, { payout: 92 }),
        holding("CUT", { ...JNJ, latestAmount: 0.5, yearAgoAmount: 1 }),
        holding("REIT", JNJ, { payout: 150, sector: "Real Estate" }),
      ],
      TODAY,
    );
    expect(watchLine(plan.stocks, false)).toBe(
      "Of the stocks you own, MO pays out 92% of its profit, which leaves its dividend little room if profits fall. CUT cut its dividend from $1.00 to $0.50 a share over the past year.",
    );
    expect(watchLine(buildDividendPlan([holding("OK", MSFT)], TODAY).stocks, true)).toBeNull();
    const stopped = buildDividendPlan([holding("T", history("T", ["2025-01-10", "2025-04-10"]))], TODAY);
    expect(watchLine(stopped.stocks, true)).toBe("In the example portfolio, T has not paid a dividend since Apr 10, 2025.");
  });
});

describe("the yearly pattern, no extra months", () => {
  it("does not add a month next to one already found", () => {
    // Ex-dates near the 10th: a 21-day lag lands Jan 30 one year and May 1 another.
    const h = history("VZ", ["2025-10-09", "2026-01-09", "2026-04-10", "2026-07-10", "2026-10-09"]);
    const plan = buildDividendPlan([holding("VZ", h)], TODAY);
    const months = yearlyPayMonths(plan.stocks[0]!.payments, h, TODAY);
    expect(months.length).toBeLessThanOrEqual(4);
  });
});
