import { beforeEach, describe, expect, it, vi } from "vitest";

/** A user doc store with a transaction that re-checks what it read, like LocalDB's /transactions:commit. */
const store = vi.hoisted(() => ({ doc: null as Record<string, unknown> | null, version: 0, writes: 0 }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => new Map() }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = { path: "users/u1" };
  return {
    adminFirestore: {
      collection: () => ({ doc: () => ref }),
      runTransaction: async <T,>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          let readVersion = -1;
          let pending: Record<string, unknown> | null = null;
          const tx = {
            get: async () => {
              readVersion = store.version;
              // Let a racing call run between this read and the commit.
              await new Promise((resolve) => setTimeout(resolve, 0));
              return { exists: store.doc !== null, data: () => ({ ...store.doc }) };
            },
            set: (_ref: unknown, data: Record<string, unknown>) => {
              pending = data;
            },
          };
          const result = await callback(tx);
          if (readVersion !== store.version) continue; // conflict: someone wrote since the read, so try again
          if (pending) {
            store.doc = { ...store.doc, ...(pending as Record<string, unknown>) };
            store.version += 1;
            store.writes += 1;
          }
          return result;
        }
        throw new Error("transaction conflict");
      },
    },
  };
});

const { markInboxSeen } = await import("./server");

describe("markInboxSeen", () => {
  beforeEach(() => {
    store.doc = { email: "a@b.c" };
    store.version = 0;
    store.writes = 0;
  });

  it("only moves the mark forward, even when an older mark lands second", async () => {
    const newer = new Date("2026-11-11T15:00:00Z");
    const older = new Date("2026-11-11T14:00:00Z");
    const results = await Promise.all([markInboxSeen("u1", newer), markInboxSeen("u1", older)]);
    expect(store.doc!.inbox_seen_at).toBe(newer.toISOString());
    expect(results).toEqual([newer.toISOString(), newer.toISOString()]);
    expect(store.doc!.email).toBe("a@b.c");
  });

  it("refuses a missing profile and writes nothing when the mark is already later", async () => {
    store.doc = { inbox_seen_at: "2026-11-11T16:00:00.000Z" };
    expect(await markInboxSeen("u1", new Date("2026-11-11T15:00:00Z"))).toBe("2026-11-11T16:00:00.000Z");
    expect(store.writes).toBe(0);
    store.doc = null;
    await expect(markInboxSeen("u1")).rejects.toMatchObject({ status: 409 });
  });
});
