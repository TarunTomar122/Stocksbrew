import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/radar-mutations", () => ({ addRadarStock: async () => ({}) }));
vi.mock("@/lib/proposals-server", () => ({
  freshStaleReason: async () => null,
}));

const {
  pickProposals,
  MAX_PENDING,
  MAX_BASKET_WAITING,
  candidates,
  newProposal,
  staleReason,
  wordCount,
  WHY_MAX_WORDS,
  TITLE_MAX_WORDS,
} = await import("@/lib/proposals");
const { decideProposal, BASKET_UNVERIFIED_WORDS } =
  await import("@/lib/proposals-actions");
const { basketDrafts, basketStale, basketWaiting } =
  await import("./proposals");

import type { ProposalInputs, Proposal } from "@/lib/proposals";
import type { ActionDeps, ProposalStore } from "@/lib/proposals-actions";
import type { BasketChange } from "./model";
import type { ProposalBasket } from "./proposals";

const TODAY = "2026-11-12";
const NOW = new Date("2026-11-12T23:00:00.000Z");

const drop: BasketChange = {
  op: "drop",
  ticker: "NVDA",
  company: "NVIDIA",
  kind: "growth",
  line: "Revenue growth slowed to 71%, from 114%.",
  verdict: "broken",
  signal_id: "growth_slowing",
};
const add: BasketChange = {
  op: "add",
  ticker: "CEG",
  company: "Constellation Energy",
  kind: "growth",
  line: "Revenue growth: +38%, against +22% for GOOGL, the weakest.",
  reason: "Its nuclear plants can power AI campuses.",
  fact: {
    label: "Revenue growth",
    value: 37.9,
    text: "+38%",
    versus: { ticker: "GOOGL", value: 22.1, text: "+22%" },
  },
};

function basket(patch: Partial<ProposalBasket> = {}): ProposalBasket {
  return {
    id: "abc123def456",
    name: "AI power",
    enabled: true,
    tickers: ["NVDA", "GOOGL", "VRT"],
    runs: [
      {
        day: "2026-11-12",
        ran_at: "2026-11-12T22:00:00.000Z",
        changes: [drop, add],
      },
      {
        day: "2026-11-11",
        ran_at: "2026-11-11T22:00:00.000Z",
        changes: [drop],
      },
      { day: "2026-11-10", ran_at: "2026-11-10T22:00:00.000Z", changes: [] },
    ],
    ...patch,
  };
}

const inputs = (baskets: ProposalBasket[] | null): ProposalInputs => ({
  now: NOW,
  today: TODAY,
  plan: "free",
  stocks: [],
  baskets,
});

