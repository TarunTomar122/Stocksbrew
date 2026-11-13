/**
 * The after-close filing check (scripts/run-filing-changes.ts): for every stock someone tracks, then the covered
 * universe, look up the company's newest 10-K or 10-Q on SEC EDGAR, and when it is newer than the one stored, compare
 * its risk factor headings with the filing it should be read against (lib/filing-changes/diff.ts) and write the
 * result to tm_filing_changes/{TICKER}.
 *
 * Cheap on a quiet night: one SEC request per stock (its filing list), documents only for new filings. SEC requests
 * all go through lib/research/edgar.ts's single queue (150ms apart, under SEC's 10 a second). Rules only, no model.
 * Writes only tm_filing_changes. The runner here takes its reads and writes as arguments, so it is tested without a
 * network or a store.
 */

import type { EdgarFiling, FilingList, RiskList } from "@/lib/research/edgar";

import { compareFull, compareQuarter, FULL_SHARE, MIN_HEADINGS_10K, unread, type Comparison, type RiskRead } from "./diff";
import { hasAnnualComparison, nextDoc, type FilingChangesDoc } from "./store";

/** Stop starting new stocks after this long, so a slow night cannot hold the after-close group. */
export const DEFAULT_BUDGET_MS = 25 * 60 * 1000;
/** Stocks worked on at once. SEC requests still go one at a time through the queue; this overlaps the downloads. */
export const DEFAULT_CONCURRENCY = 3;

export type JobDeps = {
  /** Tickers to check, those someone tracks first. */
  tickers: () => Promise<{ tickers: string[]; tracked: number }>;
  /** The stored documents for these tickers (missing ones left out). */
  readStored: (tickers: string[]) => Promise<Map<string, FilingChangesDoc>>;
  listFilings: (ticker: string) => Promise<FilingList | null>;
  riskList: (filing: EdgarFiling) => Promise<RiskList>;
  write: (ticker: string, doc: FilingChangesDoc) => Promise<void>;
  clock: () => number;
};

export type JobOptions = {
  now?: Date;
  dryRun?: boolean;
  budgetMs?: number;
  concurrency?: number;
  /** Check only these tickers (in this order). */
  only?: string[];
  /** Check at most this many tickers. */
  limit?: number;
  /** Compare again even when the newest filing is already stored (after a parsing fix). */
  force?: boolean;
  /** One line per stock (the dry run's output). Never given a uid. */
  log?: (line: string) => void;
};

export type JobSummary = {
  dryRun: boolean;
  tickers: number;
  tracked: number;
  /** Stocks whose newest filing was already stored. */
  unchanged: number;
  /** Stocks SEC does not list, or with no 10-K or 10-Q. */
  noFilings: number;
  /** Comparisons worked out this run, by status. */
  compared: Record<Comparison["status"], number>;
  /** Of those with changes: how many added at least one risk. */
  withAdded: number;
  written: number;
  writeFailures: number;
  failed: number;
  skippedForTime: number;
  seconds: number;
};

function refOf(filing: EdgarFiling): RiskRead["filing"] {
  return { form: filing.form, accession: filing.accession, filed: filing.filed, period: filing.period, url: filing.url };
}

function toRead(filing: EdgarFiling, list: RiskList): RiskRead {
  return { filing: refOf(filing), found: list.found, headings: list.headings, intro: list.intro };
}

/**
 * The comparisons one stock needs this run: its newest filing against what it should be read with, and, when the
 * newest is a 10-Q and the latest 10-K has no comparison stored yet, that 10-K against the one before it (so the stock
 * page has the year's changes from the first run on).
 */
export async function compareStock(list: FilingList, stored: FilingChangesDoc | null, read: (filing: EdgarFiling) => Promise<RiskRead>): Promise<Comparison[]> {
  const filings = list.filings;
  const newest = filings[0];
  if (!newest) return [];
  const annuals = filings.filter((filing) => filing.form === "10-K");
  const out: Comparison[] = [];
  const annualAgainstPrior = async (annual: EdgarFiling): Promise<Comparison> => {
    const prior = annuals.find((filing) => filing.filed < annual.filed || (filing.filed === annual.filed && filing.accession < annual.accession));
    return compareFull(await read(annual), prior ? await read(prior) : null);
  };
  if (newest.form === "10-K") {
    out.push(await annualAgainstPrior(newest));
    return out;
  }
  const quarter = await read(newest);
  const annual = annuals.find((filing) => filing.filed <= newest.filed) ?? null;
  const previous = filings[1] ?? null;
  // A 10-Q that lists nothing needs no other document: its 10-K is named, not read.
  const needsAnnual = quarter.found === true && quarter.headings.length > 0;
  const annualRead = annual ? (needsAnnual ? await read(annual) : unread(refOf(annual))) : null;
  const whole = annualRead?.found === true && quarter.headings.length >= Math.max(MIN_HEADINGS_10K, FULL_SHARE * annualRead.headings.length);
  let previousRead: RiskRead | null = null;
  if (previous && annual && previous.accession === annual.accession) previousRead = annualRead;
  else if (previous && whole) {
    // Only a 10-Q that repeats the whole list is read against the filing just before it.
    previousRead = await read(previous);
  }
  // A 10-Q that lists only some risks: the other 10-Qs since the same 10-K, so a risk one of them already added is
  // said as repeated, not as new again (at most two: a fiscal year has three).
  const earlier: RiskRead[] = [];
  if (needsAnnual && !whole && annual) {
    for (const filing of filings.filter((entry) => entry.form === "10-Q" && entry.accession !== newest.accession && entry.filed > annual.filed && entry.filed <= newest.filed).slice(0, 2)) {
      earlier.push(await read(filing));
    }
  }
  out.push(compareQuarter(quarter, annualRead, previousRead, earlier));
  if (annual && !hasAnnualComparison(stored, annual.accession)) out.push(await annualAgainstPrior(annual));
  return out;
}

