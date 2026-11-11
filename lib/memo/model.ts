import { generateText, Output } from "ai";
import { z } from "zod";

import { askModel } from "@/lib/ask-llm";

import type { MemoWordReader, WordingPayload } from "./word";

/**
 * The one model call that words a memo. It uses the same model and keys as
 * Ask (lib/ask-llm.ts). It gets the facts the rules chose, each with its own
 * sentence and values, and may only reword them; lib/memo/word.ts checks
 * every sentence that comes back and drops the ones that cite a number or a
 * stock the facts do not hold. With no model configured the rules' sentences
 * stand, which is a complete memo on its own.
 */

const SCHEMA = z.object({
  top_line: z
    .string()
    .describe(
      "As many sentences as the draft top line: how the week went against the S&P 500, which holdings the figure leaves out and why when the draft says so, then the one thing to look at, or that nothing needs a decision.",
    ),
  items: z.array(
    z.object({
      id: z.string().describe("The id of the item, copied exactly."),
      text: z.string().describe("The item in one or two short full sentences."),
    }),
  ),
});

const SYSTEM = `You word a short weekly memo on a person's stock portfolio. The facts are already chosen and each comes with a plain sentence and its values. Rewrite each item so the memo reads like a careful person wrote it for a friend who follows stocks.

Rules:
- Use only the numbers in that item's sentence and values, exactly as given or rounded the same way. Never add a number, a date, a stock or a cause that is not in the item.
- One or two short full sentences per item. Keep the stock's name. Say what happened, then why it matters when the facts say so.
- The top line has as many sentences as the draft top line, built from the items. When the draft says "Together, eight of nine holdings", keep "Together" and keep the sentence naming the holding left out and why.
- Plain words. No jargon, no hype, no "actionable", "navigate", "landscape", no em dashes, no lists, no questions, no advice to buy or sell.
- When the person is "example", say "the example portfolio", never "you" or "your".`;

const TIMEOUT_MS = 15_000;

/** Null when no model is configured (or only the offline planner is), so the rules' wording stands. */
export function memoModelReader(): MemoWordReader | null {
  const llm = askModel();
  if (!llm || llm.via === "offline") return null;
  return async (payload: WordingPayload) => {
    const result = await generateText({
      model: llm.model,
      system: SYSTEM,
      prompt: JSON.stringify({
        person: payload.subject,
        week: payload.weekComplete ? "finished" : "so far",
        top_line: payload.topLine,
        items: payload.items,
      }),
      output: Output.object({ schema: SCHEMA }),
      maxOutputTokens: 1200,
      providerOptions: (llm.via === "anthropic" ? { anthropic: { effort: "low" } } : { openai: { reasoningEffort: "low" } }) as never,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = SCHEMA.safeParse(result.output);
    if (!parsed.success) throw new Error("memo_model_bad_output");
    return parsed.data;
  };
}
