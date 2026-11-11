import { FREE_COVERED_STOCKS, FREE_COVER_SWAPS_PER_WEEK } from "@/lib/entitlements";

/**
 * Which tracked stocks the agent covers in full, and how a Free account may
 * change that. Pure, so the API routes, the add/remove transactions and the
 * tests all run the same rules.
 *
 * Tracking is unlimited. Coverage is the number that matters: Free covers
 * five, Pro covers everything tracked. Without a limit on changes someone
 * could cover, read the zones, uncover and repeat across the market, so on
 * Free:
 *   - the first five stocks ever covered are free fills (that is day one);
 *   - after that, covering a new stock is a swap, and there is one a week;
 *   - re-covering a stock first covered in the last seven days is free
 *     (undoing a mistake reveals nothing new) and does not restart its week;
 *   - uncovering is always free and never waits.
 *
 * Stored on the user's own doc, all additive fields:
 *   covered_stocks      instrument ids, in the order they were covered
 *   covered_fills_used  how many of the five free fills are spent
 *   covered_adds_log    [{ id, at, kind }] for the last seven days
 *   covered_held        stocks this account covered before its limit shrank
 *                       (PAYWALL_V2 cut Free from five to three, or Pro
 *                       ended): each can be picked back once without a fill
 *                       or the weekly swap, so nobody is stuck with the
 *                       first three by stored order. Until the first write
 *                       it is read from covered_stocks past the limit.
 */

export const COVERED_FIELD = "covered_stocks";
export const COVER_FILLS_FIELD = "covered_fills_used";
export const COVER_LOG_FIELD = "covered_adds_log";
export const COVER_HELD_FIELD = "covered_held";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type CoverLogEntry = { id: string; at: string; kind: "fill" | "swap" };

export type CoverageDoc = {
  tracked_stocks?: unknown;
  covered_stocks?: unknown;
  covered_fills_used?: unknown;
  covered_adds_log?: unknown;
  covered_held?: unknown;
};

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) if (typeof item === "string" && item && !out.includes(item)) out.push(item);
  return out;
}

