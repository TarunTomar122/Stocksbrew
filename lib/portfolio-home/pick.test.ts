import { describe, expect, it } from "vitest";

import { daysUntil, nextPayment, pickNoticed, toolCard, type HomeSources, type Loaded } from "@/lib/portfolio-home/pick";

const TODAY = "2026-11-11";

const ok = <T,>(value: unknown): Loaded<T> => ({ state: "ready", value: value as T });
const empty = { state: "empty" } as const;

function memo(topLine = "Your holdings are up 1.7% so far this week, ahead of the S&P 500's 1.0% rise. Nothing in your stocks needs a decision right now.") {
  return ok<never>({
    mode: "mine",
    memo: { weekKey: "2026-W46", monday: "2026-11-09", friday: "2026-11-13", endDay: "2026-11-10", topLine, week: { tone: "up" }, changed: [], hurt: [{}], look: [] },
    history: [],
    missingWeek: false,
  });
}

function stock(ticker: string, name: string, date: string, weight: number | null) {
  return {
    ticker,
    name,
    kind: "holding",
    fund: false,
    weight,
    next: { date, session: "amc" },
    inWindow: true,
    past: [],
    stats: { count: 0, usual: null, usualKind: "median", vsNormalDay: null, results: 0, biggest: null },
    typicalDayPct: null,
  };
}

function season(stocks: ReturnType<typeof stock>[], mode: "live" | "example" = "live") {
  return ok<never>({ mode, season: { today: TODAY, from: TODAY, to: "2026-12-18", weeks: [], reporting: stocks, later: [], weighted: true }, read: null });
}

function xray(ticker = "AAPL") {
  return ok<never>({
    mode: "live",
    xray: {
      total: 1000,
      funds: [{ status: "ok" }],
      companies: [{ ticker, name: "Apple", pct: 17, direct: 120, directPct: 12, fundPct: 5, viaFunds: 50, via: [{ fund: "QQQ", value: 50 }] }],
      asOfDates: ["2026-09-30"],
    },
    read: { headline: "Once your funds are opened up, Apple is 17% of everything you own, not the 12% you bought.", insights: [], headlineTickers: [ticker] },
  });
}

function ideas(kind: "trim" | "loss" | "quiet", ticker = "AAPL") {
  return ok<never>({
    subject: "mine",
    plan: {
      total: 1000,
      trims: kind === "trim" ? [{ kind: "company", ticker, name: "Apple", sentence: "Selling about 27 Apple shares would bring it from 17% to 10% of your portfolio." }] : [],
      adds: [],
    },
    losses:
      kind === "loss"
        ? [{ ticker: "UNH", name: "UnitedHealth", loss: -800, value: 2000, shares: 5, similar: [], watch: { label: "x", href: "/agents?q=Tell%20me%20if%20UNH%20drops%20below%20%24380" } }]
        : [],
    read: { headline: kind === "quiet" ? "Nothing needs rebalancing." : "Apple is 17% of your portfolio once the funds are counted.", insights: [] },
  });
}

function dividends(payDate = "2026-11-13") {
  return ok<never>({
    plan: {
      today: TODAY,
      total: 1220,
      stocks: [
        { ticker: "KO", name: "Coca-Cola", next: { payDate: "2026-12-01", payDateKnown: true, amount: 40, perShare: 0.51, status: "confirmed", paid: false } },
        { ticker: "COST", name: "Costco", next: { payDate, payDateKnown: true, amount: 10, perShare: 1.3, status: "confirmed", paid: false } },
      ],
    },
    read: { headline: "Your stocks should pay you about $1,220 from November to October.", insights: [] },
  });
}

function stress() {
  return ok<never>({
    mode: "live",
    result: { episodes: [] },
    read: { headline: "In the Covid crash your portfolio would have lost 32%, against 34% for the S&P 500.", insights: [], headlineTickers: ["AAPL"] },
  });
}

function sources(overrides: Partial<HomeSources> = {}): HomeSources {
  return { memo: empty, xray: empty, season: empty, dividends: empty, stress: empty, goal: empty, ideas: empty, ...overrides };
}

