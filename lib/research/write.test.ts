import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResearchBody } from "./types";
import { costOf, writeReport, type WriteInput } from "./write";

/**
 * Production has only an OpenAI key, so the report is written by OpenAI there.
 * The live runs on Nov 11 used Anthropic (the only key on the laptop). These
 * pin which provider is chosen and the OpenAI request we send, with no network.
 */

const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "ASK_ANTHROPIC_MODEL", "LLM_MODEL", "OPENAI_MODEL"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

const BODY: ResearchBody = {
  headline: "Revenue reached $303 billion over the last year [S1].",
  summary: ["Revenue reached $303 billion [S1]."],
  business: ["It sells chips [S1]."],
  drivers: [],
  bull: [{ title: "Margins are high", text: "The operating margin is 65.2% [S1]." }],
  bear: [],
  valuation: [],
  numbers: [],
  ownership: [],
  risks: [],
  change: [],
  watch: [{ date: null, text: "Next results [S1]." }],
};

const INPUT: WriteInput = {
  ticker: "NVDA",
  name: "NVIDIA",
  today: "2026-11-11",
  sources: [{ id: "S1", label: "Financials", url: "/stock/NVDA", kind: "data", as_of: null }],
  facts: { financials: { source: "S1", revenue: 302970000000, operating_margin_pct: 65.2 } },
  missing: [],
};

function openaiReply(output: unknown) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      created_at: 1_762_000_000,
      model: "gpt-5.6-luna",
      status: "completed",
      output: [
        { type: "message", id: "msg_test", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] },
      ],
      usage: { input_tokens: 20_000, output_tokens: 12_000, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3_000 } },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("writeReport on OpenAI (production: only OPENAI_API_KEY is set)", () => {
  it("sends one Responses call on gpt-5.6-luna with the report schema, and reads the report back", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return openaiReply(BODY);
      }),
    );
    const result = await writeReport(INPUT);
    expect(result).toMatchObject({ via: "openai", model: "gpt-5.6-luna", input_tokens: 20_000, output_tokens: 12_000 });
    expect(result.body.headline).toBe(BODY.headline);

    expect(calls).toHaveLength(1);
    const { url, body } = calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning).toMatchObject({ effort: "medium" });
    expect(body.max_output_tokens).toBe(24_000);
    const format = (body.text as { format: Record<string, unknown> }).format;
    expect(format).toMatchObject({ type: "json_schema", strict: true });
    const schema = format.schema as { required: string[]; properties: { watch: { items: { required: string[] } } } };
    expect(schema.required.sort()).toEqual(["bear", "bull", "business", "change", "drivers", "headline", "numbers", "ownership", "risks", "summary", "valuation", "watch"]);
    expect(schema.properties.watch.items.required.sort()).toEqual(["date", "text"]);
    // The same system prompt and the evidence go with it.
    const sent = JSON.stringify(body.input);
    expect(sent).toContain("You write stock research for stocksbrew");
    expect(sent).toContain("302970000000");
  });

  it("prices a report per provider", () => {
    expect(costOf("gpt-5.6-luna", 20_000, 12_000)).toBe(0.0184);
    expect(costOf("claude-haiku-5-5", 20_000, 12_000)).toBe(0.008);
    expect(costOf("some-other-model", 20_000, 12_000)).toBeNull();
  });

  it("stops the call when the run's time is up", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        return openaiReply(BODY);
      }),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(writeReport({ ...INPUT, signal: controller.signal })).rejects.toThrow();
  });
});

describe("which provider writes", () => {
  it("uses Claude Haiku when an Anthropic key is set, even with an OpenAI key", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const urls: string[] = [];
    const models: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        urls.push(String(url));
        models.push(JSON.parse(String(init?.body ?? "{}")).model);
        return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "test" } }), { status: 400, headers: { "content-type": "application/json" } });
      }),
    );
    await expect(writeReport(INPUT)).rejects.toThrow();
    expect(urls[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(models[0]).toBe("claude-haiku-5-5");
  });

  it("refuses to write with no key at all instead of pretending", async () => {
    await expect(writeReport(INPUT)).rejects.toThrow("research_not_configured");
  });
});