/** Log entries from the last seven days, oldest first. Anything malformed is dropped. */
export function recentCoverLog(value: unknown, now: Date): CoverLogEntry[] {
  if (!Array.isArray(value)) return [];
  const cutoff = now.getTime() - WEEK_MS;
  return value
    .filter((item): item is CoverLogEntry => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Partial<CoverLogEntry>;
      const at = Date.parse(String(entry.at ?? ""));
      return typeof entry.id === "string" && Number.isFinite(at) && at > cutoff && (entry.kind === "fill" || entry.kind === "swap");
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Whether the account has made an explicit coverage choice (or had one materialised for it). */
export function hasExplicitCoverage(doc: CoverageDoc | null | undefined): boolean {
  return Array.isArray(doc?.covered_stocks);
}

/**
 * The covered stocks. Pro: everything tracked. Free: the explicit choice
 * (only ids still tracked, at most five), or, before any choice exists, the
 * first five tracked stocks so nobody starts with nothing covered.
 */
export function effectiveCovered(doc: CoverageDoc | null | undefined, isPro: boolean): string[] {
  const tracked = strings(doc?.tracked_stocks);
  if (isPro) return tracked;
  if (hasExplicitCoverage(doc)) {
    return strings(doc?.covered_stocks).filter((id) => tracked.includes(id)).slice(0, FREE_COVERED_STOCKS);
  }
  return tracked.slice(0, FREE_COVERED_STOCKS);
}

/**
 * Stocks the account chose before its Free limit shrank and can pick back
 * free, once each: the stored `covered_held`, or before that is written, the
 * explicit choice past the limit. Only ids still tracked and not covered now.
 */
export function heldPicks(doc: CoverageDoc | null | undefined): string[] {
  const tracked = strings(doc?.tracked_stocks);
  const covered = effectiveCovered(doc, false);
  const stored = Array.isArray(doc?.covered_held) ? strings(doc?.covered_held) : strings(doc?.covered_stocks).slice(FREE_COVERED_STOCKS);
  return stored.filter((id, index, list) => tracked.includes(id) && !covered.includes(id) && list.indexOf(id) === index);
}

/** Free fills already spent. Before an explicit choice, the default covered stocks count as spent. */
export function fillsUsed(doc: CoverageDoc | null | undefined): number {
  const raw = doc?.covered_fills_used;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.min(FREE_COVERED_STOCKS, Math.floor(raw));
  if (hasExplicitCoverage(doc)) return Math.min(FREE_COVERED_STOCKS, strings(doc?.covered_stocks).length);
  return Math.min(FREE_COVERED_STOCKS, strings(doc?.tracked_stocks).length);
}

export type CoverageState = {
  covered: string[];
  /** Earlier picks past today's limit that can be covered again without a swap (heldPicks). Empty on Pro. */
  held: string[];
  /** Infinity on Pro. */
  limit: number;
  slotsLeft: number;
  /** Free fills left: new stocks that can be covered without spending the weekly swap. */
  fillsLeft: number;
  /** Whether a swap (covering a new stock once the fills are spent) is available now. */
  swapAvailable: boolean;
  /** When the next swap opens, if it is used up. */
  nextSwapAt: string | null;
};

export function coverageState(doc: CoverageDoc | null | undefined, isPro: boolean, now: Date = new Date()): CoverageState {
  const covered = effectiveCovered(doc, isPro);
  if (isPro) {
    return { covered, held: [], limit: Number.POSITIVE_INFINITY, slotsLeft: Number.POSITIVE_INFINITY, fillsLeft: Number.POSITIVE_INFINITY, swapAvailable: true, nextSwapAt: null };
  }
  const swaps = recentCoverLog(doc?.covered_adds_log, now).filter((entry) => entry.kind === "swap");
  const swapAvailable = swaps.length < FREE_COVER_SWAPS_PER_WEEK;
  const blocking = swaps[swaps.length - FREE_COVER_SWAPS_PER_WEEK];
  return {
    covered,
    held: heldPicks(doc),
    limit: FREE_COVERED_STOCKS,
    slotsLeft: Math.max(0, FREE_COVERED_STOCKS - covered.length),
    fillsLeft: Math.max(0, FREE_COVERED_STOCKS - fillsUsed(doc)),
    swapAvailable,
    nextSwapAt: swapAvailable || !blocking ? null : new Date(Date.parse(blocking.at) + WEEK_MS).toISOString(),
  };
}

/** What gets merged into the user doc. Every field is ours and additive. */
export type CoverageWrite = {
  covered_stocks: string[];
  covered_fills_used: number;
  covered_adds_log: CoverLogEntry[];
  covered_held: string[];
};

export type CoverageError = {
  ok: false;
  code: "not_tracked" | "over_limit" | "swap_used";
  message: string;
  nextAt: string | null;
};

export type CoverageChange = { ok: true; covered: string[]; added: string[]; removed: string[]; write: CoverageWrite } | CoverageError;

function swapDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Set the covered stocks to `requested`. On Pro the choice is stored (it is
 * what Free keeps if Pro ends) and nothing is limited. On Free the rules in
 * the header apply; nothing is written when one fails.
 */
export function planCoverage(
  doc: CoverageDoc | null | undefined,
  isPro: boolean,
  requested: readonly string[],
  now: Date = new Date(),
): CoverageChange {
  const tracked = strings(doc?.tracked_stocks);
  const next = strings(requested);
  const untracked = next.filter((id) => !tracked.includes(id));
  if (untracked.length > 0) {
    return { ok: false, code: "not_tracked", message: "Add a stock to your portfolio before covering it.", nextAt: null };
  }
  const before = effectiveCovered(doc, false);
  const added = next.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !next.includes(id));
  const log = recentCoverLog(doc?.covered_adds_log, now);
  let fills = fillsUsed(doc);

  if (isPro) {
    return {
      ok: true,
      covered: next,
      added,
      removed,
      // What Free could pick back if Pro ends: the choice past the Free limit.
      write: { covered_stocks: next, covered_fills_used: fills, covered_adds_log: log, covered_held: next.slice(FREE_COVERED_STOCKS) },
    };
  }

  if (next.length > FREE_COVERED_STOCKS) {
    return {
      ok: false,
      code: "over_limit",
      message: `Free covers ${FREE_COVERED_STOCKS} stocks. Uncover one to make room, or go Pro and cover everything you track.`,
      nextAt: null,
    };
  }

  const recentIds = new Set(log.map((entry) => entry.id));
  const held = heldPicks(doc);
  const nowIso = now.toISOString();
  let swapsLeft = FREE_COVER_SWAPS_PER_WEEK - log.filter((entry) => entry.kind === "swap").length;
  const entries: CoverLogEntry[] = [];
  for (const id of added) {
    if (recentIds.has(id)) {
      // Seen this week already. Not logged again, so the week still runs from the first cover.
      continue;
    } else if (held.includes(id)) {
      // Chosen before the limit shrank: picking it back reveals nothing new, so it costs neither a fill nor the swap.
      continue;
    } else if (fills < FREE_COVERED_STOCKS) {
      fills += 1;
      entries.push({ id, at: nowIso, kind: "fill" });
    } else if (swapsLeft > 0) {
      swapsLeft -= 1;
      entries.push({ id, at: nowIso, kind: "swap" });
    } else {
      const state = coverageState(doc, false, now);
      const nextAt = state.nextSwapAt;
      return {
        ok: false,
        code: "swap_used",
        message: nextAt
          ? `Free swaps one covered stock a week. Your next swap opens ${swapDay(nextAt)}. Uncovering is free any time, and Pro covers everything.`
          : "Free swaps one covered stock at a time. Cover one now and the next one after a week, or go Pro and cover everything.",
        nextAt,
      };
    }
  }

  return {
    ok: true,
    covered: next,
    added,
    removed,
    write: { covered_stocks: next, covered_fills_used: fills, covered_adds_log: [...log, ...entries], covered_held: held.filter((id) => !next.includes(id)) },
  };
}

/**
 * Keep coverage consistent when the tracked list changes (add, remove, or a
 * batch save). Stocks no longer tracked drop out of coverage. Newly tracked
 * stocks fill empty slots while free fills or a recent cover allow it; this
 * never spends the weekly swap, so tracking more never costs anything.
 * Returns null on Pro: coverage is everything and nothing needs storing.
 */
export function coverageAfterTrackChange(
  doc: CoverageDoc | null | undefined,
  isPro: boolean,
  nextTracked: readonly string[],
  now: Date = new Date(),
): CoverageWrite | null {
  if (isPro) return null;
  const nextIds = strings(nextTracked);
  const previousTracked = strings(doc?.tracked_stocks);
  const covered = effectiveCovered(doc, false).filter((id) => nextIds.includes(id));
  const log = recentCoverLog(doc?.covered_adds_log, now);
  const recentIds = new Set(log.map((entry) => entry.id));
  let fills = fillsUsed(doc);
  const nowIso = now.toISOString();
  const entries: CoverLogEntry[] = [];
  for (const id of nextIds) {
    if (covered.length >= FREE_COVERED_STOCKS) break;
    if (previousTracked.includes(id) || covered.includes(id)) continue;
    if (recentIds.has(id)) {
      covered.push(id);
    } else if (fills < FREE_COVERED_STOCKS) {
      covered.push(id);
      fills += 1;
      entries.push({ id, at: nowIso, kind: "fill" });
    }
  }
  // Earlier picks stay pickable while still tracked (read before covered_stocks is rewritten below its old length).
  const held = heldPicks(doc).filter((id) => nextIds.includes(id) && !covered.includes(id));
  return { covered_stocks: covered, covered_fills_used: fills, covered_adds_log: [...log, ...entries], covered_held: held };
}
