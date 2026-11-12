import { describe, expect, it } from "vitest";

import type { AgentJob } from "@/lib/agent-jobs";

import { MAX_WATCH_AGENTS, jobCovers, suggestWatchAgents, watchStatus } from "./watch-agents";

const MP_WATCH = [
  { date: null, text: "Track whether the reported $3.4 million of insider buying is followed by additional purchases or any insider sales. [S8] [S12]" },
  { date: null, text: "Watch for further evidence that GM-qualified magnet shipments have begun and that Apple-related magnet work advances beyond development. [S16] [S24]" },
  { date: null, text: "Monitor production-cost trends as output rises and the chemical recycling facility comes online. [S20]" },
  { date: null, text: "Watch NdPr sales volumes, separated-product throughput and per-unit costs in the next quarterly filing. [S36]" },
  { date: null, text: "Watch whether the 10X Facility and Independence expansion attract contracted demand without further pressure on cash flow. [S37] [S36]" },
];

function one(text: string, extra: { price?: number | null; ticker?: string; hidden?: string[] } = {}) {
  return suggestWatchAgents({ ticker: extra.ticker ?? "MP", watch: [{ date: null, text }], price: "price" in extra ? extra.price : 60, hidden: extra.hidden });
}

describe("suggestWatchAgents", () => {
  it("maps the MP report's watch list to the insider agent and the 10-Q filing agent, and nothing else", () => {
    const out = suggestWatchAgents({ ticker: "MP", watch: MP_WATCH, price: 60 });
    expect(out.map((item) => [item.template, item.label, item.items])).toEqual([
      ["insider-trade", "Insider trades in MP", [0]],
      ["sec-filing", "MP's next 10-Q", [3]],
    ]);
    expect(out[0]!.draft).toEqual({ template: "insider-trade", name: "Insider trades in MP", trigger: { type: "event", event: "insider_trade" }, scope: { kind: "tickers", tickers: ["MP"] } });
    expect(out[1]!.draft.trigger).toEqual({ type: "event", event: "sec_filing", filings: { forms: ["10-Q"] } });
  });

  it("gives no agent to lines no agent can check", () => {
    for (const text of [
      "Monitor production-cost trends as output rises.",
      "Watch whether demand from EV makers holds up.",
      "Watch whether Congress extends the clean-energy tax credit.",
      "Watch whether management says sales of magnets grow next year.",
      "Watch whether NdPr prices hold above $60 a kilogram.",
      "Watch whether FDA guidance on the trial changes.",
      "Watch for news of the Apple contract.",
    ]) {
      expect(one(text), text).toEqual([]);
    }
  });

  it("reads Congress, funds, earnings and other filing forms", () => {
    expect(one("Watch whether members of Congress disclose trades in MP.")[0]?.template).toBe("congress-trade");
    expect(one("Watch the next 13F filings for hedge funds adding to the stake.")[0]?.template).toBe("fund-filing");
    const earnings = one("Watch the next earnings report on Feb 26 for magnet revenue.")[0];
    expect(earnings?.template).toBe("earnings-ahead");
    expect(earnings?.draft.trigger).toEqual({ type: "event", event: "earnings_approaching", days_before: 3 });
    expect(one("Watch whether the company raises its 2027 guidance.")[0]?.template).toBe("earnings-ahead");
    expect(one("Watch the annual report and any 8-K on the GM deal.")[0]?.draft.trigger).toEqual({ type: "event", event: "sec_filing", filings: { forms: ["8-K", "10-K"] } });
    expect(one("Watch for a share offering to fund the expansion.")[0]?.label).toBe("Share offerings by MP");
    expect(one("Watch new SEC filings for the Apple supply terms.")[0]?.draft.trigger).toEqual({ type: "event", event: "sec_filing" });
  });

  it("an executive needs a share trade next to it", () => {
    expect(one("Watch whether the CEO buys more shares after the dip.")[0]?.template).toBe("insider-trade");
    expect(one("Watch whether the CEO says the company sells more magnets.")).toEqual([]);
  });

  it("reads trade policy and industry talk as nothing an agent watches", () => {
    for (const text of [
      "Watch whether Congress passes new trade tariffs on Chinese magnets.",
      "Lawmakers debating trade restrictions on rare-earth exports [S4].",
      "Senators pushing a trade deal that cuts rare-earth duties.",
      "Industry insiders expect NdPr prices to bottom in 2027.",
    ]) {
      expect(one(text), text).toEqual([]);
    }
    expect(one("Watch whether senators keep trading in MP shares.")[0]?.template).toBe("congress-trade");
  });

  it("takes a price level only when it is the stock's own and near today's price", () => {
    const below = one("Watch whether the stock falls below $45 before the next earnings report.", { price: 60 });
    // The line also names earnings: one agent per line, and earnings comes first in rule order.
    expect(below[0]?.template).toBe("earnings-ahead");
    const level = one("Watch whether MP shares close above $75.", { price: 60 })[0];
    expect(level?.draft.trigger).toEqual({ type: "price", rule: "crosses_above", level: 75 });
    expect(level?.label).toBe("MP above $75");
    expect(one("Watch whether the stock falls below $45.", { price: 60 })[0]?.label).toBe("MP below $45");
    expect(one("Watch whether the stock falls below $45.", { price: null })).toEqual([]);
    expect(one("Watch whether the stock falls below $5.", { price: 60 })).toEqual([]);
    expect(one("Watch whether the stock trades above $600 million in volume.", { price: 60 })).toEqual([]);
    const big = one("Watch whether the stock breaks out over $1,200 on AI demand.", { ticker: "AVGO", price: 1000 })[0];
    expect(big?.draft.trigger).toEqual({ type: "price", rule: "crosses_above", level: 1200 });
    expect(big?.label).toBe("AVGO above $1,200");
  });

  it("names each agent once, lists every line it covers, and stops at the cap", () => {
    const out = suggestWatchAgents({
      ticker: "MP",
      price: 60,
      watch: [
        { date: null, text: "Insider buying [S1]." },
        { date: null, text: "Any insider sales." },
        { date: null, text: "Congress trades in the stock." },
        { date: null, text: "Hedge funds adding." },
        { date: null, text: "The next 10-Q." },
        { date: null, text: "The next earnings call." },
      ],
    });
    expect(out).toHaveLength(MAX_WATCH_AGENTS);
    expect(out[0]!.items).toEqual([0, 1]);
    expect(out.map((item) => item.template)).toEqual(["insider-trade", "congress-trade", "fund-filing", "sec-filing"]);
  });

  it("never offers a template the server hides", () => {
    expect(one("Watch the next earnings report.", { hidden: ["earnings-ahead"] })).toEqual([]);
  });

  it("handles empty and odd input", () => {
    expect(suggestWatchAgents({ ticker: "MP", watch: [] })).toEqual([]);
    expect(suggestWatchAgents({ ticker: "MP", watch: [{ date: null, text: "" }, { date: null, text: "[S1]" }] })).toEqual([]);
    expect(one("Insider buying.", { ticker: "brk.b" })[0]?.draft.scope).toEqual({ kind: "tickers", tickers: ["BRK.B"] });
  });
});

