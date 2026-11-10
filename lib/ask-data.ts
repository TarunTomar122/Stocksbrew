import { unstable_cache } from "next/cache";
import type { UIMessage } from "ai";

import {
  ASK_CONVERSATIONS_COLLECTION,
  ASK_MAX_CONVERSATIONS_LISTED,
  ASK_MAX_MESSAGES_STORED,
  ASK_USAGE_COLLECTION,
} from "@/lib/ask-config";
import { cleanSeries, type NewsItem, type SeriesPoint } from "@/lib/ask-cards";
import type { AskUsageDoc, AskUsageStore } from "@/lib/ask-limits";
import { adminFirestore } from "@/lib/firebase-admin";
import { getNewsFeed, getNewsForTicker } from "@/lib/news";

/**
 * Server-side reads and writes for Ask: the daily allowance, saved
 * conversations, daily price series and the headline wire.
 *
 * Writes are additive and only ever touch `tm_agent_ask_usage` and
 * `tm_agent_conversations`, keyed by the signed-in person's uid.
 */

/* ── allowance ──────────────────────────────────────────────────────────── */

export const askUsageStore: AskUsageStore = {
  async transact(docId, update) {
    const ref = adminFirestore.collection(ASK_USAGE_COLLECTION).doc(docId);
    return adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const { write, result } = update(snap.exists ? (snap.data() as Partial<AskUsageDoc>) : null);
      if (write) tx.set(ref, write, { merge: true });
      return result;
    });
  },
};

/* ── conversations ──────────────────────────────────────────────────────── */

export const ASK_CONVERSATION_ID_RE = /^[a-z0-9]{8,32}$/;

export type AskConversationSummary = { id: string; title: string; updated_at: string; messages: number };

export type AskConversation = AskConversationSummary & { created_at: string; items: UIMessage[] };

function conversationDocId(uid: string, id: string): string {
  return `${uid}__${id}`;
}

function indexDocId(uid: string): string {
  return `${uid}__index`;
}

function titleFrom(messages: UIMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const text = (first?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "New conversation";
  return text.length > 72 ? `${text.slice(0, 69).trimEnd()}...` : text;
}

/**
 * Keep what is needed to show the conversation again and to hand it back to
 * the model: text, finished tool results and the step markers between them.
 * Reasoning and half-streamed tool calls are dropped: a tool call without a
 * result cannot be replayed to a model.
 */
export function storableMessages(messages: UIMessage[]): UIMessage[] {
  const kept: UIMessage[] = [];
  for (const message of messages.slice(-ASK_MAX_MESSAGES_STORED)) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = (message.parts ?? []).filter((part) => {
      if (part.type === "text") return part.text.trim().length > 0;
      if (part.type === "step-start") return true;
      if (part.type.startsWith("tool-")) {
        const state = (part as { state?: string }).state;
        return state === "output-available" || state === "output-error";
      }
      return part.type.startsWith("data-");
    });
    if (!parts.some((part) => part.type !== "step-start")) continue;
    kept.push({ id: message.id, role: message.role, parts } as UIMessage);
  }
  // The store holds JSON. Round-tripping drops undefined values, which it rejects.
  return JSON.parse(JSON.stringify(kept)) as UIMessage[];
}

/** Save (or replace) one conversation and update the person's list. Never throws: a failed save must not break an answer. */
export async function saveConversation(input: { uid: string; id: string; messages: UIMessage[]; now?: Date }): Promise<boolean> {
  if (!input.uid || !ASK_CONVERSATION_ID_RE.test(input.id)) return false;
  const items = storableMessages(input.messages);
  if (items.length === 0) return false;
  const stamp = (input.now ?? new Date()).toISOString();
  const title = titleFrom(items);
  try {
    const ref = adminFirestore.collection(ASK_CONVERSATIONS_COLLECTION).doc(conversationDocId(input.uid, input.id));
    const indexRef = adminFirestore.collection(ASK_CONVERSATIONS_COLLECTION).doc(indexDocId(input.uid));
    await adminFirestore.runTransaction(async (tx) => {
      const [snap, indexSnap] = await Promise.all([tx.get(ref), tx.get(indexRef)]);
      const created = snap.exists && typeof snap.data()?.created_at === "string" ? (snap.data()!.created_at as string) : stamp;
      const previous = indexSnap.exists && Array.isArray(indexSnap.data()?.items) ? (indexSnap.data()!.items as AskConversationSummary[]) : [];
      const summary: AskConversationSummary = { id: input.id, title, updated_at: stamp, messages: items.length };
      const next = [summary, ...previous.filter((item) => item && item.id !== input.id)].slice(0, ASK_MAX_CONVERSATIONS_LISTED);
      tx.set(ref, { kind: "conversation", uid: input.uid, id: input.id, title, created_at: created, updated_at: stamp, messages: items.length, items });
      tx.set(indexRef, { kind: "index", uid: input.uid, updated_at: stamp, items: next });
    });
    return true;
  } catch (error) {
    console.error("ask_conversation_save_failed", error);
    return false;
  }
}

export async function listConversations(uid: string): Promise<AskConversationSummary[]> {
  if (!uid) return [];
  try {
    const snap = await adminFirestore.collection(ASK_CONVERSATIONS_COLLECTION).doc(indexDocId(uid)).get();
    const items = snap.exists ? (snap.data()?.items as unknown) : null;
    if (!Array.isArray(items)) return [];
    return items
      .filter((item): item is AskConversationSummary => Boolean(item) && typeof item.id === "string" && typeof item.title === "string")
      .slice(0, ASK_MAX_CONVERSATIONS_LISTED);
  } catch (error) {
    console.error("ask_conversation_list_failed", error);
    return [];
  }
}

