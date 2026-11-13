import { describe, expect, it, vi } from "vitest";

/**
 * A sync inside its throttle only reads the store: it must report the last full run's completeness, never "complete"
 * by default, or the briefing would say "Checked: nothing to do" over a queue that missed a read.
 */

const store = vi.hoisted(() => ({ complete: false as boolean | undefined }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
  adminFirestore: {
    collection: () => ({
      where: () => ({
        get: async () => ({
          docs: [
            {
              id: "u1__sync",
              data: () => ({ uid: "u1", next_at: new Date(Date.parse("2026-11-12T18:05:00Z")).toISOString(), ...(store.complete === undefined ? {} : { complete: store.complete }) }),
            },
          ],
        }),
      }),
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  },
}));

const { syncProposals } = await import("./proposals-server");

const NOW = new Date("2026-11-12T18:00:00.000Z");

describe("syncProposals inside its throttle", () => {
  it("carries an incomplete last run", async () => {
    store.complete = false;
    const result = await syncProposals("u1", { now: NOW });
    expect(result).toMatchObject({ skipped: true, complete: false });
  });

  it("carries a complete last run", async () => {
    store.complete = true;
    const result = await syncProposals("u1", { now: NOW });
    expect(result).toMatchObject({ skipped: true, complete: true });
  });

  it("never assumes complete when the last run did not say", async () => {
    store.complete = undefined;
    const result = await syncProposals("u1", { now: NOW });
    expect(result).toMatchObject({ skipped: true, complete: false });
  });
});
