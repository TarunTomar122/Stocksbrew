import { NextRequest, NextResponse } from "next/server";

import { verifySubscriberToken } from "@/lib/email-subscribers";
import { confirmSubscriber } from "@/lib/email-subscribers-store";
import { readJsonObject } from "@/lib/request-json";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST { s, t }: the confirmation link from the signup email, sent by /email/confirm once the page is open in a
 * browser (a GET never changes anything: link scanners fetch every URL in an email). Idempotent.
 */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  const id = body?.s;
  if (!verifySubscriberToken(id, "confirm", body?.t)) {
    return NextResponse.json({ ok: false, error: "link" }, { status: 400, headers: NO_STORE });
  }
  try {
    const { state, tickers } = await confirmSubscriber(id);
    return NextResponse.json({ ok: state !== "missing", state, tickers }, { status: state === "missing" ? 404 : 200, headers: NO_STORE });
  } catch (error) {
    console.error("[email-capture] confirm failed:", (error as Error)?.message);
    return NextResponse.json({ ok: false, error: "store" }, { status: 503, headers: NO_STORE });
  }
}
