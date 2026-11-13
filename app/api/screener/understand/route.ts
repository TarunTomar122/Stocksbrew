import { NextRequest, NextResponse } from "next/server";

import { askUsageStore } from "@/lib/ask-data";
import { askPlanFor, consumeAskQuota, peekAskQuota } from "@/lib/ask-limits";
import { getSessionUser } from "@/lib/auth-server";
import { PLAIN_MAX_CHARS, mergePlainScreens, parsePlainScreen, type PlainReply } from "@/lib/screener-plain";
import { cachedPlainRead, pendingPlainRead, plainModelReader, readOnce } from "@/lib/screener-plain-model";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/**
 * The screener's plain-words box, for the part the rules could not read.
 * The browser runs the same rules first and only calls here when words are
 * left over. Rules and cached reads are free; a fresh model read counts as
 * one Ask question (lib/ask-limits.ts), so signed-out visitors get the rules
 * only, as they get no Ask questions.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function reply(body: PlainReply) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  // Read as text and cap it ourselves: a chunked body has no length header to check first.
  const raw = await req.text().catch(() => "");
  if (raw.length > 4_000) {
    return NextResponse.json({ error: "bad_request", message: "That is too long to read." }, { status: 413 });
  }
  let body: { text?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { text?: unknown } | null;
  } catch {
    body = null;
  }
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return NextResponse.json({ error: "bad_request", message: "Type what you are looking for first." }, { status: 400 });
  if (text.length > PLAIN_MAX_CHARS) {
    return NextResponse.json({ error: "bad_request", message: `Keep it under ${PLAIN_MAX_CHARS} characters.` }, { status: 400 });
  }

  const rules = parsePlainScreen(text);
  if (rules.leftover.length === 0) return reply({ screen: rules, via: "rules", note: null });

  // Somebody already paid for this sentence today: free for everyone after.
  const cached = cachedPlainRead(text);
  if (cached) return reply({ screen: mergePlainScreens(rules, cached), via: "cache", note: null });

  const session = await getSessionUser();
  if (!session) return reply({ screen: rules, via: "rules", note: "sign_in" });

  const pending = pendingPlainRead(text);
  if (pending) {
    const screen = await pending.catch(() => null);
    if (screen) return reply({ screen: mergePlainScreens(rules, screen), via: "cache", note: null });
  }

  const reader = plainModelReader();
  if (!reader) return reply({ screen: rules, via: "rules", note: "unavailable" });

  const doc = await getUserDoc(session.uid).catch(() => null);
  const plan = askPlanFor({ uid: session.uid, isPro: resolveIsSubscribed(doc) });
  // Check the allowance first, count the question only once the read worked: a timeout costs nothing.
  try {
    const allowance = await peekAskQuota(askUsageStore, { key: session.uid, plan });
    if (!allowance.ok) return reply({ screen: rules, via: "rules", note: "limit", message: allowance.message });
  } catch (error) {
    // A paid read never runs uncounted. The rules' reading still stands.
    console.error("screener_plain_quota_failed", error instanceof Error ? error.message : "unknown");
    return reply({ screen: rules, via: "rules", note: "unavailable" });
  }

  let screen;
  try {
    screen = await readOnce(text, () => reader(text, rules.leftover));
  } catch (error) {
    console.error("screener_plain_model_failed", error instanceof Error ? error.message : "unknown");
    return reply({ screen: rules, via: "rules", note: "unavailable" });
  }
  const counted = await consumeAskQuota(askUsageStore, { key: session.uid, plan }).catch((error: unknown) => {
    console.error("screener_plain_quota_count_failed", error instanceof Error ? error.message : "unknown");
    return null;
  });
  return reply({ screen: mergePlainScreens(rules, screen), via: "model", note: null, remaining: counted?.ok ? counted.remaining : undefined });
}
