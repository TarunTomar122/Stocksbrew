/**
 * Store reads for the filing and news agent events (lib/agent-events-filings.ts,
 * lib/agent-events-news.ts). Only lib/agent-jobs-data.ts imports this, so the
 * pure modules stay safe for the browser.
 *
 * The runner checks every enabled job one after another, and most jobs of one
 * person share the same names, so each read is kept for a few minutes in this
 * process and shared: the filings window is read once per run, headlines once
 * per ticker, and tone labels once per story. A failed read is never kept.
 */

import { adminFirestore } from "@/lib/firebase-admin";
import { filingFact, type FilingFact } from "@/lib/agent-events-filings";
import { NEWS_RULES, newsKnownDay, newsTickersFor, type NewsFacts, type NewsStory, type NewsToneLabel } from "@/lib/agent-events-news";
import { normalizeFiling } from "@/lib/filings-shared";
import { LocalFirestore } from "@/lib/local-firestore";

const FILINGS = "tm_agent_filings";
const NEWS = "tm_agent_news";
const TONES = "tm_agent_news_tone";
const KEEP_MS = 5 * 60_000;
/** Tickers per headline query (array-contains-any). */
const TICKERS_PER_QUERY = 10;
/** Headline queries in flight at once. */
const QUERY_CONCURRENCY = 3;
/** A story first stored within this long of its publish time is counted from when we stored it. */
const LATE_STORE_MS = 48 * 3_600_000;
/**
 * The wire took on its current sources (Investing.com, Seeking Alpha, PR
 * Newswire, more CNBC and MarketWatch, a wider Yahoo ticker feed) on Nov 9,
 * 2026, and the stories per stock jumped several times over. Days before this
 * are not a fair "normal day" for today's volume, so they are not used.
 * Move it forward if the sources change that much again.
 */
export const NEWS_SOURCES_SINCE = "2026-11-10";

type Kept<T> = { at: number; value: Promise<T> };
const kept = new Map<string, Kept<unknown>>();

function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = kept.get(key) as Kept<T> | undefined;
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const value = load();
  kept.set(key, { at: Date.now(), value });
  // Never keep a failure: the next job tries again.
  value.catch(() => kept.delete(key));
  return value;
}

/** For tests: forget everything kept. */
export function forgetAgentEventReads(): void {
  kept.clear();
}

type Rows = { docs: Array<{ id: string; data: () => unknown }> };
type Selectable = { select: (...fields: unknown[]) => { get: () => Promise<Rows> } };

/** Only these fields come back. The LocalDB adapter takes the list as an array, Firestore as arguments. */
function selected(query: unknown, fields: string[]): Promise<Rows> {
  const q = query as Selectable;
  return ((adminFirestore as unknown) instanceof LocalFirestore ? q.select(fields) : q.select(...fields)).get();
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function inBatches<T, R>(items: T[], size: number, concurrency: number, run: (batch: T[]) => Promise<R>): Promise<R[]> {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  const out: R[] = new Array(batches.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
      while (next < batches.length) {
        const index = next;
        next += 1;
        out[index] = await run(batches[index]);
      }
    }),
  );
  return out;
}

/* ── filings ────────────────────────────────────────────────────────────── */

const FILING_FIELDS = ["ticker", "company", "form", "form_group", "is_amendment", "role", "headline", "items", "filed_at", "url"];

/**
 * Every kept filing accepted on or after `from` (YYYY-MM-DD), for all
 * companies: a few thousand small rows, read once and shared by every job.
 * Null when the read fails.
 */
export async function loadFilingFacts(from: string): Promise<FilingFact[] | null> {
  try {
    return await remember(`filings:${from}`, async () => {
      const snap = await selected(adminFirestore.collection(FILINGS).where("filed_at", ">=", `${from}T00:00:00`), FILING_FIELDS);
      const out: FilingFact[] = [];
      for (const doc of snap.docs) {
        const filing = normalizeFiling(doc.data() as Record<string, unknown>, doc.id);
        const fact = filing ? filingFact(filing) : null;
        if (fact) out.push(fact);
      }
      return out;
    });
  } catch {
    return null;
  }
}

/* ── news ───────────────────────────────────────────────────────────────── */

const STORY_FIELDS = ["id", "title", "url", "source_name", "source_kind", "published_at", "captured_at", "stock_tickers"];

function storyFrom(raw: Record<string, unknown>, id: string): NewsStory | null {
  const title = text(raw.title);
  const url = text(raw.url);
  const published = text(raw.published_at);
  const publishedMs = Date.parse(published);
  if (!title || !/^https?:\/\//.test(url) || !Number.isFinite(publishedMs)) return null;
  // Some feeds hand a story over hours after it was published: it could only be read once we had it.
  const capturedMs = Date.parse(text(raw.captured_at));
  const knownMs = Number.isFinite(capturedMs) && capturedMs > publishedMs && capturedMs - publishedMs < LATE_STORE_MS ? capturedMs : publishedMs;
  const day = newsKnownDay(new Date(knownMs).toISOString());
  if (!day) return null;
  const tickers = Array.isArray(raw.stock_tickers)
    ? [...new Set(raw.stock_tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean))]
    : [];
  return {
    id: text(raw.id) || id,
    title,
    url,
    source: text(raw.source_name),
    source_kind: text(raw.source_kind),
    published_at: new Date(publishedMs).toISOString(),
    tickers,
    day,
  };
}