describe("basket proposals", () => {
  it("drafts a drop and an add from the newest check, within the word budgets, with what was read and checked", () => {
    const drafts = candidates(inputs([basket()])).filter(
      (draft) => draft.kind === "basket_drop" || draft.kind === "basket_add",
    );
    expect(drafts.map((draft) => [draft.kind, draft.title])).toEqual([
      ["basket_drop", "Drop NVDA from “AI power”"],
      ["basket_add", "Add CEG to “AI power”"],
    ]);
    for (const draft of drafts) {
      expect(wordCount(draft.title)).toBeLessThanOrEqual(TITLE_MAX_WORDS);
      expect(draft.why.length).toBe(2);
      for (const line of draft.why)
        expect(wordCount(line)).toBeLessThanOrEqual(WHY_MAX_WORDS);
      expect(draft.read.length).toBeGreaterThanOrEqual(2);
      expect(draft.figures.length).toBeGreaterThanOrEqual(2);
      expect(draft.action).toMatchObject({
        type: "basket_edit",
        basket_id: "abc123def456",
      });
    }
    expect(drafts[0]!.why[0]).toBe("Its growth reason broke today.");
    expect(drafts[1]!.figures).toEqual([
      { label: "Revenue growth, CEG", value: "+38%" },
      { label: "Revenue growth, GOOGL", value: "+22%" },
      { label: "Its reason check", value: "Holds" },
    ]);
  });

  it("keys a change by the first day of its stretch, so the same change on the next day is the same proposal", () => {
    const [first] = basketDrafts([basket()], TODAY);
    const tomorrow = basketDrafts(
      [
        basket({
          runs: [
            {
              day: "2026-11-13",
              ran_at: "2026-11-13T22:00:00.000Z",
              changes: [drop],
            },
            ...basket().runs,
          ],
        }),
      ],
      "2026-11-13",
    );
    expect(first!.event.key).toBe("basket:abc123def456:drop:NVDA:2026-11-11");
    expect(tomorrow[0]!.event.key).toBe(first!.event.key);
  });

  it("proposes nothing for a paused basket, an old check, or a change already made", () => {
    expect(basketDrafts([basket({ enabled: false })], TODAY)).toEqual([]);
    expect(
      basketDrafts(
        [
          basket({
            runs: [{ day: "2026-11-02", ran_at: "", changes: [drop] }],
          }),
        ],
        TODAY,
      ),
    ).toEqual([]);
    expect(
      basketDrafts([basket({ tickers: ["GOOGL", "CEG"] })], TODAY),
    ).toEqual([]);
    expect(basketDrafts(null, TODAY)).toEqual([]);
  });

  it("goes stale when the basket is gone or already has the change, and says nothing without the read", () => {
    const action = basketDrafts([basket()], TODAY)[0]!.action as Extract<
      Proposal["action"],
      { type: "basket_edit" }
    >;
    expect(basketStale(action, [basket()])).toBeNull();
    expect(basketStale(action, [])).toBe("basket_gone");
    expect(basketStale(action, [basket({ tickers: ["VRT"] })])).toBe(
      "basket_already",
    );
    expect(basketStale(action, null)).toBeNull();
    const proposal = newProposal(
      "u1",
      basketDrafts([basket()], TODAY)[0]!,
      NOW,
    );
    expect(staleReason(proposal, inputs([basket({ tickers: ["VRT"] })]))).toBe(
      "basket_already",
    );
  });

  it("accepting edits only the person's own basket and says what it did", async () => {
    const proposal = newProposal(
      "u1",
      basketDrafts([basket()], TODAY)[1]!,
      NOW,
    );
    const docs = new Map([[proposal.id, proposal]]);
    const store: ProposalStore = {
      async claim(uid, id) {
        const found = docs.get(id);
        if (!found || found.uid !== uid) return { kind: "missing" };
        return { kind: "claimed", proposal: found };
      },
      async finish(_uid, id, patch) {
        docs.set(id, { ...docs.get(id)!, ...patch });
      },
    };
    const editBasket = vi.fn(async () => "done" as const);
    const deps = {
      staleNow: async () => null,
      editBasket,
    } as unknown as ActionDeps;
    const outcome = await decideProposal(
      {
        actor: { uid: "u1", email: null, plan: "free" },
        id: proposal.id,
        decision: "accept",
        now: NOW,
      },
      store,
      deps,
    );
    expect(outcome.body).toMatchObject({
      ok: true,
      status: "accepted",
      result: {
        code: "done",
        message: "Added CEG to “AI power”.",
        href: "/agents/baskets/abc123def456",
      },
    });
    expect(editBasket).toHaveBeenCalledWith(
      "u1",
      {
        basket_id: "abc123def456",
        op: "add",
        ticker: "CEG",
        company: "Constellation Energy",
        kind: "growth",
        reason: "Its nuclear plants can power AI campuses.",
      },
      NOW,
    );

    const other = await decideProposal(
      {
        actor: { uid: "someone-else", email: null, plan: "free" },
        id: proposal.id,
        decision: "accept",
        now: NOW,
      },
      store,
      deps,
    );
    expect(other.status).toBe(404);
  });

  it("refuses an add into a full basket and keeps the proposal waiting", async () => {
    const proposal = newProposal(
      "u1",
      basketDrafts([basket()], TODAY)[1]!,
      NOW,
    );
    const store: ProposalStore = {
      claim: async () => ({ kind: "claimed", proposal }),
      finish: async () => undefined,
    };
    const deps = {
      staleNow: async () => null,
      editBasket: async () => "full" as const,
    } as unknown as ActionDeps;
    const outcome = await decideProposal(
      {
        actor: { uid: "u1", email: null, plan: "free" },
        id: proposal.id,
        decision: "accept",
        now: NOW,
      },
      store,
      deps,
    );
    expect(outcome.body).toMatchObject({
      ok: false,
      status: "pending",
      result: { code: "basket_full" },
    });
  });

  it("keeps basket proposals to one per basket and two in all", () => {
    const drafts = [
      ...basketDrafts([basket()], TODAY),
      ...basketDrafts(
        [
          basket({
            id: "second123456",
            tickers: ["AMD", "INTC"],
            runs: [
              { day: TODAY, ran_at: "", changes: [{ ...drop, ticker: "AMD" }] },
            ],
          }),
        ],
        TODAY,
      ),
      ...basketDrafts(
        [
          basket({
            id: "third1234567",
            tickers: ["ARM", "QCOM"],
            runs: [
              { day: TODAY, ran_at: "", changes: [{ ...drop, ticker: "ARM" }] },
            ],
          }),
        ],
        TODAY,
      ),
    ];
    const { fresh } = pickProposals(drafts, [], NOW);
    expect(fresh.map((draft) => `${draft.kind}:${draft.ticker}`)).toEqual([
      "basket_drop:NVDA",
      "basket_drop:AMD",
    ]);
    expect(fresh.length).toBe(MAX_BASKET_WAITING);
  });

  it("lets a stronger draft take a weaker waiting one's place, for its stock or the last slot, and never sets aside one being applied", () => {
    const weak = newProposal("u1", basketDrafts([basket()], TODAY)[0]!, NOW); // basket_drop NVDA, priority 40
    const holding = {
      ...basketDrafts([basket()], TODAY)[0]!,
      kind: "alert_hit" as const,
      event: {
        key: "alert:x",
        kind: "alert_hit" as const,
        at: TODAY,
        refs: [],
      },
      idea: "alert:NVDA:below:150",
      priority: 85,
      action: {
        type: "watch_add" as const,
        ticker: "NVDA",
        instrument_id: "US_NVDA",
      },
    };
    const sameStock = pickProposals([holding], [weak], NOW);
    expect(sameStock.fresh.map((draft) => draft.idea)).toEqual([
      "alert:NVDA:below:150",
    ]);
    expect(sameStock.outranked.map((proposal) => proposal.id)).toEqual([
      weak.id,
    ]);
    // Being applied: it keeps its place.
    expect(
      pickProposals(
        [holding],
        [{ ...weak, status: "applying", updated_at: NOW.toISOString() }],
        NOW,
      ).outranked,
    ).toEqual([]);
    // A stuck accept counts as waiting again, but still is never set aside.
    const stuck = {
      ...weak,
      status: "applying" as const,
      updated_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    };
    expect(pickProposals([holding], [stuck], NOW)).toEqual({
      fresh: [],
      outranked: [],
    });
    // A full queue: the weakest waiting one makes room for a stronger draft, never for a weaker one.
    const full = Array.from({ length: MAX_PENDING }, (_, index) =>
      newProposal(
        "u1",
        {
          ...holding,
          ticker: `T${index}`,
          event: { ...holding.event, key: `k${index}` },
          idea: `i${index}`,
          priority: 50 + index,
        },
        NOW,
      ),
    );
    const stronger = {
      ...holding,
      ticker: "META",
      event: { ...holding.event, key: "meta" },
      idea: "meta",
    };
    const lastSlot = pickProposals([stronger], full, NOW);
    expect(lastSlot.outranked.map((proposal) => proposal.ticker)).toEqual([
      "T0",
    ]);
    expect(pickProposals([{ ...stronger, priority: 10 }], full, NOW)).toEqual({
      fresh: [],
      outranked: [],
    });
  });

  it("says a basket has a proposal waiting only when one really waits in the store", () => {
    const proposal = newProposal(
      "u1",
      basketDrafts([basket()], TODAY)[0]!,
      NOW,
    );
    expect(basketWaiting([proposal], "abc123def456", NOW)).toBe(true);
    expect(
      basketWaiting(
        [{ ...proposal, status: "dismissed" }],
        "abc123def456",
        NOW,
      ),
    ).toBe(false);
    expect(basketWaiting([proposal], "other1234567", NOW)).toBe(false);
    expect(basketWaiting([], "abc123def456", NOW)).toBe(false);
  });

  it("says it could not check the basket, not the price, when the basket read fails on accept", async () => {
    const proposal = newProposal(
      "u1",
      basketDrafts([basket()], TODAY)[1]!,
      NOW,
    );
    const store: ProposalStore = {
      claim: async () => ({ kind: "claimed", proposal }),
      finish: async () => undefined,
    };
    const deps = {
      staleNow: async () => "unverified",
    } as unknown as ActionDeps;
    const outcome = await decideProposal(
      {
        actor: { uid: "u1", email: null, plan: "free" },
        id: proposal.id,
        decision: "accept",
        now: NOW,
      },
      store,
      deps,
    );
    expect(outcome.body.result?.message).toBe(BASKET_UNVERIFIED_WORDS);
    expect(BASKET_UNVERIFIED_WORDS).toBe(
      "Couldn't check the basket; try again in a minute.",
    );
  });

  it("offers to switch an agent back on only when jobs and baskets leave room, and never on a failed baskets read", () => {
    const paused = {
      id: "job123456789",
      name: "Earnings soon",
      enabled: false,
      trigger: {
        type: "event" as const,
        event: "earnings_approaching" as const,
        days_before: 3,
      },
      scope: { kind: "watchlist" as const },
    };
    const base: ProposalInputs = {
      now: NOW,
      today: TODAY,
      plan: "free",
      stocks: [
        { ticker: "NVDA", instrumentId: "US_NVDA", position: "holding" },
      ],
      jobs: [paused],
      upcoming: [
        { ticker: "NVDA", date: "2026-11-16", session: "amc", usualPct: 6 },
      ],
    };
    const resume = (inputs: ProposalInputs) =>
      candidates(inputs).filter((draft) => draft.kind === "agent_resume")
        .length;
    expect(resume({ ...base, baskets: [] })).toBe(1);
    expect(
      resume({ ...base, baskets: [basket(), basket({ id: "second123456" })] }),
    ).toBe(0);
    expect(resume({ ...base, baskets: null })).toBe(0);
  });
});
