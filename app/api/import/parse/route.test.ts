import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  plan: "anon" as "anon" | "free" | "pro",
  allowed: true,
  meterCalls: [] as Array<[string, string]>,
  modelCalls: 0,
  refunds: 0,
  hasModel: true,
  modelFails: false,
}));

vi.mock("@/lib/import/server", async () => {
  const { buildDirectory } = await import("@/lib/import/resolve");
  return {
    getImportViewer: async () => ({ uid: state.plan === "anon" ? null : "me", plan: state.plan }),
    getImportDirectory: async () =>
      buildDirectory([
        { instrument_id: "US_AAPL", ticker: "AAPL", name: "Apple Inc." },
        { instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA Corporation" },
      ]),
  };
});
vi.mock("@/lib/import/limits", () => ({
  anonymousSubject: () => "anon_hash",
  refundImportRead: async () => {
    state.refunds += 1;
  },
  consumeImportRead: async (plan: string, subject: string) => {
    state.meterCalls.push([plan, subject]);
    return state.allowed ? { allowed: true, used: 1, limit: 3, remaining: 2 } : { allowed: false, used: 3, limit: 3, remaining: 0, reason: "personal" };
  },
}));
vi.mock("@/lib/import/vision", () => ({
  importModel: () => (state.hasModel ? { via: "openai" } : null),
  readHoldingsWithModel: async () => {
    state.modelCalls += 1;
    if (state.modelFails) return { ok: false, code: "model_failed" };
    return { ok: true, via: "openai", notHoldings: false, holdings: [{ ticker: "NVDA", name: null, shares: 25, averageCost: 118, marketValue: null, confidence: "high" }] };
  },
}));

import { POST } from "./route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function form(fields: { text?: string; images?: Uint8Array[] }) {
  const body = new FormData();
  if (fields.text !== undefined) body.append("text", fields.text);
  for (const image of fields.images ?? []) body.append("images", new Blob([image as Uint8Array<ArrayBuffer>], { type: "image/png" }), "shot.png");
  return new NextRequest("http://localhost/api/import/parse", { method: "POST", body });
}

beforeEach(() => {
  state.plan = "anon";
  state.allowed = true;
  state.meterCalls = [];
  state.modelCalls = 0;
  state.refunds = 0;
  state.hasModel = true;
  state.modelFails = false;
});

describe("POST /api/import/parse", () => {
  it("reads a list of tickers by rules, without the model or the meter", async () => {
    const res = await POST(form({ text: "AAPL 10\nNVDA" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ via: "rules", input: "text" });
    expect(body.rows.map((r: { instrument_id: string }) => r.instrument_id)).toEqual(["US_AAPL", "US_NVDA"]);
    expect(state.meterCalls).toEqual([]);
    expect(state.modelCalls).toBe(0);
  });

  it("refuses an empty request and a file that is not an image", async () => {
    expect((await POST(form({}))).status).toBe(400);
    const res = await POST(form({ images: [new TextEncoder().encode("not an image at all")] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_an_image" });
    expect(state.modelCalls).toBe(0);
  });

  it("refuses more than four screenshots", async () => {
    const res = await POST(form({ images: [PNG, PNG, PNG, PNG, PNG] }));
    expect(res.status).toBe(400);
    expect(state.modelCalls).toBe(0);
  });

  it("refuses a request that says it is too big before reading it", async () => {
    const req = new NextRequest("http://localhost/api/import/parse", { method: "POST", body: "x", headers: { "content-length": "9000000" } });
    expect((await POST(req)).status).toBe(413);
  });

  it("counts a screenshot read against the visitor's hashed address", async () => {
    const res = await POST(form({ images: [PNG] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.meterCalls).toEqual([["anon", "anon_hash"]]);
    expect(body).toMatchObject({ via: "model", input: "image", remaining: 2 });
    expect(body.rows[0]).toMatchObject({ instrument_id: "US_NVDA", shares: 25, average_cost: 118, status: "matched" });
  });

  it("counts a signed-in read against the account", async () => {
    state.plan = "free";
    await POST(form({ images: [PNG] }));
    expect(state.meterCalls).toEqual([["free", "me"]]);
  });

  it("stops at the daily limit without calling the model", async () => {
    state.allowed = false;
    const res = await POST(form({ images: [PNG] }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "limit", plan: "anon" });
    expect(state.modelCalls).toBe(0);
  });

  it("does not spend a read when no model is set up", async () => {
    state.hasModel = false;
    const res = await POST(form({ images: [PNG] }));
    expect(res.status).toBe(503);
    expect(state.meterCalls).toEqual([]);
  });

  it("gives the read back when the model fails", async () => {
    state.modelFails = true;
    const res = await POST(form({ images: [PNG] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "model_failed" });
    expect(state.refunds).toBe(1);
  });
});
