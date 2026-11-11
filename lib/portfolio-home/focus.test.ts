import { describe, expect, it } from "vitest";

import type { Memo } from "@/lib/memo/types";
import { focusHeadline, focusNoticed, leadAction, memoFacts, prioritise, MAX_LEAD } from "@/lib/portfolio-home/focus";
import type { HomeSources, Loaded, Noticed } from "@/lib/portfolio-home/pick";
import { pickQuestions, questionFor, MAX_QUESTIONS } from "@/lib/portfolio-home/questions";

function item(overrides: Partial<Noticed> & Pick<Noticed, "id" | "tool">): Noticed {
  return {
    caption: overrides.tool,
    tone: "flat",
    text: `${overrides.id} text.`,
    evidence: null,
    ticker: null,
    open: { label: "Open it", href: `/portfolio/${overrides.tool}` },
    watch: null,
    priority: 50,
    ...overrides,
  };
}

const memo = item({ id: "memo-2026-W46", tool: "memo", priority: 100 });
const report = item({
  id: "earnings-NVDA",
  tool: "earnings",
  ticker: "NVDA",
  priority: 90,
  needsYou: true,
  open: { label: "Plan earnings season", href: "/portfolio/earnings" },
  watch: { href: "/agents?q=Tell%20me%203%20days%20before%20NVDA%20reports%20earnings", request: "Tell me 3 days before NVDA reports earnings" },
});
const reason = item({ id: "reason-JPM-weaker", tool: "portfolio", ticker: "JPM", priority: 85, needsYou: true, open: { label: "See JPM", href: "/stock/JPM" } });
const trim = item({ id: "ideas-trim-MSFT", tool: "ideas", ticker: "MSFT", priority: 80, needsYou: true, open: { label: "See where to sell some", href: "/portfolio/ideas" } });
const xray = item({ id: "xray-AAPL", tool: "xray", ticker: "AAPL", priority: 75, needsYou: true });
const dividend = item({ id: "dividend-COST-2026-11-13", tool: "dividends", ticker: "COST", priority: 65 });
const stress = item({ id: "stress-worst", tool: "stress", ticker: "AAPL", priority: 50 });

const empty = { state: "empty" } as const;
const sources = (overrides: Partial<HomeSources> = {}): HomeSources => ({ memo: empty, xray: empty, season: empty, dividends: empty, stress: empty, goal: empty, ideas: empty, ...overrides });

