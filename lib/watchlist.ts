import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";

export type UserDoc = {
  uid: string;
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  is_subscribed?: boolean;
  tracked_stocks?: string[];
  watchlist_positions?: Record<string, "holding" | "watchlist">;
  watchlist_updated_at?: string;
  watchlist_version?: number;
  radar_v1?: {
    built_at?: string;
    rows?: Array<Record<string, unknown>>;
    suggestions?: Array<Record<string, unknown>>;
    holdings_count?: number;
    watchlist_count?: number;
    tracked_count?: number;
    brief?: Record<string, unknown>;
    pulse?: Record<string, unknown>;
    portfolio?: Record<string, unknown>;
    event_radar?: Array<Record<string, unknown>>;
    changes?: Record<string, unknown>;
  };
  created_at?: string;
  last_sign_in_at?: string;
  lastCheckoutCreatedAt?: number;
  /** Dodo subscription fields (see app/api/subscription/webhook). */
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Email opt-out flags - treated as true when absent (opt-in by default). */
  email_alerts_enabled?: boolean;
  email_digest_enabled?: boolean;
  onboarding_completed?: boolean;
  onboarding_completed_at?: string;
};

export const getUserDoc = cache(async (uid: string): Promise<UserDoc | null> => {
  const snap = await adminFirestore.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...(snap.data() as Omit<UserDoc, "uid">) };
});

// Optional dev-only bypass: set NEXT_PUBLIC_DEV_UNLOCK_PRO=1 to treat any
// signed-in user with a user doc as Pro without Dodo/Firestore subscription
// fields. Default is off so local/staging matches production (Pro only when
// `is_subscribed` is set by the Dodo webhook).
const DEV_UNLOCK_PRO =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO === "1";

export function resolveIsSubscribed(doc: UserDoc | null | undefined): boolean {
  if (DEV_UNLOCK_PRO && doc) return true;
  return Boolean(doc?.is_subscribed);
}

export async function isSubscribed(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  const doc = await getUserDoc(uid);
  return resolveIsSubscribed(doc);
}

export async function getTrackedStocks(uid: string | null | undefined): Promise<string[]> {
  if (!uid) return [];
  const doc = await getUserDoc(uid);
  const tracked = doc?.tracked_stocks;
  return Array.isArray(tracked) ? tracked.filter((id) => typeof id === "string") : [];
}

export async function isStockTracked(
  uid: string | null | undefined,
  instrumentId: string,
): Promise<boolean> {
  const tracked = await getTrackedStocks(uid);
  return tracked.includes(instrumentId);
}
