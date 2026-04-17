import { adminFirestore } from "@/lib/firebase-admin";
import { DashboardView, InstrumentView } from "@/lib/view-contracts";

const DEFAULT_FRONTEND_UNIVERSE: Record<"US" | "IN", string | null> = {
  US: "us_core_100",
  IN: "in_test_5",
};

async function getActiveUniverse(market: "US" | "IN"): Promise<string | null> {
  const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data() as Record<string, unknown> | undefined;
  const value = data?.[market];
  return typeof value === "string" && value.trim() ? value : null;
}

async function getMaterializedDashboardView(
  market: "US" | "IN",
  universeId: string,
): Promise<DashboardView | null> {
  const doc = await adminFirestore.collection("tm_views_dashboard").doc(`${market}__${universeId}`).get();
  return doc.exists ? (doc.data() as DashboardView) : null;
}

async function getMaterializedInstrumentView(
  instrumentId: string,
  universeId: string,
): Promise<InstrumentView | null> {
  const doc = await adminFirestore.collection("tm_views_instrument").doc(`${instrumentId}__${universeId}`).get();
  return doc.exists ? (doc.data() as InstrumentView) : null;
}

export async function getDashboardView(
  market: "US" | "IN",
  universeId?: string,
): Promise<DashboardView | null> {
  const resolvedUniverse = universeId || (await getActiveUniverse(market)) || DEFAULT_FRONTEND_UNIVERSE[market];
  if (!resolvedUniverse) {
    return null;
  }
  return getMaterializedDashboardView(market, resolvedUniverse);
}

export async function getInstrumentView(
  instrumentId: string,
  universeId?: string,
): Promise<InstrumentView | null> {
  const market = instrumentId.startsWith("IN_") ? "IN" : "US";
  const resolvedUniverse = universeId || (await getActiveUniverse(market)) || DEFAULT_FRONTEND_UNIVERSE[market];
  if (!resolvedUniverse) {
    return null;
  }
  return getMaterializedInstrumentView(instrumentId, resolvedUniverse);
}
