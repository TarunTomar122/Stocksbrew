import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { can, limitFor, planOf } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { SAVED_SCREENS_MAX, cleanSavedScreenInput, readSavedScreens, type SavedScreen } from "@/lib/screener-saved";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/**
 * A signed-in person's own saved screens, kept on their user doc under
 * `saved_screens`. Writes only ever touch that one field, merged into the
 * doc, and only for the session's own uid.
 */

export const dynamic = "force-dynamic";

function unauthenticated() {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return unauthenticated();
  const doc = await getUserDoc(session.uid);
  return NextResponse.json({ screens: readSavedScreens((doc as { saved_screens?: unknown } | null)?.saved_screens) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthenticated();

  const body = (await req.json().catch(() => null)) as { name?: unknown; query?: unknown } | null;
  const input = cleanSavedScreenInput(body?.name, body?.query);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const existing = await getUserDoc(session.uid);
  if (!existing) return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  const plan = planOf({ signedIn: true, isSubscribed: resolveIsSubscribed(existing) });
  if (input.usesCall && !can("screener_call_filters", plan)) {
    return NextResponse.json({ error: "call_filters_locked" }, { status: 403 });
  }
  const limit = Math.min(limitFor("saved_screens", plan), SAVED_SCREENS_MAX);

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const screen: SavedScreen = { id: randomUUID(), name: input.name, query: input.query, created_at: new Date().toISOString() };
  let result: { screens: SavedScreen[] } | { error: string; limit: number } = { screens: [] };

  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const current = readSavedScreens(snap.exists ? (snap.data() as { saved_screens?: unknown }).saved_screens : null);
    const duplicate = current.find((item) => item.query === screen.query);
    if (duplicate) {
      // Same screen saved again: keep one, under the new name.
      const screens = current.map((item) => (item.id === duplicate.id ? { ...item, name: screen.name } : item));
      tx.set(userRef, { saved_screens: screens }, { merge: true });
      result = { screens };
      return;
    }
    if (current.length >= limit) {
      result = { error: "limit_reached", limit };
      return;
    }
    const screens = [...current, screen];
    tx.set(userRef, { saved_screens: screens }, { merge: true });
    result = { screens };
  });

  if ("error" in result) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthenticated();
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const userRef = adminFirestore.collection("users").doc(session.uid);
  let screens: SavedScreen[] = [];
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const current = readSavedScreens((snap.data() as { saved_screens?: unknown }).saved_screens);
    screens = current.filter((item) => item.id !== id);
    if (screens.length !== current.length) tx.set(userRef, { saved_screens: screens }, { merge: true });
  });
  return NextResponse.json({ ok: true, screens });
}
