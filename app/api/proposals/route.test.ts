import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: { uid: "u1" } as { uid: string } | null, fail: false }));

vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => state.session }));
vi.mock("@/lib/proposals-server", () => ({
  syncProposals: vi.fn(async () => {
    if (state.fail) throw new Error("down");
    return { waiting: [{ id: "p1" }], created: 0, expired: 0, complete: true, skipped: true };
  }),
  proposalCards: vi.fn(async (waiting: Array<{ id: string }>) => waiting.map((proposal) => ({ id: proposal.id, title: "Set an alert" }))),
}));

const { GET } = await import("./route");

describe("GET /api/proposals", () => {
  it("lists the person's waiting proposals, never cached", async () => {
    const response = await GET(new Request("http://localhost/api/proposals"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, proposals: [{ id: "p1", title: "Set an alert" }], complete: true, synced: false });
  });

  it("says unavailable rather than an empty list when the store fails", async () => {
    state.fail = true;
    expect((await GET(new Request("http://localhost/api/proposals"))).status).toBe(503);
    state.fail = false;
  });

  it("refuses someone signed out", async () => {
    state.session = null;
    expect((await GET(new Request("http://localhost/api/proposals"))).status).toBe(401);
    state.session = { uid: "u1" };
  });
});
