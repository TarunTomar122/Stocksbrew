import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase-admin";

const ON_DEMAND_QUEUE_DEDUPE_MS = 90 * 1000;

function marketFromInstrumentId(instrumentId: string): "US" | "IN" {
  return instrumentId.startsWith("IN_") ? "IN" : "US";
}

async function getActiveAiUniverse(market: "US" | "IN"): Promise<string> {
  const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
  const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};
  const aiKey = `${market}_ai_universe`;
  const priceKey = `${market}_universe`;
  const aiUniverse = String(data[aiKey] || "").trim();
  const priceUniverse = String(data[priceKey] || "").trim();
  if (aiUniverse) return aiUniverse;
  if (priceUniverse) return priceUniverse;
  return market === "IN" ? "in_core_60" : "us_core_100";
}

async function hasExistingIntel(instrumentId: string): Promise<boolean> {
  const market = marketFromInstrumentId(instrumentId);
  const universe = await getActiveAiUniverse(market);
  const intelSnap = await adminFirestore
    .collection("tm_news_runs")
    .doc(`${market}__${universe}`)
    .collection("stock_intelligence")
    .doc(instrumentId)
    .get();
  if (!intelSnap.exists) return false;
  const data = intelSnap.data() || {};
  const text = String(data.today_brief || data.body || data.headline || "").trim();
  return text.length > 0;
}

export async function maybeQueueOnDemandNews(uid: string, instrumentId: string): Promise<boolean> {
  const market = marketFromInstrumentId(instrumentId);
  // The old gate based on tm_tracked_instruments.tracked_count caused false
  // negatives for newly tracked users: "globally tracked" does not mean this
  // stock has fresh AI intel in the active universe.
  const alreadyCovered = await hasExistingIntel(instrumentId);
  if (alreadyCovered) return false;

  const ref = adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId);
  let queued = false;
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const status = String(existing?.status || "");
    const updatedAtRaw = String(existing?.updated_at || "");
    const updatedAt = Date.parse(updatedAtRaw);
    const recentlyQueued =
      status === "queued" &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < ON_DEMAND_QUEUE_DEDUPE_MS;
    if (status === "running" || recentlyQueued) {
      tx.set(
        ref,
        {
          requested_by: FieldValue.arrayUnion(uid),
          requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      return;
    }
    tx.set(
      ref,
      {
        instrument_id: instrumentId,
        market,
        status: "queued",
        requested_by: FieldValue.arrayUnion(uid),
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
    queued = true;
  });
  return queued;
}
