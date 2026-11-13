import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

const { candidates, pickProposals, newProposal, staleReason, toCard, MAX_BASKET_WAITING, wordCount, TITLE_MAX_WORDS, WHY_MAX_WORDS } = await import("@/lib/proposals");
const { thesisDrafts, triggerOf, HELD_PRIORITY, OTHER_PRIORITY } = await import("./proposals");

import type { ProposalDraft, ProposalInputs } from "@/lib/proposals";
import type { ThesisEvent } from "./model";
import type { ProposalThesis } from "./proposals";

const TODAY = "2026-11-20";
const NOW = new Date("2026-11-20T23:00:00.000Z");

const broke: ThesisEvent = {
  key: "report:VRT:gross_margin:above:35:2026-11-19",
  kind: "report",
  day: TODAY,
  at: "2026-11-19",
  ticker: "VRT",
  text: "VRT's Q4: gross margin 31%, under your 35%.",
  detail: null,
  verdict: "broken",
  source: "Gross margin 31% after the Q4 report, Nov 19 (SEC 8-K)",
  href: "/stock/VRT",
};
const turned: ThesisEvent = { key: `status:${TODAY}`, kind: "status", day: TODAY, at: TODAY, ticker: null, text: "Now under strain: 1 of 3 lines broke.", detail: null, verdict: null, source: "Your thesis check", href: null, status: "strain" };

function thesis(patch: Partial<ProposalThesis["state"]> = {}, rest: Partial<ProposalThesis> = {}): ProposalThesis {
  return {
    id: "abc123def456",
    name: "AI infrastructure",
    enabled: true,
    quotes: {},
    state: {
      day: TODAY,
      checked_at: "2026-11-20T22:00:00.000Z",
      status: "strain",
      status_since: TODAY,
      previous_status: "holds",
      counts: { lines: 3, holds: 2, broke: 1, waiting: 0 },
      affected: ["VRT"],
      events: [turned, broke],
      ...patch,
    },
    ...rest,
  };
}

function inputs(patch: Partial<ProposalInputs> = {}): ProposalInputs {
  return {
    now: NOW,
    today: TODAY,
    plan: "pro",
    stocks: [
      { ticker: "VRT", instrumentId: "US_VRT", position: "holding" },
      { ticker: "NVDA", instrumentId: "US_NVDA", position: "holding" },
    ],
    quotes: { VRT: { price: 200, dayPct: -6.1, at: "2026-11-20T20:00:00Z" }, NVDA: { price: 166, dayPct: 1, at: null } },
    alerts: [],
    theses: [thesis()],
    ...patch,
  };
}

describe("thesis review proposals", () => {
  it("a broken line on a holding drafts a review with an alert under it, sourced to the thesis page first", () => {
    const [draft] = thesisDrafts(inputs());
    expect(draft).toMatchObject({
      kind: "thesis_review",
      ticker: "VRT",
      title: "Review your thesis: set an alert on VRT at $190",
      why: ["VRT's Q4: gross margin 31%, under your 35%.", "“AI infrastructure” is under strain: 2 of 3 lines hold."],
      action: { type: "alert_price", ticker: "VRT", instrument_id: "US_VRT", condition: "below", price: 190, replaces: null },
      priority: HELD_PRIORITY,
      idea: "alert:VRT:below:190",
    });
    expect(draft!.event.key).toBe(`thesis:abc123def456:line:${broke.key}`);
    expect(draft!.event.refs).toContain("basket:abc123def456");
    expect(draft!.read[0]).toEqual({ label: "“AI infrastructure” thesis check", at: "2026-11-20T22:00:00.000Z", href: "/agents/theses/abc123def456" });
    expect(draft!.read[1]).toMatchObject({ label: broke.source, at: "2026-11-19", href: "/stock/VRT" });
    expect(wordCount(draft!.title)).toBeLessThanOrEqual(TITLE_MAX_WORDS);
    expect(draft!.why.every((line) => wordCount(line) <= WHY_MAX_WORDS)).toBe(true);
    // It passes the queue's own word budget and lands in the candidates.
    expect(candidates(inputs()).some((entry) => entry.kind === "thesis_review")).toBe(true);
  });

  it("a worse status on companies the person does not hold drafts a review ranked under every holding proposal", () => {
    const filingEvent: ThesisEvent = { ...broke, key: "filing:MU:mu-q", kind: "filing", ticker: "MU", verdict: null, text: "MU's new 10-Q adds 1 risk.", source: "SEC 10-Q, filed Nov 18", href: "https://www.sec.gov/x" };
    const own = thesis({ affected: ["MU"], counts: { lines: 3, holds: 3, broke: 0, waiting: 0 }, events: [{ ...turned, text: "Now under strain: MU filed new risks." }, filingEvent] }, { quotes: { MU: { price: 800, dayPct: 0.4, at: null } } });
    const [draft] = thesisDrafts(inputs({ theses: [own] }));
    expect(draft).toMatchObject({ ticker: "MU", priority: OTHER_PRIORITY, why: ["MU's new 10-Q adds 1 risk.", "“AI infrastructure” is under strain: 3 of 3 lines hold."] });
    expect(draft!.event.key).toBe(`thesis:abc123def456:status:strain:${TODAY}`);
    expect(OTHER_PRIORITY).toBeLessThan(40);
  });

  it("asks for nothing on a baseline, a better status, an old check, a paused thesis, or without the alerts read", () => {
    const held = new Set(["VRT"]);
    expect(triggerOf(thesis({ events: [{ ...broke, baseline: true }], previous_status: null }), held, TODAY)).toBeNull();
    expect(triggerOf(thesis({ status: "holds", previous_status: "strain", events: [] }), held, TODAY)).toBeNull();
    expect(triggerOf(thesis({ day: "2026-11-10", status_since: "2026-11-10", events: [{ ...broke, day: "2026-11-10" }] }), held, TODAY)).toBeNull();
    // A worse status with no dated evidence behind it (an edit, or what was on file) asks for nothing.
    expect(triggerOf(thesis({ affected: ["MU"], events: [turned] }), held, TODAY)).toBeNull();
    expect(thesisDrafts(inputs({ theses: [thesis({}, { enabled: false })] }))).toEqual([]);
    expect(thesisDrafts(inputs({ alerts: undefined }))).toEqual([]);
  });

  it("moves a live alert under the price instead of adding one, and stays quiet when one already sits at the level", () => {
    const alert = { id: "a1", ticker: "VRT", instrumentId: "US_VRT", kind: "price_threshold", condition: "below" as const, price: 150, live: true, triggered: false, triggeredAt: null, createdAt: "2026-11-01" };
    const [moved] = thesisDrafts(inputs({ alerts: [alert] }));
    expect(moved).toMatchObject({ title: "Review your thesis: move VRT's alert to $190", action: { replaces: { alert_id: "a1", price: 150 } } });
    expect(thesisDrafts(inputs({ alerts: [{ ...alert, price: 190 }] }))).toEqual([]);
  });
});

