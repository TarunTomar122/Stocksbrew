import { adminFirestore } from "@/lib/firebase-admin";

export type LifecycleEventType =
  | "track_blocked_subscription_required"
  | "checkout_started"
  | "subscription_converted"
  | "subscription_cancel_scheduled"
  | "first_radar_item_email_sent";

export async function recordLifecycleEvent(params: {
  uid: string;
  email?: string | null;
  type: LifecycleEventType;
  payload?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await adminFirestore.collection("tm_lifecycle_events").add({
    uid: params.uid,
    email: params.email ?? null,
    type: params.type,
    payload: params.payload ?? {},
    created_at: now,
    processed_at: null,
  });
}
