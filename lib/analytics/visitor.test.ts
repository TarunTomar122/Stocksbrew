import { SaltKeeper, utcDay, visitorHash, type SaltStore } from "@/lib/analytics/visitor";

function fakeStore() {
  const salts = new Map<string, string>();
  const removed: string[] = [];
  const store: SaltStore = {
    async read(day) {
      return salts.get(day) ?? null;
    },
    async create(day, salt) {
      if (salts.has(day)) return false;
      salts.set(day, salt);
      return true;
    },
    async removeBefore(day) {
      for (const key of [...salts.keys()]) if (key < day) salts.delete(key);
      removed.push(day);
    },
  };
  return { store, salts, removed };
}

const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const HOST = "www.stocksbrew.online";
const DAY1 = Date.parse("2026-11-13T10:00:00Z");
const DAY1_LATE = Date.parse("2026-11-13T23:59:00Z");
const DAY2 = Date.parse("2026-11-14T00:01:00Z");

describe("visitor hash", () => {
  it("is 16 hex characters, stable for one salt, and different for another visitor", () => {
    const a = visitorHash("s".repeat(64), HOST, IP, UA);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(visitorHash("s".repeat(64), HOST, IP, UA)).toBe(a);
    expect(visitorHash("s".repeat(64), HOST, "203.0.113.8", UA)).not.toBe(a);
    expect(visitorHash("s".repeat(64), HOST, IP, `${UA} x`)).not.toBe(a);
    expect(a).not.toContain(IP.replace(/\./g, ""));
  });

  it("rotates every UTC day: the same person gets a new id after midnight", async () => {
    const { store } = fakeStore();
    let n = 0;
    const keeper = new SaltKeeper(store, () => `salt-${++n}`.padEnd(64, "x"));
    const morning = visitorHash(await keeper.saltFor(DAY1), HOST, IP, UA);
    const night = visitorHash(await keeper.saltFor(DAY1_LATE), HOST, IP, UA);
    const tomorrow = visitorHash(await keeper.saltFor(DAY2), HOST, IP, UA);
    expect(night).toBe(morning);
    expect(tomorrow).not.toBe(morning);
  });

  it("deletes the old day's salt once a new one is made, so old ids can't be recomputed", async () => {
    const { store, salts, removed } = fakeStore();
    const keeper = new SaltKeeper(store);
    await keeper.saltFor(DAY1);
    expect([...salts.keys()]).toEqual([utcDay(DAY1)]);
    await keeper.saltFor(DAY2);
    await Promise.resolve();
    expect(removed).toContain(utcDay(DAY2));
    expect([...salts.keys()]).toEqual([utcDay(DAY2)]);
  });

  it("never brings back a deleted salt for a late event from the day before", async () => {
    const { store, salts } = fakeStore();
    const keeper = new SaltKeeper(store);
    await keeper.saltFor(DAY1);
    const today = await keeper.saltFor(DAY2);
    await Promise.resolve();
    expect(await keeper.saltFor(DAY1_LATE)).toBe(today);
    expect([...salts.keys()]).toEqual([utcDay(DAY2)]);
  });

  it("two instances agree on the day's salt: the second one reads what the first created", async () => {
    const { store } = fakeStore();
    const first = new SaltKeeper(store, () => "a".repeat(64));
    const second = new SaltKeeper(store, () => "b".repeat(64));
    const [s1, s2] = await Promise.all([first.saltFor(DAY1), second.saltFor(DAY1)]);
    expect(s1).toBe(s2);
  });

  it("asks the store once per day, not once per event", async () => {
    const { store } = fakeStore();
    const read = vi.spyOn(store, "read");
    const keeper = new SaltKeeper(store);
    await Promise.all([keeper.saltFor(DAY1), keeper.saltFor(DAY1), keeper.saltFor(DAY1 + 1000)]);
    await keeper.saltFor(DAY1 + 5000);
    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