describe("proposal caps: a thesis takes its basket's slot", () => {
  const basketDraft = (basketId: string, ticker: string, priority = 40): ProposalDraft => ({
    kind: "basket_drop",
    ticker,
    instrument_id: `US_${ticker}`,
    event: { key: `basket:${basketId}:drop:${ticker}:2026-11-20`, kind: "basket_drop", at: TODAY, refs: [`basket:${basketId}`] },
    idea: `basket_drop:${basketId}:${ticker}`,
    title: `Drop ${ticker}`,
    why: ["It broke."],
    does: "Takes it out.",
    read: [],
    figures: [],
    action: { type: "basket_edit", basket_id: basketId, basket_name: "X", op: "drop", ticker, company: null, kind: "growth", reason: null },
    priority,
  });

  it("one proposal per basket: a thesis review and a basket change from the same basket never wait together", () => {
    const review = thesisDrafts(inputs())[0]!;
    const sameBasket = basketDraft("abc123def456", "GOOGL");
    const { fresh } = pickProposals([review, sameBasket], [], NOW);
    expect(fresh.map((draft) => draft.kind)).toEqual(["thesis_review"]);
  });

  it("baskets and theses together stay within the basket cap, and a waiting thesis review counts toward it", () => {
    const review = thesisDrafts(inputs())[0]!;
    const { fresh } = pickProposals([review, basketDraft("b2", "AMD"), basketDraft("b3", "INTC")], [], NOW);
    expect(fresh).toHaveLength(MAX_BASKET_WAITING);
    const waiting = newProposal("u1", review, NOW);
    const next = pickProposals([basketDraft("b2", "AMD"), basketDraft("b3", "INTC")], [waiting], NOW);
    expect(next.fresh).toHaveLength(MAX_BASKET_WAITING - 1);
  });

  it("never crowds out a stronger holding proposal on the same stock", () => {
    const review = thesisDrafts(inputs())[0]!;
    const holding: ProposalDraft = { ...basketDraft("x", "VRT"), kind: "reason_broken", priority: 90, idea: "alert:VRT:below:185", action: { type: "alert_price", ticker: "VRT", instrument_id: "US_VRT", condition: "below", price: 185, replaces: null }, event: { key: "reason:VRT", kind: "reason_broken", at: TODAY, refs: [] } };
    const { fresh } = pickProposals([holding, review], [], NOW);
    expect(fresh.map((draft) => draft.kind)).toEqual(["reason_broken"]);
  });
});

describe("a review goes with its thesis", () => {
  it("is set aside when its thesis is removed or paused, and kept when the theses were not read", () => {
    const review = newProposal("u1", thesisDrafts(inputs())[0]!, NOW);
    expect(staleReason(review, inputs())).toBeNull();
    expect(staleReason(review, inputs({ theses: [] }))).toBe("thesis_gone");
    expect(staleReason(review, inputs({ theses: [thesis({}, { enabled: false })] }))).toBe("thesis_paused");
    expect(staleReason(review, inputs({ theses: undefined }))).toBeNull();
  });

  it("asks for nothing before a thesis's first check", () => {
    expect(thesisDrafts(inputs({ theses: [{ ...thesis(), state: null }] }))).toEqual([]);
  });

  it("keeps its review framing when cards share a heading", () => {
    const card = toCard(newProposal("u1", thesisDrafts(inputs())[0]!, NOW), null);
    expect(card.group).toEqual({ key: "thesis_review", heading: "Review your thesis", short: "Alert at $190" });
  });
});
