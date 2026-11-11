import { adminFirestore } from "@/lib/firebase-admin";

import { MEMO_VERSION, type Memo, type MemoItem } from "./types";
import { readItemCard, readView } from "./view";

/**
 * Each signed-in person's memos, one document per week:
 * `tm_portfolio_memos/{uid}__{yyyy-ww}`. Only the web app writes here, and
 * only that week's own document: the user doc is never touched, older weeks
 * are never rewritten once finished, and nothing is deleted. The current
 * week's document is rewritten at most once a day (or when the holdings or
 * coverage behind it change) until the week is over.
 */

export const MEMO_COLLECTION = "tm_portfolio_memos";
/** Past weeks listed under the memo. */
export const HISTORY_LIMIT = 52;

export function memoDocId(uid: string, weekKey: string): string {
  return `${uid}__${weekKey}`;
}

export type StoredMemo = {
  memo: Memo;
  /** New York day it was written. */
  day: string;
  /** Holdings, shares and coverage it was written from, so a change rewrites the current week. */
  signature: string;
};

export type MemoHistoryRow = {
  weekKey: string;
  monday: string;
  friday: string;
  complete: boolean;
  topLine: string;
  /** From the memo's view; missing on weeks written before the page went visual. */
  headline?: string | null;
  portfolioPct?: number | null;
  marketPct?: number | null;
};

/** A week's line in the list of memos. */
export function historyRow(memo: Memo): MemoHistoryRow {
  return {
    weekKey: memo.weekKey,
    monday: memo.monday,
    friday: memo.friday,
    complete: memo.complete,
    topLine: memo.topLine,
    headline: memo.view?.headline ?? null,
    portfolioPct: memo.view?.portfolioPct ?? null,
    marketPct: memo.view?.marketPct ?? null,
  };
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

function readItems(value: unknown): MemoItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: MemoItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    if (!str(row.id) || !str(row.text) || !str(row.href)) return null;
    items.push({
      id: str(row.id),
      kind: str(row.kind) as MemoItem["kind"],
      text: str(row.text),
      href: str(row.href),
      linkLabel: str(row.linkLabel),
      tone: row.tone === "up" || row.tone === "down" ? row.tone : "flat",
      tickers: Array.isArray(row.tickers) ? row.tickers.filter((ticker): ticker is string => typeof ticker === "string") : [],
      source: str(row.source),
      asOf: str(row.asOf),
      card: readItemCard(row.card),
    });
  }
  return items;
}

/** A stored memo, or null when the document is missing, malformed or from an older memo version. */
export function readStoredMemo(data: unknown): StoredMemo | null {
  if (!data || typeof data !== "object") return null;
  const doc = data as Record<string, unknown>;
  const raw = doc.memo as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object" || raw.version !== MEMO_VERSION) return null;
  const changed = readItems(raw.changed);
  const hurt = readItems(raw.hurt);
  const look = readItems(raw.look);
  if (!changed || !hurt || !look || !str(raw.weekKey) || !str(raw.topLine)) return null;
  return {
    memo: {
      version: MEMO_VERSION,
      weekKey: str(raw.weekKey),
      monday: str(raw.monday),
      friday: str(raw.friday),
      endDay: str(raw.endDay) || null,
      complete: raw.complete === true,
      subject: "mine",
      topLine: str(raw.topLine),
      week: raw.week ? readItems([raw.week])?.[0] ?? null : null,
      changed,
      hurt,
      look,
      heldBack: typeof raw.heldBack === "number" ? raw.heldBack : 0,
      wordedBy: raw.wordedBy === "model" ? "model" : "rules",
      writtenAt: str(raw.writtenAt),
      view: readView(raw.view),
    },
    day: str(doc.day),
    signature: str(doc.signature),
  };
}

export async function readMemo(uid: string, weekKey: string): Promise<StoredMemo | null> {
  const snap = await adminFirestore.collection(MEMO_COLLECTION).doc(memoDocId(uid, weekKey)).get();
  return snap.exists ? readStoredMemo(snap.data()) : null;
}

/** Writes one week's own document in full. Never merges into anything else. */
export async function saveMemo(uid: string, stored: StoredMemo): Promise<void> {
  await adminFirestore
    .collection(MEMO_COLLECTION)
    .doc(memoDocId(uid, stored.memo.weekKey))
    .set({
      uid,
      week_key: stored.memo.weekKey,
      monday: stored.memo.monday,
      complete: stored.memo.complete,
      day: stored.day,
      signature: stored.signature,
      memo: JSON.parse(JSON.stringify(stored.memo)) as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
}

/** The person's memos, newest week first. */
export async function listMemos(uid: string): Promise<MemoHistoryRow[]> {
  const snap = await adminFirestore.collection(MEMO_COLLECTION).where("uid", "==", uid).get();
  const rows: MemoHistoryRow[] = [];
  for (const doc of snap.docs) {
    const stored = readStoredMemo(doc.data());
    if (!stored) continue;
    rows.push(historyRow(stored.memo));
  }
  return rows.sort((a, b) => b.monday.localeCompare(a.monday)).slice(0, HISTORY_LIMIT);
}
