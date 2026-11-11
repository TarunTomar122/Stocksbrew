import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase-admin";
import { coverageAfterTrackChange, effectiveCovered, type CoverageWrite } from "@/lib/entitlements-coverage";
import { mergeChanges, mergeHolding, MERGE_MODES, type MergeMode } from "@/lib/import/merge";
import { LIMITS } from "@/lib/import/normalize";
import { resolveIsSubscribed } from "@/lib/watchlist";

/**
 * Saving an import: every reviewed row becomes a holding on the person's own
 * user doc, next to whatever they already track. Nothing is ever removed, and
 * a stock they already had keeps its numbers unless they chose otherwise in
 * the review (lib/import/merge.ts).
 *
 * The doc shape is the one the batch route and lib/radar-mutations.ts write
 * (tracked_stocks, watchlist_positions, watchlist_holdings, coverage fields,
 * watchlist_version). LocalDB's merge replaces top-level maps instead of
 * deep-merging them, so the whole maps are read and written back inside one
 * transaction: a sibling holding is never dropped.
 */

export type SaveRow = {
  instrument_id: string;
  shares: number | null;
  average_cost: number | null;
  /** Only kept when there are no shares: the value the screenshot showed. */
  market_value: number | null;
  /** For a stock already held. Anything but an explicit choice is "keep". */
  merge: MergeMode;
};

export type SaveSource = "screenshot" | "manual";

const INSTRUMENT_ID_RE = /^US_[A-Z0-9_]{1,12}$/;
export const MAX_SAVE_ROWS = 100;

function finiteIn(value: unknown, max: number): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return "invalid";
  return n === 0 ? null : n;
}

/** The request body's rows, cleaned. Null when anything is malformed (the whole save is refused). */
export function cleanSaveRows(raw: unknown): SaveRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SAVE_ROWS) return null;
  const byId = new Map<string, SaveRow>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const id = typeof row.instrument_id === "string" ? row.instrument_id.trim().toUpperCase() : "";
    if (!INSTRUMENT_ID_RE.test(id)) return null;
    const shares = finiteIn(row.shares, LIMITS.shares);
    const cost = finiteIn(row.average_cost, LIMITS.price);
    const value = finiteIn(row.market_value, LIMITS.value);
    if (shares === "invalid" || cost === "invalid" || value === "invalid") return null;
    // The last row for a stock wins; the review table never sends two.
    const merge = MERGE_MODES.includes(row.merge as MergeMode) ? (row.merge as MergeMode) : "keep";
    byId.set(id, { instrument_id: id, shares, average_cost: cost, market_value: shares === null ? value : null, merge });
  }
  return [...byId.values()];
}

type Holding = Record<string, unknown>;

export type ImportMerge = {
  write: Record<string, unknown>;
  added: string[];
  /** Already tracked, and the save changed its numbers or made it a holding. */
  updated: string[];
  /** Already held, and left exactly as it was. */
  kept: string[];
  covered: string[];
  /** How many stocks the person tracks after the save. */
  tracked: number;
  version: number;
};

function asMap<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, T>) } : {};
}

/**
 * The write for an import, from the doc as read inside the transaction. Pure.
 * Stocks already tracked keep their place and become holdings. Their saved
 * shares and cost change only when the row says "replace" or "add"; a blank in
 * the import never wipes a number already saved.
 */
