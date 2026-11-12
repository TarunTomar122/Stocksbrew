import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import type { NewsArticle } from "@/lib/news";
import { headlineWordRead } from "@/lib/wire-headline-tone";

import type { HeadlineTone } from "./types";

/**
 * Each of a stock's headlines with its tone, from the same place /news reads it (lib/wire.ts): the model's label per
 * headline id in `tm_agent_news_tone` (backend/agentdata/news_tone.py) first; for a story it has not read, the
 * headline's own words when they clearly lean (lib/wire-headline-tone.ts, the fallback /news uses); for a row from the
 * retired pipeline, its own bullish or bearish label. Anything else has no tone, never a guess. A label the model
 * scoped "other" (nothing a US stock investor would act on) is left out, as /news leaves it out of its tone counts.
 *
 * Server only. One batch read of at most the rows shown, kept for two minutes; a failed read leaves every row to its
 * fallback rather than holding up the news.
 */

const TONE_COLLECTION = "tm_agent_news_tone";
const TONES = new Set<HeadlineTone>(["positive", "negative", "neutral"]);
const SCOPES = new Set(["stock", "market"]);

export type TonedArticle = NewsArticle & { tone: HeadlineTone | null };

/** Labels by id, read in one batch. Throws on a failed read so the failure is never cached as "no labels". */
async function readTones(ids: string[]): Promise<Record<string, HeadlineTone>> {
  const out: Record<string, HeadlineTone> = {};
  const snaps = await adminFirestore.getAll(...ids.map((id) => adminFirestore.collection(TONE_COLLECTION).doc(id)));
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data() as { tone?: unknown; scope?: unknown };
    const tone = String(data.tone) as HeadlineTone;
    if (TONES.has(tone) && SCOPES.has(String(data.scope))) out[ids[index]!] = tone;
  });
  return out;
}

// Kept two minutes, like the headlines themselves (lib/news.ts), so a busy stock page reads its labels once.
const readTonesCached = unstable_cache(readTones, ["stock-news-tone-v1"], { revalidate: 120 });

async function modelTones(ids: string[]): Promise<Record<string, HeadlineTone>> {
  // A document id with a slash would name another path; an empty one names none.
  const usable = [...new Set(ids)].filter((id) => id && !id.includes("/")).sort();
  if (!usable.length) return {};
  try {
    return await readTonesCached(usable);
  } catch (error) {
    console.warn("[stock-news] tone read failed:", error);
    return {};
  }
}

/** The tone a row's own fields give when the model has not read it: the headline's words, else the old pipeline's label. */
export function fallbackTone(article: Pick<NewsArticle, "title" | "tickers" | "sentiment_label">, ticker: string, name: string | null | undefined): HeadlineTone | null {
  const tickers = article.tickers.length ? article.tickers : [ticker];
  // A two-company headline gives its words to one of them only; the page's stock must be that one.
  const read = headlineWordRead(article.title, tickers, { [ticker]: name });
  if (read) return read.ticker === ticker ? read.tone : null;
  const legacy = String(article.sentiment_label ?? "").toLowerCase();
  return legacy === "bullish" ? "positive" : legacy === "bearish" ? "negative" : null;
}

export async function toneNews(articles: NewsArticle[], ticker: string, name: string | null | undefined): Promise<TonedArticle[]> {
  const labelled = await modelTones(articles.map((article) => article.id));
  return articles.map((article) => ({ ...article, tone: labelled[article.id] ?? fallbackTone(article, ticker, name) }));
}
