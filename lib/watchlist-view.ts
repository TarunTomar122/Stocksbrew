import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

export type WatchlistRow = {
  instrument_id: string;
  ticker: string;
  market: "US" | "IN" | "";
  sector_label: string;
  industry_label: string;
  currency: string;
  price: number | null;
  day_change_pct: number | null;
  day_change_abs: number | null;
  scores: {
    overall: number | null;
    verdict: string | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  alerts: Record<string, unknown>[];
  has_intel_pro: boolean;
};

export type WatchlistPulse = {
  headline: string;
  subtitle: string;
  stats: {
    count?: number;
    movers_up?: number;
    movers_down?: number;
    avg_overall_score?: number | null;
    alert_count?: number;
  };
};

export type WatchlistView = {
  uid: string;
  tracked_count: number;
  tracked_ids: string[];
  rows: WatchlistRow[];
  pulse: WatchlistPulse;
  built_at: string;
  updated_at?: string;
};

// -----------------------------------------------------------------------------
// Reader (cheap — one Firestore read)
// -----------------------------------------------------------------------------

export async function getWatchlistView(uid: string): Promise<WatchlistView | null> {
  const doc = await adminFirestore.collection("tm_watchlist_views").doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as WatchlistView;
}

// -----------------------------------------------------------------------------
// Builder (called on track/untrack to keep the view fresh)
// -----------------------------------------------------------------------------

function marketFromInstrumentId(id: string): "US" | "IN" | "" {
  const prefix = id.split("_", 1)[0];
  return prefix === "US" || prefix === "IN" ? prefix : "";
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getActiveAiUniverses(): Promise<Record<"US" | "IN", string>> {
  const snap = await adminFirestore.collection("tm_config").doc("active_universes").get();
  const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
  return {
    US: (data?.US_ai_universe as string) || (data?.US as string) || "",
    IN: (data?.IN_ai_universe as string) || (data?.IN as string) || "",
  };
}

async function loadAlertsByInstrument(uid: string): Promise<Record<string, Record<string, unknown>[]>> {
  const snap = await adminFirestore
    .collection("tm_user_alert_flags")
    .where("user_id", "==", uid)
    .get();
  const out: Record<string, Record<string, unknown>[]> = {};
  snap.forEach((doc) => {
    const data = doc.data() as { instrument_id?: string; flags?: unknown[] };
    const instrumentId = String(data?.instrument_id ?? "").trim();
    const flags = Array.isArray(data?.flags) ? (data.flags as Record<string, unknown>[]) : [];
    if (!instrumentId || flags.length === 0) return;
    (out[instrumentId] ||= []).push(...flags);
  });
  return out;
}

async function rowFor(
  instrumentId: string,
  universes: Record<"US" | "IN", string>,
  alertsByInstrument: Record<string, Record<string, unknown>[]>,
): Promise<WatchlistRow | null> {
  const market = marketFromInstrumentId(instrumentId);
  if (!market) return null;

  const [latestSnap, intelSnap] = await Promise.all([
    adminFirestore.collection("tm_latest_prices").doc(instrumentId).get(),
    universes[market]
      ? adminFirestore
          .collection("tm_stock_intel_pro")
          .doc(`${market}__${universes[market]}`)
          .collection("stocks")
          .doc(instrumentId)
          .get()
      : Promise.resolve(null),
  ]);

  if (!latestSnap.exists) return null;
  const latest = latestSnap.data() as Record<string, unknown>;
  const quote = (latest?.quote as Record<string, unknown>) || {};
  const intel = (intelSnap && "exists" in intelSnap && intelSnap.exists
    ? intelSnap.data()
    : {}) as Record<string, unknown>;
  const pillars = (intel?.pillars as Record<string, { score?: unknown }>) || {};
  const overall = (intel?.overall as Record<string, unknown>) || {};

  return {
    instrument_id: instrumentId,
    ticker: (latest?.ticker as string) || (intel?.ticker as string) || "",
    market,
    sector_label: (intel?.sector_label as string) || "",
    industry_label: (intel?.industry_label as string) || "",
    currency: (latest?.currency as string) || (market === "US" ? "USD" : "INR"),
    price: toNumber(quote.current),
    day_change_pct: toNumber(quote.day_change_pct),
    day_change_abs: toNumber(quote.day_change_abs),
    scores: {
      overall: toNumber(overall.score),
      verdict: (overall.verdict as string) ?? null,
      valuation: toNumber(pillars.valuation?.score),
      growth: toNumber(pillars.growth?.score),
      quality: toNumber(pillars.quality?.score),
      momentum: toNumber(pillars.momentum?.score),
    },
    alerts: alertsByInstrument[instrumentId] || [],
    has_intel_pro: Object.keys(intel).length > 0,
  };
}

function pulseFromRows(rows: WatchlistRow[]): WatchlistPulse {
  if (rows.length === 0) {
    return {
      headline: "Your watchlist is empty",
      subtitle: "Track a stock from any detail page to start getting daily briefs.",
      stats: {},
    };
  }
  const up = rows.filter((r) => (r.day_change_pct ?? 0) > 0);
  const down = rows.filter((r) => (r.day_change_pct ?? 0) < 0);
  const scored = rows.filter((r) => r.scores.overall !== null);
  const avgOverall = scored.length
    ? Math.round((scored.reduce((s, r) => s + (r.scores.overall ?? 0), 0) / scored.length) * 10) / 10
    : null;
  const alertCount = rows.reduce((s, r) => s + r.alerts.length, 0);

  let headline = "Mixed tape";
  if (up.length && !down.length) headline = "Green across the board";
  else if (down.length && !up.length) headline = "Red across the board";
  else if (up.length > down.length) headline = "Mostly green";
  else if (down.length > up.length) headline = "Mostly red";

  const parts: string[] = [];
  if (alertCount) parts.push(`${alertCount} alert${alertCount === 1 ? "" : "s"} active`);
  if (avgOverall !== null) parts.push(`avg overall score ${avgOverall}`);
  parts.push(`${up.length} up, ${down.length} down`);

  return {
    headline,
    subtitle: parts.join(" · "),
    stats: {
      count: rows.length,
      movers_up: up.length,
      movers_down: down.length,
      avg_overall_score: avgOverall,
      alert_count: alertCount,
    },
  };
}

const WATCHLIST_ROW_CAP = 20;

export async function buildWatchlistView(
  uid: string,
  trackedStocks: string[],
): Promise<WatchlistView> {
  const universes = await getActiveAiUniverses();
  const alertsByInstrument = await loadAlertsByInstrument(uid);

  const rows: WatchlistRow[] = [];
  for (const id of (trackedStocks || []).slice(0, WATCHLIST_ROW_CAP)) {
    const row = await rowFor(id, universes, alertsByInstrument);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0));

  return {
    uid,
    tracked_count: rows.length,
    tracked_ids: rows.map((r) => r.instrument_id),
    rows,
    pulse: pulseFromRows(rows),
    built_at: new Date().toISOString(),
  };
}

export async function rebuildAndSaveWatchlistView(
  uid: string,
  trackedStocks: string[],
): Promise<WatchlistView> {
  const view = await buildWatchlistView(uid, trackedStocks);
  await adminFirestore.collection("tm_watchlist_views").doc(uid).set(
    {
      ...view,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: false },
  );
  return view;
}
