/**
 * The stored record of what changed in a company's filings: `tm_filing_changes/{TICKER}`, one document per stock,
 * written by the after-close job (scripts/run-filing-changes.ts) and read by the stock page, the inbox and the agent's
 * proposals. It holds the newest filing's comparison and a short history of earlier ones, newest first.
 *
 * Pure: the document shape, reading it back safely, and merging a new comparison in. Safe on the client.
 */

import { hasChanges, type Comparison, type ComparisonScope, type ComparisonStatus, type FilingRef, type Reworded } from "./diff";

export const FILING_CHANGES_COLLECTION = "tm_filing_changes";
export const FILING_CHANGES_VERSION = 1;
/** Earlier comparisons kept beside the newest. */
export const HISTORY_MAX = 8;

export type FilingChangesDoc = {
  version: number;
  ticker: string;
  company: string;
  cik: number;
  /** The newest filing's comparison. */
  latest: Comparison;
  /** Earlier comparisons, newest first, at most HISTORY_MAX. */
  history: Comparison[];
  /** When `latest` was written (ISO). */
  updated_at: string;
  source: "SEC EDGAR";
};

const STATUSES: ReadonlySet<ComparisonStatus> = new Set(["changes", "no_changes", "none_listed", "unreadable"]);
const SCOPES: ReadonlySet<ComparisonScope> = new Set(["full", "partial"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : []);

function readRef(raw: unknown): FilingRef | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.form !== "10-K" && data.form !== "10-Q") return null;
  if (typeof data.accession !== "string" || typeof data.filed !== "string" || !DAY.test(data.filed)) return null;
  // Only SEC's own address is ever linked.
  if (typeof data.url !== "string" || !/^https:\/\/www\.sec\.gov\//.test(data.url)) return null;
  return {
    form: data.form,
    accession: data.accession,
    filed: data.filed,
    period: typeof data.period === "string" && DAY.test(data.period) ? data.period : null,
    url: data.url,
    headings: typeof data.headings === "number" && Number.isFinite(data.headings) ? data.headings : null,
  };
}

function readReworded(raw: unknown): Reworded[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const data = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    return data && typeof data.from === "string" && typeof data.to === "string" ? [{ from: data.from, to: data.to, score: typeof data.score === "number" ? data.score : 0 }] : [];
  });
}

/** One stored comparison, or null when it is not one (a missing filing, an unknown status). */
export function readComparison(raw: unknown): Comparison | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const status = data.status as ComparisonStatus;
  if (!STATUSES.has(status)) return null;
  const filing = readRef(data.filing);
  if (!filing) return null;
  return {
    status,
    scope: SCOPES.has(data.scope as ComparisonScope) ? (data.scope as ComparisonScope) : null,
    filing,
    base: readRef(data.base),
    added: strings(data.added),
    ...(strings(data.repeated).length ? { repeated: strings(data.repeated) } : {}),
    dropped: strings(data.dropped),
    reworded: readReworded(data.reworded),
    same: typeof data.same === "number" && Number.isFinite(data.same) ? data.same : 0,
    reason: typeof data.reason === "string" ? data.reason : null,
    compared_at: typeof data.compared_at === "string" ? data.compared_at : null,
  };
}

/** A stored document, or null when it is not one of this version. */
export function readFilingChangesDoc(raw: unknown): FilingChangesDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== FILING_CHANGES_VERSION || typeof data.ticker !== "string") return null;
  const latest = readComparison(data.latest);
  if (!latest) return null;
  const history = Array.isArray(data.history) ? data.history.map(readComparison).filter((entry): entry is Comparison => entry !== null) : [];
  return {
    version: FILING_CHANGES_VERSION,
    ticker: data.ticker,
    company: typeof data.company === "string" ? data.company : data.ticker,
    cik: typeof data.cik === "number" ? data.cik : 0,
    latest,
    history: history.slice(0, HISTORY_MAX),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
    source: "SEC EDGAR",
  };
}

