import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readHoldingsWithModel } from "./vision";

/**
 * Production reads screenshots with OpenAI. The live check on Nov 11 ran on
 * Anthropic (the only key on the laptop), so this pins the OpenAI request we
 * send and the reply we parse, without a network call.
 */

const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "IMPORT_OPENAI_MODEL", "LLM_MODEL", "OPENAI_MODEL"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function reply(output: unknown) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      created_at: 1_762_000_000,
      model: "gpt-5.6-luna",
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_test",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
        },
      ],
      usage: { input_tokens: 900, output_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("readHoldingsWithModel on OpenAI", () => {
  it("sends the screenshot with a strict schema and reads the rows back", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return reply({
          kind: "holdings",
          holdings: [
            { ticker: "AAPL", name: "Apple", shares: 25, average_cost: 172.4, market_value: 8715.75, currency: "USD", confidence: "high" },
            { ticker: null, name: "Apple", shares: 3, average_cost: 158.4, market_value: null, currency: "EUR", confidence: "high" },
          ],
        });
      }),
    );
    const result = await readHoldingsWithModel({ images: [{ data: PNG, mediaType: "image/png" }] });
    expect(result).toMatchObject({ ok: true, via: "openai", notHoldings: false });
    if (!result.ok) return;
    expect(result.holdings).toEqual([
      { ticker: "AAPL", name: "Apple", shares: 25, averageCost: 172.4, marketValue: 8715.75, confidence: "high" },
      { ticker: null, name: "Apple", shares: 3, averageCost: null, marketValue: null, confidence: "medium", currency: "EUR" },
    ]);

    expect(calls).toHaveLength(1);
    const { url, body } = calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning).toMatchObject({ effort: "low" });
    const format = (body.text as { format: Record<string, unknown> }).format;
    expect(format).toMatchObject({ type: "json_schema", strict: true });
    // Strict mode needs every key required; nullable fields stand in for optional ones.
    const holding = ((format.schema as { properties: { holdings: { items: { required: string[] } } } }).properties.holdings.items);
    expect(holding.required.sort()).toEqual(["average_cost", "confidence", "currency", "market_value", "name", "shares", "ticker"]);
    const content = JSON.stringify(body.input);
    expect(content).toContain("input_image");
    expect(content).toContain("data:image/png;base64,");
  });

  it("returns no rows when the model says it is not a holdings screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ kind: "not_holdings", holdings: [{ ticker: "NVDA", name: null, shares: null, average_cost: null, market_value: null, currency: null, confidence: "low" }] })));
    expect(await readHoldingsWithModel({ images: [{ data: PNG, mediaType: "image/png" }] })).toMatchObject({ ok: true, notHoldings: true, holdings: [] });
  });

  it("says model_failed, without the screenshot in the log, when the call errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad image", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } })));
    expect(await readHoldingsWithModel({ images: [{ data: PNG, mediaType: "image/png" }] })).toEqual({ ok: false, code: "model_failed" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("base64");
    log.mockRestore();
  });

  it("has nothing to read with when no key is set", async () => {
    delete process.env.OPENAI_API_KEY;
    expect(await readHoldingsWithModel({ images: [], text: "apple" })).toEqual({ ok: false, code: "no_model" });
  });
});