describe("prioritise", () => {
  it("leads with at most three changes that need the person, in rank order, each with one step", () => {
    const { lead } = prioritise([memo, report, reason, trim, xray, stress], sources(), "mine");
    expect(lead.map((row) => row.id)).toEqual(["earnings-NVDA", "reason-JPM-weaker", "ideas-trim-MSFT"]);
    expect(lead).toHaveLength(MAX_LEAD);
    expect(lead.every((row) => row.action.label && row.action.href)).toBe(true);
  });

  it("puts everything else behind the fold, and names each tool once", () => {
    const { lead, fold } = prioritise([memo, report, reason, trim, xray, stress], sources(), "mine");
    const leadIds = new Set(lead.map((row) => row.id));
    expect(fold.some((row) => leadIds.has(row.key))).toBe(false);
    // The leftover findings first, then every tool no finding speaks for.
    expect(fold.map((row) => row.key)).toEqual(["memo-2026-W46", "xray-AAPL", "stress-worst", "tool-portfolio", "tool-dividends", "tool-goal", "tool-taxes"]);
    expect(fold[0]!.text).toBe("memo-2026-W46 text.");
    const tools = fold.map((row) => row.tool);
    for (const said of ["memo", "earnings", "ideas", "xray", "stress"]) expect(fold.filter((row) => row.key === `tool-${said}`)).toHaveLength(0);
    expect(tools).toContain("goal");
  });

  it("does not repeat the x-ray's figure under a trim idea, or the tax figure under a tax-loss idea", () => {
    expect(prioritise([trim], sources(), "mine").fold.map((row) => row.key)).not.toContain("tool-xray");
    const loss = item({ id: "ideas-loss-UNH", tool: "ideas", ticker: "UNH", priority: 75, needsYou: true });
    const keys = prioritise([loss], sources(), "mine").fold.map((row) => row.key);
    expect(keys).not.toContain("tool-taxes");
    expect(keys).toContain("tool-xray");
  });

  it("keeps the memo's week on its line in the fold, since a stored memo can be from an older week", () => {
    const old = { ...memo, evidence: "From the memo for the week of Nov 2, written from closes through Nov 6. It lists 1 thing to watch." };
    const [row] = prioritise([report, old], sources(), "mine").fold;
    expect(row!.text).toBe("memo-2026-W46 text. From the memo for the week of Nov 2, written from closes through Nov 6.");
  });

  it("does not let the next dividend take one of the five places", () => {
    const dividendSource = ok<never>({
      plan: { today: "2026-11-11", total: 1, stocks: [{ ticker: "KO", name: "Coca-Cola", next: { payDate: "2026-11-13", payDateKnown: true, amount: 40, perShare: 0.5, status: "confirmed", paid: false } }] },
      read: null,
    });
    const picked = focusNoticed({ memo: empty, xray: empty, season: empty, dividends: dividendSource, stress: empty, ideas: empty }, "mine");
    expect(picked.some((row) => row.tool === "dividends")).toBe(false);
  });

  it("leaves the next dividend to the log and shows the dividends tool instead", () => {
    const { lead, fold } = prioritise([dividend], sources(), "mine");
    expect(lead).toEqual([]);
    expect(fold.map((row) => row.key)).toContain("tool-dividends");
    expect(fold.map((row) => row.key)).not.toContain(dividend.id);
  });

  it("with nothing that needs the person, leads with the top finding alone", () => {
    const { lead, fold } = prioritise([memo, stress], sources(), "example");
    expect(lead.map((row) => row.id)).toEqual(["memo-2026-W46"]);
    expect(lead[0]!.action).toEqual({ label: "Open it", href: "/portfolio/memo", kind: "open" });
    expect(fold[0]!.key).toBe("stress-worst");
  });

  it("sends the example's tax row to the ideas page, where the example's losses are shown", () => {
    const { fold } = prioritise([], sources(), "example");
    expect(fold.find((row) => row.key === "tool-taxes")?.href).toBe("/portfolio/ideas");
    expect(prioritise([], sources(), "mine").fold.find((row) => row.key === "tool-taxes")?.href).toBe("/watchlist/tax");
  });

  it("says plainly when a tool did not answer in time", () => {
    const { fold } = prioritise([], sources({ goal: { state: "slow" } }), "mine");
    expect(fold.find((row) => row.key === "tool-goal")).toMatchObject({ figure: null, text: "Still working this out; open it to see." });
  });
});

describe("leadAction", () => {
  it("offers the agent request on a report coming up, and the page otherwise", () => {
    expect(leadAction(report)).toEqual({ label: "Tell me 3 days before NVDA reports earnings", href: report.watch!.href, kind: "watch" });
    expect(leadAction(reason)).toEqual({ label: "Review JPM", href: "/stock/JPM", kind: "open" });
    expect(leadAction(trim)).toEqual({ label: "See where to sell some", href: "/portfolio/ideas", kind: "open" });
    expect(leadAction({ ...report, watch: null })).toEqual({ label: "Plan earnings season", href: "/portfolio/earnings", kind: "open" });
  });
});

describe("focusHeadline", () => {
  it("counts what needs the person in a short line", () => {
    expect(focusHeadline(0, "mine")).toBe("Nothing needs a decision from you this week.");
    expect(focusHeadline(1, "mine")).toBe("One thing needs you this week.");
    expect(focusHeadline(3, "example")).toBe("Three things in the example need a look this week.");
    expect(focusHeadline(0, "example")).toBe("Nothing in the example needs a decision this week.");
  });
});

/* ── questions ─────────────────────────────────────────────────────────── */

const ok = <T,>(value: unknown): Loaded<T> => ({ state: "ready", value: value as T });

