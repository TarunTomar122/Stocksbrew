import { NextRequest, NextResponse } from "next/server";

import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  isValidSourceSlug,
  normalizeFollowed,
  toggleFollowed,
} from "@/lib/follow-shared";

export const dynamic = "force-dynamic";

/** The signed-in person's followed sources, newest first. */
export async function GET() {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const snap = await adminFirestore.collection("users").doc(session.uid).get();
  const followed = snap.exists
    ? normalizeFollowed(
        (snap.data() as { followedSources?: unknown }).followedSources,
      )
    : [];
  return NextResponse.json({ followed });
}

/**
 * Follow or unfollow one source: `{ slug, follow }`.
 *
 * Only `followedSources` (and its timestamp) is merged into the caller's own
 * user doc; nothing else on the doc is read back out or rewritten.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const slug =
    typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!isValidSourceSlug(slug))
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  if (typeof body?.follow !== "boolean")
    return NextResponse.json({ error: "invalid_follow" }, { status: 400 });

  if (body.follow) {
    // Only real directory entries can be followed, so the list never fills with junk.
    const source = await adminFirestore
      .collection("tm_follow_sources")
      .doc(slug)
      .get();
    if (!source.exists)
      return NextResponse.json({ error: "unknown_source" }, { status: 404 });
  }

  const ref = adminFirestore.collection("users").doc(session.uid);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  const current = (snap.data() as { followedSources?: unknown })
    .followedSources;
  const followed = toggleFollowed(current, slug, body.follow);
  const before = toggleFollowed(current, slug, false);
  const planLimit = limitFor("followed_sources", (await getViewer()).plan);
  if (body.follow && followed.length > before.length && before.length >= planLimit) {
    return NextResponse.json(
      { error: "plan_limit", feature: "followed_sources", limit: planLimit, message: `Your plan follows ${planLimit} investors. Unfollow one to follow this one.` },
      { status: 409 },
    );
  }
  await ref.set(
    {
      followedSources: followed,
      followedSourcesUpdatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true, followed });
}
