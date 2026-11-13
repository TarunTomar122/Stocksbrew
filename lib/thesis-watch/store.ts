import type { ThesisKind } from "@/lib/thesis";

import { readConditionRecords, type ConditionRecord } from "./conditions";
import type { ReasonCheck, Signal, SignalLevel, Verdict } from "./rules";

/**
 * Each person's latest check per stock, with the changes before it:
 * `tm_thesis_checks/{uid}__{instrument_id}`. Only the web app writes here,
 * and only the signed-in person's own documents: the user doc is never
 * touched and nothing is deleted. A document is rewritten when the day, the
 * verdict, the signals, the figures or the reason change; the history keeps the last
 * HISTORY_MAX changes of verdict or signals, so a quiet day is recorded in
 * `day` without filling the history.
 */

export const CHECKS_COLLECTION = "tm_thesis_checks";
export const HISTORY_MAX = 20;
export const CHECK_VERSION = 1;

export function checkDocId(uid: string, instrumentId: string): string {
  return `${uid}__${instrumentId}`;
}

export type CheckHistoryRow = { day: string; verdict: Verdict; signals: string[] };

export type StoredCheck = {
  version: number;
  uid: string;
  instrumentId: string;
  ticker: string;
  kind: ThesisKind | null;
  /** The reason's own `updated_at`: a changed reason is a new check. */
  reasonUpdatedAt: string;
  verdict: Verdict;
  headline: string;
  /** The note shown to the person: the rules' words, or a model's rewording of them that passed the numbers check. */
  note: string;
  wordedBy: "rules" | "model";
  /** The rules' own note for these findings and figures: a stored note is reused only while this is unchanged. */
  draft: string;
  /** Whether a model was already asked to reword this draft (so a rules note is not sent again and again). */
  wordTried: boolean;
  signals: Signal[];
  checked: Signal[];
  quote: string | null;
  limit: string | null;
  asOf: string;
  /** New York day of the latest check. */
  day: string;
  checkedAt: string;
  history: CheckHistoryRow[];
  /** The reason's measurable conditions as last checked, one record each (additive; absent on older documents). */
  conditions: ConditionRecord[];
};

const VERDICTS = new Set<Verdict>(["holds", "weaker", "broken", "played_out"]);
const LEVELS = new Set<SignalLevel>(["soft", "hard", "done", "info"]);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

function readSignals(value: unknown): Signal[] {
  if (!Array.isArray(value)) return [];
  const out: Signal[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!str(row.id) || !str(row.text) || !LEVELS.has(row.level as SignalLevel)) continue;
    const data: Signal["data"] = {};
    if (row.data && typeof row.data === "object") {
      for (const [key, item] of Object.entries(row.data as Record<string, unknown>)) {
        if (typeof item === "string" || item === null || (typeof item === "number" && Number.isFinite(item))) data[key] = item as string | number | null;
      }
    }
    out.push({ id: str(row.id), level: row.level as SignalLevel, text: str(row.text), source: str(row.source), asOf: str(row.asOf), href: str(row.href) || null, data });
  }
  return out;
}

/** A stored check, or null when the document is missing, malformed or from another version. */
export function readStoredCheck(data: unknown): StoredCheck | null {
  if (!data || typeof data !== "object") return null;
  const doc = data as Record<string, unknown>;
  if (doc.version !== CHECK_VERSION || !VERDICTS.has(doc.verdict as Verdict) || !str(doc.instrument_id) || !str(doc.day)) return null;
  const history: CheckHistoryRow[] = Array.isArray(doc.history)
    ? (doc.history as unknown[])
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .filter((row) => VERDICTS.has(row.verdict as Verdict) && str(row.day))
        .map((row) => ({ day: str(row.day), verdict: row.verdict as Verdict, signals: Array.isArray(row.signals) ? row.signals.filter((id): id is string => typeof id === "string") : [] }))
    : [];
  return {
    version: CHECK_VERSION,
    uid: str(doc.uid),
    instrumentId: str(doc.instrument_id),
    ticker: str(doc.ticker),
    kind: (str(doc.kind) || null) as ThesisKind | null,
    reasonUpdatedAt: str(doc.reason_updated_at),
    verdict: doc.verdict as Verdict,
    headline: str(doc.headline),
    note: str(doc.note),
    wordedBy: doc.worded_by === "model" ? "model" : "rules",
    draft: str(doc.draft),
    wordTried: doc.word_tried === true,
    signals: readSignals(doc.signals),
    checked: readSignals(doc.checked),
    quote: str(doc.quote) || null,
    limit: str(doc.limit) || null,
    asOf: str(doc.as_of),
    day: str(doc.day),
    checkedAt: str(doc.checked_at),
    history,
    conditions: readConditionRecords(doc.conditions),
  };
}

