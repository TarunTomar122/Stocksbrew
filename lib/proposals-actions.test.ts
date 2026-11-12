import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/radar-mutations", () => ({ addRadarStock: async () => ({}) }));
vi.mock("@/lib/proposals-server", () => ({ freshStaleReason: async () => null }));

const { decideProposal, claimOf } = await import("./proposals-actions");
const { newProposal } = await import("./proposals");
const { StockAlertError } = await import("@/lib/stock-alerts");
const { AgentJobError } = await import("@/lib/agent-jobs-data");

import type { ActionDeps, ProposalStore } from "./proposals-actions";
import type { Proposal, ProposalAction, ProposalDraft } from "./proposals";

const NOW = new Date("2026-11-12T18:00:00.000Z");
const actor = { uid: "u1", email: "me@example.com", plan: "free" as const };

function draft(action: ProposalAction): ProposalDraft {
  return {
    kind: "alert_hit",
    ticker: "NVDA",
    instrument_id: "US_NVDA",
    event: { key: `k:${JSON.stringify(action)}`, kind: "alert_hit", at: "2026-11-12", refs: [] },
    idea: "i",
    title: "Move NVDA's $142 alert down to $131",
    why: ["Because."],
    does: "Sets it.",
    read: [{ label: "x", at: "2026-11-12", href: null }],
    figures: [],
    action,
    priority: 50,
  };
}

/** An in-memory store with the same claim rule as the real one. */
function fakeStore(proposals: Proposal[]): ProposalStore & { docs: Map<string, Proposal> } {
  const docs = new Map(proposals.map((proposal) => [proposal.id, { ...proposal }]));
  return {
    docs,
    async claim(uid, id, to, now) {
      const proposal = docs.get(id);
      if (!proposal || proposal.uid !== uid) return { kind: "missing" };
      const outcome = claimOf(proposal, now);
      if (outcome !== "claim") return { kind: outcome, proposal: { ...proposal } };
      docs.set(id, { ...proposal, status: to === "dismissed" ? "dismissed" : "applying", updated_at: now.toISOString() });
      return { kind: "claimed", proposal: { ...proposal } };
    },
    async finish(_uid, id, patch) {
      docs.set(id, { ...docs.get(id)!, ...patch });
    },
  };
}

function fakeDeps(overrides: Partial<ActionDeps> = {}): ActionDeps & { calls: string[] } {
  const calls: string[] = [];
  const deps: ActionDeps = {
    createAlert: vi.fn(async (input) => {
      calls.push(`create:${input.kind}:${input.condition ?? ""}:${input.targetPrice ?? ""}`);
      return { alert_id: "new1", kind: input.kind };
    }),
    deleteAlert: vi.fn(async (_uid, id) => {
      calls.push(`off:${id}`);
      return { alert_id: id, active: false };
    }),
    restoreAlert: vi.fn(async (_uid, id) => {
      calls.push(`restore:${id}`);
    }),
    addStock: vi.fn(async (input) => {
      calls.push(`add:${input.instrumentId}:${input.positionType}:${input.move ? "move" : ""}`);
      return { already_tracked: false, position_type: "watchlist", changed: true, research_queued: false, source_version: 2, covered: true } as never;
    }),
    staleNow: vi.fn(async () => null),
    listJobs: vi.fn(async () => []),
    updateJob: vi.fn(async (_uid, jobId, patch) => {
      calls.push(`job:${jobId}:${patch.enabled}`);
      return null;
    }),
    createJob: vi.fn(async (_uid, input) => {
      calls.push(`newjob:${input.template}`);
      return { ...input, id: "job1", uid: "u1", mode: "tell_me", enabled: true, created_at: "", updated_at: "" } as never;
    }),
    ...overrides,
  };
  return Object.assign(deps, { calls });
}

const move: ProposalAction = { type: "alert_price", ticker: "NVDA", instrument_id: "US_NVDA", condition: "below", price: 131, replaces: { alert_id: "old1", price: 142 } };

