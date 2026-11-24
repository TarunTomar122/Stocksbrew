import {
  CONFIRM_RESEND_MS,
  MAX_SUBSCRIBER_TICKERS,
  instrumentIdOf,
  isActiveSubscriber,
  mergeTickers,
  normalizeEmail,
  normalizeTicker,
  planCapture,
  seedTickers,
  subscriberId,
  subscriberToken,
  verifySubscriberToken,
} from "@/lib/email-subscribers";

const NOW = Date.parse("2026-11-24T15:00:00Z");
const SECRET = "test-secret";

describe("email capture rules", () => {
  it("accepts real addresses, lowercased, and refuses the rest", () => {
    expect(normalizeEmail("  Sam.Lee+news@Example.COM ")).toBe("sam.lee+news@example.com");
    for (const bad of ["", "sam", "sam@", "@example.com", "sam@example", "sam@@example.com", "sam..lee@example.com", ".sam@example.com", "sam@-example.com", "sam @example.com", "a".repeat(65) + "@example.com", 42, null]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it("reads tickers in the US shape and maps them to instrument ids", () => {
    expect(normalizeTicker(" nvda ")).toBe("NVDA");
    expect(normalizeTicker("brk.b")).toBe("BRK.B");
    expect(normalizeTicker("NVDA; drop")).toBeNull();
    expect(normalizeTicker("TOOLONGX")).toBeNull();
    expect(instrumentIdOf("BRK.B")).toBe("US_BRK_B");
  });

  it("keys a signup by the lowercased address", () => {
    expect(subscriberId("Sam@Example.com")).toBe(subscriberId("sam@example.com"));
    expect(subscriberId("sam@example.com")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("signs links per purpose and refuses a swapped or forged one", () => {
    const id = subscriberId("sam@example.com");
    const confirm = subscriberToken(id, "confirm", SECRET)!;
    expect(verifySubscriberToken(id, "confirm", confirm, SECRET)).toBe(true);
    expect(verifySubscriberToken(id, "stop", confirm, SECRET)).toBe(false);
    expect(verifySubscriberToken(subscriberId("other@example.com"), "confirm", confirm, SECRET)).toBe(false);
    expect(verifySubscriberToken("not-an-id", "confirm", confirm, SECRET)).toBe(false);
    expect(subscriberToken(id, "confirm", "")).toBeNull();
    expect(verifySubscriberToken(id, "confirm", confirm, "")).toBe(false);
  });

  it("adds a ticker once, at the end, and stops at the cap", () => {
    expect(mergeTickers(["NVDA"], "AMD")).toEqual(["NVDA", "AMD"]);
    expect(mergeTickers(["NVDA", "AMD"], "NVDA")).toEqual(["NVDA", "AMD"]);
    const full = Array.from({ length: MAX_SUBSCRIBER_TICKERS }, (_, i) => `T${i}`);
    expect(mergeTickers(full, "NVDA")).toEqual(full);
    expect(mergeTickers(["NVDA", "bad ticker", 7 as unknown as string], null)).toEqual(["NVDA"]);
  });
});

describe("planCapture", () => {
  const input = { email: "sam@example.com", ticker: "NVDA", source: "stock" as const };

  it("a new address is stored and gets a confirmation", () => {
    const plan = planCapture(null, input, NOW);
    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.sendConfirm).toBe(true);
    expect(plan.doc).toMatchObject({ email: "sam@example.com", tickers: ["NVDA"], source: "stock", confirmed_at: null, unsubscribed_at: null });
  });

  it("a repeat signup within 24 hours adds the ticker but sends no second confirmation", () => {
    const first = planCapture(null, input, NOW);
    if (first.kind !== "write") throw new Error("expected a write");
    const stored = { ...first.doc, confirm_sent_at: new Date(NOW).toISOString() };
    const again = planCapture(stored, { ...input, ticker: "AMD", source: "earnings" }, NOW + CONFIRM_RESEND_MS - 1);
    if (again.kind !== "write") throw new Error("expected a write");
    expect(again.sendConfirm).toBe(false);
    expect(again.doc.tickers).toEqual(["NVDA", "AMD"]);
    expect(again.doc.source).toBe("stock");
    expect(again.doc.last_source).toBe("earnings");
    expect(again.doc.created_at).toBe(stored.created_at);
    const later = planCapture(stored, input, NOW + CONFIRM_RESEND_MS);
    expect(later.kind === "write" && later.sendConfirm).toBe(true);
  });

  it("a confirmed address never gains a ticker from the form: it is asked by email, once a day; a stopped one is asked to confirm again", () => {
    const confirmed = { email: "sam@example.com", tickers: ["NVDA"], source: "stock" as const, confirmed_at: "2026-11-01T00:00:00Z", confirm_sent_at: "2026-11-01T00:00:00Z" };
    const plan = planCapture(confirmed, { ...input, ticker: "TSLA" }, NOW);
    if (plan.kind !== "write") throw new Error("expected a write");
    expect(plan.sendConfirm).toBe(false);
    expect(plan.sendAdd).toBe("TSLA");
    expect(plan.doc.tickers).toEqual(["NVDA"]);
    // a stock it already follows, or one asked for within 24 hours of the last add email: nothing to send
    expect(planCapture(confirmed, input, NOW)).toMatchObject({ sendAdd: null, sendConfirm: false });
    const asked = { ...confirmed, add_sent_at: new Date(NOW - 60_000).toISOString() };
    expect(planCapture(asked, { ...input, ticker: "AMD" }, NOW)).toMatchObject({ sendAdd: null, doc: { tickers: ["NVDA"] } });
    expect(planCapture(asked, { ...input, ticker: "AMD" }, NOW - 60_000 + CONFIRM_RESEND_MS)).toMatchObject({ sendAdd: "AMD" });
    // a full list asks for nothing
    const full = { ...confirmed, tickers: Array.from({ length: MAX_SUBSCRIBER_TICKERS }, (_, i) => `T${i}`) };
    expect(planCapture(full, { ...input, ticker: "TSLA" }, NOW)).toMatchObject({ sendAdd: null });
    const stopped = planCapture({ ...confirmed, unsubscribed_at: "2026-11-10T00:00:00Z" }, input, NOW);
    expect(stopped.kind === "write" && stopped.sendConfirm).toBe(true);
    // still stopped until the new link is clicked
    expect(stopped.kind === "write" && stopped.doc.unsubscribed_at).toBe("2026-11-10T00:00:00Z");
  });

  it("an address linked to an account is left alone", () => {
    expect(planCapture({ email: "sam@example.com", linked_uid: "u1" }, input, NOW)).toEqual({ kind: "linked" });
  });

  it("a confirmation stamped in the future (a clock skew) does not block a new one", () => {
    const plan = planCapture({ email: "sam@example.com", tickers: [], confirm_sent_at: new Date(NOW + 3_600_000).toISOString() }, input, NOW);
    expect(plan.kind === "write" && plan.sendConfirm).toBe(true);
  });
});

describe("who gets mail and what a new account starts with", () => {
  const base = { email: "sam@example.com", tickers: ["NVDA", "AMD", "TSLA", "PLTR"], confirmed_at: "2026-11-01T00:00:00Z" };

  it("only a confirmed, active, unlinked signup", () => {
    expect(isActiveSubscriber(base)).toBe(true);
    expect(isActiveSubscriber({ ...base, confirmed_at: null })).toBe(false);
    expect(isActiveSubscriber({ ...base, unsubscribed_at: "2026-11-02T00:00:00Z" })).toBe(false);
    expect(isActiveSubscriber({ ...base, linked_uid: "u1" })).toBe(false);
  });

  it("seeds up to the free limit, and nothing from an unconfirmed signup", () => {
    expect(seedTickers(base, 3)).toEqual(["NVDA", "AMD", "TSLA"]);
    expect(seedTickers({ ...base, confirmed_at: null }, 3)).toEqual([]);
    expect(seedTickers(null, 3)).toEqual([]);
  });
});
