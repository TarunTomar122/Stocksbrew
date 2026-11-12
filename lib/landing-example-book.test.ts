import { describe, expect, it } from "vitest";

import { exampleBookView } from "@/lib/landing-example-book";
import { stockCards, type BookSource, type CallInfo } from "@/lib/portfolio-home/stocks";
import { buildPortfolio, FUNDS_SECTOR, type PortfolioRowInput } from "@/lib/portfolio-shared";

const TODAY = "2026-11-11";

function row(ticker: string, price: number, dayPct: number | null, sector = "Technology"): PortfolioRowInput {
  return { instrument_id: `US_${ticker}`, ticker, name: ticker, sector, kind: "holding", price, day_change_pct: dayPct, stance: null };
}

const call = (word: CallInfo["call"], reason: string | null = null): CallInfo => ({ call: word, addBelow: null, trimAbove: null, reason });

/** The example's shape: seven stocks and two funds, the same share counts as lib/portfolio-data.ts. */
function exampleSource(overrides: Partial<BookSource> = {}): BookSource {
  const rows = [
    row("MSFT", 520.19, -2.43),
    row("AAPL", 354.5, 1.72),
    row("NVDA", 175.53, 3.93),
    row("JPM", 344.44, 0.62, "Financials"),
    row("COST", 1080.57, 0.94, "Consumer Staples"),
    row("XOM", 165.95, 1.09, "Energy"),
    row("UNH", 401.41, -1.32, "Health Care"),
    row("VOO", 694.33, 1.4, FUNDS_SECTOR),
    row("QQQ", 692.21, 2.6, FUNDS_SECTOR),
    // On the watchlist, not held: never counted as a holding.
    { ...row("AMD", 250, 5), kind: "watchlist" as const },
  ];
  const shares: Record<string, number> = { MSFT: 30, AAPL: 55, NVDA: 80, JPM: 28, COST: 7, XOM: 60, UNH: 12, VOO: 40, QQQ: 30 };
  const holdings = Object.fromEntries(Object.entries(shares).map(([ticker, quantity]) => [`US_${ticker}`, { quantity }]));
  return {
    mode: "example",
    today: TODAY,
    portfolio: buildPortfolio({ rows, holdings, today: TODAY }),
    pricesDay: TODAY,
    marketPct: 1.4,
    week: null,
    facts: {
      calls: {
        MSFT: call("Hold", "Microsoft's sales grew 18% over the past year, and it trades at 23 times its past year's earnings."),
        AAPL: call("Add", "Apple's sales grew 15% over the past year, and its report on Nov 2 beat profit forecasts by 3.5%."),
        NVDA: call("Hold", "NVIDIA fell 18% over the past five trading days, far more than other chip stocks (down 3.3%)."),
        JPM: call("Add"),
        COST: call("Add"),
        XOM: call("Add"),
        UNH: call("Add"),
      },
      moves: {},
      callChanges: {},
      insiderBuys: {},
    },
    ...overrides,
  };
}

describe("the home page's example book", () => {
  it("has every holding of the /portfolio example, worth what /portfolio adds up", () => {
    const source = exampleSource();
    const view = exampleBookView(source)!;
    expect(view.rows).toHaveLength(9);
    expect(view.count).toBe("nine holdings");
    expect(view.rows.map((r) => r.ticker)).not.toContain("AMD");
    expect(view.value).toBe(`$${Math.round(source.portfolio.totals.value!).toLocaleString("en-US")}`);
    expect(view.value).toBe("$129,667");
  });

  it("lists the stocks in the order of their /portfolio cards, each with the same line", () => {
    const source = exampleSource();
    const cards = stockCards(source, { reasons: [], ideas: [] });
    const view = exampleBookView(source)!;
    expect(view.rows.map((r) => r.ticker)).toEqual(cards.map((card) => card.ticker));
    expect(view.rows.map((r) => r.line)).toEqual(cards.map((card) => card.fact?.text ?? null));
    expect(view.rows.find((r) => r.ticker === "AAPL")).toMatchObject({ shares: 55, price: 354.5, dayPct: 1.72, call: "Buy more" });
  });

  it("never puts a call word on a fund, even when the research has one for it (judges, ship 44)", () => {
    const source = exampleSource();
    const view = exampleBookView({ ...source, facts: { ...source.facts, calls: { ...source.facts.calls, QQQ: call("Hold"), VOO: call("Hold") } } })!;
    expect(view.rows.find((r) => r.ticker === "QQQ")?.call).toBeNull();
    expect(view.rows.find((r) => r.ticker === "VOO")?.call).toBeNull();
    expect(view.calls).toBe("We'd buy more of five and keep two.");
  });

  it("rounds the day's move the way /portfolio does, and says the calls once", () => {
    const view = exampleBookView(exampleSource())!;
    expect(view.day?.text).toMatch(/^[+−]\d+\.\d%$/);
    expect(view.day?.when).toBe("today");
    expect(view.calls).toBe("We'd buy more of five and keep two.");
    // Funds carry no call of ours, so nothing is pending.
    expect(view.pending).toBe("");
  });

  it("says a stock with no call once, and names a past price day", () => {
    const source = exampleSource({ pricesDay: "2026-11-10", today: TODAY });
    const { NVDA: _drop, ...calls } = source.facts.calls;
    const view = exampleBookView({ ...source, facts: { ...source.facts, calls } })!;
    expect(view.pending).toBe("We have no call on NVDA yet.");
    expect(view.calls).toBe("We'd buy more of five and keep one.");
    expect(view.day?.when).toBe("yesterday");
  });

  it("is null with nothing valued, so the page shows its plain line", () => {
    const empty = exampleSource({ portfolio: buildPortfolio({ rows: [], holdings: {}, today: TODAY }) });
    expect(exampleBookView(empty)).toBeNull();
  });
});
