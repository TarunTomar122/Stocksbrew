vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));

import { subscriberId } from "@/lib/email-subscribers";
import {
  captureSubscriber,
  confirmSubscriber,
  countSubscribers,
  linkSubscriberToAccount,
  setSubscriberStopped,
} from "@/lib/email-subscribers-store";
import { seedFromSubscription } from "@/lib/email-subscriber-seed";

/** A tiny in-memory store with the Firestore shape the store module uses. */
function fakeDb(seed: Record<string, Record<string, Record<string, unknown>>> = {}) {
  const data: Record<string, Map<string, Record<string, unknown>>> = {};
  for (const [name, docs] of Object.entries(seed)) data[name] = new Map(Object.entries(docs));
  const col = (name: string) => (data[name] ??= new Map());
  const docRef = (name: string, id: string) => ({
    id,
    async get() {
      const value = col(name).get(id);
      return { exists: value !== undefined, data: () => (value ? { ...value } : undefined) };
    },
    async set(value: Record<string, unknown>, opts?: { merge?: boolean }) {
      col(name).set(id, opts?.merge ? { ...(col(name).get(id) ?? {}), ...value } : { ...value });
    },
  });
  const db = {
    data,
    collection(name: string) {
      const query = (field?: string, value?: unknown) => ({
        limit: () => query(field, value),
        select: () => query(field, value),
        async get() {
          const docs = [...col(name).entries()].filter(([, v]) => field === undefined || v[field] === value);
          return { empty: docs.length === 0, docs: docs.map(([id, v]) => ({ id, data: () => v })) };
        },
      });
      return {
        doc: (id: string) => docRef(name, id),
        where: (field: string, _op: string, value: unknown) => query(field, value),
        select: () => query(),
      };
    },
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const writes: Array<() => Promise<void>> = [];
      const tx = {
        get: (ref: ReturnType<typeof docRef>) => ref.get(),
        set: (ref: ReturnType<typeof docRef>, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
          writes.push(() => ref.set(value, opts));
        },
      };
      const result = await callback(tx);
      for (const write of writes) await write();
      return result;
    },
  };
  return db;
}

const NOW = Date.parse("2026-11-24T15:00:00Z");
const EMAIL = "sam@example.com";
const ID = subscriberId(EMAIL);

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
});

