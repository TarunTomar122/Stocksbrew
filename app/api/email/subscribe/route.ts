import { NextRequest, NextResponse } from "next/server";

import { visitorAddress } from "@/lib/analytics/address";
import { instrumentIdOf, isCaptureSource, normalizeEmail, normalizeTicker } from "@/lib/email-subscribers";
import { captureSubscriber } from "@/lib/email-subscribers-store";
import { adminFirestore } from "@/lib/firebase-admin";
import { createIpRateLimiter } from "@/lib/ip-rate-limit";
import { readJsonObject } from "@/lib/request-json";
import { getSeoStockPage } from "@/lib/seo/stock-pages";

export const dynamic = "force-dynamic";

/**
 * POST { email, source, ticker?, website, ms }: the no-account morning email (before the open, on days something happens)
 * (components/email-capture.tsx). Double opt-in: the address gets a confirmation link and nothing else until it is
 * clicked (lib/email-subscribers-store.ts).
 *
 * Every accepted signup answers the same `{ ok: true }`, whether the address is new, waiting, already confirmed or
 * an account's, so the form never tells anyone which addresses we know. Bots get the same answer: a filled
 * `website` field (hidden from people) or a form sent faster than a person can type is dropped without a word.
 * The address is never logged.
 */

/** Signups from one visitor address. */
const perAddress = createIpRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
/** Confirmation emails from this instance, from every address together: a bot spread over many addresses still
 *  cannot turn us into a mailer. Real signups are about 50 visitors a week. */
const confirmations = createIpRateLimiter({ limit: 60, windowMs: 60 * 60_000 });
/** Faster than this from first render to submit is a script, not a person typing an address. */
const MIN_FILL_MS = 800;

const NO_STORE = { "Cache-Control": "private, no-store" };
const answer = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

async function tickerExists(ticker: string): Promise<boolean> {
  if (getSeoStockPage(ticker)) return true;
  const snap = await adminFirestore.collection("tm_instruments").doc(instrumentIdOf(ticker)).get();
  return snap.exists;
}

export async function POST(req: NextRequest) {
  const limited = perAddress(visitorAddress(req.headers));
  if (!limited.ok) return answer({ ok: false, error: "slow_down" }, 429, { "Retry-After": String(limited.retryAfterSec) });

  const body = await readJsonObject(req);
  if (!body) return answer({ ok: false, error: "invalid_body" }, 400);

  // The honeypot and the timing check: answered like a real signup, so the bot learns nothing. The form always sends
  // `ms`; a missing or broken one is a script that skipped it, treated like a fast submit.
  if (typeof body.website === "string" && body.website.trim()) return answer({ ok: true });
  if (typeof body.ms !== "number" || !Number.isFinite(body.ms) || body.ms < MIN_FILL_MS) return answer({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return answer({ ok: false, error: "email" }, 400);
  if (!isCaptureSource(body.source)) return answer({ ok: false, error: "source" }, 400);
  const rawTicker = body.ticker;
  const ticker = rawTicker == null || rawTicker === "" ? null : normalizeTicker(rawTicker);
  if (rawTicker != null && rawTicker !== "" && !ticker) return answer({ ok: false, error: "ticker" }, 400);

  try {
    if (ticker && !(await tickerExists(ticker))) return answer({ ok: false, error: "ticker" }, 400);
    const result = await captureSubscriber(
      { email, ticker, source: body.source },
      { mayConfirm: () => confirmations("all").ok },
    );
    // Busy answers like every other signup: a different answer would say the address is new or waiting.
    if (result.status === "busy") console.warn("[email-capture] email cap reached; signup stored without an email");
    return answer({ ok: true });
  } catch (error) {
    console.error("[email-capture] store failed:", (error as Error)?.message);
    return answer({ ok: false, error: "store" }, 503);
  }
}
