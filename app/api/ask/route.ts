import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  type ModelMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { auditNumbers, cardForModel, isAskCard, type AskCard, type AskUIMessage } from "@/lib/ask-cards";
import { contextLabel, parseAskContext } from "@/lib/ask-context";
import { openContext } from "@/lib/ask-context-open";
import { ASK_MAX_QUESTION_CHARS, ASK_MAX_STEPS, ASK_MAX_TURNS_SENT } from "@/lib/ask-config";
import { askUsageStore, storableMessages } from "@/lib/ask-data";
import { askPlanFor, consumeAskQuota, decideAskQuota, peekAskQuota } from "@/lib/ask-limits";
import { askModel } from "@/lib/ask-llm";
import { askSystemPrompt } from "@/lib/ask-prompt";
import { buildAskTools } from "@/lib/ask-tools";
import { getSessionUser } from "@/lib/auth-server";
import { earliestBacktestStart } from "@/lib/backtest/gated";
import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const maxDuration = 60;
export const dynamic = "force-dynamic";


const ASK_MAX_BODY_BYTES = 200_000;

const OFFLINE_NOTICE =
  "No language model key on this server. This answer was assembled from the tool results by fixed rules, not written by the copilot.";

/** Signed-out people are counted by a hash of their address. The address itself is never stored. */
function anonymousKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.headers.get("x-real-ip") || "unknown";
  return `anon_${createHash("sha256").update(`ask:${address}`).digest("hex").slice(0, 32)}`;
}

async function whoIsAsking(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return { uid: null, isPro: false, plan: askPlanFor({ uid: null, isPro: false }), key: anonymousKey(req) };
  const doc = await getUserDoc(session.uid).catch(() => null);
  const isPro = resolveIsSubscribed(doc);
  return { uid: session.uid, isPro, plan: askPlanFor({ uid: session.uid, isPro }), key: session.uid };
}

function textOf(message: UIMessage | undefined): string {
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

function cleanMessages(raw: unknown): AskUIMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null;
  const out: AskUIMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const message = item as AskUIMessage;
    if ((message.role !== "user" && message.role !== "assistant") || !Array.isArray(message.parts)) return null;
    // Provider metadata from the browser would become provider options on the request (cache markers among them).
    // Only the server decides those, so it is dropped here.
    const parts = message.parts.map((part) => {
      if (!part || typeof part !== "object") return part;
      const { providerMetadata: _a, callProviderMetadata: _b, ...rest } = part as typeof part & { providerMetadata?: unknown; callProviderMetadata?: unknown };
      return rest as typeof part;
    });
    out.push({ ...message, parts });
  }
  // Drop anything a model cannot be handed back, such as a tool call that never got its result.
  const sendable = storableMessages(out) as AskUIMessage[];
  return sendable[sendable.length - 1]?.role === "user" ? sendable : null;
}

/** Today's allowance, without counting a question. */
export async function GET(req: NextRequest) {
  const who = await whoIsAsking(req);
  try {
    const quota = await peekAskQuota(askUsageStore, { key: who.key, plan: who.plan });
    return NextResponse.json({ signed_in: Boolean(who.uid), plan: who.plan, limit: quota.limit, used: quota.used, remaining: quota.remaining, resets_at: quota.resets_at });
  } catch {
    return NextResponse.json({ signed_in: Boolean(who.uid), plan: who.plan, limit: null, used: null, remaining: null, resets_at: null });
  }
}

export async function POST(req: NextRequest) {
  // One question is a few kilobytes even with its history. Anything far larger is not a question.
  if (Number(req.headers.get("content-length") ?? 0) > ASK_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "bad_request", message: "That conversation is too long to send. Start a new one." }, { status: 413 });
  }
  const body = (await req.json().catch(() => null)) as { messages?: unknown; context?: unknown } | null;
  const messages = cleanMessages(body?.messages);
  // Ids only, re-read below for this session. Anything that is not exactly one of the shapes is ignored, not an error.
  const context = parseAskContext(body?.context);
  if (!messages) return NextResponse.json({ error: "bad_request", message: "Send a question." }, { status: 400 });

  const question = textOf(messages[messages.length - 1]);
  if (!question) return NextResponse.json({ error: "bad_request", message: "Type a question first." }, { status: 400 });
  if (question.length > ASK_MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: "bad_request", message: `Keep a question under ${ASK_MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const who = await whoIsAsking(req);
  // Signed out has no allowance. Say so before touching the model or the usage store.
  if (!who.uid) {
    const blocked = decideAskQuota(0, who.plan, new Date());
    if (!blocked.ok) return NextResponse.json(blocked, { status: 429 });
  }

  const llm = askModel();
  if (!llm) {
    return NextResponse.json({ error: "not_configured", message: "The copilot is not set up on this server yet." }, { status: 503 });
  }

  let quota;
  try {
    quota = await consumeAskQuota(askUsageStore, { key: who.key, plan: who.plan });
  } catch (error) {
    // The counter is down. Failing closed would take the copilot down with it; signed-out traffic is the abuse risk, so only that waits.
    console.error("ask_quota_failed", error);
    if (!who.uid) {
      return NextResponse.json({ error: "unavailable", message: "The copilot is busy. Try again in a minute, or sign in." }, { status: 503 });
    }
    quota = null;
  }
  if (quota && !quota.ok) return NextResponse.json(quota, { status: 429 });

  const now = new Date();
  const viewer = await getViewer();
  const tools = buildAskTools({
    uid: who.uid,
    isPro: who.isPro,
    now,
    levels: (ticker) => canSeeLevels(viewer, ticker),
    earliestBacktestStart: earliestBacktestStart(viewer.plan, now),
    // The viewer is the same session as `who`; the person's own tools read only `who.uid`.
    viewer: viewer.uid === who.uid ? viewer : null,
    example: Boolean(context?.example),
  });
  // The item a link carried opens with the first question only. Later questions in the conversation already have its card.
  const firstTurn = messages.filter((message) => message.role === "user").length === 1;
  // Start the window on a person's turn so the model never opens on a dangling tool result.
  let recent = messages.slice(-ASK_MAX_TURNS_SENT);
  while (recent.length > 1 && recent[0]!.role !== "user") recent = recent.slice(1);
  const stream = createUIMessageStream<AskUIMessage>({
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
        signedIn: Boolean(who.uid),
        isPro: who.isPro,
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
        onError: ({ error }) => console.error("ask_stream_error", error),
      });
      writer.merge(result.toUIMessageStream({ sendReasoning: false }));

      // Once the answer is written, check its figures against what the tools returned.
      const steps = await result.steps;
      const answer = steps.map((step) => step.text).join("\n");
      if (!answer.trim()) return;
      const outputs: unknown[] = earlierOutputs(recent);
      if (opened) outputs.push(cardForModel(opened.output));
      for (const step of steps) {
        for (const toolResult of step.toolResults) {
          if (isAskCard(toolResult.output) && !auditable(toolResult.output)) continue;
          outputs.push(isAskCard(toolResult.output) ? cardForModel(toolResult.output) : toolResult.output);
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

  const headers: Record<string, string> = {};
  if (quota?.ok) {
    headers["x-ask-plan"] = quota.plan;
    headers["x-ask-limit"] = String(quota.limit);
    headers["x-ask-remaining"] = String(quota.remaining);
  }
  return createUIMessageStreamResponse({ stream, headers });
}