export function mergeImport(userData: Record<string, unknown>, rows: SaveRow[], source: SaveSource, now: Date): ImportMerge {
  const at = now.toISOString();
  const tracked = Array.isArray(userData.tracked_stocks) ? (userData.tracked_stocks as unknown[]).filter((id): id is string => typeof id === "string") : [];
  const trackedSet = new Set(tracked);
  const positions = asMap<string>(userData.watchlist_positions);
  const holdings = asMap<Holding>(userData.watchlist_holdings);
  const added: string[] = [];
  const updated: string[] = [];
  const kept: string[] = [];
  for (const row of rows) {
    const isNew = !trackedSet.has(row.instrument_id);
    if (isNew) {
      added.push(row.instrument_id);
      trackedSet.add(row.instrument_id);
    }
    const wasHolding = positions[row.instrument_id] === "holding";
    const before = holdings[row.instrument_id] && typeof holdings[row.instrument_id] === "object" ? holdings[row.instrument_id]! : null;
    // A watched stock has no numbers of its own yet, so the import fills them in whatever the mode.
    const numbers = mergeHolding(wasHolding ? before : null, row, wasHolding ? row.merge : "replace");
    if (!isNew && wasHolding && !mergeChanges(before, numbers)) {
      kept.push(row.instrument_id);
      continue;
    }
    if (!isNew) updated.push(row.instrument_id);
    positions[row.instrument_id] = "holding";
    holdings[row.instrument_id] = {
      ...(before ?? {}),
      ...numbers,
      currency: typeof before?.currency === "string" && before.currency ? before.currency : "USD",
      source,
      updated_at: at,
    };
  }
  const nextTracked = [...tracked, ...added];
  const isPro = resolveIsSubscribed(userData as Parameters<typeof resolveIsSubscribed>[0]);
  const coverage: CoverageWrite | null = added.length > 0 ? coverageAfterTrackChange(userData, isPro, nextTracked, now) : null;
  const covered = isPro ? nextTracked : coverage?.covered_stocks ?? effectiveCovered(userData, false);
  const version = Number(userData.watchlist_version ?? 0) + 1;
  return {
    write: {
      ...(coverage ?? {}),
      tracked_stocks: nextTracked,
      watchlist_positions: positions,
      watchlist_holdings: holdings,
      watchlist_updated_at: at,
      watchlist_version: version,
      ...(added.length > 0 ? { last_tracked_at: at } : {}),
    },
    added,
    updated,
    kept,
    covered,
    tracked: nextTracked.length,
    version,
  };
}

export type SaveResult =
  | { ok: true; added: string[]; updated: string[]; kept: string[]; covered: string[]; tracked: number; version: number; replay: boolean }
  | { ok: false; code: "profile_not_ready" };

/**
 * Run the merge in a transaction. `mutationId` makes a retried save (a double
 * click, a flaky network) a no-op the second time.
 */
export async function saveImport(input: { uid: string; rows: SaveRow[]; source: SaveSource; mutationId: string; now?: Date }): Promise<SaveResult> {
  const now = input.now ?? new Date();
  const userRef = adminFirestore.collection("users").doc(input.uid);
  const eventRef = userRef.collection("watchlist_events").doc(input.mutationId);
  return adminFirestore.runTransaction(async (tx): Promise<SaveResult> => {
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(eventRef)]);
    if (!userSnap.exists) return { ok: false, code: "profile_not_ready" };
    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
    if (eventSnap.exists) {
      const event = (eventSnap.data() ?? {}) as Record<string, unknown>;
      const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
      const tracked = Array.isArray(userData.tracked_stocks) ? userData.tracked_stocks.length : 0;
      return { ok: true, added: ids(event.added), updated: ids(event.updated), kept: ids(event.kept), covered: [], tracked, version: Number(event.version ?? 0), replay: true };
    }
    const merge = mergeImport(userData, input.rows, input.source, now);
    tx.set(userRef, merge.write, { merge: true });
    for (const id of merge.added) {
      tx.set(
        adminFirestore.collection("tm_tracked_instruments").doc(id),
        { instrument_id: id, market: "US", tracked_count: FieldValue.increment(1), updated_at: now.toISOString() },
        { merge: true },
      );
    }
    tx.set(eventRef, {
      kind: "IMPORT_HOLDINGS",
      version: merge.version,
      created_at: now.toISOString(),
      source: input.source,
      added: merge.added,
      updated: merge.updated,
      kept: merge.kept,
      added_count: merge.added.length,
      updated_count: merge.updated.length,
    });
    return { ok: true, added: merge.added, updated: merge.updated, kept: merge.kept, covered: merge.covered, tracked: merge.tracked, version: merge.version, replay: false };
  });
}
