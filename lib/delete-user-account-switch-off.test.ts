import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

/** where("uid", "==", x).get() over `${collection}/${id}` docs, and a batch whose set merges. */
vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({ path });
  return {
    adminAuth: {},
    adminFirestore: {
      collection: (name: string) => ({
        where: (_f: string, _op: string, uid: string) => ({
          get: async () => ({
            docs: [...h.docs.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && data.uid === uid)
              .map(([path, data]) => ({ ref: ref(path), data: () => ({ ...data }) })),
          }),
        }),
      }),
      batch: () => {
        const writes: Array<[string, Record<string, unknown>]> = [];
        return {
          set: (r: { path: string }, data: Record<string, unknown>) => writes.push([r.path, data]),
          commit: async () => {
            for (const [path, data] of writes) h.docs.set(path, { ...h.docs.get(path), ...data });
          },
        };
      },
    },
  };
});

import { switchOffUserAlertsAndAgents } from "@/lib/delete-user-account";

beforeEach(() => {
  h.docs.clear();
  h.docs.set("tm_alerts/a1", { uid: "gone", kind: "price_threshold", active: true, target_price: 10 });
  h.docs.set("tm_alerts/a2", { uid: "gone", kind: "earnings_24h", active: false });
  h.docs.set("tm_alerts/a3", { uid: "other", active: true });
  h.docs.set("tm_agent_jobs/gone__j1", { uid: "gone", enabled: true, name: "Watch NVDA" });
  h.docs.set("tm_agent_jobs/other__j1", { uid: "other", enabled: true });
});

describe("account deletion switches off alerts and agents (bug 17)", () => {
  it("deactivates the person's live alerts and archives their agents, keeping the docs and touching nobody else", async () => {
    await expect(switchOffUserAlertsAndAgents("gone", new Date("2026-11-12T00:00:00Z"))).resolves.toEqual({ alerts: 1, agents: 1 });
    expect(h.docs.get("tm_alerts/a1")).toMatchObject({ active: false, target_price: 10, updated_at: "2026-11-12T00:00:00.000Z" });
    expect(h.docs.get("tm_agent_jobs/gone__j1")).toMatchObject({ archived: true, enabled: false, name: "Watch NVDA" });
    expect(h.docs.get("tm_alerts/a3")).toMatchObject({ active: true });
    expect(h.docs.get("tm_agent_jobs/other__j1")).toEqual({ uid: "other", enabled: true });
    expect(h.docs.size).toBe(5);
  });

  it("archives the person's idea baskets too, so the nightly run stops checking them", async () => {
    h.docs.set("tm_agent_baskets/gone__b1", { uid: "gone", enabled: true, name: "AI power" });
    h.docs.set("tm_agent_baskets/other__b1", { uid: "other", enabled: true });
    await expect(switchOffUserAlertsAndAgents("gone", new Date("2026-11-12T00:00:00Z"))).resolves.toEqual({ alerts: 1, agents: 2 });
    expect(h.docs.get("tm_agent_baskets/gone__b1")).toMatchObject({ archived: true, enabled: false, name: "AI power" });
    expect(h.docs.get("tm_agent_baskets/other__b1")).toEqual({ uid: "other", enabled: true });
  });
});