describe("pickNoticed", () => {
  it("leads with the memo, ranks the rest and stops at five", () => {
    const items = pickNoticed(
      sources({ memo: memo(), season: season([stock("NVDA", "NVIDIA", "2026-11-17", 11)]), xray: xray("MSFT"), ideas: ideas("trim"), dividends: dividends(), stress: stress() }),
      "mine",
    );
    expect(items.map((item) => item.tool)).toEqual(["memo", "earnings", "ideas", "xray", "dividends"]);
    expect(items[0]!.open.href).toBe("/portfolio/memo");
  });

  it("drops the x-ray when the trim idea is about the same company", () => {
    const items = pickNoticed(sources({ xray: xray("AAPL"), ideas: ideas("trim", "AAPL"), stress: stress() }), "mine");
    expect(items.map((item) => item.tool)).toEqual(["ideas", "stress"]);
  });

  it("offers each watch request once", () => {
    const items = pickNoticed(sources({ ideas: ideas("trim", "AAPL"), stress: stress() }), "mine");
    expect(items[0]!.watch?.request).toBe("Tell me when AAPL moves 5% in a day");
    expect(items[1]!.watch).toBeNull();
  });

  it("lets a quiet 'nothing to rebalance' fill a short list only", () => {
    expect(pickNoticed(sources({ memo: memo(), ideas: ideas("quiet") }), "mine").map((item) => item.tool)).toEqual(["memo", "ideas"]);
    const full = pickNoticed(sources({ memo: memo(), stress: stress(), dividends: dividends(), xray: xray("MSFT"), ideas: ideas("quiet") }), "mine");
    expect(full.map((item) => item.tool)).not.toContain("ideas");
  });

  it("shows nothing for sources that were slow or broke", () => {
    expect(pickNoticed(sources({ memo: { state: "slow" }, stress: { state: "failed" } }), "mine")).toEqual([]);
  });

  it("leaves out 'bought directly' when a company comes only through funds", () => {
    const view = xray("MSFT") as { value: { xray: { companies: Array<Record<string, unknown>> } } };
    view.value.xray.companies[0] = { ...view.value.xray.companies[0], direct: 0, directPct: 0 };
    const [item] = pickNoticed(sources({ xray: view as never }), "mine");
    expect(item!.evidence).toBe("Apple: 5.0% through QQQ. Fund holdings from SEC N-PORT filings as of Sep 30, 2026.");
  });

  it("names the report that matters most and offers a reminder only the agent box can read", () => {
    const [item] = pickNoticed(sources({ season: season([stock("COST", "Costco", "2026-11-12", 4), stock("NVDA", "NVIDIA", "2026-11-17", 11)]) }), "mine");
    expect(item!.text).toBe("NVIDIA's report on Nov 17 after the close matters most: it is 11% of your portfolio.");
    expect(item!.evidence).toContain("Two of your holdings report in the next six weeks.");
    expect(item!.watch).toEqual({ href: "/agents?q=Tell%20me%203%20days%20before%20NVDA%20reports%20earnings", request: "Tell me 3 days before NVDA reports earnings" });
  });

  it("offers the big-move agent when the report is tomorrow, too late for a reminder", () => {
    const [item] = pickNoticed(sources({ season: season([stock("NVDA", "NVIDIA", "2026-11-12", 11)], "example") }), "example");
    expect(item!.text).toBe("NVIDIA reports tomorrow after the close, the only one of the example's holdings to report in the next six weeks, and it is 11% of the example portfolio.");
    expect(item!.watch?.request).toBe("Tell me when NVDA moves 5% in a day");
  });

  it("says the next dividend in dollars with its day", () => {
    const [item] = pickNoticed(sources({ dividends: dividends() }), "example");
    expect(item!.text).toBe("The example's next dividend is about $10 from Costco on Nov 13.");
    expect(item!.evidence).toBe("Your stocks should pay you about $1,220 from November to October.");
    expect(item!.watch).toBeNull();
  });

  it("reuses the tax-loss watch request the ideas loader built", () => {
    const [item] = pickNoticed(sources({ ideas: ideas("loss") }), "mine");
    expect(item!.watch).toEqual({ href: "/agents?q=Tell%20me%20if%20UNH%20drops%20below%20%24380", request: "Tell me if UNH drops below $380" });
  });
});

describe("nextPayment", () => {
  it("picks the earliest payment still to come", () => {
    const plan = (dividends() as { value: { plan: Parameters<typeof nextPayment>[0] } }).value.plan;
    expect(nextPayment(plan)?.stock.ticker).toBe("COST");
    const paid = { ...plan, stocks: plan.stocks.map((s) => (s.ticker === "COST" ? { ...s, next: { ...s.next!, paid: true } } : s)) };
    expect(nextPayment(paid)?.stock.ticker).toBe("KO");
  });
});

describe("toolCard", () => {
  it("says plainly when its source was slow or broke, and never shows a made-up figure", () => {
    expect(toolCard("memo", { memo: { state: "slow" } }, "mine")).toMatchObject({ figure: null, detail: "Still working this out; open it to see." });
    expect(toolCard("stress", { stress: { state: "failed" } }, "mine").figure).toBeNull();
    expect(toolCard("goal", {}, "mine").detail).toBe("Still working this out; open it to see.");
  });

  it("gives each tool one live figure from its own loader", () => {
    expect(toolCard("dividends", { dividends: dividends() }, "mine")).toMatchObject({ figure: "$1,220", href: "/portfolio/dividends" });
    expect(toolCard("xray", { xray: xray() }, "mine").figure).toBe("Apple 17%");
    expect(toolCard("earnings", { season: season([stock("NVDA", "NVIDIA", "2026-11-17", 11)]) }, "mine")).toMatchObject({ figure: "1 report" });
  });
});

describe("daysUntil", () => {
  it("counts whole days", () => {
    expect(daysUntil("2026-11-12", TODAY)).toBe(1);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil("bad", TODAY)).toBe(Number.POSITIVE_INFINITY);
  });
});
