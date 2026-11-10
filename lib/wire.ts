import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getMarketSnapshot } from "@/lib/firestore";
import { getNewsFeed } from "@/lib/news";
import type { NewsLabel, NewsLabels } from "@/lib/wire-read";
import { assessFreshness, classifyTopics, visibleTone, type WireFreshness, type WireItem } from "@/lib/wire-shared";

/**
 * Server loaders for the wire (`/news`).
 *
 * Two stores hold headlines. `tm_agent_news` is the live one: publisher and
 * official RSS written by `backend/agentdata/news_feed.py`, tickers matched
 * strictly, the publisher's own excerpt and no model-written tone. The older
 * `tm_news_runs` pipeline carried model summaries and a sentiment label but
 * stopped in May 2026. The wire shows the live store and only falls back to
 * the old one when the live store is empty, and then says how old it is.
 */

const LIVE_COLLECTION = "tm_agent_news";
const TONE_COLLECTION = "tm_agent_news_tone";
const TONE_META = { collection: "tm_agent_news_tone_meta", id: "US" };
// Two days of headlines, so the read can compare today with the day before.
const WIRE_DEPTH = 2500;
const LABEL_HOURS = 52;
const TICKER_DEPTH = 150;

type RawHeadline = {
  id?: string;
  title?: string;
  url?: string;
  source_name?: string;
  source_kind?: string;
  published_at?: string;
  summary?: string;
  summary_origin?: string;
  stock_tickers?: unknown;
};