describe("watchStatus", () => {
  const [insider, filing] = suggestWatchAgents({ ticker: "MP", watch: MP_WATCH, price: 60 });
  const job = (patch: Partial<AgentJob>): Pick<AgentJob, "template" | "trigger" | "scope" | "enabled"> => ({
    template: "insider-trade",
    trigger: { type: "event", event: "insider_trade" },
    scope: { kind: "tickers", tickers: ["MP"] },
    enabled: true,
    ...patch,
  });

  it("is watching when a running agent covers the stock, by ticker, by any stock, or by the watchlist it is on", () => {
    expect(watchStatus(insider!, [job({})], "MP", false)).toBe("watching");
    expect(watchStatus(insider!, [job({ scope: { kind: "tickers", tickers: ["NVDA", "mp"] } })], "MP", false)).toBe("watching");
    expect(watchStatus(insider!, [job({ scope: { kind: "watchlist" } })], "MP", true)).toBe("watching");
    expect(watchStatus(insider!, [job({ scope: { kind: "watchlist" } })], "MP", false)).toBe("new");
    expect(watchStatus(insider!, [job({ scope: { kind: "tickers", tickers: ["NVDA"] } })], "MP", false)).toBe("new");
  });

  it("is paused when only a paused agent covers it", () => {
    expect(watchStatus(insider!, [job({ enabled: false })], "MP", false)).toBe("paused");
    expect(watchStatus(insider!, [job({ enabled: false }), job({})], "MP", false)).toBe("watching");
  });

  it("a filing agent covers the 10-Q when it watches every filing or the 10-Q among others", () => {
    const sec = (filings?: object) => job({ template: "sec-filing", trigger: { type: "event", event: "sec_filing", ...(filings ? { filings } : {}) } as AgentJob["trigger"] });
    expect(jobCovers(sec(), filing!, "MP", false)).toBe(true);
    expect(jobCovers(sec({ forms: ["10-Q", "10-K"] }), filing!, "MP", false)).toBe(true);
    expect(jobCovers(sec({ forms: ["8-K"] }), filing!, "MP", false)).toBe(false);
    expect(jobCovers(sec({ major: true }), filing!, "MP", false)).toBe(false);
  });

  it("a different template never covers", () => {
    expect(watchStatus(filing!, [job({})], "MP", false)).toBe("new");
  });
});
