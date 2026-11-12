import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory document store with the parts the proposal store uses: doc get/set(merge) and transactions. */
const db = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    path,
    async get() {
      const data = docs.get(path);
      return { exists: Boolean(data), id: path.split("/").pop(), data: () => (data ? structuredClone(data) : undefined) };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      docs.set(path, options?.merge ? { ...(docs.get(path) ?? {}), ...structuredClone(data) } : structuredClone(data));
    },
  });
  const firestore = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    async runTransaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      const writes: Array<() => Promise<void>> = [];
      const tx = {
        get: (target: ReturnType<typeof ref>) => target.get(),
        set: (target: ReturnType<typeof ref>, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push(() => target.set(data, options));
        },
      };
      const result = await run(tx);
      for (const write of writes) await write();
      return result;
    },
  };
  return { docs, firestore, session: { uid: "u1", email: "me@example.com" } as { uid: string; email: string | null } | null, alerts: [] as Array<Record<string, unknown>> };
});

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: db.firestore, adminAuth: {} }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => db.session }));
vi.mock("@/lib/entitlements-server", () => ({ getViewer: async () => ({ plan: "free" }), viewerFromUserDoc: () => ({}), isCovered: () => true }));
vi.mock("@/lib/proposals-server", () => ({ resetProposalSync: vi.fn(), freshStaleReason: vi.fn(async () => null) }));
vi.mock("@/lib/radar-mutations", () => ({ addRadarStock: vi.fn(async () => ({ already_tracked: false })) }));
vi.mock("@/lib/stock-alerts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stock-alerts")>();
  return {
    ...real,
    createStockAlert: vi.fn(async (input: Record<string, unknown>) => {
      db.alerts.push(input);
      return { alert_id: `alert${db.alerts.length}`, kind: input.kind };
    }),
    deleteStockAlert: vi.fn(async (_uid: string, id: string) => ({ alert_id: id, active: false })),
  };
});

const { POST } = await import("./route");
const { newProposal, proposalDocId, PROPOSALS_COLLECTION } = await import("@/lib/proposals");

const NOW = new Date();

function seed(uid = "u1") {
  const proposal = newProposal(
    uid,
    {
      kind: "call_change",
      ticker: "NVDA",
      instrument_id: "US_NVDA",
      event: { key: `call:NVDA:${uid}`, kind: "call_change", at: "2026-11-11", refs: [] },
      idea: "alert:NVDA:below:142",
      title: "Set an alert at NVDA's $142 buy-more level",
      why: ["Our call on NVDA moved to Buy more yesterday."],
      does: "Emails you if NVDA falls to $142.",
      read: [{ label: "Our call on NVDA", at: "2026-11-11", href: "/stock/NVDA" }],
      figures: [{ label: "Buy-more level", value: "$142" }],
      action: { type: "alert_price", ticker: "NVDA", instrument_id: "US_NVDA", condition: "below", price: 142, replaces: null },
      priority: 75,
    },
    NOW,
  );
  db.docs.set(`${PROPOSALS_COLLECTION}/${proposalDocId(uid, proposal.id)}`, JSON.parse(JSON.stringify(proposal)));
  return proposal;
}

function post(id: string, body: unknown) {
  return POST(new Request(`http://localhost/api/proposals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } });
}

describe("POST /api/proposals/[id]", () => {
  beforeEach(() => {
    db.docs.clear();
    db.alerts.length = 0;
    db.session = { uid: "u1", email: "me@example.com" };
  });

  it("accepts once: sets the alert with the person's plan and stores the outcome", async () => {
    const proposal = seed();
    const response = await post(proposal.id, { decision: "accept" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "accepted", result: { ok: true, message: "Alert set: NVDA below $142." } });
    expect(db.alerts).toEqual([expect.objectContaining({ uid: "u1", kind: "price_threshold", condition: "below", targetPrice: 142, plan: "free" })]);
    const stored = db.docs.get(`${PROPOSALS_COLLECTION}/${proposalDocId("u1", proposal.id)}`)!;
    expect(stored).toMatchObject({ status: "accepted", result: { ok: true } });
    // The rest of the proposal is untouched.
    expect(stored.title).toBe(proposal.title);

    const again = await post(proposal.id, { decision: "accept" });
    expect(await again.json()).toMatchObject({ ok: true, already: true });
    expect(db.alerts).toHaveLength(1);
  });

  it("dismisses without touching anything else", async () => {
    const proposal = seed();
    const response = await post(proposal.id, { decision: "dismiss" });
    expect(await response.json()).toMatchObject({ ok: true, status: "dismissed" });
    expect(db.alerts).toEqual([]);
    expect(db.docs.get(`${PROPOSALS_COLLECTION}/${proposalDocId("u1", proposal.id)}`)).toMatchObject({ status: "dismissed" });
  });

  it("refuses someone signed out, a bad decision, a bad id and another person's proposal", async () => {
    const theirs = seed("u2");
    expect((await post(theirs.id, { decision: "accept" })).status).toBe(404);
    expect((await post("not-an-id", { decision: "accept" })).status).toBe(404);
    expect((await post(theirs.id, { decision: "maybe" })).status).toBe(400);
    db.session = null;
    expect((await post(theirs.id, { decision: "accept" })).status).toBe(401);
    expect(db.alerts).toEqual([]);
    expect(db.docs.get(`${PROPOSALS_COLLECTION}/${proposalDocId("u2", theirs.id)}`)).toMatchObject({ status: "pending" });
  });
});
