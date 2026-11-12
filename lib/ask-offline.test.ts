import { describe, expect, it } from "vitest";

import { auditNumbers, type AskCard } from "@/lib/ask-cards";
import { ASK_SUGGESTIONS, ASK_TOOL_LABELS, EXPLORE_SUGGESTIONS } from "@/lib/ask-config";
import { OFFLINE_NO_PLAN, describeCard, planOffline, tickersIn, writeOffline } from "@/lib/ask-offline";
import { askSystemPrompt } from "@/lib/ask-prompt";

describe("tickersIn", () => {
  it("reads symbols, cashtags and well-known names in the order written", () => {
    expect(tickersIn("Compare Microsoft, Alphabet and Amazon")).toEqual(["MSFT", "GOOGL", "AMZN"]);
    expect(tickersIn("How is $PLTR doing vs NVDA?")).toEqual(["PLTR", "NVDA"]);
    expect(tickersIn("What is the P/E of the S&P today, and why?")).toEqual([]);
  });
});

describe("planOffline", () => {
  it("plans a stock lookup with history when asked how it has done", () => {
    expect(planOffline("How has Nvidia done over the last year?")).toEqual([
      { tool: "get_stock", input: { ticker: "NVDA" } },
      { tool: "get_price_history", input: { ticker: "NVDA", period: "1y" } },
    ]);
  });

  it("plans a comparison, a backtest and a basket", () => {
    expect(planOffline("Compare Microsoft, Alphabet and Amazon on valuation")).toEqual([{ tool: "compare_stocks", input: { tickers: ["MSFT", "GOOGL", "AMZN"] } }]);
    expect(planOffline("How would an equal mix of AAPL, MSFT and NVDA have done against the S&P 500 since 2019?")).toEqual([
      { tool: "run_backtest", input: { holdings: [{ ticker: "AAPL" }, { ticker: "MSFT" }, { ticker: "NVDA" }], start: "2019-01-01", benchmark: "SPY" } },
    ]);
    expect(planOffline("Build me a basket of companies that benefit from power grid spending.")).toEqual([
      { tool: "build_basket", input: { thesis: "companies that benefit from power grid spending" } },
    ]);
    expect(planOffline("Find cheap uranium names")).toEqual([{ tool: "build_basket", input: { thesis: "cheap uranium names" } }]);
  });

  it("routes investors, insiders, Congress and the person's own names", () => {
    expect(planOffline("What did Berkshire Hathaway buy and sell in its latest 13F?")).toEqual([{ tool: "get_investor", input: { name: "Berkshire Hathaway" } }]);
    expect(planOffline("Which insiders bought their own stock this month?")).toEqual([{ tool: "get_insider_trades", input: { buys_only: true } }]);
    expect(planOffline("What has Pelosi traded?")[0]).toEqual({ tool: "get_congress_trades", input: { person: "Pelosi" } });
    expect(planOffline("What changed in my portfolio since yesterday?")).toEqual([{ tool: "get_portfolio_changes", input: {} }]);
    expect(planOffline("Show my holdings")).toEqual([{ tool: "get_my_portfolio", input: {} }]);
  });

  it("only ever proposes an action, with the numbers the person gave", () => {
    expect(planOffline("Add NVDA and AMD to my watchlist")).toEqual([{ tool: "propose_watchlist_add", input: { tickers: ["NVDA", "AMD"] } }]);
    expect(planOffline("Set an alert for AAPL below 180")).toEqual([{ tool: "propose_price_alert", input: { ticker: "AAPL", condition: "below", target_price: 180 } }]);
  });

  it("routes questions about the person's own week, reasons, agents, research and reports", () => {
    expect(planOffline("How is my portfolio doing this week?")).toEqual([{ tool: "get_my_week", input: {} }]);
    expect(planOffline("What does my memo say?")).toEqual([{ tool: "get_my_week", input: {} }]);
    expect(planOffline("Which of my reasons are weaker?")).toEqual([{ tool: "get_my_reasons", input: {} }]);
    expect(planOffline("Is my reason for owning NVDA still holding up?")).toEqual([{ tool: "get_my_reasons", input: { ticker: "NVDA" } }]);
    expect(planOffline("What have my agents found?")).toEqual([{ tool: "get_my_agents", input: {} }]);
    expect(planOffline("Summarise my NVDA research")).toEqual([{ tool: "get_my_research", input: { ticker: "NVDA" } }]);
    expect(planOffline("What reports this week for my stocks?")).toEqual([{ tool: "get_earnings", input: { days: 7, mine: true } }]);
  });

  it("offers an agent when asked to keep watching, and never plans one by itself", () => {
    expect(planOffline("Tell me when NVDA drops below 150")).toEqual([{ tool: "suggest_watch", input: { kind: "price_below", ticker: "NVDA", level: 150 } }]);
    expect(planOffline("Remind me before Apple reports")).toEqual([{ tool: "suggest_watch", input: { kind: "earnings_before", ticker: "AAPL" } }]);
    expect(planOffline("Watch NVDA for me")).toEqual([{ tool: "suggest_watch", input: { kind: "daily_move", ticker: "NVDA" } }]);
    expect(planOffline("What should I watch for at NVDA?").some((call) => call.tool === "suggest_watch")).toBe(false);
  });

  it("sets the watch box's buy, sell and call watches when asked to be told", () => {
    expect(planOffline("Tell me when to sell NVDA")).toEqual([{ tool: "suggest_watch", input: { kind: "sell_zone", ticker: "NVDA" } }]);
    expect(planOffline("Let me know when NVDA is a good price to buy")).toEqual([{ tool: "suggest_watch", input: { kind: "buy_zone", ticker: "NVDA" } }]);
    expect(planOffline("Tell me when your call on AMD changes")).toEqual([{ tool: "suggest_watch", input: { kind: "call_change", ticker: "AMD" } }]);
  });

  it("answers 'when should I sell?' with our call, and offers the watch behind one tap", () => {
    expect(planOffline("When should I sell NVDA?")).toEqual([{ tool: "suggest_watch", input: { kind: "sell_zone", ticker: "NVDA", offer: true } }]);
    expect(planOffline("when is a good time to buy AMD")).toEqual([{ tool: "suggest_watch", input: { kind: "buy_zone", ticker: "AMD", offer: true } }]);
    expect(planOffline("When do I take profits on NVDA?")).toEqual([{ tool: "suggest_watch", input: { kind: "sell_zone", ticker: "NVDA", offer: true } }]);
    const zone = { side: "sell" as const, call: "Sell some" as const, level: 250, price: 230, gap_pct: 8.7, locked: false, answer: "Our call on NVIDIA is Sell some at $250. That's 8.7% above its price of $230." };
    const card = { card: "watch" as const, status: "ready" as const, request: "Tell me when to sell NVDA", preview: "x", href: "/agents", existing: [], note: null, zone, offer: "Want me to tell you when it gets there?", source: "", as_of: null };
    expect(writeOffline([card])).toBe(zone.answer);
  });

  it("has no plan for a question it cannot route", () => {
    expect(planOffline("Explain convexity to me")).toEqual([]);
  });

  it("only plans tools that exist, for every suggested prompt", () => {
    for (const question of [...ASK_SUGGESTIONS.map((item) => item.question), ...EXPLORE_SUGGESTIONS]) {
      const plan = planOffline(question);
      expect(plan.length, question).toBeGreaterThan(0);
      for (const call of plan) expect(ASK_TOOL_LABELS, question).toHaveProperty(call.tool);
    }
  });
});