describe("captureSubscriber", () => {
  it("stores a new signup and sends one confirmation; a repeat within 24 hours adds the stock and sends none", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => true);
    const first = await captureSubscriber({ email: EMAIL, ticker: "NVDA", source: "stock" }, { db: db as never, send, now: NOW });
    expect(first).toEqual({ status: "stored", confirmSent: true, id: ID });
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = send.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe(EMAIL);
    expect(subject).toMatch(/Confirm/);
    expect(html).toContain(`/email/confirm?s=${ID}&amp;t=`);
    expect(html).toContain("NVDA");

    const again = await captureSubscriber({ email: EMAIL, ticker: "AMD", source: "earnings" }, { db: db as never, send, now: NOW + 60_000 });
    expect(again).toEqual({ status: "stored", confirmSent: false, id: ID });
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.data.tm_email_subscribers!.get(ID)).toMatchObject({ tickers: ["NVDA", "AMD"], source: "stock", last_source: "earnings" });
  });

  it("gives the 24-hour claim back when the confirmation did not go out", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => false);
    const first = await captureSubscriber({ email: EMAIL, ticker: null, source: "news" }, { db: db as never, send, now: NOW });
    expect(first).toMatchObject({ status: "stored", confirmSent: false });
    expect(db.data.tm_email_subscribers!.get(ID)!.confirm_sent_at).toBeNull();
    const retry = await captureSubscriber({ email: EMAIL, ticker: null, source: "news" }, { db: db as never, send: vi.fn(async () => true), now: NOW + 1000 });
    expect(retry).toMatchObject({ confirmSent: true });
  });

  it("stores without sending when the confirmation cap is spent", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => true);
    const result = await captureSubscriber({ email: EMAIL, ticker: null, source: "calendar" }, { db: db as never, send, mayConfirm: () => false, now: NOW });
    expect(result).toEqual({ status: "busy", id: ID });
    expect(send).not.toHaveBeenCalled();
    expect(db.data.tm_email_subscribers!.get(ID)!.confirm_sent_at).toBeNull();
  });

  it("never stores or mails an address that already has an account", async () => {
    const db = fakeDb({ users: { u1: { email_lower: EMAIL } } });
    const send = vi.fn(async () => true);
    expect(await captureSubscriber({ email: EMAIL, ticker: "NVDA", source: "stock" }, { db: db as never, send, now: NOW })).toEqual({ status: "account" });
    expect(db.data.tm_email_subscribers?.size ?? 0).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("confirm, stop and link", () => {
  it("confirms once, says so again on a reload, and a stop then a resume work", async () => {
    const db = fakeDb({ tm_email_subscribers: { [ID]: { email: EMAIL, tickers: ["NVDA"], confirmed_at: null } } });
    expect(await confirmSubscriber(ID, { db: db as never, now: NOW })).toEqual({ state: "confirmed", tickers: ["NVDA"] });
    expect(await confirmSubscriber(ID, { db: db as never, now: NOW + 1 })).toEqual({ state: "already", tickers: ["NVDA"] });
    expect(await confirmSubscriber("f".repeat(64), { db: db as never })).toEqual({ state: "missing", tickers: [] });
    expect(await setSubscriberStopped(ID, true, { db: db as never, now: NOW })).toBe(true);
    expect(db.data.tm_email_subscribers!.get(ID)!.unsubscribed_at).toBe(new Date(NOW).toISOString());
    expect(await setSubscriberStopped(ID, false, { db: db as never, now: NOW })).toBe(true);
    expect(db.data.tm_email_subscribers!.get(ID)!.unsubscribed_at).toBeNull();
    expect(await setSubscriberStopped("f".repeat(64), true, { db: db as never })).toBe(false);
  });

  it("links the signup to a new account and hands over its stocks only when confirmed", async () => {
    const db = fakeDb({ tm_email_subscribers: { [ID]: { email: EMAIL, tickers: ["NVDA", "AMD", "TSLA", "PLTR"], confirmed_at: "2026-11-01T00:00:00Z" } } });
    expect(await linkSubscriberToAccount({ uid: "u1", email: EMAIL, limit: 3 }, { db: db as never, now: NOW })).toEqual(["NVDA", "AMD", "TSLA"]);
    expect(db.data.tm_email_subscribers!.get(ID)).toMatchObject({ linked_uid: "u1" });
    // linked once: a second account (or a second call) gets nothing
    expect(await linkSubscriberToAccount({ uid: "u2", email: EMAIL, limit: 3 }, { db: db as never, now: NOW })).toEqual([]);

    const waiting = fakeDb({ tm_email_subscribers: { [ID]: { email: EMAIL, tickers: ["NVDA"], confirmed_at: null } } });
    expect(await linkSubscriberToAccount({ uid: "u1", email: EMAIL, limit: 3 }, { db: waiting as never, now: NOW })).toEqual([]);
    expect(waiting.data.tm_email_subscribers!.get(ID)).toMatchObject({ linked_uid: "u1" });
  });

  it("counts signups by state without reading an address", () => {
    const counts = countSubscribers(
      [
        { created_at: "2026-11-23T00:00:00Z", confirmed_at: "2026-11-23T01:00:00Z" },
        { created_at: "2026-11-01T00:00:00Z" },
        { created_at: "2026-11-20T00:00:00Z", confirmed_at: "x", unsubscribed_at: "y" },
        { created_at: "2026-11-02T00:00:00Z", confirmed_at: "x", linked_uid: "u1" },
      ],
      NOW,
    );
    expect(counts).toEqual({ total: 4, confirmed: 1, waiting: 1, linked: 1, stopped: 1, week: 2 });
  });
});

describe("seedFromSubscription", () => {
  it("seeds the confirmed signup's stocks into an empty account, one rebuild at the end", async () => {
    const add = vi.fn(async () => undefined);
    const added = await seedFromSubscription(
      { uid: "u1", email: "Sam@Example.com" },
      { link: async (input) => (input.email === EMAIL && input.limit === 3 ? ["NVDA", "BRK.B"] : []), readTracked: async () => [], add, limit: 3 },
    );
    expect(added).toEqual(["NVDA", "BRK.B"]);
    expect(add.mock.calls.map((c) => (c as unknown as [{ instrumentId: string; skipRebuild: boolean }])[0])).toEqual([
      expect.objectContaining({ instrumentId: "US_NVDA", skipRebuild: true, requestedBy: "email_seed" }),
      expect.objectContaining({ instrumentId: "US_BRK_B", skipRebuild: false }),
    ]);
  });

  it("leaves an account that already follows stocks alone, and never throws", async () => {
    const add = vi.fn(async () => undefined);
    expect(await seedFromSubscription({ uid: "u1", email: EMAIL }, { link: async () => ["NVDA"], readTracked: async () => ["US_AAPL"], add })).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(await seedFromSubscription({ uid: "u1", email: EMAIL }, { link: async () => { throw new Error("store down"); }, add })).toEqual([]);
    expect(await seedFromSubscription({ uid: "u1", email: null }, { link: async () => ["NVDA"], add })).toEqual([]);
    const flaky = vi.fn(async (args: { instrumentId: string }) => { if (args.instrumentId === "US_NVDA") throw new Error("busy"); });
    expect(await seedFromSubscription({ uid: "u1", email: EMAIL }, { link: async () => ["NVDA", "AMD"], readTracked: async () => [], add: flaky })).toEqual(["AMD"]);
  });
});