export async function getConversation(uid: string, id: string): Promise<AskConversation | null> {
  if (!uid || !ASK_CONVERSATION_ID_RE.test(id)) return null;
  try {
    const snap = await adminFirestore.collection(ASK_CONVERSATIONS_COLLECTION).doc(conversationDocId(uid, id)).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    // The doc id already carries the uid; this guards against a mis-keyed doc.
    if (data.uid !== uid || !Array.isArray(data.items)) return null;
    return {
      id,
      title: typeof data.title === "string" ? data.title : "Conversation",
      created_at: typeof data.created_at === "string" ? data.created_at : "",
      updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
      messages: data.items.length,
      items: data.items as UIMessage[],
    };
  } catch (error) {
    console.error("ask_conversation_read_failed", error);
    return null;
  }
}

/* ── daily closes ───────────────────────────────────────────────────────── */

export type DailySeries = {
  symbol: string;
  series: SeriesPoint[];
  source: string;
  adjusted: boolean;
  fetched_at: string | null;
};

const PRICE_SOURCES: Record<string, string> = { yahoo_chart: "Yahoo Finance daily closes" };

async function loadDailySeriesUncached(symbol: string): Promise<DailySeries | null> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  if (!doc.exists) return null;
  const raw = (doc.data() ?? {}) as { dates?: unknown; closes?: unknown; source?: string; adjusted?: boolean; fetched_at?: string };
  const series = cleanSeries(raw.dates, raw.closes);
  if (series.length < 2) return null;
  return {
    symbol,
    series,
    source: PRICE_SOURCES[raw.source ?? ""] ?? raw.source ?? "Daily closes",
    adjusted: raw.adjusted !== false,
    fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : null,
  };
}

/** Years of adjusted daily closes for one symbol, from `tm_price_history_daily`. Null when we hold none. */
export async function loadDailySeries(symbol: string): Promise<DailySeries | null> {
  const upper = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-^=]{0,11}$/.test(upper)) return null;
  try {
    return await unstable_cache(() => loadDailySeriesUncached(upper), ["ask-daily-series-v1", upper], { revalidate: 3 * 3600 })();
  } catch (error) {
    console.error("ask_daily_series_failed", upper, error);
    return null;
  }
}

/* ── the wire ───────────────────────────────────────────────────────────── */

type RawNews = {
  title?: string;
  url?: string;
  source_name?: string;
  published_at?: string;
  summary?: string;
  stock_tickers?: string[];
};

function toNewsItem(raw: RawNews): NewsItem | null {
  if (!raw || typeof raw.title !== "string" || typeof raw.url !== "string" || typeof raw.published_at !== "string") return null;
  if (!/^https?:\/\//.test(raw.url)) return null;
  const summary = typeof raw.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim() : "";
  return {
    title: raw.title.replace(/\s+/g, " ").trim(),
    url: raw.url,
    source: typeof raw.source_name === "string" && raw.source_name ? raw.source_name : "News",
    published_at: raw.published_at,
    summary: summary && summary !== raw.title ? summary.slice(0, 280) : null,
    tickers: Array.isArray(raw.stock_tickers) ? raw.stock_tickers.filter((t): t is string => typeof t === "string").slice(0, 6) : [],
  };
}

function newestFirst(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of [...items].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function loadWireUncached(limit: number): Promise<NewsItem[]> {
  const [fresh, older] = await Promise.all([
    adminFirestore
      .collection("tm_agent_news")
      .orderBy("published_at", "desc")
      .limit(limit * 3)
      .get()
      .then((snap) => snap.docs.map((doc) => toNewsItem(doc.data() as RawNews)))
      .catch(() => [] as Array<NewsItem | null>),
    getNewsFeed("US", limit)
      .then((rows) =>
        rows.map((row) =>
          toNewsItem({
            title: row.title,
            url: row.url,
            source_name: row.source_name,
            published_at: row.published_at,
            summary: row.summary,
            stock_tickers: row.tickers,
          }),
        ),
      )
      .catch(() => [] as Array<NewsItem | null>),
  ]);
  return newestFirst([...fresh, ...older].filter((item): item is NewsItem => item !== null)).slice(0, limit);
}

/** The newest market headlines, publisher excerpts only. Empty when the wire is down. */
export const loadWire = (limit = 20) =>
  unstable_cache(() => loadWireUncached(limit), ["ask-wire-v1", String(limit)], { revalidate: 180 })();

async function loadTickerNewsUncached(ticker: string, limit: number): Promise<NewsItem[]> {
  const [fresh, older] = await Promise.all([
    adminFirestore
      .collection("tm_agent_news")
      .where("stock_tickers", "array-contains", ticker)
      .limit(60)
      .get()
      .then((snap) => snap.docs.map((doc) => toNewsItem(doc.data() as RawNews)))
      .catch(() => [] as Array<NewsItem | null>),
    getNewsForTicker("US", ticker, { days: 14, limit })
      .then((rows) =>
        rows.map((row) =>
          toNewsItem({
            title: row.title,
            url: row.url,
            source_name: row.source_name,
            published_at: row.published_at,
            summary: row.summary,
            stock_tickers: row.tickers,
          }),
        ),
      )
      .catch(() => [] as Array<NewsItem | null>),
  ]);
  return newestFirst([...fresh, ...older].filter((item): item is NewsItem => item !== null)).slice(0, limit);
}

/** Headlines that name one ticker, newest first. */
export const loadTickerNews = (ticker: string, limit = 8) =>
  unstable_cache(() => loadTickerNewsUncached(ticker.toUpperCase(), limit), ["ask-ticker-news-v1", ticker.toUpperCase(), String(limit)], {
    revalidate: 180,
  })();
