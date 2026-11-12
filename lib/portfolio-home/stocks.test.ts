import { describe, expect, it } from "vitest";

import { buildPortfolio, type DailySeries, type PortfolioRowInput } from "@/lib/portfolio-shared";
import { bookLead, callLevel, extraFacts, firstSentence, leadHeadline, monthMoves, monthWords, signedDollars, signedPct, stockCards, stockFacts, weekMove, type BookSource, type CallInfo } from "@/lib/portfolio-home/stocks";

const TODAY = "2026-11-11";

function row(ticker: string, price: number, dayPct: number | null): PortfolioRowInput {
  return { instrument_id: `US_${ticker}`, ticker, name: ticker, sector: "Technology", kind: "holding", price, day_change_pct: dayPct, stance: null };
}

function portfolio(options: { shares?: boolean; earnings?: Record<string, string> } = {}) {
  const rows = [row("NVDA", 200, 4), row("AAPL", 100, -1), row("MSFT", 50, 0.5)];
  const holdings = options.shares === false ? {} : { US_NVDA: { quantity: 10, average_cost: 150 }, US_AAPL: { quantity: 10, average_cost: 120 }, US_MSFT: { quantity: 10 } };
  const earnings = new Map(Object.entries(options.earnings ?? {}).map(([ticker, date]) => [ticker, { date, time: "amc" as const }]));
  return buildPortfolio({ rows, holdings, earnings, today: TODAY });
}

function source(overrides: Partial<BookSource> = {}, facts: Partial<BookSource["facts"]> = {}): BookSource {
  return {
    mode: "mine",
    today: TODAY,
    portfolio: portfolio(),
    pricesDay: TODAY,
    marketPct: 1,
    week: null,
    facts: { calls: {}, moves: {}, callChanges: {}, insiderBuys: {}, ...facts },
    ...overrides,
  };
}

const NONE = { reasons: [], ideas: [] };

describe("formatting", () => {
  it("signs percents and dollars with a real minus", () => {
    expect(signedPct(1.234)).toBe("+1.2%");
    expect(signedPct(-0.04)).toBe("+0.0%");
    expect(signedPct(-2.5, 2)).toBe("−2.50%");
    expect(signedDollars(1240)).toBe("+$1,240");
    expect(signedDollars(-12.4)).toBe("−$12.40");
  });

  it("keeps a short first sentence and drops a long one", () => {
    expect(firstSentence("Sales grew 18%. It trades at 23 times earnings.")).toBe("Sales grew 18%.");
    expect(firstSentence("U.S. Steel sales fell. Then more.")).toBe("U.S. Steel sales fell.");
    expect(firstSentence("x".repeat(200))).toBeNull();
    expect(firstSentence(null)).toBeNull();
  });
});

describe("the call's level", () => {
  const call = (overrides: Partial<CallInfo>): CallInfo => ({ call: "Add", addBelow: null, trimAbove: null, reason: null, ...overrides });
  it("shows only the level that goes with the call", () => {
    expect(callLevel(call({ addBelow: 180 }), 190)).toBe("below $180");
    expect(callLevel(call({ call: "Trim", trimAbove: 240 }), 230)).toBe("above $240");
    expect(callLevel(call({ call: "Hold", addBelow: 180 }), 190)).toBeNull();
    expect(callLevel(call({ call: "Add", trimAbove: 240 }), 230)).toBeNull();
  });
  it("leaves out a level more than half the price away", () => {
    expect(callLevel(call({ addBelow: 50 }), 190)).toBeNull();
  });
});