function cleanLine(raw: string | undefined): string {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toWireItem(raw: RawHeadline, fallbackId: string): WireItem | null {
  const title = cleanLine(raw.title);
  const url = String(raw.url ?? "").trim();
  const publishedAt = String(raw.published_at ?? "");
  if (!title || !/^https?:\/\//.test(url) || Number.isNaN(Date.parse(publishedAt))) return null;
  const source = cleanLine(raw.source_name);
  const excerpt = cleanLine(raw.summary);
  const tickers = Array.isArray(raw.stock_tickers)
    ? [...new Set(raw.stock_tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
    : [];
  return {
    id: String(raw.id ?? fallbackId),
    title,
    url,
    source,
    sourceKind: String(raw.source_kind ?? ""),
    publishedAt: new Date(publishedAt).toISOString(),
    // An excerpt that only repeats the headline adds nothing.
    excerpt: excerpt && excerpt.toLowerCase() !== title.toLowerCase() ? excerpt : "",
    excerptOrigin: excerpt ? "publisher" : "",
    tickers,
    tone: null,
    topics: classifyTopics(title, source),
  };
}

// Throws on a failed read, so a failure is never cached as "no headlines" for two minutes.
async function loadLiveUncached(): Promise<WireItem[]> {
  const snap = await adminFirestore.collection(LIVE_COLLECTION).orderBy("published_at", "desc").limit(WIRE_DEPTH).get();
  return snap.docs
    .map((doc) => toWireItem(doc.data() as RawHeadline, doc.id))
    .filter((item): item is WireItem => item !== null);
}

const loadLiveCached = unstable_cache(loadLiveUncached, ["wire-live-v2"], { revalidate: 120 });

async function loadLive(): Promise<WireItem[]> {
  try {
    return await loadLiveCached();
  } catch (error) {
    console.warn("[wire] live headline read failed:", error);
    return [];
  }
}

const TONES = new Set(["positive", "negative", "neutral"]);
const SCOPES = new Set(["stock", "market", "other"]);

export type LabelsMeta = { updatedAt: string | null; model: string | null };

/**
 * Tone, scope and theme per headline id, from `backend/agentdata/news_tone.py`.
 * Only well-formed labels are kept; a headline without one is simply unlabelled.
 */
const loadLabelsCached = unstable_cache(
  async (sinceIso: string): Promise<{ labels: NewsLabels; meta: LabelsMeta }> => {
    const labels: NewsLabels = {};
    let meta: LabelsMeta = { updatedAt: null, model: null };
    const [snap, metaSnap] = await Promise.all([
      adminFirestore.collection(TONE_COLLECTION).where("published_at", ">=", sinceIso).limit(6000).get(),
      adminFirestore.collection(TONE_META.collection).doc(TONE_META.id).get(),
    ]);
    for (const doc of snap.docs) {
      const data = doc.data() as { id?: string; tone?: string; scope?: string; theme?: unknown };
      const id = String(data.id ?? doc.id);
      if (!TONES.has(String(data.tone)) || !SCOPES.has(String(data.scope))) continue;
      const theme = typeof data.theme === "string" && data.theme.trim() ? data.theme.trim().slice(0, 60) : null;
      labels[id] = { tone: data.tone, scope: data.scope, theme } as NewsLabel;
    }
    if (metaSnap.exists) {
      const raw = metaSnap.data() as { updated_at?: string; model?: string };
      meta = { updatedAt: raw.updated_at ?? null, model: raw.model ?? null };
    }
    return { labels, meta };
  },
  ["wire-labels-v1"],
  { revalidate: 120 },
);

/** Labels for headlines since `sinceIso`; none (and no read) when the read fails, without caching the failure. */
async function loadLabels(sinceIso: string): Promise<{ labels: NewsLabels; meta: LabelsMeta }> {
  try {
    return await loadLabelsCached(sinceIso);
  } catch (error) {
    console.warn("[wire] tone labels read failed:", error);
    return { labels: {}, meta: { updatedAt: null, model: null } };
  }
}

/** "claude-haiku-5-5" → "Claude Haiku 5.5", for the read's source line. */
export function modelLabel(model: string | null): string | null {
  if (!model) return null;
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  if (!match) return model;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
  return `Claude ${family} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}

/** Every stored headline that names one ticker (the live store keeps 14 days). */
const loadLiveForTicker = unstable_cache(
  async (ticker: string): Promise<WireItem[]> => {
    try {
      const snap = await adminFirestore
        .collection(LIVE_COLLECTION)
        .where("stock_tickers", "array-contains", ticker)
        .limit(TICKER_DEPTH)
        .get();
      return snap.docs
        .map((doc) => toWireItem(doc.data() as RawHeadline, doc.id))
        .filter((item): item is WireItem => item !== null)
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    } catch (error) {
      console.warn("[wire] ticker headline read failed:", error);
      return [];
    }
  },
  ["wire-live-ticker-v1"],
  { revalidate: 120 },
);

/** The retired pipeline's last feed, mapped to the same shape. Only used when the live store is empty. */
async function loadLegacy(): Promise<WireItem[]> {
  const articles = await getNewsFeed("US").catch(() => []);
  const out: WireItem[] = [];
  for (const article of articles) {
    if (article.coverage_mode === "headline_feed") continue; // live rows merged in by lib/news.ts
    if (Number.isNaN(Date.parse(article.published_at))) continue;
    out.push({
      id: article.id,
      title: article.title,
      url: article.url,
      source: article.source_name,
      sourceKind: article.source_kind ?? "",
      publishedAt: new Date(article.published_at).toISOString(),
      excerpt: article.summary,
      excerptOrigin: article.summary ? "summary" : "",
      tickers: article.tickers,
      tone: visibleTone(article.sentiment_label),
      topics: classifyTopics(article.title, article.source_name),
    });
  }
  return out;
}

/** Publisher names, the one with the most headlines first. */
function sourcesByVolume(items: WireItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) if (item.source) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export type WireQuote = { pct: number | null; name: string };

export type WireData = {
  items: WireItem[];
  /** Which store the rows came from. */
  origin: "live" | "legacy" | "none";
  freshness: WireFreshness;
  /** Day move and company name by ticker, from the latest price snapshot. */
  quotes: Record<string, WireQuote>;
  quotesAsOf: string | null;
  /** Distinct publishers in the feed, busiest first. */
  sources: string[];
  /** Tone, scope and theme by headline id (recent headlines only). */
  labels: NewsLabels;
  labelsMeta: LabelsMeta;
};

async function loadQuotes(): Promise<{ quotes: Record<string, WireQuote>; asOf: string | null }> {
  const rows = await getMarketSnapshot("US").catch(() => []);
  const quotes: Record<string, WireQuote> = {};
  let asOf = "";
  for (const row of rows) {
    const symbol = String(row.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    const pct = row.price?.changePct;
    quotes[symbol] = { pct: typeof pct === "number" && Number.isFinite(pct) ? pct : null, name: row.name || symbol };
    if (row.lastUpdated && row.lastUpdated > asOf) asOf = row.lastUpdated;
  }
  return { quotes, asOf: asOf || null };
}

/**
 * The rows for the wire. With a ticker, every stored headline for that name;
 * otherwise the newest thousand across the market.
 */
export async function loadWire(options: { ticker?: string | null; now?: number } = {}): Promise<WireData> {
  const now = options.now ?? Date.now();
  // Rounded to the hour so the cached label read is shared between requests.
  const labelSince = new Date(Math.floor((now - LABEL_HOURS * 3_600_000) / 3_600_000) * 3_600_000).toISOString();
  const [live, quoteData, labelled] = await Promise.all([loadLive(), loadQuotes(), loadLabels(labelSince)]);

  let items = live;
  let origin: WireData["origin"] = live.length ? "live" : "none";
  if (live.length && options.ticker) {
    const forTicker = await loadLiveForTicker(options.ticker);
    // Fall back to the market rows when the targeted read comes back empty or fails.
    items = forTicker.length ? forTicker : live.filter((item) => item.tickers.includes(options.ticker as string));
  }
  if (!live.length) {
    items = await loadLegacy();
    origin = items.length ? "legacy" : "none";
  }

  // A labelled headline shows its tone; the retired pipeline's own label is kept when there is no new one.
  const withTone = items.map((item) => {
    const label = labelled.labels[item.id];
    if (!label) return item;
    return { ...item, tone: label.tone === "positive" ? ("bullish" as const) : label.tone === "negative" ? ("bearish" as const) : null };
  });

  return {
    items: withTone,
    origin,
    // Freshness is judged on the whole feed, not on one ticker's rows.
    freshness: assessFreshness(live.length ? live : items, now),
    quotes: quoteData.quotes,
    quotesAsOf: quoteData.asOf,
    sources: sourcesByVolume(live.length ? live : items),
    labels: labelled.labels,
    labelsMeta: labelled.meta,
  };
}
