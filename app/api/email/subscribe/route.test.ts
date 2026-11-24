import { NextRequest } from "next/server";

const capture = vi.fn();
const instrumentExists = vi.fn(async () => false);

vi.mock("@/lib/email-subscribers-store", () => ({ captureSubscriber: (...args: unknown[]) => capture(...args) }));
vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: { collection: () => ({ doc: () => ({ get: async () => ({ exists: await instrumentExists() }) }) }) },
}));
vi.mock("@/lib/seo/stock-pages", () => ({ getSeoStockPage: (t: string) => (t === "NVDA" ? { ticker: "NVDA" } : null) }));

let ip = 0;
/** Each test gets its own visitor address, so the per-address limit only bites where a test means it to. */
function post(body: unknown, address = `203.0.113.${++ip}`) {
  return new NextRequest("http://localhost/api/email/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": address },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(body: unknown, address?: string) {
  const { POST } = await import("@/app/api/email/subscribe/route");
  const res = await POST(post(body, address));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

const OK = { email: "Sam@Example.com", source: "stock", ticker: "nvda", website: "", ms: 5000 };

beforeEach(() => {
  capture.mockReset();
  capture.mockResolvedValue({ status: "stored", confirmSent: true, addSent: false, id: "x" });
  instrumentExists.mockReset();
  instrumentExists.mockResolvedValue(false);
});

describe("POST /api/email/subscribe", () => {
  it("stores a valid signup, lowercased, with its stock", async () => {
    const res = await call(OK);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(capture).toHaveBeenCalledWith({ email: "sam@example.com", ticker: "NVDA", source: "stock" }, expect.any(Object));
  });

  it("refuses a bad address, a bad source, a bad or unknown ticker, and a body that is not an object", async () => {
    expect((await call({ ...OK, email: "sam@example" })).body).toEqual({ ok: false, error: "email" });
    expect((await call({ ...OK, source: "home" })).status).toBe(400);
    expect((await call({ ...OK, ticker: "NV DA" })).body).toEqual({ ok: false, error: "ticker" });
    expect((await call({ ...OK, ticker: "ZZZZ" })).body).toEqual({ ok: false, error: "ticker" });
    expect((await call("null")).status).toBe(400);
    expect((await call("[1]")).status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it("takes a stock outside the catalogue that the store has", async () => {
    instrumentExists.mockResolvedValue(true);
    expect((await call({ ...OK, ticker: "ZZZZ" })).status).toBe(200);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ ticker: "ZZZZ" }), expect.any(Object));
  });

  it("a market signup (no ticker) is fine", async () => {
    expect((await call({ email: "sam@example.com", source: "news", ms: 5000 })).status).toBe(200);
    expect(capture).toHaveBeenCalledWith({ email: "sam@example.com", ticker: null, source: "news" }, expect.any(Object));
  });

  it("answers a filled honeypot or a too-fast form like a real signup, and stores nothing", async () => {
    expect(await call({ ...OK, website: "https://spam.example" }).then((r) => [r.status, r.body])).toEqual([200, { ok: true }]);
    expect(await call({ ...OK, ms: 120 }).then((r) => [r.status, r.body])).toEqual([200, { ok: true }]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("treats a missing or broken timing like a too-fast form: the real form always sends it", async () => {
    const { ms: _ms, ...noTiming } = OK;
    for (const body of [noTiming, { ...OK, ms: null }, { ...OK, ms: "5000" }, { ...OK, ms: -1 }]) {
      expect(await call(body).then((r) => [r.status, r.body])).toEqual([200, { ok: true }]);
    }
    expect(capture).not.toHaveBeenCalled();
  });

  it("limits one visitor address to five signups in ten minutes", async () => {
    const address = "198.51.100.7";
    for (let i = 0; i < 5; i += 1) expect((await call({ ...OK, email: `sam${i}@example.com` }, address)).status).toBe(200);
    const sixth = await call({ ...OK, email: "sam9@example.com" }, address);
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(capture).toHaveBeenCalledTimes(5);
    // another address is not held back
    expect((await call(OK, "198.51.100.8")).status).toBe(200);
  });

  it("is idempotent from the outside: an account's address or a repeat answers the same", async () => {
    capture.mockResolvedValueOnce({ status: "account" });
    expect((await call(OK)).body).toEqual({ ok: true });
    capture.mockResolvedValueOnce({ status: "stored", confirmSent: false, addSent: false, id: "x" });
    expect((await call(OK)).body).toEqual({ ok: true });
    // a confirmed address asked by email to add the stock
    capture.mockResolvedValueOnce({ status: "stored", confirmSent: false, addSent: true, id: "x" });
    expect(await call(OK).then((r) => [r.status, r.body])).toEqual([200, { ok: true }]);
  });

  it("answers a spent email cap like any signup (a 429 would say the address is new or waiting), and 503 when the store fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    capture.mockResolvedValueOnce({ status: "busy", id: "x" });
    const busy = await call({ ...OK, email: "waiting.person@example.com" });
    expect([busy.status, busy.body, busy.headers.get("retry-after")]).toEqual([200, { ok: true }, null]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("waiting.person");
    warn.mockRestore();
    capture.mockRejectedValueOnce(new Error("down"));
    const res = await call(OK);
    expect(res.status).toBe(503);
  });

  it("never logs the address", async () => {
    const spies = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "log").mockImplementation(() => {})];
    capture.mockRejectedValueOnce(new Error("down"));
    await call({ ...OK, email: "secret.person@example.com" });
    capture.mockResolvedValueOnce({ status: "busy", id: "x" });
    await call({ ...OK, email: "secret.person@example.com" });
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain("secret.person");
    for (const spy of spies) spy.mockRestore();
  });
});
