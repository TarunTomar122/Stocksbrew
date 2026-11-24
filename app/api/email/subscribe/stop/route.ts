import { NextRequest, NextResponse } from "next/server";

import { verifySubscriberToken } from "@/lib/email-subscribers";
import { setSubscriberStopped } from "@/lib/email-subscribers-store";

export const dynamic = "force-dynamic";

/**
 * POST only: stops the no-account morning email. Handles the mail client's one-click unsubscribe (RFC 8058, body
 * "List-Unsubscribe=One-Click", `s` and `t` in the query string: the List-Unsubscribe header backend/mail/subscribers.py
 * sets) and the form on /email/stop (fields in the body, plus `action=resume` to undo). GET only redirects to the page.
 */
export async function POST(req: NextRequest) {
  const query = req.nextUrl.searchParams;
  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null;
  }
  const pick = (key: string) => (form?.get(key) as string | null) ?? query.get(key);
  const id = pick("s");
  const token = pick("t");
  const resume = pick("action") === "resume";
  const fromPage = form?.get("from") === "page";

  if (!verifySubscriberToken(id, "stop", token)) {
    return fromPage
      ? NextResponse.redirect(new URL("/email/stop?error=1", req.url), 303)
      : NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 400 });
  }
  let found = false;
  try {
    found = await setSubscriberStopped(id, !resume);
  } catch (error) {
    console.error("[email-capture] stop failed:", (error as Error)?.message);
    return fromPage
      ? NextResponse.redirect(new URL("/email/stop?error=1", req.url), 303)
      : NextResponse.json({ ok: false, error: "Try again in a minute." }, { status: 503 });
  }
  if (fromPage) {
    const next = new URL("/email/stop", req.url);
    if (!found) next.searchParams.set("error", "1");
    else {
      next.searchParams.set("s", id);
      next.searchParams.set("t", token as string);
      next.searchParams.set("done", resume ? "on" : "off");
    }
    return NextResponse.redirect(next, 303);
  }
  return NextResponse.json({ ok: found }, { status: found ? 200 : 404 });
}

export async function GET(req: NextRequest) {
  const next = new URL("/email/stop", req.url);
  req.nextUrl.searchParams.forEach((value, key) => next.searchParams.set(key, value));
  return NextResponse.redirect(next, 303);
}
