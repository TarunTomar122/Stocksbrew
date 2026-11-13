import { unstable_cache } from "next/cache";

import { etToday } from "@/lib/day-words";
import { adminFirestore } from "@/lib/firebase-admin";
import type { InboxItem } from "@/lib/inbox/types";

import { docAsSentences } from "./casing";
import { filingItems } from "./inbox";
import { FILING_CHANGES_COLLECTION, readFilingChangesDoc, viewOf, type FilingChangesDoc, type FilingChangesView } from "./store";

/**
 * Reads of tm_filing_changes (written after the close by scripts/run-filing-changes.ts). One document per stock, the
 * same for every viewer, so each is cached for an hour across requests: a new 10-K or 10-Q reaches the store once a
 * night. A failed read throws and is not cached; the callers leave their section out. Every document comes back for
 * display: a heading filed in Title Case is a sentence (./casing.ts); the stored copy stays as filed.
 */

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

function clean(ticker: string): string | null {
  const value = ticker.trim().toUpperCase();
  return TICKER.test(value) ? value : null;
}

const cachedDoc = unstable_cache(
  async (ticker: string): Promise<FilingChangesDoc | null> => {
    const snap = await adminFirestore.collection(FILING_CHANGES_COLLECTION).doc(ticker).get();
    const doc = snap.exists ? readFilingChangesDoc(snap.data()) : null;
    return doc ? docAsSentences(doc) : null;
  },
  ["tm-filing-changes-v2"],
  { revalidate: 3600, tags: ["filing-changes"] },
);

/** One stock's stored comparisons, or null when the job has none for it. */
export async function getFilingChanges(ticker: string): Promise<FilingChangesDoc | null> {
  const value = clean(ticker);
  return value ? cachedDoc(value) : null;
}

/** What the stock page shows for this stock, or null for no section. */
export async function getFilingChangesView(ticker: string, today: string = etToday()): Promise<FilingChangesView | null> {
  return viewOf(await getFilingChanges(ticker), today);
}

const cachedMany = unstable_cache(
  async (tickers: string[]): Promise<FilingChangesDoc[]> => {
    if (tickers.length === 0) return [];
    const snaps = await adminFirestore.getAll(...tickers.map((ticker) => adminFirestore.collection(FILING_CHANGES_COLLECTION).doc(ticker)));
    return snaps
      .map((snap) => (snap.exists ? readFilingChangesDoc(snap.data()) : null))
      .filter((doc): doc is FilingChangesDoc => doc !== null)
      .map(docAsSentences);
  },
  ["tm-filing-changes-many-v2"],
  { revalidate: 3600, tags: ["filing-changes"] },
);

/** Several stocks' stored comparisons in one read (the inbox, the agent's proposals). Missing ones are left out. */
export async function getFilingChangesFor(tickers: readonly string[]): Promise<FilingChangesDoc[]> {
  const unique = [...new Set(tickers.map(clean).filter((ticker): ticker is string => ticker !== null))].sort().slice(0, 300);
  return cachedMany(unique);
}

/** The inbox source: comparisons of filings in the window on the person's stocks (lib/filing-changes/inbox.ts). */
export async function filingSource(stocks: ReadonlyArray<{ ticker: string }>, sinceDay: string): Promise<InboxItem[]> {
  if (stocks.length === 0) return [];
  const tickers = new Set(stocks.map((stock) => stock.ticker.toUpperCase()));
  return filingItems(await getFilingChangesFor([...tickers]), tickers, sinceDay);
}
