import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceQuotes } from "@/lib/firestore";

// Live "what's moving right now" reader.
//
// The precomputed watchlist view doc only stores the top handful of *personalized*
// suggestions, which skews toward screen matches and can go stale between rebuilds.
// This reader hits the raw signal snapshots the pipeline refreshes every run —
// `tm_daily_anomalies/{MARKET}__latest` (sharp single-day moves) and
// `reddit_snapshots/{MARKET}__latest` (retail buzz) — so the Radar can always
// surface "this stock went crazy today" and "Reddit is loud about this one"
// regardless of when the user's view was last built.

export type TrendingSignal = {
  instrument_id: string;
  ticker: string;
  market: "US" | "IN";
  name: string;
  sector: string;
  // ExploreDirectiveCard-compatible fields so the same card renders these.
  why: string;
  reason: string;
  score: number | null;
  sources: string[];
  anomaly_move_pct?: number | null;
  anomaly_headline?: string;
  reddit_mentions?: number;
  reddit_summary?: string;
  reddit_sentiment?: string;
  // % distance from the mean analyst price target ("analyst runway").
  target_upside_pct?: number | null;
  analyst_count?: number | null;
  // current price used for the runway math (anomaly snapshot or latest quote).
  price?: number | null;
  day_change_pct?: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type TrendingResult = { movers: TrendingSignal[]; buzz: TrendingSignal[] };

/**
 * Read the latest anomaly + reddit snapshots for the given markets and return
 * the top movers and top buzzing names, excluding anything the user already
 * tracks (so the rail stays discovery-only).
 */
export async function getTrendingSignals(
  markets: Array<"US" | "IN">,
  trackedInstrumentIds: Set<string>,
  opts: { moversLimit?: number; buzzLimit?: number; minMove?: number; minMentions?: number } = {},
): Promise<TrendingResult> {
  const effectiveMarkets = markets.length > 0 ? markets : (["US"] as Array<"US" | "IN">);
  const moversLimit = opts.moversLimit ?? 4;
  const buzzLimit = opts.buzzLimit ?? 4;
  const minMove = opts.minMove ?? 4;
  const minMentions = opts.minMentions ?? 3;

  const [anomalyDocs, redditDocs] = await Promise.all([
    adminFirestore.getAll(
      ...effectiveMarkets.map((m) => adminFirestore.collection("tm_daily_anomalies").doc(`${m}__latest`)),
    ),
    adminFirestore.getAll(
      ...effectiveMarkets.map((m) => adminFirestore.collection("reddit_snapshots").doc(`${m}__latest`)),
    ),
  ]);

  // ── Movers (anomalies) ─────────────────────────────────────────────────────
  const moverMap = new Map<string, TrendingSignal>();
  for (const doc of anomalyDocs) {
    if (!doc.exists) continue;
    const market = (String(doc.id.split("__")[0] || "US").toUpperCase() as "US" | "IN");
    const rows = ((doc.data()?.anomalies || []) as Array<Record<string, unknown>>) || [];
    for (const item of rows) {
      const ticker = String(item.ticker || item.symbol || "").toUpperCase();
      if (!ticker) continue;
      const instrumentId = String(item.instrument_id || `${market}_${ticker}`);
      if (trackedInstrumentIds.has(instrumentId)) continue;
      const move = toNumber(item.day_change_pct);
      if (move === null || Math.abs(move) < minMove) continue;
      const existing = moverMap.get(instrumentId);
      if (existing && Math.abs(existing.anomaly_move_pct ?? 0) >= Math.abs(move)) continue;
      const headline = String(item.headline || "").slice(0, 200);
      moverMap.set(instrumentId, {
        instrument_id: instrumentId,
        ticker,
        market,
        name: String(item.name || ""),
        sector: String(item.sector || ""),
        why: headline,
        reason: "Daily anomaly",
        score: toNumber(item.overall_score),
        sources: ["anomaly"],
        anomaly_move_pct: move,
        anomaly_headline: headline,
        price: toNumber(item.price),
      });
    }
  }
  const movers = Array.from(moverMap.values())
    .sort((a, b) => Math.abs(b.anomaly_move_pct ?? 0) - Math.abs(a.anomaly_move_pct ?? 0))
    .slice(0, moversLimit);

  // ── Buzz (reddit) ──────────────────────────────────────────────────────────
  const buzzMap = new Map<string, TrendingSignal>();
  for (const doc of redditDocs) {
    if (!doc.exists) continue;
    const market = (String(doc.id.split("__")[0] || "US").toUpperCase() as "US" | "IN");
    const tickersRaw = doc.data()?.tickers;
    const entries: Array<[string, Record<string, unknown>]> = [];
    if (tickersRaw && typeof tickersRaw === "object" && !Array.isArray(tickersRaw)) {
      for (const [ticker, payload] of Object.entries(tickersRaw as Record<string, unknown>)) {
        entries.push([String(ticker).toUpperCase(), (payload || {}) as Record<string, unknown>]);
      }
    } else if (Array.isArray(tickersRaw)) {
      for (const item of tickersRaw) {
        const t = String((item as Record<string, unknown>)?.ticker || "").toUpperCase();
        if (t) entries.push([t, (item || {}) as Record<string, unknown>]);
      }
    }
    for (const [ticker, item] of entries) {
      const instrumentId = String(item.instrument_id || `${market}_${ticker}`);
      if (trackedInstrumentIds.has(instrumentId)) continue;
      // Reddit snapshot rows use `mention_count` + `company_name`; tolerate the
      // older `mentions`/`name` shape too.
      const mentions = Math.round(toNumber(item.mention_count ?? item.mentions) ?? 0);
      if (mentions < minMentions) continue;
      const existing = buzzMap.get(instrumentId);
      if (existing && (existing.reddit_mentions ?? 0) >= mentions) continue;
      const summary = String(item.summary || item.context || "").slice(0, 200);
      const sentiment = String(item.sentiment || "").toLowerCase();
      buzzMap.set(instrumentId, {
        instrument_id: instrumentId,
        ticker,
        market,
        name: String(item.company_name || item.name || ""),
        sector: String(item.sector || ""),
        why: summary,
        reason: "Reddit buzz",
        score: null,
        sources: ["reddit"],
        reddit_mentions: mentions,
        reddit_summary: summary,
        reddit_sentiment: sentiment,
      });
    }
  }
  const buzz = Array.from(buzzMap.values())
    .sort((a, b) => (b.reddit_mentions ?? 0) - (a.reddit_mentions ?? 0))
    .slice(0, buzzLimit);

  // Enrich with analyst "runway" — % distance from the mean price target. The
  // anomaly rows carry a price; reddit rows don't, so fall back to the latest
  // quote. Targets live in tm_stock_facts.analyst.target_price.
  const all = [...movers, ...buzz];
  const ids = Array.from(new Set(all.map((s) => s.instrument_id)));
  if (ids.length > 0) {
    const [factDocs, pricesById] = await Promise.all([
      adminFirestore.getAll(...ids.map((id) => adminFirestore.collection("tm_stock_facts").doc(id))),
      getLatestPriceQuotes(ids),
    ]);
    const targetById = new Map<string, { target: number | null; count: number | null }>();
    for (const doc of factDocs) {
      if (!doc.exists) continue;
      const analyst = ((doc.data()?.analyst || {}) as Record<string, unknown>) || {};
      targetById.set(doc.id, {
        target: toNumber(analyst.target_price),
        count: toNumber(analyst.analyst_count),
      });
    }
    for (const s of all) {
      const analyst = targetById.get(s.instrument_id);
      const quote = pricesById.get(s.instrument_id)?.quote;
      const price = s.price ?? toNumber(quote?.current) ?? null;
      const dayChange = toNumber(quote?.day_change_pct) ?? s.anomaly_move_pct ?? null;
      s.price = price;
      s.day_change_pct = dayChange;
      s.analyst_count = analyst?.count ?? null;
      if (analyst?.target && price && price > 0) {
        s.target_upside_pct = Math.round(((analyst.target - price) / price) * 1000) / 10;
      } else {
        s.target_upside_pct = null;
      }
    }
  }

  return { movers, buzz };
}