function emptySummary(dryRun: boolean): JobSummary {
  return {
    dryRun,
    tickers: 0,
    tracked: 0,
    unchanged: 0,
    noFilings: 0,
    compared: { changes: 0, no_changes: 0, none_listed: 0, unreadable: 0 },
    withAdded: 0,
    written: 0,
    writeFailures: 0,
    failed: 0,
    skippedForTime: 0,
    seconds: 0,
  };
}

/** "AMD 10-Q 2026-11-04 changes/full +0 −0 ~2 against 10-Q 2026-08-05": one stock in the log. Tickers only. */
export function stockLine(ticker: string, comparison: Comparison): string {
  const base = comparison.base ? ` against ${comparison.base.form} ${comparison.base.filed}` : "";
  const why = comparison.reason ? ` (${comparison.reason})` : "";
  return `${ticker} ${comparison.filing.form} ${comparison.filing.filed} ${comparison.status}${comparison.scope ? `/${comparison.scope}` : ""} +${comparison.added.length} −${comparison.dropped.length} ~${comparison.reworded.length} =${comparison.same}${base}${why}`;
}

export async function runFilingChanges(deps: JobDeps, options: JobOptions = {}): Promise<JobSummary> {
  const started = deps.clock();
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const summary = emptySummary(dryRun);
  const log = options.log ?? (() => undefined);

  let tickers: string[];
  if (options.only && options.only.length > 0) {
    tickers = [...new Set(options.only.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  } else {
    const listed = await deps.tickers();
    tickers = listed.tickers;
    summary.tracked = listed.tracked;
  }
  if (options.limit && options.limit > 0) tickers = tickers.slice(0, options.limit);
  summary.tickers = tickers.length;
  const stored = await deps.readStored(tickers);

  const reads = new Map<string, Promise<RiskRead>>();
  const read = (filing: EdgarFiling): Promise<RiskRead> => {
    let pending = reads.get(filing.accession);
    if (!pending) {
      pending = deps.riskList(filing).then((list) => toRead(filing, list));
      reads.set(filing.accession, pending);
    }
    return pending;
  };

  let next = 0;
  const worker = async () => {
    while (next < tickers.length) {
      const ticker = tickers[next++]!;
      if (deps.clock() - started > budgetMs) {
        summary.skippedForTime += 1;
        continue;
      }
      try {
        const list = await deps.listFilings(ticker);
        const newest = list?.filings[0];
        if (!list || !newest) {
          summary.noFilings += 1;
          continue;
        }
        const previous = stored.get(ticker) ?? null;
        if (previous && previous.latest.filing.accession === newest.accession && options.force !== true) {
          summary.unchanged += 1;
          continue;
        }
        // Forced, the 10-K's own comparison is worked out again too.
        const comparisons = await compareStock(list, options.force === true ? null : previous, read);
        for (const comparison of comparisons) {
          summary.compared[comparison.status] += 1;
          if (comparison.status === "changes" && comparison.added.length > 0) summary.withAdded += 1;
          log(stockLine(ticker, comparison));
        }
        const doc = nextDoc(previous, { ticker, company: list.company, cik: list.cik, comparisons, now });
        if (!doc || dryRun) continue;
        try {
          await deps.write(ticker, doc);
          summary.written += 1;
        } catch {
          summary.writeFailures += 1;
        }
      } catch (error) {
        summary.failed += 1;
        log(`${ticker} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      // A filing read once is not needed by the next stock: let it go.
      if (reads.size > 200) reads.clear();
    }
  };
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, tickers.length)) }, worker));
  summary.seconds = Math.round((deps.clock() - started) / 1000);
  return summary;
}

/** Whether the run should show red on the timer. Time running out is not a failure: the next run carries on. */
export function runFailed(summary: JobSummary): boolean {
  return summary.writeFailures > 0 || (summary.failed > 0 && summary.failed * 4 >= Math.max(1, summary.tickers - summary.skippedForTime));
}

/** The one summary line: counts only. */
export function summaryLine(summary: JobSummary): string {
  const c = summary.compared;
  return [
    `${summary.dryRun ? "dry run, nothing written: " : ""}${summary.tickers} stocks (${summary.tracked} tracked first)`,
    `${summary.unchanged} unchanged, ${summary.noFilings} without filings`,
    `compared ${c.changes} with changes (${summary.withAdded} added risks), ${c.no_changes} no changes, ${c.none_listed} none listed, ${c.unreadable} unreadable`,
    `${summary.written} written, ${summary.writeFailures} writes failed, ${summary.failed} failed, ${summary.skippedForTime} skipped for time`,
    `${summary.seconds}s`,
  ].join("; ");
}