describe("the one thing per stock", () => {
  it("puts a report this week first", () => {
    const book = source({ portfolio: portfolio({ earnings: { AAPL: "2026-11-12" } }) }, { moves: { NVDA: "Raised its outlook" } });
    const cards = stockCards(book, NONE);
    expect(cards[0]!.ticker).toBe("AAPL");
    expect(cards[0]!.fact?.text).toBe("Reports tomorrow, after the close.");
    expect(cards[1]!.ticker).toBe("NVDA");
    expect(cards[1]!.fact?.text).toBe("Raised its outlook.");
  });

  it("drops a call change that does not match the call on the card", () => {
    const calls: Record<string, CallInfo> = { AAPL: { call: "Hold", addBelow: null, trimAbove: null, reason: null } };
    const stale = stockCards(source({}, { calls, callChanges: { AAPL: { day: "2026-11-11", from: "Keep", to: "Sell some" } } }), NONE).find((card) => card.ticker === "AAPL")!;
    expect(stale.fact?.kind).not.toBe("call");
    const fresh = stockCards(source({}, { calls, callChanges: { AAPL: { day: "2026-11-11", from: "Buy more", to: "Keep" } } }), NONE).find((card) => card.ticker === "AAPL")!;
    expect(fresh.fact?.text).toBe("Our call moved from Buy more to Keep on Nov 11.");
  });

  it("names a big move only with a confirmed reason, and only when it is big", () => {
    const small = stockCards(source({}, { moves: { MSFT: "Something happened" } }), NONE).find((card) => card.ticker === "MSFT")!;
    expect(small.fact?.kind).not.toBe("move");
  });

  it("never puts a tax-loss sale beside a Keep or Buy more call", () => {
    const calls: Record<string, CallInfo> = { AAPL: { call: "Hold", addBelow: null, trimAbove: null, reason: null } };
    const keep = stockCards(source({}, { calls }), { reasons: [], ideas: [{ ticker: "AAPL", kind: "loss", loss: -200 }] }).find((card) => card.ticker === "AAPL")!;
    expect(keep.fact?.kind).not.toBe("loss");
    const none = stockCards(source(), { reasons: [], ideas: [{ ticker: "AAPL", kind: "loss", loss: -200 }] }).find((card) => card.ticker === "AAPL")!;
    expect(none.fact?.text).toBe("$200 below what you paid, a loss you could book for tax.");
  });

  it("says when the price is near the call's level", () => {
    const calls: Record<string, CallInfo> = { NVDA: { call: "Add", addBelow: 196, trimAbove: null, reason: null } };
    const card = stockCards(source({}, { calls }), NONE).find((one) => one.ticker === "NVDA")!;
    expect(card.call).toBe("Buy more");
    expect(card.level).toBe("below $196");
    expect(card.fact?.text).toBe("2.0% above its buy-more level.");
  });

  it("orders the rest by size and gives a quiet card its share of the money", () => {
    const cards = stockCards(source(), NONE);
    expect(cards.map((card) => card.ticker)).toEqual(["NVDA", "AAPL", "MSFT"]);
    expect(cards[0]!.fact?.text).toBe("Your biggest holding, 57% of your money.");
    expect(cards[2]!.fact?.text).toBe("14% of your money.");
  });

  it("works out gains only where the cost is known", () => {
    const cards = stockCards(source(), NONE);
    expect(cards.find((card) => card.ticker === "NVDA")!.gain).toBe(500);
    expect(cards.find((card) => card.ticker === "MSFT")!.gain).toBeNull();
  });

  it("names the person's reason when the watcher found it weaker", () => {
    const facts = stockFacts({
      position: portfolio().positions.find((position) => position.ticker === "AAPL")!,
      today: TODAY,
      example: false,
      calls: {},
      moves: {},
      callChanges: {},
      insiderBuys: {},
      reasons: [{ ticker: "AAPL", verdict: "weaker", signal: "Sales fell 4% last quarter." }],
      ideas: [],
    });
    expect(facts[0]!.text).toBe("Your reason for owning it is weaker: sales fell 4% last quarter.");
  });

  it("never puts a reason that played out or broke under a Buy more call (rule 9)", () => {
    const position = portfolio({ earnings: { AAPL: "2026-12-01" } }).positions.find((item) => item.ticker === "AAPL")!;
    const base = { position, today: TODAY, example: true, moves: {}, callChanges: {}, insiderBuys: {}, ideas: [] };
    const reasons = [{ ticker: "AAPL", verdict: "played_out" as const, signal: "The stock is no longer cheap against its own past." }];
    const add = stockFacts({ ...base, calls: { AAPL: { call: "Add", addBelow: null, trimAbove: null, reason: null } }, reasons });
    expect(add.map((fact) => fact.kind)).not.toContain("reason");
    // The card takes the next fact instead.
    expect(add[0]!.text).toBe("Next report Dec 1.");
    for (const verdict of ["weaker", "broken"] as const) {
      const out = stockFacts({ ...base, calls: { AAPL: { call: "Add", addBelow: null, trimAbove: null, reason: null } }, reasons: [{ ...reasons[0]!, verdict }] });
      expect(out.map((fact) => fact.kind)).not.toContain("reason");
    }
    const keep = stockFacts({ ...base, calls: { AAPL: { call: "Hold", addBelow: null, trimAbove: null, reason: null } }, reasons });
    expect(keep[0]!.text).toBe("The example's reason for owning it has played out: the stock is no longer cheap against its own past.");
    const sell = stockFacts({ ...base, calls: { AAPL: { call: "Trim", addBelow: null, trimAbove: null, reason: null } }, reasons });
    expect(sell[0]!.kind).toBe("reason");
  });
});

