import { beforeEach, describe, expect, it, vi } from "vitest";

/* An in-memory store with the reads and writes the basket and jobs modules use. */
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/watchlist", () => ({
  getUserDoc: async (uid: string) => (uid === "gone" ? null : { uid }),
  resolveIsSubscribed: () => false,
}));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (collection: string, id: string) => ({
    path: `${collection}/${id}`,
    async get() {
      const data = store.docs.get(`${collection}/${id}`);
      return { exists: data !== undefined, data: () => data, id };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const path = `${collection}/${id}`;
      store.docs.set(
        path,
        options?.merge ? { ...(store.docs.get(path) ?? {}), ...data } : data,
      );
    },
  });
  const firestore = {
    collection: (collection: string) => ({
      doc: (id: string) => ref(collection, id),
      where: (field: string, _op: string, value: unknown) => ({
        async get() {
          const docs = [...store.docs.entries()]
            .filter(
              ([path, data]) =>
                path.startsWith(`${collection}/`) && data[field] === value,
            )
            .map(([, data]) => ({ data: () => data }));
          return { docs, size: docs.length };
        },
      }),
    }),
    async runTransaction<T>(
      work: (tx: {
        get: (
          r: ReturnType<typeof ref>,
        ) => ReturnType<ReturnType<typeof ref>["get"]>;
        set: (
          r: ReturnType<typeof ref>,
          d: Record<string, unknown>,
          o?: { merge?: boolean },
        ) => void;
      }) => Promise<T>,
    ) {
      const writes: Array<() => Promise<void>> = [];
      const result = await work({
        get: (r) => r.get(),
        set: (r, d, o) => void writes.push(() => r.set(d, o)),
      });
      for (const write of writes) await write();
      return result;
    },
  };
  return { adminAuth: {}, adminFirestore: firestore };
});

const {
  createBasket,
  updateBasket,
  applyBasketChange,
  getBasket,
  listBaskets,
  BasketAgentError,
  withSince,
  settledSession,
  basketsOverPlan,
  runAllBasketAgents,
} = await import("./data");
const { createJob } = await import("@/lib/agent-jobs-data");

import type { BasketDraft, ReplaySummary } from "./model";

const NOW = new Date("2026-11-12T22:00:00.000Z");
const replay: ReplaySummary = {
  from: "2026-10-16",
  to: "2026-11-12",
  sessions: 20,
  days: [],
  proposals: [],
  counts: { propose: 0, nothing: 20, could_not_check: 0 },
  notes: [],
  replayed_at: NOW.toISOString(),
};
const draft: BasketDraft = {
  name: "AI power",
  idea: "Power for AI data centers",
  source: { kind: "theme", slug: "ai-capex" },
  lines: [
    {
      ticker: "VRT",
      company: "Vertiv",
      kind: "growth",
      reason: "Cools the racks.",
    },
    {
      ticker: "ETN",
      company: "Eaton",
      kind: "growth",
      reason: "Sells the switchgear.",
    },
  ],
};

beforeEach(() => store.docs.clear());

