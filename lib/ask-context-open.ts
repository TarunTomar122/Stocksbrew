import type { ToolSet } from "ai";

import { isAskCard, type AskCard } from "@/lib/ask-cards";
import { contextToolCall, type AskContext } from "@/lib/ask-context";

export type OpenedContext = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: AskCard;
  /** A briefing line that is no longer saved opened the stock instead. */
  fellBack: boolean;
};

/**
 * Open the item a link carried, with the same tool the model would call, before the model writes. The card goes
 * into the answer like any other lookup and into the model's history as a finished tool call, so the first answer
 * starts from it. Null when there is nothing to open, the item is not found, or the tool is missing.
 */
export async function openContext(context: AskContext, tools: ToolSet, now: Date = new Date()): Promise<OpenedContext | null> {
  const call = contextToolCall(context);
  const run = tools[call.tool]?.execute;
  if (!run) return null;
  const toolCallId = `ctx-${now.getTime().toString(36)}`;
  const output = (await run(call.input as never, { toolCallId, messages: [] })) as unknown;
  if (!isAskCard(output)) return null;
  // A briefing line that is no longer saved falls back to the stock itself, so the answer still starts somewhere real.
  if (output.card === "error" && context.kind === "brief" && context.ticker && tools.get_stock?.execute) {
    const stock = (await tools.get_stock.execute({ ticker: context.ticker } as never, { toolCallId, messages: [] })) as unknown;
    if (isAskCard(stock) && stock.card !== "error") return { toolCallId, toolName: "get_stock", input: { ticker: context.ticker }, output: stock, fellBack: true };
  }
  // An item that is gone, or one only an account can open, is not a starting point: the question goes ahead without it.
  if (output.card === "error" || output.card === "sign_in") return null;
  return { toolCallId, toolName: call.tool, input: call.input, output, fellBack: false };
}