function signalIds(signals: readonly Pick<Signal, "id">[]): string[] {
  return signals.map((signal) => signal.id).sort();
}

/** Whether a new check says the same thing as the stored one: same reason, verdict and signals. */
export function sameFindings(stored: StoredCheck | null, check: ReasonCheck, reasonUpdatedAt: string): boolean {
  if (!stored) return false;
  return stored.reasonUpdatedAt === reasonUpdatedAt && stored.verdict === check.verdict && signalIds(stored.signals).join(",") === signalIds(check.signals).join(",");
}

/**
 * The document to store after a check, or null when the stored one already
 * says it for today. `note` and `wordedBy` are the wording to keep.
 */
export function nextStoredCheck(
  stored: StoredCheck | null,
  input: {
    uid: string;
    check: ReasonCheck;
    reasonUpdatedAt: string;
    note: string;
    wordedBy: "rules" | "model";
    draft: string;
    wordTried: boolean;
    day: string;
    now: Date;
    /** The conditions' records after tonight's check; left out, the stored ones are kept. */
    conditions?: ConditionRecord[];
  },
): StoredCheck | null {
  const { check } = input;
  const conditions = input.conditions ?? stored?.conditions ?? [];
  const sameConditions = stableJson(conditions) === stableJson(stored?.conditions ?? []);
  const same = sameFindings(stored, check, input.reasonUpdatedAt);
  if (same && sameConditions && stored!.day === input.day && stored!.draft === input.draft && stored!.note === input.note && stored!.wordTried === input.wordTried) return null;
  const row: CheckHistoryRow = { day: input.day, verdict: check.verdict, signals: signalIds(check.signals) };
  // A changed reason is a new reason: the old one's verdicts are not its history.
  const history = stored && stored.reasonUpdatedAt === input.reasonUpdatedAt ? [...stored.history] : [];
  const last = history.at(-1);
  const changed = !last || last.verdict !== row.verdict || last.signals.join(",") !== row.signals.join(",");
  if (changed) history.push(row);
  return {
    version: CHECK_VERSION,
    uid: input.uid,
    instrumentId: check.instrumentId,
    ticker: check.ticker,
    kind: check.kind,
    reasonUpdatedAt: input.reasonUpdatedAt,
    verdict: check.verdict,
    headline: check.headline,
    note: input.note,
    wordedBy: input.wordedBy,
    draft: input.draft,
    wordTried: input.wordTried,
    signals: check.signals,
    checked: check.checked,
    quote: check.quote,
    limit: check.limit,
    asOf: check.asOf,
    day: input.day,
    checkedAt: input.now.toISOString(),
    history: history.slice(-HISTORY_MAX),
    conditions,
  };
}

/** JSON with object keys sorted, so a record read back compares equal to the same record built tonight. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : item,
  );
}

/** The shape written to the store: snake case at the top, plain JSON throughout. */
export function toDoc(check: StoredCheck): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({
      version: check.version,
      uid: check.uid,
      instrument_id: check.instrumentId,
      ticker: check.ticker,
      kind: check.kind,
      reason_updated_at: check.reasonUpdatedAt,
      verdict: check.verdict,
      headline: check.headline,
      note: check.note,
      worded_by: check.wordedBy,
      draft: check.draft,
      word_tried: check.wordTried,
      signals: check.signals,
      checked: check.checked,
      quote: check.quote,
      limit: check.limit,
      as_of: check.asOf,
      day: check.day,
      checked_at: check.checkedAt,
      history: check.history,
      conditions: check.conditions,
    }),
  ) as Record<string, unknown>;
}

/** The verdict before the latest change, and the day it changed, from the history. */
export function lastChange(history: readonly CheckHistoryRow[]): { from: Verdict; day: string } | null {
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i]!.verdict !== history[i - 1]!.verdict) return { from: history[i - 1]!.verdict, day: history[i]!.day };
  }
  return null;
}
