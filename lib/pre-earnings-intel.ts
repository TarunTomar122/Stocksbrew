import { adminFirestore } from "@/lib/firebase-admin";
import {
  filterPreEarningsWithinDays,
  isWithinPreEarningsWindow,
  type PreEarningsIntelDoc,
} from "@/lib/pre-earnings-intel-shared";

export type { EpsOutlook, PostPrintMove, PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
export {
  daysUntilEventDate,
  EPS_OUTLOOK_LABELS,
  filterPreEarningsWithinDays,
  isWithinPreEarningsWindow,
  POST_PRINT_MOVE_LABELS,
  shouldShowPreEarningsIntel,
  epsOutlookTone,
  postPrintMoveTone,
} from "@/lib/pre-earnings-intel-shared";

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getPreEarningsIntelUpcoming(
  market: "US" | "IN",
  instrumentId: string,
): Promise<PreEarningsIntelDoc | null> {
  const doc = await adminFirestore
    .collection("tm_pre_earnings_intel")
    .doc(`${market}__${instrumentId}__upcoming`)
    .get();
  if (!doc.exists) return null;
  const data = doc.data() as PreEarningsIntelDoc;
  if (!data?.instrument_id || !data?.ticker) return null;
  if (!isWithinPreEarningsWindow(data.event_date)) return null;
  return { ...data, doc_id: doc.id };
}

export async function getPreEarningsIntelForInstruments(
  market: "US" | "IN",
  instrumentIds: string[],
): Promise<PreEarningsIntelDoc[]> {
  if (!instrumentIds.length) return [];
  const refs = instrumentIds.map((id) =>
    adminFirestore.collection("tm_pre_earnings_intel").doc(`${market}__${id}__upcoming`),
  );
  const snaps = await adminFirestore.getAll(...refs);
  const rows: PreEarningsIntelDoc[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as PreEarningsIntelDoc;
    if (!data?.instrument_id || !data?.ticker) continue;
    if (!isWithinPreEarningsWindow(data.event_date)) continue;
    rows.push({ ...data, doc_id: snap.id });
  }
  return filterPreEarningsWithinDays(rows);
}

export async function getPreEarningsIntelPastForInstruments(
  market: "US" | "IN",
  instrumentIds: string[],
): Promise<PreEarningsIntelDoc[]> {
  if (!instrumentIds.length) return [];
  const refs = instrumentIds.map((id) =>
    adminFirestore.collection("tm_pre_earnings_intel").doc(`${market}__${id}__upcoming`),
  );
  const snaps = await adminFirestore.getAll(...refs);
  const rows: PreEarningsIntelDoc[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as PreEarningsIntelDoc;
    if (!data?.instrument_id || !data?.ticker || !data?.event_date) continue;
    rows.push({ ...data, doc_id: snap.id });
  }
  return rows;
}

export async function listUpcomingPreEarningsIntel(
  market: "US" | "IN" = "US",
  maxDays = 7,
  universeTickers?: Set<string>,
): Promise<PreEarningsIntelDoc[]> {
  const today = utcToday();
  const end = new Date(today);
  end.setUTCDate(today.getUTCDate() + maxDays);
  const fromIso = today.toISOString().slice(0, 10);
  const toIso = end.toISOString().slice(0, 10);

  const eventSnap = await adminFirestore
    .collection("tm_earnings_events")
    .where("market", "==", market)
    .where("event_date", ">=", fromIso)
    .where("event_date", "<=", toIso)
    .orderBy("event_date")
    .get();

  const instrumentIds: string[] = [];
  const seen = new Set<string>();
  for (const doc of eventSnap.docs) {
    const row = doc.data();
    const ticker = String(row.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!ticker) continue;
    if (universeTickers && !universeTickers.has(ticker)) continue;
    const instrumentId = `${market}_${ticker}`;
    if (seen.has(instrumentId)) continue;
    seen.add(instrumentId);
    instrumentIds.push(instrumentId);
  }

  return getPreEarningsIntelForInstruments(market, instrumentIds);
}
