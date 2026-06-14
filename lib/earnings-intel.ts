import { adminFirestore } from "@/lib/firebase-admin";

export type EarningsIntelScenario = {
  case: "bull" | "base" | "bear";
  probability_pct: number;
  thesis: string;
  triggers: string[];
  invalidators: string[];
};

export type EarningsIntelDoc = {
  doc_id: string;
  market: "US" | "IN";
  instrument_id: string;
  ticker: string;
  event_date: string;
  generated_at: string;
  model?: string;
  report: {
    headline: string;
    summary: string;
    facts?: {
      reported_vs_expected?: string;
      guidance_signal?: string;
      price_reaction?: string;
      post_earnings_narrative?: string;
    };
    interpretation?: {
      what_changed?: string;
      what_market_is_pricing?: string;
      fundamental_implication?: string;
    };
    scenarios_30_90d?: EarningsIntelScenario[];
    decision_guide?: {
      for_holders?: string;
      for_watchers?: string;
      key_monitor_list?: string[];
    };
    confidence?: {
      score_0_100?: number;
      reason?: string;
    };
  };
};

/** Post-earnings surfaces only show reports from this window. */
export const EARNINGS_RECENT_MAX_DAYS = 14;

function parseEventDateUtc(eventDate: string): Date | null {
  const iso = eventDate.trim().split("T", 1)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const event = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(event.getTime()) ? event : null;
}

export function daysSinceEventDate(eventDate: string, ref = new Date()): number | null {
  const event = parseEventDateUtc(eventDate);
  if (!event) return null;
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  const eventDay = new Date(
    Date.UTC(event.getUTCFullYear(), event.getUTCMonth(), event.getUTCDate()),
  );
  return Math.round((today.getTime() - eventDay.getTime()) / 86_400_000);
}

export function isEventDateWithinRecentWindow(
  eventDate: string,
  maxDays = EARNINGS_RECENT_MAX_DAYS,
  ref = new Date(),
): boolean {
  const delta = daysSinceEventDate(eventDate, ref);
  if (delta === null) return false;
  return delta >= 0 && delta <= maxDays;
}

export function filterEarningsIntelRecent(
  docs: EarningsIntelDoc[],
  maxDays = EARNINGS_RECENT_MAX_DAYS,
  ref = new Date(),
): EarningsIntelDoc[] {
  return docs
    .filter((d) => isEventDateWithinRecentWindow(d.event_date, maxDays, ref))
    .sort((a, b) => {
      const ea = Date.parse(`${a.event_date}T12:00:00.000Z`);
      const eb = Date.parse(`${b.event_date}T12:00:00.000Z`);
      return (Number.isFinite(eb) ? eb : 0) - (Number.isFinite(ea) ? ea : 0);
    });
}

/** Monday–Sunday week (UTC) containing `ref`. */
export function isEventDateInCurrentWeek(eventDate: string, ref = new Date()): boolean {
  const iso = eventDate.trim().split("T", 1)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const event = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(event.getTime())) return false;

  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  const dow = today.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return event.getTime() >= weekStart.getTime() && event.getTime() <= weekEnd.getTime();
}

export function filterEarningsIntelThisWeek(docs: EarningsIntelDoc[]): EarningsIntelDoc[] {
  return docs
    .filter((d) => isEventDateInCurrentWeek(d.event_date))
    .sort((a, b) => {
      const ea = Date.parse(`${a.event_date}T12:00:00.000Z`);
      const eb = Date.parse(`${b.event_date}T12:00:00.000Z`);
      return (Number.isFinite(eb) ? eb : 0) - (Number.isFinite(ea) ? ea : 0);
    });
}

export async function getLatestEarningsIntelForInstruments(
  market: "US" | "IN",
  instrumentIds: string[],
): Promise<EarningsIntelDoc[]> {
  if (!instrumentIds.length) return [];
  const refs = instrumentIds.map((id) =>
    adminFirestore.collection("tm_earnings_intel").doc(`${market}__${id}__latest`),
  );
  const snaps = await adminFirestore.getAll(...refs);
  const rows: EarningsIntelDoc[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as EarningsIntelDoc;
    if (!data?.instrument_id || !data?.ticker) continue;
    rows.push(data);
  }
  rows.sort((a, b) => {
    const ta = Date.parse(a.generated_at || "");
    const tb = Date.parse(b.generated_at || "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return rows;
}

function docGeneratedMs(doc: EarningsIntelDoc): number {
  const t = Date.parse(doc.generated_at || "");
  return Number.isFinite(t) ? t : 0;
}

/** Every published post-earnings report (one row per ticker, newest wins). */
export async function listAllEarningsIntelDocs(): Promise<EarningsIntelDoc[]> {
  const snaps = await adminFirestore.collection("tm_earnings_intel").get();
  const byTicker = new Map<string, EarningsIntelDoc>();

  for (const snap of snaps.docs) {
    if (!snap.id.endsWith("__latest")) continue;
    const data = snap.data() as EarningsIntelDoc;
    const ticker = String(data?.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!ticker || !data?.instrument_id) continue;

    const row: EarningsIntelDoc = { ...data, doc_id: snap.id, ticker };
    const existing = byTicker.get(ticker);
    if (!existing || docGeneratedMs(row) > docGeneratedMs(existing)) {
      byTicker.set(ticker, row);
    }
  }

  return filterEarningsIntelRecent(
    [...byTicker.values()].sort((a, b) => docGeneratedMs(b) - docGeneratedMs(a)),
  );
}

/** All published earnings intel reports for sitemap generation. */
export async function listEarningsIntelForSitemap(): Promise<
  { ticker: string; lastmod: string }[]
> {
  return (await listAllEarningsIntelDocs()).map((doc) => ({
    ticker: doc.ticker,
    lastmod:
      (doc.generated_at || doc.event_date || "").split("T", 1)[0] ||
      new Date().toISOString().split("T", 1)[0],
  }));
}

export async function getLatestEarningsIntelByTicker(
  market: "US" | "IN",
  ticker: string,
): Promise<EarningsIntelDoc | null> {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return null;

  const bySymbol = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", market)
    .where("symbol", "==", upper)
    .limit(1)
    .get();
  let instrumentId = bySymbol.docs[0]?.id || "";
  if (!instrumentId) {
    const byTicker = await adminFirestore
      .collection("tm_instruments")
      .where("market", "==", market)
      .where("ticker", "==", upper)
      .limit(1)
      .get();
    instrumentId = byTicker.docs[0]?.id || "";
  }
  if (!instrumentId) return null;

  const doc = await adminFirestore
    .collection("tm_earnings_intel")
    .doc(`${market}__${instrumentId}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as EarningsIntelDoc;
}

