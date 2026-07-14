import { FieldValue, type CollectionReference, type Query } from "firebase-admin/firestore";

import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { DODO_BASE, dodoHeaders } from "@/lib/dodo";

async function deleteQueryBatch(query: Query, batchSize = 400): Promise<void> {
  while (true) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) return;
    const batch = adminFirestore.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    if (snap.size < batchSize) return;
  }
}

async function deleteCollection(collection: CollectionReference): Promise<void> {
  await deleteQueryBatch(collection);
}

function marketFromInstrumentId(instrumentId: string): string {
  return instrumentId.includes("__") ? instrumentId.split("__")[0] : "US";
}

async function decrementTrackedInstruments(trackedStocks: string[]): Promise<void> {
  if (trackedStocks.length === 0) return;
  const batch = adminFirestore.batch();
  const now = new Date().toISOString();
  for (const instrumentId of trackedStocks) {
    const ref = adminFirestore.collection("tm_tracked_instruments").doc(instrumentId);
    batch.set(
      ref,
      {
        instrument_id: instrumentId,
        market: marketFromInstrumentId(instrumentId),
        tracked_count: FieldValue.increment(-1),
        updated_at: now,
      },
      { merge: true },
    );
  }
  await batch.commit();
}

async function cancelBillableSubscription(subscriptionId: string | undefined): Promise<void> {
  if (!subscriptionId) return;
  try {
    const res = await fetch(`${DODO_BASE}/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: dodoHeaders(),
      body: JSON.stringify({ cancel_at_next_billing_date: true }),
    });
    if (!res.ok) {
      console.warn("account_delete: dodo cancel failed", subscriptionId, res.status);
    }
  } catch (error) {
    console.warn("account_delete: dodo cancel error", subscriptionId, error);
  }
}

export async function deleteUserAccount(uid: string): Promise<void> {
  const userRef = adminFirestore.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() ?? {} : {};

  const trackedStocks = Array.isArray(userData.tracked_stocks)
    ? userData.tracked_stocks.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const subscriptionId =
    typeof userData.subscriptionId === "string" && userData.subscriptionId.trim()
      ? userData.subscriptionId.trim()
      : undefined;

  await cancelBillableSubscription(subscriptionId);
  await decrementTrackedInstruments(trackedStocks);

  await deleteCollection(userRef.collection("watchlist_events"));
  await deleteCollection(adminFirestore.collection("tm_radar_inbox").doc(uid).collection("items"));
  await deleteCollection(adminFirestore.collection("tm_radar_user_views").doc(uid).collection("history"));
  await deleteQueryBatch(
    adminFirestore.collection("tm_user_alert_flags").where("user_id", "==", uid),
  );

  const docDeletes = [
    userRef,
    adminFirestore.collection("tm_watchlist_views").doc(uid),
    adminFirestore.collection("tm_watchlist_view_refresh_control").doc(uid),
    adminFirestore.collection("tm_portfolio_exposure").doc(uid),
    adminFirestore.collection("tm_portfolio_scenarios").doc(uid),
    adminFirestore.collection("tm_radar_inbox").doc(uid),
    adminFirestore.collection("tm_radar_user_views").doc(uid),
  ];

  const batch = adminFirestore.batch();
  docDeletes.forEach((ref) => batch.delete(ref));
  await batch.commit();

  await deleteCollection(adminFirestore.collection("tm_portfolio_scenarios").doc(uid).collection("events"));

  await adminAuth.deleteUser(uid);
}
