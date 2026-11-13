import {
  convertToModelMessages,
  createUIMessageStream,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";

import { auditNumbers, cardForModel, isAskCard, type AskCard, type AskUIMessage } from "@/lib/ask-cards";
import { contextLabel, type AskContext } from "@/lib/ask-context";
import { openContext } from "@/lib/ask-context-open";
import { ASK_MAX_STEPS, ASK_MAX_TURNS_SENT } from "@/lib/ask-config";
import type { AskModel } from "@/lib/ask-llm";
import { askSystemPrompt } from "@/lib/ask-prompt";

/**
 * One Ask answer, as the stream the page reads: the opened item (when a link carried one), the model's lookups and
 * text, a "Watch this" card when the answer names a stock, and the numbers check. The /api/ask route runs it for a
 * person's question, after its own sign-in and allowance checks; the example answers (lib/ask-examples-data.ts) run
 * the very same thing for a signed-out visitor and keep the result.
 */

export const OFFLINE_NOTICE =
  "No language model key on this server. This answer was assembled from the tool results by fixed rules, not written by the copilot.";

export type AskRun = {
  /** The conversation, ending on the person's question. */
  messages: AskUIMessage[];
  context: AskContext | null;
  signedIn: boolean;
  isPro: boolean;
  llm: AskModel;
  tools: ToolSet;
  now: Date;
  abortSignal?: AbortSignal;
};

export function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

/**
 * Whether a card's figures count as evidence for the numbers check. A "Watch this" card echoes the level the
 * model chose, so a figure the model made up would trace to its own suggestion; it is left out.
 */
function auditable(card: AskCard): boolean {
  return card.card !== "watch";
}

/** Tool results already in the conversation, as the model saw them. */
function earlierOutputs(messages: UIMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!part.type.startsWith("tool-")) continue;
      const output = (part as { output?: unknown }).output;
      if (isAskCard(output) && auditable(output)) out.push(cardForModel(output));
    }
  }
  return out;
}

/* ── "Watch this" for every answer that names a stock ───────────────────── */

export type WatchInput = { kind: "earnings_before" | "daily_move" | "insider_trade" | "congress_trade" | "sec_filing"; ticker: string; days?: number; pct?: number; filing?: "big" };

/** Kinds of card that are about one stock, in the order they count as "the stock the answer is about". */
const ONE_STOCK_CARDS = new Set(["quote", "research", "briefing_item", "returns", "filing_changes"]);

/** Whole days from one day (YYYY-MM-DD) to another. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

/** Funds an answer is measured against or reads the market from. Not "the stock the answer is about". */
const NOT_A_STOCK = new Set(["SPY", "QQQ", "DIA", "IWM", "VOO", "VTI"]);

/** Every ticker a card holds, anywhere in it (a market brief's movers, a comparison's rows). */
function tickersIn(value: unknown, into: Set<string>, depth = 0): Set<string> {
  if (depth > 6 || !value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const item of value) tickersIn(item, into, depth + 1);
    return into;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "ticker" && typeof item === "string" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(item.trim().toUpperCase())) into.add(item.trim().toUpperCase());
    else if (typeof item === "object") tickersIn(item, into, depth + 1);
  }
  return into;
}

const COMMON_FIRST_WORDS = new Set(["the", "first", "american", "united", "general", "international", "national", "global", "west", "western", "southern", "public"]);

