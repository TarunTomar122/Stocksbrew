import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryStore } from "./test-store";

const state = vi.hoisted(() => ({ store: null as MemoryStore | null }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/seo/stock-pages", () => ({ isFeaturedStockTicker: () => false }));
vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore } = await import("./test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return memoryFirestore(state.store!);
    },
  };
});

import { ANON_IMPORT_READS_CEILING, anonymousSubject, consumeImportRead, IMPORT_READS_PER_DAY, refundImportRead } from "./limits";
import { createMemoryStore } from "./test-store";

const DAY = new Date("2026-11-10T15:00:00Z");
const NEXT_DAY = new Date("2026-11-11T00:00:01Z");

const store = () => state.store!;

beforeEach(() => {
  state.store = createMemoryStore();
});

describe("consumeImportRead", () => {
  it("gives a signed-out visitor three reads a day, then refuses without counting", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeImportRead("anon", "anon_a", DAY));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]).toMatchObject({ used: 3, remaining: 0, reason: "personal" });
    expect((await consumeImportRead("anon", "anon_a", NEXT_DAY)).allowed).toBe(true);
  });

  it("stops every signed-out visitor at the shared daily ceiling, but not signed-in people", async () => {
    state.store!.docs.set(`tm_agent_usage_meters/anon_all__import_read__2026-11-10`, { used: ANON_IMPORT_READS_CEILING });
    expect(await consumeImportRead("anon", "anon_b", DAY)).toMatchObject({ allowed: false, reason: "everyone" });
    expect((await consumeImportRead("free", "u1", DAY)).allowed).toBe(true);
  });

  it("gives Free and Pro their own daily counts", async () => {
    for (let i = 0; i < IMPORT_READS_PER_DAY.free; i += 1) await consumeImportRead("free", "u1", DAY);
    expect((await consumeImportRead("free", "u1", DAY)).allowed).toBe(false);
    expect((await consumeImportRead("pro", "u2", DAY)).limit).toBe(IMPORT_READS_PER_DAY.pro);
  });

  it("fails closed for signed-out visitors and open for accounts when the store is down", async () => {
    state.store!.fail = true;
    expect((await consumeImportRead("anon", "anon_c", DAY)).allowed).toBe(false);
    expect((await consumeImportRead("free", "u1", DAY)).allowed).toBe(true);
  });
});

describe("refundImportRead", () => {
  it("gives one read back to the visitor and to the shared count, never below zero", async () => {
    await consumeImportRead("anon", "anon_r", DAY);
    await refundImportRead("anon", "anon_r", DAY);
    expect(store().docs.get("tm_agent_usage_meters/anon_r__import_read__2026-11-10")).toMatchObject({ used: 0 });
    expect(store().docs.get("tm_agent_usage_meters/anon_all__import_read__2026-11-10")).toMatchObject({ used: 0 });
    await refundImportRead("anon", "anon_r", DAY);
    expect(store().docs.get("tm_agent_usage_meters/anon_r__import_read__2026-11-10")).toMatchObject({ used: 0 });
  });
});

describe("anonymousSubject", () => {
  it("hashes the first forwarded address and never contains it", () => {
    const subject = anonymousSubject("203.0.113.9, 10.0.0.1", null);
    expect(subject).toMatch(/^anon_[0-9a-f]{32}$/);
    expect(subject).not.toContain("203");
    expect(anonymousSubject("203.0.113.9", null)).toBe(subject);
    expect(anonymousSubject(null, "198.51.100.2")).not.toBe(subject);
    // A new day, a new id: yesterday's cannot be linked to today's.
    expect(anonymousSubject("203.0.113.9", null, NEXT_DAY)).not.toBe(anonymousSubject("203.0.113.9", null, DAY));
  });
});
