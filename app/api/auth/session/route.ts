import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const SESSION_COOKIE_NAME = "tikrr_session";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

async function isWaitlistedEmail(email: string | null | undefined): Promise<boolean> {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return false;
  try {
    const snap = await adminFirestore
      .collection("tm_waitlist")
      .where("email_lower", "==", value)
      .limit(1)
      .get();
    return !snap.empty;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const idToken = body.idToken;
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: FIVE_DAYS_MS,
    });
  } catch {
    return NextResponse.json({ error: "session_failed" }, { status: 500 });
  }

  let waitlistPromoted = false;
  try {
    const userRef = adminFirestore.collection("users").doc(decoded.uid);
    const existing = await userRef.get();
    const waitlisted = await isWaitlistedEmail(decoded.email ?? null);
    const profile = {
      email: decoded.email ?? null,
      email_lower: decoded.email ? String(decoded.email).toLowerCase() : null,
      display_name: decoded.name ?? null,
      photo_url: decoded.picture ?? null,
      last_sign_in_at: FieldValue.serverTimestamp(),
    };
    if (!existing.exists) {
      await userRef.set({
        ...profile,
        created_at: FieldValue.serverTimestamp(),
        is_subscribed: waitlisted ? true : false,
        waitlist_promoted_at: waitlisted ? FieldValue.serverTimestamp() : null,
      });
      waitlistPromoted = waitlisted;
    } else {
      const data = existing.data() || {};
      const updates: Record<string, unknown> = { ...profile };
      if (waitlisted && data.is_subscribed !== true) {
        updates.is_subscribed = true;
        updates.waitlist_promoted_at = FieldValue.serverTimestamp();
        waitlistPromoted = true;
      }
      await userRef.set(updates, { merge: true });
    }
  } catch (err) {
    console.error("user doc upsert failed", err);
    // do not fail the session — user can still sign in; doc will sync on next login
  }

  const response = NextResponse.json({ ok: true, uid: decoded.uid, waitlistPromoted });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionCookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FIVE_DAYS_MS / 1000,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