describe("the lead line", () => {
  it("compares the day with the S&P 500", () => {
    expect(leadHeadline({ pct: 1.2, marketPct: 0.4, when: "today", example: false, average: false })).toBe("Your stocks rose 1.2% today, 0.8 points better than the S&P 500.");
    expect(leadHeadline({ pct: -0.5, marketPct: -0.45, when: "today", example: true, average: false })).toBe("The example's stocks fell 0.5% today, in line with the S&P 500.");
    expect(leadHeadline({ pct: 0.3, marketPct: null, when: "on Nov 10", example: false, average: true })).toBe("Your stocks rose 0.3% on average on Nov 10.");
  });

  it("uses dollars with share counts and the plain average without", () => {
    const lead = bookLead(source())!;
    // The day in dollars is each value less what it was before the move.
    expect(lead.today?.dollars).toBeCloseTo(2000 - 2000 / 1.04 + (1000 - 1000 / 0.99) + (500 - 500 / 1.005));
    const bare = bookLead(source({ portfolio: portfolio({ shares: false }) }))!;
    expect(bare.today?.dollars).toBeNull();
    expect(bare.today?.pct).toBeCloseTo((4 - 1 + 0.5) / 3);
    expect(bare.gain).toBeNull();
  });
});

describe("the past week", () => {
  const series = (closes: number[]): DailySeries => ({ dates: ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"], closes });
  it("runs from five sessions back to the prices on screen", () => {
    const positions = portfolio().positions;
    const week = weekMove({
      positions,
      series: new Map([
        ["NVDA", series([180, 180, 190, 190, 190, 195])],
        ["AAPL", series([100, 100, 100, 100, 100, 101])],
        ["MSFT", series([50, 50, 50, 50, 50, 50])],
      ]),
      benchmark: series([100, 100, 101, 101, 101, 102]),
      pricesDay: TODAY,
      marketPct: 1,
    })!;
    // Today is not stored yet, so the week starts four stored sessions back (Nov 4).
    expect(week.from).toBe("2026-11-04");
    expect(week.dollars).toBeCloseTo(10 * (200 - 180));
    expect(week.marketPct).toBeCloseTo((102 * 1.01) / 100 * 100 - 100);
  });

  it("says nothing when the closes cover too little of the money", () => {
    const week = weekMove({ positions: portfolio().positions, series: new Map([["MSFT", series([50, 50, 50, 50, 50, 50])]]), benchmark: series([100, 100, 101, 101, 101, 102]), pricesDay: TODAY, marketPct: 1 });
    expect(week).toBeNull();
  });
});

describe("extraFacts", () => {
  it("keeps tax losses, the biggest company trim, and each reason's first signal", () => {
    const out = extraFacts({
      ideas: { losses: [{ ticker: "mrvl", loss: -124 }], plan: { trims: [{ ticker: "AAPL", kind: "company", before: 12 }, { ticker: "NVDA", kind: "company", before: 24 }, { ticker: "XLK", kind: "sector", before: 40 }] } },
      reasons: [{ ticker: "unh", verdict: "played_out", signals: [{ text: " No longer cheap. " }] }],
    });
    expect(out.ideas).toEqual([
      { ticker: "MRVL", kind: "loss", loss: -124 },
      { ticker: "NVDA", kind: "weight", pct: 24 },
    ]);
    expect(out.reasons).toEqual([{ ticker: "UNH", verdict: "played_out", signal: "No longer cheap." }]);
  });
});

describe("the five-session figure's words", () => {
  it("says trading days when only the five-session move is known, so it is not read as the memo's week so far", () => {
    const rows = [row("NVDA", 200, null), row("AAPL", 100, null)];
    const quiet = buildPortfolio({ rows, holdings: { US_NVDA: { quantity: 10 }, US_AAPL: { quantity: 10 } }, today: TODAY });
    const lead = bookLead(source({ portfolio: quiet, week: { from: "2026-11-04", to: TODAY, pct: -2.3, dollars: -300, marketPct: -0.8 } }))!;
    expect(lead.today).toBeNull();
    expect(lead.headline).toBe("Your stocks fell 2.3% over the past five trading days, 1.5 points worse than the S&P 500.");
  });
});

describe("the past month", () => {
  // 25 stored sessions ending Nov 10; today (Nov 11) is not stored yet.
  const dates = Array.from({ length: 25 }, (_, i) => new Date(Date.UTC(2026, 9, 7 + i)).toISOString().slice(0, 10)).filter((d) => d <= "2026-11-10");
  const flat = (value: number): DailySeries => ({ dates, closes: dates.map(() => value) });
  const ramp = (from: number, to: number): DailySeries => ({ dates, closes: dates.map((_, i) => from + ((to - from) * i) / (dates.length - 1)) });

  it("runs from 21 sessions back to the prices on screen, against SPY on the same days", () => {
    const month = monthMoves({ positions: portfolio().positions, series: new Map([["NVDA", flat(160)], ["AAPL", flat(100)]]), benchmark: flat(100), pricesDay: TODAY, marketPct: 1 });
    expect(month.NVDA!.pct).toBeCloseTo(25);
    expect(month.AAPL!.pct).toBeCloseTo(0);
    expect(month.NVDA!.marketPct).toBeCloseTo(1);
    // No closes for MSFT: left out rather than guessed.
    expect(month.MSFT).toBeUndefined();
  });

  it("says nothing without 21 sessions of the S&P 500", () => {
    const short: DailySeries = { dates: dates.slice(-5), closes: [100, 100, 100, 100, 100] };
    expect(monthMoves({ positions: portfolio().positions, series: new Map([["NVDA", ramp(150, 200)]]), benchmark: short, pricesDay: TODAY, marketPct: 1 })).toEqual({});
  });

  it("says each card's own gap to the market, and flat for no move", () => {
    expect(monthWords({ pct: -7.2, marketPct: -2.3 })).toBe("down 7.2% over the past month, 4.9 points behind the S&P 500");
    expect(monthWords({ pct: 3.6, marketPct: -2.3 })).toBe("up 3.6% over the past month, 5.9 points ahead of the S&P 500");
    expect(monthWords({ pct: 0.02, marketPct: 0.04 })).toBe("flat over the past month, in line with the S&P 500");
    expect(monthWords({ pct: 1.0, marketPct: null })).toBe("up 1.0% over the past month");
    // Half a point either way over a month is in line (VOO against the S&P 500).
    expect(monthWords({ pct: -2.4, marketPct: -2.3 })).toBe("down 2.4% over the past month, in line with the S&P 500");
    expect(monthWords({ pct: -2.9, marketPct: -2.3 })).toBe("down 2.9% over the past month, 0.6 points behind the S&P 500");
  });

  it("fills a quiet card with its weight and month, below the call's own reason", () => {
    const cards = stockCards(source({ month: { MSFT: { pct: -4.1, marketPct: -2.3 } } }), NONE);
    const msft = cards.find((card) => card.ticker === "MSFT")!;
    expect(msft.fact?.kind).toBe("month");
    expect(msft.fact?.text).toMatch(/of your money, down 4\.1% over the past month, 1\.8 points behind the S&P 500\.$/);
  });
});

describe("a bare next-report date", () => {
  it("takes the month with it when it is the card's top fact", () => {
    const cards = stockCards(source({ portfolio: portfolio({ earnings: { MSFT: "2026-12-10" } }), month: { MSFT: { pct: 2.1, marketPct: -1.3 } } }), NONE);
    expect(cards.find((card) => card.ticker === "MSFT")!.fact?.text).toBe("Next report Dec 10; up 2.1% over the past month, 3.4 points ahead of the S&P 500.");
  });
});