/** Whether the written answer names a stock: by ticker, or by the first word of its name ("Apple", "NVIDIA"). */
function names(answer: string, ticker: string, name: string | null): number {
  const escaped = ticker.replace(/\./g, "\\.");
  // A one-letter ticker (A, C, T) only counts written as "(C)": as a bare word it is usually just a word.
  const pattern = ticker.length === 1 ? `\\(${escaped}\\)` : `(^|[^A-Za-z0-9.])${escaped}(?![A-Za-z0-9])`;
  const byTicker = answer.search(new RegExp(pattern));
  if (byTicker >= 0) return byTicker;
  const word = (name ?? "").trim().split(/[\s,]+/)[0]?.replace(/[^A-Za-z0-9&'-]/g, "") ?? "";
  // Too short, or a word that starts many company names ("The Walt Disney Company", "American Express").
  if (word.length < 3 || COMMON_FIRST_WORDS.has(word.toLowerCase())) return -1;
  return answer.search(new RegExp(`(^|[^A-Za-z0-9])${word.replace(/[-']/g, "\\$&")}(?![A-Za-z0-9])`, "i"));
}

/**
 * The stock an answer is about: of the one-stock cards (a stock it looked up, a return it measured), the first one the
 * written answer names, the model's own lookups before the item the page opened; a lone one-stock card even when the
 * answer only says "it". Failing that, the first stock the answer names among those its other cards hold (a market
 * answer leading with one mover). Index funds never count. `cards` are in the order the answer made them, the item the
 * page opened last.
 */
function stockOf(answer: string, cards: AskCard[]): string | null {
  const oneStock = cards
    .filter((card) => ONE_STOCK_CARDS.has(card.card) && typeof (card as { ticker?: unknown }).ticker === "string")
    .map((card) => ({ ticker: (card as { ticker: string }).ticker.trim().toUpperCase(), name: (card as { name?: unknown }).name }))
    .filter((card) => !NOT_A_STOCK.has(card.ticker));
  const named = oneStock.find((card) => names(answer, card.ticker, typeof card.name === "string" ? card.name : null) >= 0);
  if (named) return named.ticker;
  if (new Set(oneStock.map((card) => card.ticker)).size === 1) return oneStock[0]!.ticker;
  if (oneStock.length > 1) return null;
  const known = new Set<string>();
  for (const card of cards) if (card.card !== "watch" && card.card !== "error") tickersIn(card, known);
  let first: { ticker: string; at: number } | null = null;
  for (const candidate of Array.from(known)) {
    if (NOT_A_STOCK.has(candidate)) continue;
    const at = names(answer, candidate, null);
    if (at >= 0 && (!first || at < first.at)) first = { ticker: candidate, at };
  }
  return first?.ticker ?? null;
}

/**
 * The agent an answer leads to when the model offered none, read from what the answer concluded: insider or Congress
 * trades when that is what it talked about, its next big filing after an answer about what its filings changed, the
 * next report when it is close (or the answer is about it), and otherwise a big daily move. Null when the answer names no stock its cards hold, or only the index fund it was
 * measured against. Pure.
 */
export function fallbackWatch(answer: string, cards: AskCard[], now: Date): WatchInput | null {
  const ticker = stockOf(answer, cards);
  if (!ticker) return null;
  const text = answer.toLowerCase();
  if (/\binsiders?\b|\bform 4\b/.test(text)) return { kind: "insider_trade", ticker };
  if (/\bcongress(?:ional)?\b|\bsenators?\b/.test(text)) return { kind: "congress_trade", ticker };
  // An answer about what a company changed in its filings leads to its next big filing (an annual report among them).
  if (cards.some((card) => card.card === "filing_changes" && card.ticker.toUpperCase() === ticker)) return { kind: "sec_filing", ticker, filing: "big" };
  const quote = cards.find((card) => card.card === "quote" && card.ticker.toUpperCase() === ticker);
  const report = quote?.card === "quote" ? quote.next_earnings?.date ?? null : null;
  // Counted in New York days, the market's calendar.
  const gap = report ? daysBetween(now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }), report) : null;
  const talksAboutReport = /\b(earnings|reports?|results)\b/.test(text);
  // A report within two weeks, or within a month when the answer is about it. Further out, a big move is the closer watch.
  if (gap !== null && gap >= 0 && (gap <= 14 || (talksAboutReport && gap <= 30))) return { kind: "earnings_before", ticker, days: 3 };
  return { kind: "daily_move", ticker, pct: 5 };
}

/* ── the stream ─────────────────────────────────────────────────────────── */

