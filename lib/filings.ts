import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  FILING_GROUPS,
  type Filing,
  type FilingGroup,
  type FilingsMeta,
  normalizeFiling,
} from "@/lib/filings-shared";

export { FILING_GROUPS, type Filing, type FilingGroup, type FilingsMeta } from "@/lib/filings-shared";

/**
 * SEC filings for the covered US universe, written by
 * `backend/agentdata/sec_filings.py` into `tm_agent_filings` (one doc per
 * ticker and accession) with a summary doc in `tm_agent_filings_meta/US`.
 *
 * The whole 90-day window is a few thousand small rows, so the stream is read
 * once, trimmed to what the page draws, cached, and filtered in memory.
 */

const STREAM_LIMIT = 5000;
/** The fields normalizeFiling reads; the rest of each document (CIK, accession, index URL, capture time...) stays in the store. */
const FILING_FIELDS = ["ticker", "company", "form", "form_group", "role", "is_amendment", "headline", "items", "filed_at", "url"];

function normalizeSnapshot(docs: Array<{ id: string; data(): unknown }>): Filing[] {
  const out: Filing[] = [];
  for (const doc of docs) {
    const filing = normalizeFiling(doc.data() as Record<string, unknown>, doc.id);
    if (filing) out.push(filing);
  }
  // Filings filed the same second keep one order (by id), whichever read they came from.
  return out.sort((a, b) => (a.filedAt < b.filedAt ? 1 : a.filedAt > b.filedAt ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function getFilingsStreamUncached(): Promise<Filing[]> {
  const snap = await adminFirestore
    .collection("tm_agent_filings")
    .orderBy("filed_at", "desc")
    .limit(STREAM_LIMIT)
    .select(...FILING_FIELDS)
    .get();
  return normalizeSnapshot(snap.docs);
}

/** Newest first. Empty when the job has not run. */
export const getFilingsStream = unstable_cache(getFilingsStreamUncached, ["agent-filings-stream-v2"], {
  revalidate: 600,
});

/** Days the shared recent read covers: the agents' and proposals' six-day look-back, plus a day. */
const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

/** Every filing stored on or after `sinceDay`: a day before the window, a margin for any time not stored in UTC (sec_filings.py stores UTC). */
async function getRecentFilingsUncached(sinceDay: string): Promise<Filing[]> {
  const snap = await adminFirestore
    .collection("tm_agent_filings")
    .where("filed_at", ">=", sinceDay)
    .orderBy("filed_at", "desc")
    .limit(STREAM_LIMIT)
    .select(...FILING_FIELDS)
    .get();
  return normalizeSnapshot(snap.docs);
}

// Keyed by the window's first day, so one entry is shared by every reader that day, at the stream's freshness.
const getRecentFilingsCached = unstable_cache(getRecentFilingsUncached, ["agent-filings-recent-v1"], { revalidate: 600 });

/**
 * The stream from `fromMs` on, newest first: a reader that walks the stream until a filing is older than `fromMs`
 * finds the same filings in the same order here. Inside the last RECENT_DAYS this reads only those days (a few hundred
 * filings rather than the whole 90-day window); an older start reads the whole stream.
 */
export async function getFilingsSince(fromMs: number, now: number = Date.now()): Promise<Filing[]> {
  const windowStart = Date.parse(new Date(now - RECENT_DAYS * DAY_MS).toISOString().slice(0, 10));
  if (!Number.isFinite(fromMs) || fromMs < windowStart) return getFilingsStream();
  return getRecentFilingsCached(new Date(windowStart - DAY_MS).toISOString().slice(0, 10));
}

async function getFilingsMetaUncached(): Promise<FilingsMeta | null> {
  const doc = await adminFirestore.collection("tm_agent_filings_meta").doc("US").get();
  if (!doc.exists) return null;
  const data = doc.data() as Record<string, unknown>;
  const updatedAt = typeof data.updated_at === "string" ? data.updated_at : "";
  if (!updatedAt) return null;
  return {
    updatedAt,
    windowDays: typeof data.window_days === "number" ? data.window_days : null,
    companiesChecked: typeof data.companies_checked === "number" ? data.companies_checked : null,
    total: typeof data.filings_in_window === "number" ? data.filings_in_window : null,
  };
}

export const getFilingsMeta = unstable_cache(getFilingsMetaUncached, ["agent-filings-meta-v2"], {
  revalidate: 600,
});

export type FilingsQuery = {
  group?: FilingGroup | null;
  /** Only these tickers (upper case). Null or undefined means no ticker filter. */
  tickers?: ReadonlySet<string> | null;
  limit?: number;
};

export type FilingsPage = {
  filings: Filing[];
  /** Matches before the limit was applied. */
  matched: number;
  /** Count per form group for the current ticker scope, ignoring the form filter. */
  counts: Record<FilingGroup, number>;
};

/** Pure filter, exported for tests. */
export function selectFilings(stream: Filing[], query: FilingsQuery = {}): FilingsPage {
  const counts = Object.fromEntries(FILING_GROUPS.map((group) => [group, 0])) as Record<FilingGroup, number>;
  const scoped = query.tickers ? stream.filter((filing) => query.tickers!.has(filing.ticker)) : stream;
  for (const filing of scoped) counts[filing.group] += 1;
  const matched = query.group ? scoped.filter((filing) => filing.group === query.group) : scoped;
  const limit = Math.max(1, query.limit ?? 150);
  return { filings: matched.slice(0, limit), matched: matched.length, counts };
}

export async function getFilings(query: FilingsQuery = {}): Promise<FilingsPage> {
  return selectFilings(await getFilingsStream(), query);
}

/** Latest filings for one ticker, newest first. */
export async function getFilingsForTicker(ticker: string, limit = 12): Promise<Filing[]> {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return [];
  return selectFilings(await getFilingsStream(), { tickers: new Set([upper]), limit }).filings;
}