/**
 * The document after this run: the new comparisons (newest first) lead; whatever was stored before stays as history,
 * once per filing, newest first, cut to HISTORY_MAX. A comparison of a filing already stored is replaced by the new
 * one (the reading may have improved).
 */
export function nextDoc(previous: FilingChangesDoc | null, input: { ticker: string; company: string; cik: number; comparisons: Comparison[]; now: Date }): FilingChangesDoc | null {
  const stamp = input.now.toISOString();
  const before = new Map((previous ? [previous.latest, ...previous.history] : []).map((entry) => [entry.filing.accession, entry]));
  // A comparison worked out again (--force) that says the same keeps when it was first worked out: its inbox line
  // must not turn unread again.
  const fresh = input.comparisons
    .map((entry) => {
      const old = before.get(entry.filing.accession);
      return { ...entry, compared_at: old && old.compared_at && sameContent(old, entry) ? old.compared_at : stamp };
    })
    .sort((a, b) => b.filing.filed.localeCompare(a.filing.filed) || b.filing.accession.localeCompare(a.filing.accession));
  const latest = fresh[0];
  if (!latest) return previous;
  const seen = new Set<string>();
  const history: Comparison[] = [];
  for (const entry of [...fresh, ...(previous ? [previous.latest, ...previous.history] : [])]) {
    if (seen.has(entry.filing.accession)) continue;
    seen.add(entry.filing.accession);
    if (entry !== latest) history.push(entry);
  }
  history.sort((a, b) => b.filing.filed.localeCompare(a.filing.filed));
  return {
    version: FILING_CHANGES_VERSION,
    ticker: input.ticker,
    company: input.company,
    cik: input.cik,
    latest,
    history: history.slice(0, HISTORY_MAX),
    updated_at: input.now.toISOString(),
    source: "SEC EDGAR",
  };
}

/** Whether two comparisons of one filing say the same thing (when they were worked out aside). */
export function sameContent(a: Comparison, b: Comparison): boolean {
  const key = (entry: Comparison) =>
    JSON.stringify([entry.status, entry.scope, entry.base?.accession ?? null, entry.added, entry.repeated ?? [], entry.dropped, entry.reworded.map((pair) => [pair.from, pair.to]), entry.same]);
  return key(a) === key(b);
}

/** Whether the stored history already compares this 10-K with the one before it. */
export function hasAnnualComparison(doc: FilingChangesDoc | null, accession: string): boolean {
  if (!doc) return false;
  return [doc.latest, ...doc.history].some((entry) => entry.filing.accession === accession && entry.filing.form === "10-K");
}

/** How far back a comparison may be the one the stock page shows: a 10-K a little over a year old still counts. */
export const SHOW_DAYS = 400;

/**
 * What the stock page shows: the newest readable comparison that added or dropped a risk (or, when none did, the
 * newest that only reworded some), within SHOW_DAYS. When a newer filing changed less (a 10-Q with no changes, or one
 * that only reworded), it is said in one line above. Null when nothing readable changed: no section at all.
 */
export type FilingChangesView = {
  ticker: string;
  company: string;
  shown: Comparison;
  /** The newest filing, when it is newer than `shown` and changed less: said in one line above. */
  quiet: Comparison | null;
};

const addsOrDrops = (entry: Comparison) => hasChanges(entry) && entry.added.length + (entry.repeated?.length ?? 0) + entry.dropped.length > 0;

export function viewOf(doc: FilingChangesDoc | null, today: string): FilingChangesView | null {
  if (!doc) return null;
  const all = [doc.latest, ...doc.history].sort((a, b) => b.filing.filed.localeCompare(a.filing.filed));
  const floor = new Date(Date.parse(`${today}T12:00:00Z`) - SHOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recent = all.filter((entry) => entry.filing.filed >= floor);
  const shown = recent.find(addsOrDrops) ?? recent.find((entry) => hasChanges(entry));
  if (!shown) return null;
  const newest = all[0]!;
  const quiet = newest !== shown && newest.filing.filed > shown.filing.filed && newest.status !== "unreadable" && !addsOrDrops(newest) ? newest : null;
  return { ticker: doc.ticker, company: doc.company, shown, quiet };
}
