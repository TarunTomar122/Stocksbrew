import { generateText, Output } from "ai";
import { z } from "zod";

import { askModel } from "@/lib/ask-llm";

import type { NoteReader, NotePayload } from "./word";

/**
 * The one model call that words a reason check, with the same model and
 * keys as Ask (lib/ask-llm.ts). It gets the rules' verdict, their draft and
 * the facts with their values, and may only reword them; lib/thesis-watch/word.ts
 * checks every sentence that comes back. With no model configured the
 * rules' note stands, which is complete on its own.
 */

const SCHEMA = z.object({
  note: z.string().describe("The note: the verdict sentence exactly as given, then two or three short full sentences."),
});

const SYSTEM = `You word a short note on whether a person's reason for owning a stock still holds. The verdict and the facts are already decided.

Rules:
- Start with the verdict sentence exactly as given.
- Then two or three short full sentences built only from the facts. Use only the numbers in the facts, exactly as given or rounded the same way. Never add a number, a date, a stock, a cause or a forecast.
- When the person's own words are given, say plainly which fact speaks to them. Do not quote more than a few of their words.
- Plain words, like a careful friend who follows stocks. No jargon, no hype, no em dashes, no lists, no questions, no advice to buy or sell.`;

const TIMEOUT_MS = 10_000;

/** Null when no model is configured (or only the offline planner is), so the rules' note stands. */
export function thesisModelReader(): NoteReader | null {
  const llm = askModel();
  if (!llm || llm.via === "offline") return null;
  return async (payload: NotePayload) => {
    const result = await generateText({
      model: llm.model,
      system: SYSTEM,
      prompt: JSON.stringify({ stock: payload.ticker, verdict: payload.verdict, their_words: payload.quote, draft: payload.draft, facts: payload.facts }),
      output: Output.object({ schema: SCHEMA }),
      maxOutputTokens: 400,
      providerOptions: (llm.via === "anthropic" ? { anthropic: { effort: "low" } } : { openai: { reasoningEffort: "low" } }) as never,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = SCHEMA.safeParse(result.output);
    return parsed.success ? parsed.data : null;
  };
}
