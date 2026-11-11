import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getAskExample, parseExampleSubject, type AskExampleResult } from "@/lib/ask-examples";
import { askExampleStore, isCataloguedTicker, writeAskExample } from "@/lib/ask-examples-data";
import { askModel } from "@/lib/ask-llm";

/**
 * GET /api/ask/example?subject=stock:NVDA (or subject=market)
 *
 * Today's example answer for the Ask panel, for someone who has not signed in. The panel calls this after it opens,
 * never a page. The first call of the day on a subject writes the answer with the Ask pipeline (inside the daily cap,
 * lib/ask-examples.ts) and keeps it; every later one reads the kept copy. Nobody's account is read or written.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Seconds until midnight in New York, when a new day's examples start. */
function secondsToNewYorkMidnight(now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  ) as { hour?: number; minute?: number; second?: number };
  const elapsed = ((parts.hour ?? 0) % 24) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0);
  return Math.max(0, 86_400 - elapsed);
}

function reply(result: AskExampleResult, now: Date = new Date()) {
  // A finished example is the same for everyone for the rest of its New York day, so the CDN may hold it for a few
  // minutes, never past midnight. A stock outside the catalog stays outside it all day. Anything else may change on
  // the next request.
  let cache = "no-store";
  if (result.status === "ready") {
    const left = Math.min(600, secondsToNewYorkMidnight(now));
    cache = left > 30 ? `public, max-age=60, s-maxage=${left}` : "no-store";
  } else if (result.status === "unavailable" && result.reason === "not_covered") {
    cache = "public, max-age=3600, s-maxage=3600";
  }
  return NextResponse.json(result, { headers: { "cache-control": cache } });
}

/** A visitor, as a hash of their address, for the per-visitor limit. The address itself is never stored. */
function visitorKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`ask-example:${address}`).digest("hex").slice(0, 32);
}

export async function GET(req: NextRequest) {
  const subject = parseExampleSubject(req.nextUrl.searchParams.get("subject"));
  if (!subject) return NextResponse.json({ error: "bad_request", message: "Unknown example." }, { status: 400 });

  const llm = askModel();
  if (!llm) return reply({ status: "unavailable", reason: "no_model" });

  // The offline rules (a checkout with no model key, never production) are not a real answer: nothing is kept.
  if (llm.via === "offline") return reply({ status: "unavailable", reason: "no_model" });

  try {
    const result = await getAskExample(subject, {
      store: askExampleStore,
      isCatalogued: isCataloguedTicker,
      client: visitorKey(req),
      write: (what, question, now) => writeAskExample(what, question, now, llm),
    });
    return reply(result);
  } catch (error) {
    // The store could not be read or the claim not written: no model call runs uncounted.
    console.error("ask_example_store_failed", error);
    return reply({ status: "unavailable", reason: "store" });
  }
}
