import { NextRequest } from "next/server";

const confirm = vi.fn();
const add = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/email-subscribers-store", () => ({
  confirmSubscriber: (...args: unknown[]) => confirm(...args),
  addSubscriberTicker: (...args: unknown[]) => add(...args),
}));

import { addPurpose, subscriberToken } from "@/lib/email-subscribers";

const ID = "a".repeat(64);

async function call(body: unknown) {
  const { POST } = await import("@/app/api/email/subscribe/confirm/route");
  const res = await POST(new NextRequest("http://localhost/api/email/subscribe/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
  confirm.mockReset().mockResolvedValue({ state: "confirmed", tickers: ["NVDA"] });
  add.mockReset().mockResolvedValue({ state: "added", tickers: ["NVDA", "AMD"] });
});

describe("POST /api/email/subscribe/confirm", () => {
  it("confirms with the confirm link", async () => {
    expect(await call({ s: ID, t: subscriberToken(ID, "confirm") })).toEqual({ status: 200, body: { ok: true, state: "confirmed", tickers: ["NVDA"] } });
    expect(add).not.toHaveBeenCalled();
  });

  it("adds only the stock the add link was signed for", async () => {
    const token = subscriberToken(ID, addPurpose("AMD"));
    expect(await call({ s: ID, t: token, a: "amd" })).toEqual({ status: 200, body: { ok: true, state: "added", tickers: ["NVDA", "AMD"] } });
    expect(add).toHaveBeenCalledWith(ID, "AMD");
    // the same token for another stock, the confirm token used to add, or an add token used to confirm: refused
    for (const body of [{ s: ID, t: token, a: "TSLA" }, { s: ID, t: subscriberToken(ID, "confirm"), a: "AMD" }, { s: ID, t: token }, { s: ID, t: token, a: "NV DA" }]) {
      expect(await call(body)).toEqual({ status: 400, body: { ok: false, error: "link" } });
    }
    expect(add).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});
