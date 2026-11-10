import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { EMAIL_CATEGORIES, verifyUnsubscribe } from "@/lib/email-unsubscribe";

export const dynamic = "force-dynamic";

/**
 * POST only. Handles both the mail client's one-click unsubscribe
 * (RFC 8058, body "List-Unsubscribe=One-Click", params in the query string)
 * and the confirm form on /email/unsubscribe (params in the form body, plus
 * `action=resubscribe` for undo). GET never changes anything, because link
 * scanners open every URL in an email.
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
  const uid = pick("u");
  const category = pick("c");
  const token = pick("t");
  const resubscribe = pick("action") === "resubscribe";
  const fromPage = form?.get("from") === "page";

  if (!verifyUnsubscribe(uid, category, token)) {
    return fromPage
      ? NextResponse.redirect(new URL(`/email/unsubscribe?error=1`, req.url), 303)
      : NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 400 });
  }

  const field = EMAIL_CATEGORIES[category as keyof typeof EMAIL_CATEGORIES].field;
  const ref = adminFirestore.collection("users").doc(uid as string);
  const snap = await ref.get();
  if (!snap.exists) {
    return fromPage
      ? NextResponse.redirect(new URL(`/email/unsubscribe?error=1`, req.url), 303)
      : NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }
  await ref.set(
    { [field]: resubscribe, email_prefs_updated_at: new Date().toISOString() },
    { merge: true },
  );

  if (fromPage) {
    const next = new URL("/email/unsubscribe", req.url);
    next.searchParams.set("u", uid as string);
    next.searchParams.set("c", category as string);
    next.searchParams.set("t", token as string);
    next.searchParams.set("done", resubscribe ? "on" : "off");
    return NextResponse.redirect(next, 303);
  }
  return NextResponse.json({ ok: true, category, enabled: resubscribe });
}

export async function GET(req: NextRequest) {
  const next = new URL("/email/unsubscribe", req.url);
  req.nextUrl.searchParams.forEach((value, key) => next.searchParams.set(key, value));
  return NextResponse.redirect(next, 303);
}
