import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { normalizeModelHoldings, type ParsedHolding } from "@/lib/import/normalize";
import { llmApiKey, llmModel } from "@/lib/server-llm";

/**
 * Reads holdings out of broker screenshots (or messy pasted text) with a
 * vision model. The images are passed straight through from the request and
 * never written anywhere.
 *
 * Provider order: OpenAI when `OPENAI_API_KEY` is set (production has it),
 * then Anthropic when `ANTHROPIC_API_KEY` is set, then OpenRouter. Override
 * the model with `IMPORT_OPENAI_MODEL`, `IMPORT_ANTHROPIC_MODEL` or
 * `IMPORT_OPENROUTER_MODEL`.
 */

const OPENAI_DEFAULT = "gpt-5.6-luna";
const ANTHROPIC_DEFAULT = "claude-haiku-5-5";

export type ImportModel = { model: LanguageModel; via: "openai" | "anthropic" | "openrouter" };

export function importModel(): ImportModel | null {
  const openaiKey = llmApiKey();
  if (openaiKey) {
    const provider = createOpenAI({ apiKey: openaiKey });
    // IMPORT_OPENAI_MODEL wins over the app-wide LLM_MODEL, since this call needs a model that reads images.
    const model = (process.env.IMPORT_OPENAI_MODEL || "").trim() || llmModel(OPENAI_DEFAULT);
    return { model: provider(model), via: "openai" };
  }
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (anthropicKey) {
    const provider = createAnthropic({ apiKey: anthropicKey });
    return { model: provider((process.env.IMPORT_ANTHROPIC_MODEL || "").trim() || ANTHROPIC_DEFAULT), via: "anthropic" };
  }
  const openrouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (openrouterKey) {
    const provider = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: openrouterKey, name: "openrouter" });
    return { model: provider.chat((process.env.IMPORT_OPENROUTER_MODEL || "").trim() || `openai/${OPENAI_DEFAULT}`), via: "openrouter" };
  }
  return null;
}

// Every field is required and nullable: OpenAI's structured output refuses optional keys.
const HoldingSchema = z.object({
  ticker: z.string().nullable().describe("The ticker symbol exactly as shown, e.g. AAPL or BRK.B. Null if only a name is shown."),
  name: z.string().nullable().describe("The company or fund name as shown, or null."),
  shares: z.number().nullable().describe("Number of shares held. Null if not visible."),
  average_cost: z.number().nullable().describe("Average cost PER SHARE. Null if not visible. Do not use the total cost here."),
  market_value: z.number().nullable().describe("Current market value of the whole position, or null."),
  currency: z.string().nullable().describe("ISO code of the money amounts on this row as shown, e.g. USD or EUR. Null if no amounts are shown."),
  confidence: z.enum(["high", "medium", "low"]).describe("How sure you are that this row is read correctly."),
});

const ResultSchema = z.object({
  kind: z.enum(["holdings", "not_holdings"]).describe("not_holdings when the input is not a list of investment positions."),
  holdings: z.array(HoldingSchema),
});

const INSTRUCTIONS = `You read stock holdings from screenshots of brokerage apps and from text people paste.

Return every position you can see: stocks, ETFs and funds. For each one give the ticker, the name, the number of shares, the average cost per share and the market value, exactly as shown. Use null for anything that is not visible. Never guess or work out a number that is not on screen: if the screen shows a total cost but no cost per share, leave average_cost null.

Numbers come back as plain numbers whatever the screen's language: "1.234,56" on a German screen is 1234.56, and "25 Stk." is 25 shares. Give the currency the amounts are shown in.

Skip cash, money market and sweep funds, totals, buying power, pending orders, options and crypto. If the same position appears twice (overlapping screenshots), list it once.

Confidence: high when the ticker and numbers are crisp and clearly belong together; medium when something is cut off, blurry or you had to infer which column is which; low when you are unsure the row is a position at all.

If the input is not a list of holdings (a chart, a news article, a photo), set kind to not_holdings and return no holdings.`;

export type VisionImage = { data: Uint8Array; mediaType: string };

export type VisionResult = {
  ok: true;
  holdings: ParsedHolding[];
  notHoldings: boolean;
  via: ImportModel["via"];
} | {
  ok: false;
  code: "no_model" | "model_failed" | "timeout";
};

/** Read holdings from images and/or text with the model. One model call per request. */
export async function readHoldingsWithModel(input: { images: VisionImage[]; text?: string | null }, timeoutMs = 45_000): Promise<VisionResult> {
  const chosen = importModel();
  if (!chosen) return { ok: false, code: "no_model" };
  const content: Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string }> = [];
  if (input.images.length > 0) {
    content.push({
      type: "text",
      text: input.images.length === 1 ? "Here is one screenshot." : `Here are ${input.images.length} screenshots of the same account; they may overlap.`,
    });
    for (const image of input.images) content.push({ type: "image", image: image.data, mediaType: image.mediaType });
  }
  if (input.text) content.push({ type: "text", text: `Pasted text:\n\n${input.text}` });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await generateText({
      model: chosen.model,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content }],
      output: Output.object({ schema: ResultSchema }),
      maxOutputTokens: 4000,
      abortSignal: controller.signal,
      ...(chosen.via === "openai" ? { providerOptions: { openai: { reasoningEffort: "low" } } } : {}),
    });
    const output = result.output as z.infer<typeof ResultSchema> | undefined;
    if (!output) return { ok: false, code: "model_failed" };
    return {
      ok: true,
      holdings: output.kind === "not_holdings" ? [] : normalizeModelHoldings(output.holdings),
      notHoldings: output.kind === "not_holdings",
      via: chosen.via,
    };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, code: "timeout" };
    // Never log the request: it holds the person's screenshot. The error message is enough.
    console.error("import model failed", chosen.via, error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return { ok: false, code: "model_failed" };
  } finally {
    clearTimeout(timer);
  }
}
