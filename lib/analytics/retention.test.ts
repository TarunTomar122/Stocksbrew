import { resetDashboardCacheForTests } from "@/lib/analytics/dashboard";
import { setAnalyticsDbForTests, type AnalyticsDb } from "@/lib/analytics/db";
import type { DayRollup, EventChunk, StoredEvent } from "@/lib/analytics/rollup";
import { pruneRawChunks } from "@/lib/analytics/retention";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ev = (iso: string, p = "/"): StoredEvent => ({ t: Date.parse(iso), n: "pageview", sid: "s1", vid: "v1", p, r: p });
const chunk = (events: StoredEvent[]): EventChunk => ({
  days: Array.from(new Set(events.map((e) => new Date(e.t).toISOString().slice(0, 10)))),
  first_ts: Math.min(...events.map((e) => e.t)),
  last_ts: Math.max(...events.map((e) => e.t)),
  count: events.length,
  events,
  created_at: "",
});

function fake() {
  const chunks = new Map<string, EventChunk>([
    ["old1", chunk([ev("2026-11-02T10:00:00Z"), ev("2026-11-02T10:01:00Z", "/x")])],
    ["old2", chunk([ev("2026-11-06T23:59:59Z")])],
    ["recent", chunk([ev("2026-11-11T09:00:00Z")])],
    ["today", chunk([ev("2026-11-13T09:00:00Z")])],
  ]);
  const rollups = new Map<string, DayRollup>();
  const db: AnalyticsDb = {
    writeChunk: async () => undefined,
    salts: () => ({ read: async () => null, create: async () => true, removeBefore: async () => undefined }),
    chunksForDay: async (_ns, day) => [...chunks.values()].filter((c) => c.days.includes(day)),
    chunksSince: async () => [],
    oldChunks: async (_ns, before) => [...chunks].filter(([, c]) => c.last_ts < before).map(([id, c]) => ({ id, days: c.days })),
    deleteChunks: async (_ns, ids) => {
      for (const id of ids) chunks.delete(id);
    },
    readRollups: async (_ns, days) => new Map(days.filter((d) => rollups.has(d)).map((d) => [d, rollups.get(d)!])),
    writeRollups: async (_ns, list) => {
      for (const r of list) rollups.set(r.day, r);
    },
    realFacts: async () => ({ users: [], agents: [], lifecycle: [] }),
  };
  return { db, chunks, rollups };
}

afterEach(() => {
  setAnalyticsDbForTests();
  resetDashboardCacheForTests();
});

describe("raw event retention", () => {
  it("deletes raw chunks five days after their day, only once that day's final rollup is stored", async () => {
    const { db, chunks, rollups } = fake();
    setAnalyticsDbForTests(db);
    const { deleted } = await pruneRawChunks("tm_analytics_dev", NOW);
    expect(deleted).toBe(2);
    expect([...chunks.keys()]).toEqual(["recent", "today"]);
    // the counts survive in the rollup
    expect(rollups.get("2026-11-02")).toMatchObject({ pv: 2, complete: true });
    expect(rollups.get("2026-11-06")).toMatchObject({ pv: 1, complete: true });
  });

  it("keeps everything when the rollup can't be stored", async () => {
    const { db, chunks } = fake();
    setAnalyticsDbForTests({ ...db, writeRollups: async () => Promise.reject(new Error("down")) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await pruneRawChunks("tm_analytics_dev", NOW);
    expect(chunks.size).toBe(4);
    warn.mockRestore();
  });
});
