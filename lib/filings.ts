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

async function getFilingsStreamUncached(): Promise<Filing[]> {
  const snap = await adminFirestore
    .collection("tm_agent_filings")
    .orderBy("filed_at", "desc")
    .limit(STREAM_LIMIT)
    .get();
  const out: Filing[] = [];
  for (const doc of snap.docs) {
    const filing = normalizeFiling(doc.data() as Record<string, unknown>, doc.id);
    if (filing) out.push(filing);
  }
  return out.sort((a, b) => (a.filedAt < b.filedAt ? 1 : a.filedAt > b.filedAt ? -1 : 0));
}

/** Newest first. Empty when the job has not run. */
export const getFilingsStream = unstable_cache(getFilingsStreamUncached, ["agent-filings-stream-v2"], {
  revalidate: 600,
});

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
