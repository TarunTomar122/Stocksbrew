import { adminFirestore } from "@/lib/firebase-admin";
import { readTheses } from "@/lib/thesis";
import { conditionKey, type ConditionRecord } from "@/lib/thesis-watch/conditions";
import { CHECKS_COLLECTION, checkDocId, readStoredCheck } from "@/lib/thesis-watch/store";
import { getUserDoc } from "@/lib/watchlist";

import { listTheses } from "./data";
import { reasonsStrip, thesisStrip, type StripThesis, type ThesisStripData } from "./strip";

/**
 * The thesis strip's data for one signed-in person (lib/thesis-monitor/strip.ts), from what the nightly checks stored:
 * the person's theses and their latest checks (one query and one batch read), else their measurable reasons' stored
 * checks (one batch read; the user doc is the request's cached one). Never runs a check, never writes, never throws:
 * a slow or failed read leaves the strip out.
 */

/** "US_BRK_B" → "BRK.B" (as lib/thesis-watch/data.ts tickerFromId, without that module's reads). */
const tickerFromId = (instrumentId: string) => instrumentId.split("_").slice(1).join(".");

/** How long a page waits for the strip before going on without it. */
export const STRIP_MS = 1200;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/** Each company's next report day from the cached earnings calendar; a slow read leaves it out. */
async function calendarReports(tickers: readonly string[]): Promise<Record<string, string>> {
  const { getNextEarningsCalendarEventCached } = await import("@/lib/earnings");
  const rows = await Promise.all(
    tickers.map((ticker) =>
      getNextEarningsCalendarEventCached("US", ticker)
        .then((event) => [ticker, event?.event_date ?? null] as const)
        .catch(() => [ticker, null] as const),
    ),
  );
  return Object.fromEntries(rows.filter((row): row is readonly [string, string] => typeof row[1] === "string"));
}

export type StripOptions = {
  today: string;
  /** Report days the page already has (the briefing's positions): no calendar read for those. */
  reports?: Readonly<Record<string, string>>;
  ms?: number;
};

/** What the strip is made from, read from the store: the checked theses, else the measurable reasons' records. */
export type StripSource =
  | { kind: "thesis"; list: StripThesis[] }
  | { kind: "reasons"; records: Array<{ ticker: string; records: ConditionRecord[] }> };

/**
 * The strip's reads, started as early as the page likes: the theses and their checks; without a checked thesis, the
 * reasons' stored checks. Null when there is nothing to show. Rejects on a failed read (the caller bounds and catches).
 */
export async function readStripSource(uid: string): Promise<StripSource | null> {
  const theses = await listTheses(uid);
  const list: StripThesis[] = theses
    .filter((entry) => entry.basket.thesis)
    .map(({ basket, state }) => ({ id: basket.id, name: basket.name, enabled: basket.enabled, tickers: (basket.thesis?.lines ?? []).map((line) => line.ticker), state }));
  // Any thesis with a judged check wins (thesisStrip picks among them); the reasons are read only without one.
  if (list.some((entry) => entry.state && entry.state.status !== "waiting")) return { kind: "thesis", list };
  const doc = await getUserDoc(uid);
  if (!doc) return null;
  const tracked = new Set(Array.isArray(doc.tracked_stocks) ? doc.tracked_stocks : []);
  const reasons = Object.entries(readTheses((doc as unknown as Record<string, unknown>).theses)).filter(([id, thesis]) => tracked.has(id) && id.startsWith("US_") && (thesis.conditions ?? []).length > 0);
  if (reasons.length === 0) return null;
  const snaps = await adminFirestore.getAll(...reasons.map(([id]) => adminFirestore.collection(CHECKS_COLLECTION).doc(checkDocId(uid, id))));
  const records = snaps.flatMap((snap, index) => {
    const stored = snap.exists ? readStoredCheck(snap.data()) : null;
    if (!stored || stored.uid !== uid) return [];
    // Only the conditions the reason still has: an edited line's old record is not a line any more.
    const keys = new Set((reasons[index]![1].conditions ?? []).map((condition) => conditionKey(condition)));
    const kept = stored.conditions.filter((record) => keys.has(record.key));
    return kept.length > 0 ? [{ ticker: tickerFromId(reasons[index]![0]), records: kept }] : [];
  });
  return records.length > 0 ? { kind: "reasons", records } : null;
}

/** The strip from what was read, with each company's next report (the page's own days, else the cached calendar). */
export async function stripFrom(source: StripSource | null, options: StripOptions): Promise<ThesisStripData | null> {
  if (!source) return null;
  if (source.kind === "thesis") {
    const reports = await reportsFor([...new Set(source.list.flatMap((entry) => entry.tickers))], options);
    return thesisStrip(source.list, reports, options.today);
  }
  const reports = await reportsFor(source.records.map((entry) => entry.ticker), options);
  return reasonsStrip(source.records, reports, options.today);
}

async function reportsFor(tickers: readonly string[], options: StripOptions): Promise<Record<string, string>> {
  const known = options.reports ?? {};
  const have: Record<string, string> = Object.fromEntries(tickers.flatMap((ticker) => (known[ticker] && known[ticker]! >= options.today ? [[ticker, known[ticker]!] as const] : [])));
  // The page's own report days, and the cached calendar for the companies it has none for, so the earliest report is
  // never missed because the page only knew a later one.
  const missing = tickers.filter((ticker) => !have[ticker]);
  if (missing.length === 0) return have;
  return { ...((await within(calendarReports(missing), 800)) ?? {}), ...have };
}

export async function loadThesisStrip(uid: string, options: StripOptions): Promise<ThesisStripData | null> {
  return within(readStripSource(uid).then((source) => stripFrom(source, options)), options.ms ?? STRIP_MS);
}

export { within as withinStrip };
