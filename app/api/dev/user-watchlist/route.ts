import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Returns any user's email and watchlist through the admin SDK. Local only.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const [userSnap, viewSnap] = await Promise.all([
    adminFirestore.collection("users").doc(userId).get(),
    adminFirestore.collection("tm_watchlist_views").doc(userId).get().catch(() => null),
  ]);

  if (!userSnap.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userData = userSnap.data()!;
  const tracked = Array.isArray(userData.tracked_stocks)
    ? userData.tracked_stocks.filter((id: unknown): id is string => typeof id === "string")
    : [];

  const watchlistView = viewSnap?.exists ? viewSnap.data() : null;

  const instrumentIds = [...new Set(tracked)];
  const instruments: Record<string, unknown> = {};
  if (instrumentIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < instrumentIds.length; i += 30) {
      chunks.push(instrumentIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const snap = await adminFirestore.collection("tm_instruments").where("__name__", "in", chunk).get();
      for (const doc of snap.docs) {
        instruments[doc.id] = doc.data();
      }
    }
  }

  return NextResponse.json({
    user: {
      uid: userId,
      email: userData.email || userData.email_lower || null,
      display_name: userData.display_name || null,
      photo_url: userData.photo_url || null,
      is_subscribed: userData.is_subscribed || false,
      subscriptionStatus: userData.subscriptionStatus || null,
      subscriptionPlan: userData.subscriptionPlan || null,
      subscribedAt: userData.subscribedAt || null,
      subscriptionId: userData.subscriptionId || null,
      cancelAtPeriodEnd: userData.cancelAtPeriodEnd || false,
      created_at: userData.created_at || null,
      last_sign_in_at: userData.last_sign_in_at || null,
      lastCheckoutMarket: userData.lastCheckoutMarket || null,
      lastCheckoutPlan: userData.lastCheckoutPlan || null,
      lastCheckoutCreatedAt: userData.lastCheckoutCreatedAt || null,
      tracked_stocks: tracked,
      watchlist_positions: userData.watchlist_positions || {},
      watchlist_holdings: userData.watchlist_holdings || {},
      watchlist_version: userData.watchlist_version || 0,
      watchlist_updated_at: userData.watchlist_updated_at || null,
      last_tracked_at: userData.last_tracked_at || null,
    },
    watchlistView,
    instruments,
  });
}
