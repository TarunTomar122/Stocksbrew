import { NextRequest, NextResponse } from "next/server";

import { addPurpose, normalizeTicker, verifySubscriberToken } from "@/lib/email-subscribers";
import { addSubscriberTicker, confirmSubscriber } from "@/lib/email-subscribers-store";
import { readJsonObject } from "@/lib/request-json";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST { s, t, a? }: the confirmation link from the signup email, sent by /email/confirm once the page is open in a
 * browser (a GET never changes anything: link scanners fetch every URL in an email). Idempotent. With `a`, the link
 * from the "add NVDA to your morning email?" email: signed for that one stock, which it adds to the list.
 */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  const id = body?.s;
  const hasAdd = body?.a != null && body.a !== "";
  const add = hasAdd ? normalizeTicker(body?.a) : null;
  if ((hasAdd && !add) || !verifySubscriberToken(id, add ? addPurpose(add) : "confirm", body?.t)) {
    return NextResponse.json({ ok: false, error: "link" }, { status: 400, headers: NO_STORE });
  }
  try {
    // "added" reads like a first confirmation on the page ("You're in" with the new list), without the confirm event.
    const { state, tickers } = add ? await addSubscriberTicker(id, add) : await confirmSubscriber(id);
    return NextResponse.json({ ok: state !== "missing", state, tickers }, { status: state === "missing" ? 404 : 200, headers: NO_STORE });
  } catch (error) {
    console.error("[email-capture] confirm failed:", (error as Error)?.message);
    return NextResponse.json({ ok: false, error: "store" }, { status: 503, headers: NO_STORE });
  }
}
