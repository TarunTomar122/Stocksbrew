/**
 * Sign-ups, agents, checkouts and Pro from the real records, not from beacons:
 * new `users` docs by created_at, agent jobs and baskets/theses by owner, and
 * the checkout and conversion events in tm_lifecycle_events. Pure counting
 * here; lib/analytics/store.ts loads the facts. Only uids, dates and counts
 * are read (never an email), and only counts leave this file.
 */

export type UserFact = { uid: string; createdMs: number | null; tracked: number };
export type LifecycleFact = { uid: string; type: string; ms: number; dev: boolean };
export type AgentFact = { uid: string; ms: number | null; kind: "job" | "basket" | "thesis" };

export type RealFacts = {
  users: UserFact[];
  agents: AgentFact[];
  lifecycle: LifecycleFact[];
};

export type FunnelStep = { id: string; label: string; count: number; source: "beacon" | "records" };

export function parseMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object" && value && "_seconds" in value) {
    const seconds = Number((value as { _seconds: unknown })._seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

const inRange = (ms: number | null, start: number, end: number): ms is number => ms != null && ms >= start && ms < end;

/** New accounts in [start, end). */
export function signupsIn(facts: RealFacts, start: number, end: number): UserFact[] {
  return facts.users.filter((user) => inRange(user.createdMs, start, end));
}

/** People who became Pro in [start, end): first paid activation, test activations left out. */
export function proConversionsIn(facts: RealFacts, start: number, end: number): number {
  return new Set(facts.lifecycle.filter((e) => e.type === "subscription_converted" && !e.dev && inRange(e.ms, start, end)).map((e) => e.uid)).size;
}

/** Agents, baskets and theses created in [start, end). */
export function agentsCreatedIn(facts: RealFacts, start: number, end: number): Record<AgentFact["kind"], number> {
  const out = { job: 0, basket: 0, thesis: 0 };
  for (const agent of facts.agents) if (inRange(agent.ms, start, end)) out[agent.kind] += 1;
  return out;
}

/**
 * Visit → sign-in started (beacons: people, not clicks) → signed up → added stocks
 * → switched an agent on → started checkout → Pro. From "signed up" on, every
 * step counts the same people: accounts made in the range, and what they did since.
 */
export function funnel(facts: RealFacts, input: { start: number; end: number; visitors: number; signinStarted: number }): FunnelStep[] {
  const cohort = signupsIn(facts, input.start, input.end);
  const ids = new Set(cohort.map((user) => user.uid));
  const withAgent = new Set(facts.agents.map((agent) => agent.uid).filter((uid) => ids.has(uid)));
  const checkout = new Set(facts.lifecycle.filter((e) => e.type === "checkout_started" && ids.has(e.uid)).map((e) => e.uid));
  const pro = new Set(facts.lifecycle.filter((e) => e.type === "subscription_converted" && !e.dev && ids.has(e.uid)).map((e) => e.uid));
  return [
    { id: "visit", label: "Visited", count: input.visitors, source: "beacon" },
    { id: "signin", label: "Started sign-in", count: input.signinStarted, source: "beacon" },
    { id: "signup", label: "Signed up", count: cohort.length, source: "records" },
    { id: "stocks", label: "Added stocks", count: cohort.filter((user) => user.tracked > 0).length, source: "records" },
    { id: "agent", label: "Switched an agent on", count: withAgent.size, source: "records" },
    { id: "checkout", label: "Started checkout", count: checkout.size, source: "records" },
    { id: "pro", label: "Went Pro", count: pro.size, source: "records" },
  ];
}

/** Share of the step before that reached this one, or null for the first step or an empty one before it. */
export function stepRates(steps: readonly FunnelStep[]): Array<number | null> {
  return steps.map((step, index) => {
    if (index === 0) return null;
    const before = steps[index - 1]!.count;
    return before > 0 ? step.count / before : null;
  });
}