async function storiesFor(tickers: string[], from: string): Promise<Map<string, NewsStory[]>> {
  const out = new Map<string, NewsStory[]>();
  const missing: string[] = [];
  for (const ticker of tickers) {
    const hit = kept.get(`news:${from}:${ticker}`) as Kept<NewsStory[]> | undefined;
    if (hit && Date.now() - hit.at < KEEP_MS) out.set(ticker, await hit.value);
    else missing.push(ticker);
  }
  if (missing.length === 0) return out;
  const batches = await inBatches(missing, TICKERS_PER_QUERY, QUERY_CONCURRENCY, async (batch) => {
    const snap = await selected(
      adminFirestore.collection(NEWS).where("stock_tickers", "array-contains-any", batch).where("published_at", ">=", `${from}T00:00:00`),
      STORY_FIELDS,
    );
    const byTicker = new Map<string, NewsStory[]>(batch.map((ticker) => [ticker, []]));
    for (const doc of snap.docs) {
      const story = storyFrom(doc.data() as Record<string, unknown>, doc.id);
      if (!story) continue;
      for (const ticker of story.tickers) byTicker.get(ticker)?.push(story);
    }
    return byTicker;
  });
  for (const byTicker of batches) {
    for (const [ticker, stories] of byTicker) {
      out.set(ticker, stories);
      kept.set(`news:${from}:${ticker}`, { at: Date.now(), value: Promise.resolve(stories) });
    }
  }
  return out;
}

const TONE_VALUES = new Set(["positive", "negative", "neutral"]);
const SCOPE_VALUES = new Set(["stock", "market", "other"]);

async function tonesFor(ids: string[]): Promise<Record<string, NewsToneLabel>> {
  const out: Record<string, NewsToneLabel> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = kept.get(`tone:${id}`) as Kept<NewsToneLabel | null> | undefined;
    if (hit && Date.now() - hit.at < KEEP_MS) {
      const label = await hit.value;
      if (label) out[id] = label;
    } else missing.push(id);
  }
  if (missing.length === 0) return out;
  const snaps = await adminFirestore.getAll(...missing.map((id) => adminFirestore.collection(TONES).doc(id)));
  snaps.forEach((snap, index) => {
    const id = missing[index];
    let label: NewsToneLabel | null = null;
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const scoredAt = text(data.scored_at);
      if (TONE_VALUES.has(text(data.tone)) && SCOPE_VALUES.has(text(data.scope)) && Number.isFinite(Date.parse(scoredAt))) {
        label = { tone: text(data.tone) as NewsToneLabel["tone"], scope: text(data.scope) as NewsToneLabel["scope"], scored_at: new Date(Date.parse(scoredAt)).toISOString() };
      }
    }
    if (label) out[id] = label;
    kept.set(`tone:${id}`, { at: Date.now(), value: Promise.resolve(label) });
  });
  return out;
}

/** The first day we kept headlines for, and the first time a tone label was written. */
async function newsCoverage(): Promise<{ coverage_from: string | null; tone_from: string | null }> {
  return remember("news:coverage", async () => {
    const [first, firstTone] = await Promise.all([
      selected(adminFirestore.collection(NEWS).orderBy("published_at", "asc").limit(1), ["published_at"]),
      selected(adminFirestore.collection(TONES).orderBy("scored_at", "asc").limit(1), ["scored_at"]),
    ]);
    const published = text((first.docs[0]?.data() as Record<string, unknown> | undefined)?.published_at);
    const scored = text((firstTone.docs[0]?.data() as Record<string, unknown> | undefined)?.scored_at);
    // The first day is only partly kept, so the first whole day is the next one.
    const firstDay = published ? newsKnownDay(published, NEWS_RULES.storyCutoffMinutes) : null;
    return {
      coverage_from: firstDay ? nextDay(firstDay) : null,
      tone_from: Number.isFinite(Date.parse(scored)) ? new Date(Date.parse(scored)).toISOString() : null,
    };
  });
}

/**
 * Headlines naming these tickers since `from`, their tone labels, and how far
 * back both go. Null when the read fails, so the job says it could not check.
 */
export async function loadNewsFacts(tickers: string[], from: string, sessions: string[]): Promise<NewsFacts | null> {
  try {
    const wanted = [...new Set(tickers.flatMap((ticker) => newsTickersFor(ticker.toUpperCase())))];
    const [byTicker, coverage] = await Promise.all([storiesFor(wanted, from), newsCoverage()]);
    const byId = new Map<string, NewsStory>();
    for (const stories of byTicker.values()) for (const story of stories) byId.set(story.id, story);
    const stories = [...byId.values()];
    const tones = await tonesFor(stories.map((story) => story.id));
    // Days before `from` were not read here (and `from` itself only in part), so they count as not kept:
    // a missing day must never pass for a quiet one.
    const coverage_from = coverage.coverage_from ? [coverage.coverage_from, NEWS_SOURCES_SINCE, nextDay(from)].sort().pop()! : null;
    return { stories, tones, coverage_from, tone_from: coverage.tone_from, sessions };
  } catch {
    return null;
  }
}
