import { funnel, parseMs, proConversionsIn, signupsIn, stepRates, type RealFacts } from "@/lib/analytics/funnel";

const t = (iso: string) => Date.parse(iso);
const START = t("2026-11-07T00:00:00Z");
const END = t("2026-11-14T00:00:00Z");

// A fake store: the docs as LocalDB returns them, turned into facts the way lib/analytics/db.ts does.
type Docs = Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
const docs: Docs = {
  users: [
    { id: "old", data: { created_at: "2026-10-01T10:00:00.000000+00:00", tracked_stocks: ["US_AAPL"] } },
    { id: "u1", data: { created_at: "2026-11-08T10:00:00.000000+00:00", tracked_stocks: ["US_NVDA", "US_AMD"] } },
    { id: "u2", data: { created_at: "2026-11-09T10:00:00.000000+00:00", tracked_stocks: [] } },
    { id: "u3", data: { created_at: "2026-11-13T23:59:59.000000+00:00", tracked_stocks: ["US_MSFT"] } },
    { id: "u4", data: { created_at: "2026-11-14T00:00:00.000000+00:00", tracked_stocks: ["US_MSFT"] } },
    { id: "nodate", data: {} },
  ],
  tm_agent_jobs: [
    { id: "u1__a", data: { uid: "u1", created_at: "2026-11-08T11:00:00.000Z" } },
    { id: "u1__b", data: { uid: "u1", created_at: "2026-11-08T11:05:00.000Z" } },
    { id: "old__c", data: { uid: "old", created_at: "2026-11-08T11:05:00.000Z" } },
  ],
  tm_agent_baskets: [{ id: "u3__x", data: { created_at: "2026-11-13T23:59:59.500Z", thesis: { created_at: "2026-11-13T23:59:59.600Z" } } }],
  tm_lifecycle_events: [
    { id: "e1", data: { uid: "u1", type: "checkout_started", created_at: "2026-11-08T12:00:00.000Z" } },
    { id: "e2", data: { uid: "u1", type: "subscription_converted", created_at: "2026-11-08T12:05:00.000Z", payload: { source_event: "subscription.active" } } },
    { id: "e3", data: { uid: "u1", type: "subscription_converted", created_at: "2026-11-09T12:05:00.000Z", payload: { source_event: "subscription.active" } } },
    { id: "e4", data: { uid: "u2", type: "subscription_converted", created_at: "2026-11-09T12:05:00.000Z", payload: { source_event: "dev_activate" } } },
    { id: "e5", data: { uid: "old", type: "subscription_converted", created_at: "2026-11-10T12:05:00.000Z", payload: { source_event: "subscription.active" } } },
    { id: "e6", data: { uid: "u2", type: "checkout_started", created_at: "2026-11-10T12:05:00.000Z" } },
  ],
};

vi.mock("@/lib/firebase-admin", () => {
  const collection = (name: string) => {
    const query = {
      select: () => query,
      get: async () => ({ docs: (docs[name] ?? []).map((doc) => ({ id: doc.id, data: () => doc.data })) }),
    };
    return query;
  };
  return { adminFirestore: { collection } };
});

async function loadFacts(): Promise<RealFacts> {
  const { analyticsDb } = await import("@/lib/analytics/db");
  return analyticsDb().realFacts();
}

describe("funnel from the records", () => {
  it("reads sign-ups, agents and lifecycle events from a fake store, ids and dates only", async () => {
    const facts = await loadFacts();
    expect(facts.users.map((u) => u.uid)).toEqual(["old", "u1", "u2", "u3", "u4", "nodate"]);
    expect(facts.users.find((u) => u.uid === "nodate")!.createdMs).toBeNull();
    expect(facts.agents.filter((a) => a.kind === "thesis").map((a) => a.uid)).toEqual(["u3"]);
    expect(facts.lifecycle.find((e) => e.uid === "u2" && e.type === "subscription_converted")!.dev).toBe(true);
    expect(JSON.stringify(facts)).not.toMatch(/@/);
  });

  it("counts sign-ups in [start, end) and Pro once per person, without test activations", async () => {
    const facts = await loadFacts();
    expect(signupsIn(facts, START, END).map((u) => u.uid)).toEqual(["u1", "u2", "u3"]);
    // u1 (twice → once) and old; u2's dev activation is left out
    expect(proConversionsIn(facts, START, END)).toBe(2);
  });

  it("follows the range's sign-ups through each step", async () => {
    const facts = await loadFacts();
    const steps = funnel(facts, { start: START, end: END, visitors: 120, signinStarted: 9 });
    expect(steps.map((s) => [s.id, s.count])).toEqual([
      ["visit", 120],
      ["signin", 9],
      ["signup", 3],
      ["stocks", 2],
      ["agent", 2],
      ["checkout", 2],
      ["pro", 1],
    ]);
    const rates = stepRates(steps);
    expect(rates[0]).toBeNull();
    expect(rates[1]).toBeCloseTo(9 / 120);
    expect(rates[6]).toBeCloseTo(1 / 2);
  });

  it("gives no rate after an empty step", () => {
    expect(stepRates([
      { id: "a", label: "a", count: 0, source: "beacon" },
      { id: "b", label: "b", count: 0, source: "records" },
    ])).toEqual([null, null]);
  });

  it("parses the timestamp shapes the store holds", () => {
    expect(parseMs("2026-11-08T10:00:00.000000+00:00")).toBe(t("2026-11-08T10:00:00Z"));
    expect(parseMs({ _seconds: 1 })).toBe(1000);
    expect(parseMs("nope")).toBeNull();
    expect(parseMs(null)).toBeNull();
  });
});
