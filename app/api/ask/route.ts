import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { createUIMessageStreamResponse } from "ai";

import type { AskUIMessage } from "@/lib/ask-cards";
import { parseAskContext } from "@/lib/ask-context";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { askUsageStore, storableMessages } from "@/lib/ask-data";
import { askPlanFor, consumeAskQuota, decideAskQuota, peekAskQuota } from "@/lib/ask-limits";
import { askModel } from "@/lib/ask-llm";
import { askUIStream, textOf } from "@/lib/ask-pipeline";
import { buildAskTools } from "@/lib/ask-tools";
import { getSessionUser } from "@/lib/auth-server";
import { earliestBacktestStart } from "@/lib/backtest/gated";
import { METER_UNAVAILABLE_MESSAGE, canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const maxDuration = 60;
export const dynamic = "force-dynamic";


const ASK_MAX_BODY_BYTES = 200_000;

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
    // The counter is down. Every question is a paid model call, so nothing runs uncounted: say "try again" (FAIL_CLOSED_METERS).
    console.error("ask_quota_failed", error);
    return NextResponse.json({ error: "unavailable", message: METER_UNAVAILABLE_MESSAGE }, { status: 503 });
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
  const stream = askUIStream({ messages, context, signedIn: Boolean(who.uid), isPro: who.isPro, llm, tools, now });

  const headers: Record<string, string> = {};
  if (quota?.ok) {
    headers["x-ask-plan"] = quota.plan;
    headers["x-ask-limit"] = String(quota.limit);
    headers["x-ask-remaining"] = String(quota.remaining);
  }
  return createUIMessageStreamResponse({ stream, headers });
}
