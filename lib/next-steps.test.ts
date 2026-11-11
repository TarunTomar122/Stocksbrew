import { describe, expect, it } from "vitest";

import { parseByRules } from "@/lib/agents-plain/parse";
import { buildCatalog } from "@/lib/agents-plain/stocks";
import type { Insight, TheRead } from "@/lib/insights";

import {
  AFFECT_LABEL,
  askHref,
  briefingLead,
  briefingSteps,
  earningsReminder,
  marketTodaySteps,
  portfolioSteps,
  stockCallSteps,
  whyMovedQuestion,
  withStep,
} from "./next-steps";

const catalog = buildCatalog([
  { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
  { ticker: "HIMS", name: "Hims & Hers Health", aliases: ["HIMS"], price: 40 },
]);

/** Every agent link must land on an agent, never on "I can't watch that yet". */
function readsAsOneAgent(href: string) {
  expect(href.startsWith("/agents?q=")).toBe(true);
  const request = decodeURIComponent(href.slice("/agents?q=".length));
  const result = parseByRules(request, catalog, { hidden: [] });
  expect(result.spec.cannot).toEqual([]);
  expect(result.spec.watches).toHaveLength(1);
}

function question(href: string): string {
  expect(href.startsWith("/ask?q=")).toBe(true);
  return new URL(href, "https://example.test").searchParams.get("q") ?? "";
}

const row = (id: string, extra: Partial<Insight> = {}): Insight => ({ id, tone: "flat", text: "x", ...extra });

describe("ask links", () => {
  it("prefills Ask and names the move without a day", () => {
    expect(question(askHref("  What would change your mind on NVDA? "))).toBe("What would change your mind on NVDA?");
    expect(whyMovedQuestion("HIMS", -16.52)).toBe("Why did HIMS fall 16.5%?");
    expect(whyMovedQuestion("NVDA", 3.24)).toBe("Why did NVDA rise 3.2%?");
    expect(whyMovedQuestion("NVDA", null)).toBe("What's behind NVDA's latest move?");
  });
});

describe("earnings reminders", () => {
  it("only offers a reminder that can still fire", () => {
    expect(earningsReminder("NVDA", 10)?.days).toBe(3);
    expect(earningsReminder("NVDA", 4)?.days).toBe(3);
    expect(earningsReminder("NVDA", 3)?.days).toBe(1);
    expect(earningsReminder("NVDA", 2)?.days).toBe(1);
    expect(earningsReminder("NVDA", 1)).toBeNull();
    expect(earningsReminder("NVDA", null)).toBeNull();
    readsAsOneAgent(earningsReminder("NVDA", 10)!.href);
    readsAsOneAgent(earningsReminder("NVDA", 2)!.href);
  });
});

describe("withStep", () => {
  it("fills the first step, then the second, never a third or a repeat", () => {
    const a = { label: "A", href: "/a" };
    const b = { label: "B", href: "/b" };
    expect(withStep(row("x"), a).action).toEqual(a);
    expect(withStep(row("x", { action: a }), b).secondAction).toEqual(b);
    expect(withStep(row("x", { action: a }), a).secondAction).toBeUndefined();
    const full = row("x", { action: a, secondAction: b });
    expect(withStep(full, { label: "C", href: "/c" })).toBe(full);
  });
});

describe("the stock call", () => {
  it("asks what would change our mind when the reader sees the full read", () => {
    const steps = stockCallSteps({ ticker: "nvda", fullRead: true, dayPct: 0.4, earningsInDays: 12 })!;
    expect(steps.ask.map((step) => question(step.href))).toEqual(["What would change your mind on NVDA?", "What are the biggest risks for NVDA right now?"]);
    expect(steps.watch?.label).toBe("Remind me 3 days before earnings");
    readsAsOneAgent(steps.watch!.href);
  });

  it("asks about the move on a big day and watches for big moves without a report ahead", () => {
    const steps = stockCallSteps({ ticker: "NVDA", fullRead: false, dayPct: -4.1, earningsInDays: null })!;
    expect(steps.ask.map((step) => step.label)).toEqual(["How has NVDA done against the S&P 500 this year?", "Why did NVDA fall 4.1%?"]);
    expect(steps.watch?.label).toBe("Tell me when NVDA moves 5% in a day");
    readsAsOneAgent(steps.watch!.href);
  });

  it("offers nothing for a symbol that is not a ticker", () => {
    expect(stockCallSteps({ ticker: "not one", fullRead: true, dayPct: 0, earningsInDays: 5 })).toBeNull();
  });
});

describe("the briefing", () => {
  const lead = { ticker: "HIMS", pct: -16.5 };

  it("picks the biggest move as the lead, as the headline does", () => {
    expect(
      briefingLead([
        { key: "NVDA", ticker: "NVDA", day_change_pct: 3 },
        { key: "__market", ticker: null, day_change_pct: -40 },
        { key: "HIMS", ticker: "HIMS", day_change_pct: -16.5 },
      ]),
    ).toEqual({ ticker: "HIMS", pct: -16.5 });
    expect(briefingLead([])).toBeNull();
  });

  it("puts the lead's steps on its row and asks about your stocks under the headline", () => {
    const read: TheRead = {
      headline: "The S&P 500 fell 0.6% as tech dragged.",
      insights: [row("giants"), row("move-1", { tickers: ["HIMS"], action: { label: "Our view on HIMS", href: "/stock/HIMS" } })],
    };
    const out = briefingSteps(read, { mode: "market", lead })!;
    expect(out.actions).toEqual([{ label: AFFECT_LABEL, href: "/portfolio" }]);
    const story = out.insights[1]!;
    expect(story.action?.label).toBe("Why did it fall?");
    expect(question(story.action!.href)).toBe("Why did HIMS fall 16.5%?");
    expect(story.secondAction?.label).toBe("Watch HIMS for me");
    readsAsOneAgent(story.secondAction!.href);
    expect(out.insights[0]!.action).toBeUndefined();
  });

  it("asks about your stocks on the index line when the headline names the lead", () => {
    const read: TheRead = {
      headline: "Hims & Hers Health fell 16.5%, the biggest move with a confirmed reason.",
      insights: [row("index"), row("move-1", { tickers: ["HIMS"], action: { label: "Our view on HIMS", href: "/stock/HIMS" } })],
    };
    const out = briefingSteps(read, { mode: "market", lead })!;
    expect(out.actions).toBeUndefined();
    expect(out.insights[0]!.action).toEqual({ label: AFFECT_LABEL, href: "/portfolio" });
    expect(out.insights[1]!.secondAction?.label).toBe("Watch HIMS for me");
  });

  it("puts the lead's steps under a headline that tells the story, and the question on the index line", () => {
    const read: TheRead = {
      headline: "Hims & Hers fell 16.5% after earnings missed.",
      headlineTickers: ["HIMS"],
      insights: [row("index"), row("move-2", { tickers: ["NVDA"], action: { label: "Our view on NVDA", href: "/stock/NVDA" } })],
    };
    const out = briefingSteps(read, { mode: "market", lead })!;
    expect(out.actions?.map((action) => action.label)).toEqual(["Why did it fall?", "Watch HIMS for me"]);
    expect(out.insights[0]!.action).toEqual({ label: AFFECT_LABEL, href: "/portfolio" });
    // Other stories keep their own link.
    expect(out.insights[1]!.action?.label).toBe("Our view on NVDA");
    expect(out.insights[1]!.secondAction).toBeUndefined();
  });

  it("adds a question to the moves in your own briefing", () => {
    const read: TheRead = {
      headline: "Your holdings are down 1.2% today.",
      insights: [row("mover-NVDA", { tickers: ["NVDA"], action: { label: "NVDA report", href: "/stock/NVDA" } }), row("decisions", { tickers: ["A", "B"] })],
    };
    const out = briefingSteps(read, { mode: "personal", lead: null })!;
    expect(out.actions).toBeUndefined();
    expect(out.insights[0]!.secondAction?.label).toBe("Ask why it moved");
    expect(out.insights[1]!.action).toBeUndefined();
  });

  it("passes no read through", () => {
    expect(briefingSteps(null, { mode: "market", lead })).toBeNull();
  });
});

describe("the watchlist", () => {
  const positions = [
    { ticker: "NVDA", dayPct: 2.5, nextEarnings: { date: "2026-11-19" } },
    { ticker: "AMD", dayPct: -1, nextEarnings: { date: "2026-11-13" } },
  ];

  it("offers a reminder on the earnings line and a question on the movers line", () => {
    const read: TheRead = {
      headline: "Your holdings rose 1.1% today.",
      insights: [
        row("earnings", { tickers: ["NVDA"], action: { label: "NVDA earnings", href: "/stock/NVDA#earnings" } }),
        row("contributors", { tickers: ["NVDA", "AMD"], action: { label: "Why NVDA moved", href: "/stock/NVDA" } }),
        row("sector", { action: { label: "Analytics", href: "/watchlist?tab=analytics" } }),
      ],
    };
    const out = portfolioSteps(read, { tab: "positions", positions, today: "2026-11-11" })!;
    expect(out.insights[0]!.secondAction?.label).toBe("Remind me 3 days before it reports");
    readsAsOneAgent(out.insights[0]!.secondAction!.href);
    expect(out.insights[1]!.secondAction?.label).toBe("Ask why NVDA rose");
    expect(question(out.insights[1]!.secondAction!.href)).toBe("Why did NVDA rise 2.5%?");
    expect(out.insights[2]!.secondAction).toBeUndefined();
  });

  it("names the stock when the line lists several, and skips a report too close to remind", () => {
    const many = portfolioSteps({ headline: "h", insights: [row("earnings", { tickers: ["AMD", "NVDA"] })] }, { tab: "positions", positions, today: "2026-11-11" })!;
    expect(many.insights[0]!.action?.label).toBe("Remind me the day before AMD reports");
    const close = portfolioSteps({ headline: "h", insights: [row("earnings", { tickers: ["AMD"] })] }, { tab: "watching", positions, today: "2026-11-12" })!;
    expect(close.insights[0]!.action).toBeUndefined();
  });
});

describe("the watchlist's Analytics tab", () => {
  it("leaves its gain-on-cost lines alone, though they share the movers' id", () => {
    const read: TheRead = { headline: "h", insights: [row("contributors", { tickers: ["NVDA", "AMD"] })] };
    const out = portfolioSteps(read, { tab: "analytics", positions: [{ ticker: "NVDA", dayPct: -0.6, nextEarnings: null }], today: "2026-11-11" });
    expect(out).toBe(read);
  });
});

describe("Market today", () => {
  it("asks about your stocks on the top development only", () => {
    const out = marketTodaySteps({ headline: "h", insights: [row("giants", { action: { label: "Biggest companies", href: "/markets" } }), row("sector")] })!;
    expect(out.insights[0]!.secondAction).toEqual({ label: AFFECT_LABEL, href: "/portfolio" });
    expect(out.insights[1]!.action).toBeUndefined();
    expect(marketTodaySteps({ headline: "h", insights: [] })!.insights).toEqual([]);
  });
});
