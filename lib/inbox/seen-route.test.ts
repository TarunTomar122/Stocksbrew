import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ marks: [] as Array<{ uid: string; at: Date }>, session: { uid: "u1" } as { uid: string } | null }));

vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => calls.session }));
vi.mock("@/lib/inbox/server", () => ({
  markInboxSeen: async (uid: string, at: Date) => {
    calls.marks.push({ uid, at });
    return at.toISOString();
  },
}));

const { POST } = await import("@/app/api/inbox/seen/route");

function post(body?: unknown): Request {
  return new Request("http://localhost/api/inbox/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/inbox/seen", () => {
  beforeEach(() => {
    calls.marks = [];
    calls.session = { uid: "u1" };
  });

  it("marks up to the time the browser showed", async () => {
    const response = await POST(post({ at: "2026-11-11T15:30:00.000Z" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, seenAt: "2026-11-11T15:30:00.000Z" });
    expect(calls.marks).toEqual([{ uid: "u1", at: new Date("2026-11-11T15:30:00.000Z") }]);
  });

  it("marks up to now with no body, as Mark all read always did, and never past now", async () => {
    const before = Date.now();
    await POST(post());
    await POST(post({ at: "2999-01-01T00:00:00.000Z" }));
    for (const mark of calls.marks) {
      expect(mark.at.getTime()).toBeGreaterThanOrEqual(before);
      expect(mark.at.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("refuses someone signed out and writes nothing", async () => {
    calls.session = null;
    const response = await POST(post({ at: "2026-11-11T15:30:00.000Z" }));
    expect(response.status).toBe(401);
    expect(calls.marks).toEqual([]);
  });
});
