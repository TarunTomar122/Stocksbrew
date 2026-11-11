import { generateText, Output } from "ai";
import { z } from "zod";

import { askModel } from "@/lib/ask-llm";

import { CANNOT_CODES, type BasketModelReader, type ModelBasketParse } from "./parse";
import { FILTER_FIELDS } from "./spec";
import { TOPICS, TOPIC_IDS } from "./topics";

/**
 * The model reader for the words the rules could not place. Same model and
 * keys as Ask (lib/ask-llm.ts). It may only pick subjects and fields from our
 * lists and copy numbers from the request (parse.ts drops any number that is
 * not written there). It never names a company or a ticker, and every
 * sentence a person reads is written by ./spec.ts.
 */

const SCHEMA = z.object({
  topics: z.array(z.enum(TOPIC_IDS)).describe("Subjects the request is about (any of them)."),
  ties: z.array(z.enum(TOPIC_IDS)).describe("Subjects every company must also have, e.g. 'ai' in 'AI chip stocks'."),
  exclude: z.array(z.enum(TOPIC_IDS)).describe("Subjects to leave out ('except banks')."),
  filters: z.array(
    z.object({
      field: z.enum(FILTER_FIELDS),
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
  ),
  cannot: z.array(
    z.object({
      quote: z.string().describe("The words from the request this is about, copied exactly."),
      reason: z.enum(CANNOT_CODES),
    }),
  ),
});

const TOPIC_LIST = TOPICS.map((topic) => `- ${topic.id}: ${topic.label}`).join("\n");

const SYSTEM = `You sort the leftover words of a request for a stock basket into fixed subjects and screener fields. You never write anything for the person to read, and you never name a company or a ticker.

Subjects (ids):
${TOPIC_LIST}

Fields (min/max in the field's own unit): market_cap (dollars), price (dollars a share), pe, fwd_pe, peg, ps (multiples), rev_growth (% year over year), rev_cagr_3y (% a year over 3 years), eps_growth (%), net_margin, op_margin, roic, roe (%), debt_equity (multiple), net_cash (dollars), div_yield (%), div_growth (% a year), div_growth_years (years), payout (%), buyback_yield (%), ret_6m, ret_ytd, ret_1y (%), vs_200d (% above the 200-day average), from_hi_pct (% from the one-year high, negative), rsi, vol_90d (% a year), beta, short_float (%), buy_pct (% of analysts saying buy), upside (% to the analyst target), inst_own (%), earnings_in_days (days).

Rules:
- Only use the ids and fields above. Anything else goes in "cannot" with the closest reason: esg, people (who runs the company), insiders, congress, ipo, crypto, geography (countries, where a company sells), funds (ETFs), ev, other_index (Dow, Russell), news, buzz (social media), options, or unclear.
- Use a number only if it is written in the request. Never invent one; use null.
- Read only the leftover words you are given, in the context of the whole request.`;

const TIMEOUT_MS = 12_000;

/** Null when no model is configured (or only the offline planner is), so the rules' reading stands. */
export function basketModelReader(): BasketModelReader | null {
  const llm = askModel();
  if (!llm || llm.via === "offline") return null;
  return async (text: string, leftover: string[]): Promise<ModelBasketParse> => {
    const result = await generateText({
      model: llm.model,
      system: SYSTEM,
      prompt: `Request: ${JSON.stringify(text)}\nLeftover words: ${JSON.stringify(leftover.join(" "))}`,
      output: Output.object({ schema: SCHEMA }),
      maxOutputTokens: 600,
      providerOptions: (llm.via === "anthropic" ? { anthropic: { effort: "low" } } : { openai: { reasoningEffort: "low" } }) as never,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = SCHEMA.safeParse(result.output);
    if (!parsed.success) throw new Error("plain_basket_model_bad_output");
    return parsed.data;
  };
}