describe("decideProposal", () => {
  it("accepting sets the new alert, turns the old one off and records the outcome", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const store = fakeStore([proposal]);
    const deps = fakeDeps();
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ ok: true, status: "accepted", result: { ok: true, code: "done", message: "Alert moved: NVDA below $131.", ref: "new1" } });
    expect(deps.calls).toEqual(["create:price_threshold:below:131", "off:old1"]);
    expect(store.docs.get(proposal.id)).toMatchObject({ status: "accepted", decided_at: NOW.toISOString() });
    expect(vi.mocked(deps.createAlert).mock.calls[0]![0]).toMatchObject({ uid: "u1", email: "me@example.com", plan: "free", metadata: { proposal_id: proposal.id } });
  });

  it("accepting twice is a no-op", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const store = fakeStore([proposal]);
    const deps = fakeDeps();
    await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    const again = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(again).toMatchObject({ status: 200, body: { ok: true, status: "accepted", already: true } });
    expect(deps.calls).toHaveLength(2);
  });

  it("a second click while the first accept runs is refused, not applied twice", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const store = fakeStore([proposal]);
    let release: () => void = () => undefined;
    const deps = fakeDeps({
      createAlert: vi.fn(async (input) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { alert_id: "new1", kind: input.kind };
      }),
    });
    const first = decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    await Promise.resolve();
    const second = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(second).toMatchObject({ status: 409, body: { status: "applying" } });
    release();
    expect((await first).body.status).toBe("accepted");
    expect(deps.createAlert).toHaveBeenCalledTimes(1);
  });

  it("a full Free plan keeps the proposal waiting with the limit's own words", async () => {
    const proposal = newProposal("u1", draft({ ...move, replaces: null }), NOW);
    const store = fakeStore([proposal]);
    const message = "Free keeps 5 price alerts and all 5 are set.";
    const deps = fakeDeps({ createAlert: vi.fn(async () => Promise.reject(new StockAlertError(message, "plan_limit", 409))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { ok: false, code: "plan_limit", message } });
    expect(store.docs.get(proposal.id)!.status).toBe("pending");
  });

  it("moving an alert on a full plan frees the old slot first, and puts it back if the new one still fails", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    let tries = 0;
    const deps = fakeDeps({
      createAlert: vi.fn(async (input) => {
        tries += 1;
        if (tries === 1) throw new StockAlertError("full", "plan_limit", 409);
        return { alert_id: "new2", kind: input.kind };
      }),
    });
    const ok = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(ok.body.status).toBe("accepted");
    expect(deps.calls).toEqual(["off:old1"]);

    const failing = fakeDeps({ createAlert: vi.fn(async () => Promise.reject(new StockAlertError("full", "plan_limit", 409))) });
    const failed = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), failing);
    expect(failed.body.status).toBe("pending");
    expect(failing.calls).toEqual(["off:old1", "restore:old1"]);
  });

  it("an alert that already exists counts as done", async () => {
    const proposal = newProposal("u1", draft({ ...move, replaces: null }), NOW);
    const deps = fakeDeps({ createAlert: vi.fn(async () => Promise.reject(new StockAlertError("exists", "alert_exists", 409))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: true, status: "accepted", result: { code: "already" } });
  });

  it("the earnings reminder on Free says Pro in the existing words and stays waiting", async () => {
    const proposal = newProposal("u1", draft({ type: "alert_earnings", ticker: "NVDA", instrument_id: "US_NVDA", report_date: "2026-11-19", label: "Wednesday, after the close" }), NOW);
    const message = "Earnings, call-change and zone alerts are part of Pro.";
    const deps = fakeDeps({ createAlert: vi.fn(async () => Promise.reject(new StockAlertError(message, "pro_required", 403))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { code: "pro_required", message } });
  });

  it("refuses an accept whose facts changed (the price already went past the level), says why, and writes nothing", async () => {
    const proposal = newProposal("u1", draft({ ...move, replaces: null }), NOW);
    const store = fakeStore([proposal]);
    const deps = fakeDeps({ staleNow: vi.fn(async () => "price_past_level") });
    const refused = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(refused.body).toMatchObject({ ok: false, status: "expired", result: { code: "stale", message: expect.stringContaining("already past that level") } });
    expect(deps.calls).toEqual([]);
    expect(store.docs.get(proposal.id)).toMatchObject({ status: "expired", expired_reason: "price_past_level" });
  });

  it("never acts on facts it could not check: stays waiting and says so", async () => {
    for (const staleNow of [vi.fn(async () => "unverified"), vi.fn(async () => Promise.reject(new Error("slow")))]) {
      const proposal = newProposal("u1", draft({ ...move, replaces: null }), NOW);
      const store = fakeStore([proposal]);
      const deps = fakeDeps({ staleNow });
      const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
      expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { code: "unverified", message: "Couldn't check the latest price; try again in a minute." } });
      expect(deps.calls).toEqual([]);
      expect(store.docs.get(proposal.id)!.status).toBe("pending");
    }
  });

  it("a move whose old alert can't be turned off undoes the new one and refuses", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const store = fakeStore([proposal]);
    const deps = fakeDeps({
      deleteAlert: vi.fn(async (_uid: string, id: string) => {
        if (id === "old1") throw new Error("store down");
        return { alert_id: id, active: false };
      }),
    });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps);
    expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { code: "move_failed" } });
    // The new alert (new1) was turned off again.
    expect(vi.mocked(deps.deleteAlert).mock.calls.map((call) => call[1])).toEqual(["old1", "new1"]);
  });

  it("when neither step can be undone, the card says both alerts are on", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const deps = fakeDeps({ deleteAlert: vi.fn(async () => Promise.reject(new Error("store down"))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: true, status: "accepted", result: { code: "both_live", message: expect.stringContaining("still on too") } });
  });

  it("a move whose old alert is already gone just sets the new one", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const deps = fakeDeps({ deleteAlert: vi.fn(async () => Promise.reject(new StockAlertError("Alert not found.", "alert_not_found", 404))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: true, status: "accepted", result: { code: "done" } });
  });

  it("says accepted when the action ran even if recording it failed, and tries the record twice", async () => {
    const proposal = newProposal("u1", draft({ ...move, replaces: null }), NOW);
    const store = fakeStore([proposal]);
    const finish = vi.fn(async () => Promise.reject(new Error("store down")));
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, { ...store, finish }, fakeDeps());
    expect(outcome).toMatchObject({ status: 200, body: { ok: true, status: "accepted" } });
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("adds a flagged stock to Watching", async () => {
    const proposal = newProposal("u1", draft({ type: "watch_add", ticker: "PLTR", instrument_id: "US_PLTR" }), NOW);
    const deps = fakeDeps();
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: true, result: { message: "Added PLTR to Watching." } });
    expect(deps.calls).toEqual(["add:US_PLTR:watchlist:"]);
  });

  it("turning an agent on past the plan's limit keeps it waiting with the limit's words", async () => {
    const proposal = newProposal("u1", draft({ type: "agent_enable", job_id: "job123456", job_name: "Earnings coming up", enabled: true }), NOW);
    const message = "Your plan runs 2 agents at a time. Pause another to run this one.";
    const deps = fakeDeps({ updateJob: vi.fn(async () => Promise.reject(new AgentJobError(message, 409, "agents"))) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { code: "agents", message } });
    expect(vi.mocked(deps.updateJob).mock.calls[0]!.slice(3)).toEqual([NOW, 2, "free"]);
  });

  it("a new agent saved paused by the plan says so; an existing one is not made twice", async () => {
    const action: ProposalAction = { type: "agent_create", template: "sec-filing", name: "New SEC filings from my names", trigger: { type: "event", event: "sec_filing" }, scope: { kind: "watchlist" } };
    const proposal = newProposal("u1", draft(action), NOW);
    const paused = fakeDeps({ createJob: vi.fn(async (_uid, input) => ({ ...input, id: "job2", enabled: false }) as never) });
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), paused);
    expect(outcome.body).toMatchObject({ ok: true, result: { code: "saved_paused", message: expect.stringContaining("Saved and paused") } });

    const exists = fakeDeps({ listJobs: vi.fn(async () => [{ id: "job3", name: "Filings", template: "sec-filing", trigger: { type: "event", event: "sec_filing" } }] as never) });
    const again = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), exists);
    expect(again.body).toMatchObject({ ok: true, result: { code: "already" } });
    expect(exists.createJob).not.toHaveBeenCalled();
  });

  it("the practice ticket only opens the page: nothing is written, nothing is traded", async () => {
    const proposal = newProposal("u1", draft({ type: "practice_ticket", ticker: "NVDA", side: "buy" }), NOW);
    const deps = fakeDeps();
    const outcome = await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: true, status: "accepted", result: { code: "opened", href: "/practice?symbol=NVDA&side=buy#ticket" } });
    expect(deps.calls).toEqual([]);
  });

  it("dismissing writes nothing but the proposal, and is idempotent", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const store = fakeStore([proposal]);
    const deps = fakeDeps();
    expect((await decideProposal({ actor, id: proposal.id, decision: "dismiss", now: NOW }, store, deps)).body).toMatchObject({ ok: true, status: "dismissed" });
    expect((await decideProposal({ actor, id: proposal.id, decision: "dismiss", now: NOW }, store, deps)).body).toMatchObject({ ok: true, already: true });
    expect((await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, store, deps)).status).toBe(409);
    expect(deps.calls).toEqual([]);
  });

  it("an expired or someone else's proposal is never applied", async () => {
    const proposal = newProposal("u1", draft(move), new Date(NOW.getTime() - 8 * 86_400_000));
    const deps = fakeDeps();
    expect((await decideProposal({ actor, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps)).status).toBe(410);
    const theirs = newProposal("u2", draft(move), NOW);
    expect((await decideProposal({ actor, id: theirs.id, decision: "accept", now: NOW }, fakeStore([theirs]), deps)).status).toBe(404);
    expect(deps.calls).toEqual([]);
  });

  it("an account without an email cannot set an alert", async () => {
    const proposal = newProposal("u1", draft(move), NOW);
    const deps = fakeDeps();
    const outcome = await decideProposal({ actor: { ...actor, email: null }, id: proposal.id, decision: "accept", now: NOW }, fakeStore([proposal]), deps);
    expect(outcome.body).toMatchObject({ ok: false, status: "pending", result: { code: "no_email" } });
    expect(deps.calls).toEqual([]);
  });
});