export function askUIStream(run: AskRun) {
  const { messages, context, llm, tools, now } = run;
  // The item a link carried opens with the first question only. Later questions in the conversation already have its card.
  const firstTurn = messages.filter((message) => message.role === "user").length === 1;
  // Start the window on a person's turn so the model never opens on a dangling tool result.
  let recent = messages.slice(-ASK_MAX_TURNS_SENT);
  while (recent.length > 1 && recent[0]!.role !== "user") recent = recent.slice(1);
  return createUIMessageStream<AskUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // Open the assistant message before anything else goes on the stream (the notice, the opened item), so the
      // page keeps one answer with one id. Without it the first part starts a second message.
      writer.write({ type: "start" });
      if (llm.via === "offline") writer.write({ type: "data-notice", data: { text: OFFLINE_NOTICE } });
      // Read here, after the stream has started, so a slow read never holds the response.
      const opened =
        context && firstTurn
          ? await openContext(context, tools, now).catch((error) => {
              console.error("ask_context_failed", error);
              return null;
            })
          : null;
      const system = askSystemPrompt({
        signedIn: run.signedIn,
        isPro: run.isPro,
        now,
        startedFrom: opened && context ? contextLabel(opened.fellBack ? { ...context, kind: "stock" } : context) : null,
        example: Boolean(context?.example),
      });
      const history: ModelMessage[] = await convertToModelMessages(recent, { tools });
      if (opened) {
        // Shown as the answer's first lookup, and handed to the model as one it already made.
        writer.write({ type: "tool-input-available", toolCallId: opened.toolCallId, toolName: opened.toolName, input: opened.input });
        writer.write({ type: "tool-output-available", toolCallId: opened.toolCallId, output: opened.output });
        history.push(
          { role: "assistant", content: [{ type: "tool-call", toolCallId: opened.toolCallId, toolName: opened.toolName, input: opened.input }] },
          {
            role: "tool",
            content: [{ type: "tool-result", toolCallId: opened.toolCallId, toolName: opened.toolName, output: { type: "json", value: cardForModel(opened.output) as never } }],
          },
        );
      }
      const result = streamText({
        model: llm.model,
        providerOptions: llm.providerOptions,
        // On Claude, a cache point after the system prompt covers the tool definitions and the prompt (about 6k
        // tokens, the same for every signed-in person on a given day), so every question after the first reads them
        // from cache. Measured 2026-11-10: about 6k of a first step's 6k input tokens came from cache.
        system:
          llm.via === "anthropic"
            ? { role: "system", content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
            : system,
        messages: history,
        // Only the server writes system instructions. A system message inside the conversation is refused.
        allowSystemInMessages: false,
        tools,
        stopWhen: stepCountIs(ASK_MAX_STEPS),
        // An answer is a few paragraphs. This caps a runaway reply, not a normal one.
        maxOutputTokens: 8000,
        abortSignal: run.abortSignal,
        onError: ({ error }) => console.error("ask_stream_error", error),
      });
      writer.merge(result.toUIMessageStream({ sendReasoning: false }));

      // Once the answer is written, check its figures against what the tools returned.
      const steps = await result.steps;
      const answer = steps.map((step) => step.text).join("\n");
      if (!answer.trim()) return;
      const outputs: unknown[] = earlierOutputs(recent);
      const cards: AskCard[] = [];
      if (opened) outputs.push(cardForModel(opened.output));
      for (const step of steps) {
        for (const toolResult of step.toolResults) {
          if (isAskCard(toolResult.output)) cards.push(toolResult.output);
          if (isAskCard(toolResult.output) && !auditable(toolResult.output)) {
            // A move size or a number of days is a setting the answer may repeat ("a 5% move"), not a fact about the
            // stock, so those count. A price level the model picked still does not.
            const kind = (toolResult.input as { kind?: unknown } | undefined)?.kind;
            if (toolResult.output.card === "watch" && (kind === "daily_move" || kind === "earnings_before")) outputs.push(toolResult.output.request);
            // "When should I sell?" is answered from our call, its level and the price, read from our own stores.
            if (toolResult.output.card === "watch" && toolResult.output.zone) outputs.push(toolResult.output.zone);
            continue;
          }
          outputs.push(isAskCard(toolResult.output) ? cardForModel(toolResult.output) : toolResult.output);
        }
      }

      // The item the page opened counts last: an answer about another stock is about that one.
      if (opened) cards.push(opened.output);

      // Every answer about one stock ends on an agent to keep watching it. The model usually offers one itself
      // (suggest_watch); when it did not, the same tool fills one in from what the answer concluded.
      // A suggestion the tool turned down (a kind with no stock, say) does not count as offered.
      const offered = steps.some((step) =>
        step.toolResults.some((toolResult) => toolResult.toolName === "suggest_watch" && isAskCard(toolResult.output) && toolResult.output.card === "watch"),
      );
      const watch = offered ? null : fallbackWatch(answer, cards, now);
      const suggest = watch ? tools.suggest_watch?.execute : undefined;
      if (watch && suggest) {
        const toolCallId = `watch-${now.getTime().toString(36)}`;
        const card = (await Promise.resolve(suggest(watch as never, { toolCallId, messages: [] })).catch(() => null)) as unknown;
        // Only a card the Agents page will accept is offered; anything else is left out quietly.
        if (isAskCard(card) && card.card === "watch") {
          writer.write({ type: "tool-input-available", toolCallId, toolName: "suggest_watch", input: watch });
          writer.write({ type: "tool-output-available", toolCallId, output: card });
        }
      }

      // What the person typed counts as given: "since 2019", "above $180".
      for (const message of recent) if (message.role === "user") outputs.push(textOf(message));
      const audit = auditNumbers(answer, outputs);
      if (audit.checked > 0) writer.write({ type: "data-audit", data: audit });
    },
    onError: (error) => {
      console.error("ask_failed", error);
      return "The copilot could not finish that answer. Nothing was changed. Try again.";
    },
    // The conversation is saved by the page once the answer is in (POST /api/ask/conversations), so a slow
    // write to the store never holds this stream open.
  });
}
