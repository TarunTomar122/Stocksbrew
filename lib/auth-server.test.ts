import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));

import { createSessionTrust, type SessionCheck } from "@/lib/auth-server";

const HOUR = 3_600_000;

function setup(start = 10 * HOUR) {
  let t = start;
  const answers = new Map<string, SessionCheck>();
  const verify = vi.fn(async (cookie: string) => answers.get(cookie) ?? "refused");
  const pending: Promise<unknown>[] = [];
  const trust = createSessionTrust({
    verify,
    now: () => t,
    background: (_label, work) => pending.push(work),
  });
  const ok = (uid: string, expiresAt = t + HOUR): SessionCheck => ({
    user: { uid, email: null, displayName: null, photoURL: null },
    expiresAt,
  });
  return {
    trust,
    verify,
    answers,
    ok,
    advance: (ms: number) => (t += ms),
    settle: () => Promise.all(pending.splice(0)),
  };
}

describe("createSessionTrust", () => {
  it("checks a new cookie before answering, then trusts it for a minute", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    s.advance(59_000);
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    expect(s.verify).toHaveBeenCalledTimes(1);
  });

  it("keys trust by cookie: another cookie is checked on its own and gets its own uid", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    s.answers.set("cookie-b", s.ok("bob"));
    await s.trust.resolve("cookie-a");
    expect((await s.trust.resolve("cookie-b"))?.uid).toBe("bob");
    expect(await s.trust.resolve("cookie-unknown")).toBeNull();
  });

  it("after a minute answers at once and re-checks once in the background", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    await s.trust.resolve("cookie-a");
    s.advance(5 * 60_000);
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    expect(s.verify).toHaveBeenCalledTimes(2);
    await s.settle();
    // The re-check renewed the trust: no new check for another minute.
    s.advance(30_000);
    await s.trust.resolve("cookie-a");
    expect(s.verify).toHaveBeenCalledTimes(2);
  });

  it("drops a session the background re-check refuses (revoked)", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    await s.trust.resolve("cookie-a");
    s.advance(2 * 60_000);
    s.answers.set("cookie-a", "refused");
    await s.trust.resolve("cookie-a");
    await s.settle();
    expect(await s.trust.resolve("cookie-a")).toBeNull();
  });

  it("asks again on the next request when the background re-check could not reach Firebase", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    await s.trust.resolve("cookie-a");
    s.advance(2 * 60_000);
    s.answers.set("cookie-a", "unavailable");
    await s.trust.resolve("cookie-a");
    await s.settle();
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    expect(s.verify).toHaveBeenCalledTimes(3);
  });

  it("checks before answering once the last check is over ten minutes old", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    await s.trust.resolve("cookie-a");
    s.advance(11 * 60_000);
    s.answers.set("cookie-a", "refused");
    expect(await s.trust.resolve("cookie-a")).toBeNull();
  });

  it("never trusts a session past its own expiry", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice", 10 * HOUR + 30_000));
    await s.trust.resolve("cookie-a");
    s.advance(31_000);
    s.answers.set("cookie-a", "refused");
    expect(await s.trust.resolve("cookie-a")).toBeNull();
    expect(s.verify).toHaveBeenCalledTimes(2);
  });

  it("forgets one person's sessions on request (account deleted) and keeps everyone else's", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    s.answers.set("cookie-b", s.ok("bob"));
    await s.trust.resolve("cookie-a");
    await s.trust.resolve("cookie-b");
    s.trust.forgetUid("alice");
    s.answers.set("cookie-a", "refused");
    expect(await s.trust.resolve("cookie-a")).toBeNull();
    expect((await s.trust.resolve("cookie-b"))?.uid).toBe("bob");
    expect(s.verify).toHaveBeenCalledTimes(3);
  });

  it("keeps serving and retries later when the background re-check throws", async () => {
    const s = setup();
    s.answers.set("cookie-a", s.ok("alice"));
    await s.trust.resolve("cookie-a");
    s.advance(2 * 60_000);
    s.verify.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    expect((await s.trust.resolve("cookie-a"))?.uid).toBe("alice");
    await s.settle();
    await s.trust.resolve("cookie-a");
    expect(s.verify).toHaveBeenCalledTimes(3);
  });

  it("treats a failed check as signed out without remembering it", async () => {
    const s = setup();
    s.answers.set("cookie-a", "unavailable");
    expect(await s.trust.resolve("cookie-a")).toBeNull();
    expect(s.trust.size()).toBe(0);
  });
});
