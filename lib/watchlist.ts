import { adminFirestore } from "@/lib/firebase-admin";

export type UserDoc = {
  uid: string;
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  is_subscribed?: boolean;
  tracked_stocks?: string[];
  created_at?: string;
  last_sign_in_at?: string;
};

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await adminFirestore.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...(snap.data() as Omit<UserDoc, "uid">) };
}

// Dev convenience: in non-production, treat every signed-in user as
// subscribed so we can exercise Pro surfaces without toggling Firestore.
// Flip off by setting NEXT_PUBLIC_DEV_UNLOCK_PRO=0 or running in production.
const DEV_UNLOCK_PRO =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO !== "0";

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