describe("writing from cards", () => {
  const returns = {
    card: "returns",
    ticker: "NVDA",
    period: "1 year",
    from: { date: "2025-11-10", close: 198.5743 },
    to: { date: "2026-11-09", close: 176.7902 },
    return_pct: -10.97,
    annualized_pct: null,
    high: { date: "2026-10-06", close: 239.24 },
    low: { date: "2026-03-30", close: 164.79 },
    max_drawdown_pct: -26.1,
    benchmark: { ticker: "SPY", return_pct: 11.9 },
    adjusted: true,
    points: [],
    source: "Yahoo Finance daily closes",
    as_of: "2026-11-09",
  } as AskCard;

  it("copies every figure from the card, so the audit passes", () => {
    const text = describeCard(returns);
    expect(text).toContain("-10.97%");
    expect(text).toContain("SPY returned +11.90%");
    expect(auditNumbers(text, [returns]).untraced).toEqual([]);
  });

  it("always labels a backtest as simulated", () => {
    const card = {
      card: "backtest",
      simulated: true,
      holdings: [],
      rebalance: "monthly",
      benchmark: "SPY",
      start: "2019-01-02",
      end: "2026-11-09",
      years: 7.9,
      limited_by: null,
      strategy: { total_return_pct: 512.3, annualized_pct: 25.9, volatility_pct: 28, sharpe: 0.9, max_drawdown_pct: -38.2 },
      benchmark_stats: { total_return_pct: 180.4, annualized_pct: 14, volatility_pct: 18, sharpe: 0.7, max_drawdown_pct: -33.7 },
      beat_years: { beat: 6, of: 7 },
      best_year: null,
      worst_year: null,
      cost_bps: 10,
      caveats: [],
      curve: [],
      source: "x",
      as_of: "2026-11-09",
    } as AskCard;
    const text = describeCard(card);
    expect(text.startsWith("Simulated")).toBe(true);
    expect(text).toContain("not a record anyone earned");
  });

  it("says nothing was saved for a proposal", () => {
    const card = { card: "action", action: "add_to_watchlist", status: "needs_confirmation", tickers: ["NVDA"], reason: null, source: "", as_of: null } as AskCard;
    expect(describeCard(card)).toContain("Nothing is saved until you confirm");
  });

  it("falls back to the plain explanation when there is nothing to write from", () => {
    expect(writeOffline([])).toBe(OFFLINE_NO_PLAN);
    expect(writeOffline([{ not: "a card" }])).toBe(OFFLINE_NO_PLAN);
    expect(writeOffline([{ card: "error", message: "We hold no daily price history for ZZZZ." }])).toBe("We hold no daily price history for ZZZZ.");
  });
});

describe("the system prompt", () => {
  const prompt = askSystemPrompt({ signedIn: false, isPro: false, now: new Date("2026-11-09T15:00:00Z") });

  it("carries the number rule, the date and the confirm-first rule", () => {
    expect(prompt).toContain("2026-11-09");
    expect(prompt).toContain("must appear in a tool result");
    expect(prompt).toContain("Never estimate");
    expect(prompt).toContain("Confirm button");
    expect(prompt).toContain("does not place trades");
    expect(prompt).toContain("signed out");
  });

  it("tells a signed-in person's copilot their holdings may be incomplete", () => {
    expect(askSystemPrompt({ signedIn: true, isPro: true, now: new Date() })).toContain("possibly incomplete");
  });
});
