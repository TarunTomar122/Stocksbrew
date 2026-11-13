import { describe, expect, it } from "vitest";

import { AGENT_TEMPLATES, parseJobDraft, planMayRun, templateById } from "@/lib/agent-jobs";
import { limitFor } from "@/lib/entitlements";

import { limitWords, MAX_OFFERS, OFFER_CATALOG, pickOffers } from "./agents";
import type { Finding } from "./types";

const mayRunOn = (plan: "free" | "pro") => (template: string) => planMayRun(templateById(template)!.defaults, plan);

function finding(kind: Finding["kind"], ticker: string): Finding {
  return { id: `${kind}:${ticker}`, kind, ticker, figure: "x", figureLabel: "x", tone: "flat", text: "x", lead: "x", day: null, source: "x", href: "/", score: 70, held: true };
}

const base = { existing: [], since: null, hidden: [], findings: [] as Finding[] };

describe("pickOffers", () => {
  it("offers three on Pro, in our default order, with nothing said about a limit", () => {
    const { offers, limitNote } = pickOffers({ ...base, plan: "pro", limit: limitFor("agents", "pro"), running: 0, mayRun: mayRunOn("pro") });
    expect(offers.map((offer) => offer.template)).toEqual(["earnings-ahead", "mover", "sec-filing"]);
    expect(limitNote).toBeNull();
    for (const offer of offers) {
      expect(offer.draft.scope).toEqual({ kind: "watchlist" });
      expect(offer.job).toBeNull();
    }
  });

  it("offers only as many as Free has room for, says the limit once, and never more than the limit", () => {
    const limit = limitFor("agents", "free");
    for (let running = 0; running <= limit + 1; running += 1) {
      const { offers, limitNote } = pickOffers({ ...base, plan: "free", limit, running, mayRun: mayRunOn("free") });
      expect(offers.length).toBe(Math.min(MAX_OFFERS, Math.max(0, limit - running)));
      expect(offers.length + running).toBeLessThanOrEqual(Math.max(limit, running));
      expect(limitNote).toBe(limitWords("free", limit, running));
    }
  });

  it("puts the agent that would have spoken now first, with the stocks it would speak about", () => {
    const findings = [finding("filing", "AMD"), finding("insider", "TSLA"), finding("filing", "NVDA")];
    const { offers } = pickOffers({ ...base, findings, plan: "pro", limit: 20, running: 3, mayRun: () => true });
    expect(offers[0]).toMatchObject({ template: "sec-filing", tickers: ["AMD", "NVDA"] });
    expect(offers.map((offer) => offer.template)).toContain("insider-trade");
  });

  it("never offers a template the person already has, one that is hidden, or one the plan cannot run", () => {
    const { offers } = pickOffers({
      ...base,
      plan: "free",
      limit: 20,
      running: 0,
      existing: [{ id: "a1b2c3d4e5f6", template: "earnings-ahead", enabled: false, created_at: "2026-01-01T00:00:00Z" }],
      hidden: ["mover"],
      mayRun: (template) => template !== "sec-filing",
    });
    expect(offers.map((offer) => offer.template)).toEqual(["call-change", "insider-trade", "buy-zone"]);
  });

  it("keeps an agent made from the first look, with its switch, so it does not vanish once it is on", () => {
    const { offers, limitNote } = pickOffers({
      ...base,
      plan: "free",
      limit: 2,
      running: 2,
      since: "2026-11-13T10:00:00Z",
      existing: [
        { id: "aaaaaaaaaaaa", template: "mover", enabled: true, created_at: "2026-11-13T10:05:00Z" },
        { id: "bbbbbbbbbbbb", template: "weekly-review", enabled: true, created_at: "2026-10-01T00:00:00Z" },
      ],
      mayRun: () => true,
    });
    expect(offers.map((offer) => [offer.template, offer.job])).toEqual([["mover", { id: "aaaaaaaaaaaa", enabled: true }]]);
    expect(limitNote).toBe("Free runs two agents at a time, and both are on.");
  });

  it("each offer is a draft the agents API accepts as it is", () => {
    for (const entry of OFFER_CATALOG) {
      expect(AGENT_TEMPLATES.some((template) => template.id === entry.template)).toBe(true);
      const parsed = parseJobDraft({ template: entry.template, name: entry.name, trigger: entry.trigger, scope: { kind: "watchlist" } }, { hidden: [] });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.draft.scope).toEqual({ kind: "watchlist" });
    }
    const earnings = parseJobDraft({ template: "earnings-ahead", trigger: { days_before: 1 }, scope: { kind: "watchlist" } }, { hidden: [] });
    expect(earnings.ok && earnings.draft.trigger).toEqual({ type: "event", event: "earnings_approaching", days_before: 1 });
    const filings = parseJobDraft({ template: "sec-filing", trigger: { filings: { major: true } }, scope: { kind: "watchlist" } }, { hidden: [] });
    expect(filings.ok && filings.draft.trigger).toEqual({ type: "event", event: "sec_filing", filings: { major: true } });
  });
});

describe("limitWords", () => {
  it("says the limit in plain words", () => {
    expect(limitWords("free", 2, 0)).toBe("Free runs two agents at a time.");
    expect(limitWords("free", 2, 1)).toBe("Free runs two agents at a time, and one is on.");
    expect(limitWords("free", 1, 1)).toBe("Free runs one agent at a time, and yours is on.");
  });
});