const xraySource = ok<never>({ xray: { companies: [{ ticker: "AAPL" }, { ticker: "MSFT" }, { ticker: "NVDA" }, { ticker: "AMZN" }] } });
const seasonSource = ok<never>({ season: { reporting: [{ ticker: "COST", kind: "holding", next: { date: "2026-12-10" } }] } });

describe("pickQuestions", () => {
  it("asks what the leading findings raise, then the portfolio-wide questions, four at most", () => {
    const questions = pickQuestions({ lead: [report, reason, trim], rest: [], sources: sources({ xray: xraySource, season: seasonSource }), mode: "mine" });
    expect(questions.map((row) => row.question)).toEqual([
      "What should I know before NVDA reports earnings?",
      "What is the latest news on JPM?",
      "What changed in my portfolio since yesterday?",
      "Compare AAPL, MSFT and NVDA on valuation and one-year return.",
    ]);
    expect(questions).toHaveLength(MAX_QUESTIONS);
    expect(questions[0]!.href).toBe("/ask?q=What%20should%20I%20know%20before%20NVDA%20reports%20earnings%3F");
  });

  it("never asks the example about 'my portfolio', which Ask cannot see", () => {
    const questions = pickQuestions({ lead: [reason], rest: [], sources: sources({ xray: xraySource, season: seasonSource }), mode: "example" });
    expect(questions.some((row) => /\bmy\b/i.test(row.question))).toBe(false);
    expect(questions.map((row) => row.question)).toEqual([
      "What is the latest news on JPM?",
      "Compare AAPL, MSFT and NVDA on valuation and one-year return.",
      "What should I know before COST reports earnings?",
      // A news question is already there, so the biggest company gets the S&P 500 one.
      "How has AAPL done against the S&P 500 this year?",
    ]);
  });

  it("asks each question once and skips findings that are not about one stock", () => {
    const questions = pickQuestions({ lead: [trim, { ...trim, id: "ideas-trim-MSFT-2" }], rest: [memo], sources: sources(), mode: "example" });
    expect(questions.map((row) => row.question)).toEqual(["How has MSFT done against the S&P 500 this year?"]);
    expect(questionFor(memo)).toBeNull();
    expect(questionFor({ ...reason, ticker: "not a ticker" })).toBeNull();
  });

  it("has nothing to offer the example with no findings and no data", () => {
    expect(pickQuestions({ lead: [], rest: [], sources: sources(), mode: "example" })).toEqual([]);
  });
});

describe("memoFacts", () => {
  const base = {
    complete: false,
    hurt: [{ id: "sector", kind: "sector", tickers: [], text: "x", card: { figure: "56%", label: "in Technology, against 37% of the S&P 500", sign: null, visual: null } }],
    view: {
      headline: "Down so far",
      portfolioPct: -0.1,
      marketPct: 2,
      curve: [],
      movers: [
        { ticker: "QQQ", name: "QQQ", pct: 2.8, points: 0.6, href: "/x" },
        { ticker: "NVDA", name: "NVIDIA", pct: -9.5, points: -1.4, href: "/y" },
      ],
      calls: [],
      footnote: null,
    },
  } as unknown as Memo;

  it("turns the memo into the week against the S&P 500, the biggest mover and the main risk", () => {
    expect(memoFacts(base)).toEqual([
      { id: "week", caption: "So far this week", figure: "−0.1%", label: "against +2.0% for the S&P 500", tone: "down", ticker: null },
      { id: "driver", caption: "Biggest drag", figure: "−1.4 pts", label: "NVDA fell 9.5% so far this week", tone: "down", ticker: "NVDA" },
      { id: "risk", caption: "Main risk", figure: "56%", label: "in Technology, against 37% of the S&P 500", tone: "flat", ticker: null },
    ]);
  });

  it("says nothing it does not have", () => {
    expect(memoFacts({ ...base, view: null, hurt: [] } as unknown as Memo)).toEqual([]);
  });

  it("drops the 'so far' once the week is done", () => {
    const done = memoFacts({ ...base, complete: true } as unknown as Memo);
    expect(done.find((fact) => fact.id === "driver")?.label).toBe("NVDA fell 9.5%");
    expect(done.find((fact) => fact.id === "week")?.caption).toBe("This week");
  });
});