describe("basket agents in the store", () => {
  it("switches on within the plan's room and saves paused past it, counting jobs and baskets together", async () => {
    const first = await createBasket("u1", draft, replay, "free", NOW);
    const second = await createBasket("u1", draft, replay, "free", NOW);
    const third = await createBasket("u1", draft, replay, "free", NOW);
    expect([first.enabled, second.enabled, third.enabled]).toEqual([
      true,
      true,
      false,
    ]);
    expect(third.replay).toEqual(replay);
    // A standing job made now is past Free's two as well.
    const job = await createJob(
      "u1",
      {
        template: "big-move",
        name: "Moves",
        trigger: { type: "price", rule: "moves_pct", pct: 5 },
        scope: { kind: "tickers", tickers: ["NVDA"] },
      },
      NOW,
      2,
      "free",
    );
    expect(job.enabled).toBe(false);
    // Another person's baskets never count.
    expect((await createBasket("u2", draft, replay, "free", NOW)).enabled).toBe(
      true,
    );
  });

  it("refuses to switch one on past the limit, with the agents lock", async () => {
    await createBasket("u1", draft, replay, "free", NOW);
    await createBasket("u1", draft, replay, "free", NOW);
    const paused = await createBasket("u1", draft, replay, "free", NOW);
    await expect(
      updateBasket("u1", paused.id, { enabled: true }, "free", NOW),
    ).rejects.toMatchObject({ status: 409, feature: "agents" });
    await expect(
      updateBasket("u1", paused.id, { enabled: true }, "pro", NOW),
    ).resolves.toMatchObject({ enabled: true });
  });

  it("only ever reads and writes the signed-in person's own basket", async () => {
    const mine = await createBasket("u1", draft, replay, "pro", NOW);
    expect(await getBasket("u2", mine.id)).toBeNull();
    await expect(
      updateBasket("u2", mine.id, { archived: true }, "pro", NOW),
    ).rejects.toBeInstanceOf(BasketAgentError);
    expect(
      await applyBasketChange(
        "u2",
        {
          basket_id: mine.id,
          op: "drop",
          ticker: "VRT",
          company: null,
          kind: "growth",
          reason: null,
        },
        NOW,
      ),
    ).toBe("missing");
    expect(
      (await getBasket("u1", mine.id))!.lines.map((line) => line.ticker),
    ).toEqual(["VRT", "ETN"]);
  });

  it("applies a proposal once: drop, add, already, and remembers the drop", async () => {
    const basket = await createBasket(
      "u1",
      {
        ...draft,
        lines: [
          ...draft.lines,
          {
            ticker: "PWR",
            company: null,
            kind: "growth",
            reason: "Builds the grid.",
          },
        ],
      },
      replay,
      "pro",
      NOW,
    );
    const change = {
      basket_id: basket.id,
      company: "Constellation",
      kind: "growth" as const,
      reason: "Nuclear power for AI.",
    };
    expect(
      await applyBasketChange(
        "u1",
        { ...change, op: "drop", ticker: "VRT" },
        NOW,
      ),
    ).toBe("done");
    expect(
      await applyBasketChange(
        "u1",
        { ...change, op: "drop", ticker: "VRT" },
        NOW,
      ),
    ).toBe("already");
    // Never under two companies.
    expect(
      await applyBasketChange(
        "u1",
        { ...change, op: "drop", ticker: "ETN" },
        NOW,
      ),
    ).toBe("min");
    expect(
      await applyBasketChange(
        "u1",
        { ...change, op: "add", ticker: "CEG" },
        NOW,
      ),
    ).toBe("done");
    expect(
      await applyBasketChange(
        "u1",
        { ...change, op: "add", ticker: "CEG" },
        NOW,
      ),
    ).toBe("already");
    const after = (await getBasket("u1", basket.id))!;
    expect(after.lines.map((line) => [line.ticker, line.reason])).toEqual([
      ["ETN", "Sells the switchgear."],
      ["PWR", "Builds the grid."],
      ["CEG", "Nuclear power for AI."],
    ]);
    expect(after.dropped).toEqual([{ ticker: "VRT", day: "2026-11-12" }]);
    // Each change bumped the version: 1 at creation, then two writes.
    expect(after.version).toBe(3);
  });

  it("an edit keeps the day each company joined, and removing archives without deleting", async () => {
    const basket = await createBasket("u1", draft, replay, "pro", NOW);
    const later = new Date("2026-11-20T22:00:00.000Z");
    // An edit made from an older version is refused, so it cannot undo a change made since.
    await expect(
      updateBasket("u1", basket.id, { draft, version: 0 }, "pro", later),
    ).rejects.toMatchObject({ status: 409 });
    await updateBasket(
      "u1",
      basket.id,
      {
        version: 1,
        draft: {
          ...draft,
          name: "Renamed",
          lines: [
            draft.lines[0]!,
            {
              ticker: "PWR",
              company: null,
              kind: "growth",
              reason: "Builds the grid.",
            },
          ],
        },
      },
      "pro",
      later,
    );
    const edited = (await getBasket("u1", basket.id))!;
    expect(edited.name).toBe("Renamed");
    expect(edited.lines.map((line) => [line.ticker, line.added_at])).toEqual([
      ["VRT", NOW.toISOString()],
      ["PWR", later.toISOString()],
    ]);
    expect(edited.dropped).toEqual([{ ticker: "ETN", day: "2026-11-20" }]);
    await updateBasket("u1", basket.id, { archived: true }, "pro", later);
    expect(await listBaskets("u1")).toEqual([]);
    expect(store.docs.get(`tm_agent_baskets/u1__${basket.id}`)).toMatchObject({
      archived: true,
      enabled: false,
    });
  });

  it("keeps one stretch per change: a day that could not check does not break it, a day without it does", () => {
    const drop = {
      op: "drop" as const,
      ticker: "NVDA",
      company: null,
      kind: "growth" as const,
      line: "x",
    };
    const earlier = [
      { day: "2026-11-11", decision: "could_not_check" as const, changes: [] },
      {
        day: "2026-11-10",
        decision: "propose" as const,
        changes: [{ ...drop, since: "2026-11-06" }],
      },
    ];
    expect(withSince([drop], earlier, "2026-11-12")[0]!.since).toBe(
      "2026-11-06",
    );
    expect(
      withSince(
        [drop],
        [
          { day: "2026-11-11", decision: "nothing" as const, changes: [] },
          ...earlier,
        ],
        "2026-11-12",
      )[0]!.since,
    ).toBe("2026-11-12");
  });

  it("dates the first check on the last settled session, never a weekend", () => {
    // Saturday afternoon in New York: Friday's close is the last settled one.
    expect(settledSession(new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-13");
    // Monday before the close: Friday again.
    expect(settledSession(new Date("2026-11-16T15:00:00Z"))).toBe("2026-11-13");
    // Monday after the close: Monday.
    expect(settledSession(new Date("2026-11-16T22:00:00Z"))).toBe("2026-11-16");
  });

  it("leaves the oldest baskets running within the plan, after the jobs", async () => {
    const a = await createBasket(
      "u1",
      draft,
      replay,
      "pro",
      new Date("2026-11-01T00:00:00Z"),
    );
    const b = await createBasket(
      "u1",
      draft,
      replay,
      "pro",
      new Date("2026-11-02T00:00:00Z"),
    );
    expect([...basketsOverPlan([b, a], 1, 2)]).toEqual([b.id]);
    expect([...basketsOverPlan([b, a], 0, 2)]).toEqual([]);
  });

  it("never runs the baskets of an account that no longer exists", async () => {
    await createBasket("gone", draft, replay, "pro", NOW);
    const summary = await runAllBasketAgents(NOW, () => {}, { dryRun: true });
    expect(summary).toMatchObject({
      baskets: 1,
      no_account: 1,
      recorded: 0,
      failed: 0,
    });
  });

  it("counts every switched-on job against the plan, as the limit checks do, and stops at its time budget", async () => {
    // Free runs two agents: with two jobs on, a basket that is on is left out (paused by the plan).
    const job = {
      template: "big-move",
      name: "Moves",
      trigger: { type: "price" as const, rule: "moves_pct" as const, pct: 5 },
      scope: { kind: "tickers" as const, tickers: ["NVDA"] },
    };
    await createJob("u3", job, NOW, 20, "pro");
    await createJob(
      "u3",
      {
        ...job,
        trigger: { type: "event" as const, event: "sec_filing" as const },
      },
      NOW,
      20,
      "pro",
    );
    await createBasket("u3", draft, replay, "pro", NOW);
    const summary = await runAllBasketAgents(NOW, () => {}, { dryRun: true });
    expect(summary).toMatchObject({ baskets: 1, over_plan: 1, recorded: 0 });
    // A run whose time budget is spent starts nothing more.
    store.docs.clear();
    await createBasket("u4", draft, replay, "pro", NOW);
    expect(
      await runAllBasketAgents(NOW, () => {}, {
        dryRun: true,
        deadline: Date.now() - 1,
      }),
    ).toMatchObject({ deferred: 1, recorded: 0 });
  });
});
