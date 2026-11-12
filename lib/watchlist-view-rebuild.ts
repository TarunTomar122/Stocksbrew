import { adminFirestore } from "@/lib/firebase-admin";
import { syncAlertPauses } from "@/lib/stock-alerts";
import { resolveIsSubscribed } from "@/lib/watchlist";
import { rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";

/**
 * The per-user view (`tm_watchlist_views/{uid}`) rebuilt on the server after a
 * write to the person's stocks, so /briefing, the emails, Ask and MCP see a new
 * stock without waiting for the next weekday build.
 *
 * One rebuild per user at a time in this instance. A request that lands while
 * one runs either rides on it (the running build already read a book at least
 * as new as the caller's write) or asks for one more pass with a fresh read once
 * it finishes; a basket of five adds costs two builds, not five. The view writer
 * drops a build older than the stored `source_version`
 * (rebuildAndSaveWatchlistView), which covers two instances racing.
 */

const REBUILD_OPTIONS = {
  preserveBriefIfFallback: true,
  preserveDirectivesIfMissing: true,
  preserveActivityIfThin: true,
} as const;

function record<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

/**
 * Read the book fresh and rebuild the view from it. `onRead` hears the version
 * the build is based on before the slow part starts. Returns that version, or
 * null when the profile does not exist (nothing is written then).
 *
 * Also keeps alerts in step with the book: a stock that was in the last view and
 * is no longer tracked has its alerts paused (the batch modal removes stocks
 * without going through removeRadarStock), and a paused stock that is tracked
 * again has them resumed. Best effort: a failed alert write never stops the build.
 */
export async function rebuildWatchlistViewForUser(
  uid: string,
  onRead?: (version: number) => void,
  skipIfVersion?: number | null,
): Promise<number | null> {
  const userSnap = await adminFirestore.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const user = (userSnap.data() ?? {}) as Record<string, unknown>;
  const sourceVersion = Number(user.watchlist_version ?? 0);
  // Said as soon as the book is read, so a write that lands after this point asks the queue for another pass.
  onRead?.(sourceVersion);
  if (skipIfVersion !== undefined && skipIfVersion !== null && sourceVersion === skipIfVersion) return sourceVersion;

  const tracked = Array.isArray(user.tracked_stocks)
    ? (user.tracked_stocks as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const positions = record<"holding" | "watchlist">(user.watchlist_positions);

  // Stocks in the last view that are no longer tracked were removed since it was built. Only when that view is not
  // newer than the book read here: otherwise this read is the stale one and its diff means nothing.
  const viewSnap = await adminFirestore.collection("tm_watchlist_views").doc(uid).get().catch(() => null);
  const view = viewSnap?.exists ? (viewSnap.data() ?? {}) : null;
  const trackedSet = new Set(tracked);
  // Only alerts set before that view was built are paused: one set later on a stock that is not followed was set
  // on purpose. A view without a build time can't say that, so it pauses nothing.
  const builtAt = view && typeof view.built_at === "string" ? view.built_at : null;
  const previousIds = view && builtAt && Number(view.source_version ?? 0) <= sourceVersion ? (view.tracked_ids as unknown) : null;
  const removed = Array.isArray(previousIds)
    ? previousIds.filter((id): id is string => typeof id === "string" && !trackedSet.has(id))
    : [];
  const isSubscribed = resolveIsSubscribed(user as Parameters<typeof resolveIsSubscribed>[0]);
  await syncAlertPauses(uid, {
    pause: removed,
    resume: tracked,
    plan: isSubscribed ? "pro" : "free",
    ...(builtAt ? { createdBefore: builtAt } : {}),
  }).catch((error: unknown) => {
    console.warn("[watchlist-view-rebuild] alert sync failed:", error instanceof Error ? error.message : error);
  });

  await rebuildAndSaveWatchlistView(
    uid,
    tracked,
    positions,
    isSubscribed,
    sourceVersion,
    REBUILD_OPTIONS,
  );
  return sourceVersion;
}

type Worker = (uid: string, onRead: (version: number) => void, skipIfVersion: number | null) => Promise<number | null>;

type Slot = {
  done: Promise<void>;
  /** Another pass is wanted after this one, with a fresh read. */
  again: boolean;
  /** The version the running pass read, or null before its read lands. */
  readVersion: number | null;
  /** The newest version any caller asked for; passes repeat until one has built at least this. */
  wanted: number | null;
};

/** A store that keeps failing, or a version that never shows up, must not keep one user's builds looping. */
const MAX_PASSES = 4;

/** The coalescing queue, with the worker passed in so tests can drive it. */
export function createRebuildQueue(worker: Worker) {
  const slots = new Map<string, Slot>();

  function start(uid: string): Slot {
    const slot: Slot = { done: Promise.resolve(), again: false, readVersion: null, wanted: null };
    slot.done = (async () => {
      let built: number | null = null;
      let failure: unknown = null;
      let passes = 0;
      try {
        while (true) {
          slot.again = false;
          slot.readVersion = null;
          let version: number | null = null;
          try {
            // A later pass for a version an earlier one already built (a replayed request) is skipped.
            version = await worker(uid, (read) => { slot.readVersion = read; }, passes === 0 ? null : built);
            built = version ?? built;
            failure = null;
          } catch (error) {
            failure = error;
          }
          passes += 1;
          if (passes >= MAX_PASSES) break;
          if (slot.again) continue;
          // A request can land after this pass read the book but before it said so: `wanted` catches that.
          const behind = slot.wanted !== null && (built === null || built < slot.wanted);
          if (!behind || failure || (version === null && !failure)) break;
        }
      } finally {
        slots.delete(uid);
      }
      if (failure) throw failure;
    })();
    slots.set(uid, slot);
    return slot;
  }

  /**
   * Make sure a build that reads at least `minVersion` runs. Resolves when the
   * build that covers it has finished; rejects when that build failed. Without
   * a version, any pass that has not read yet covers it, otherwise one more
   * pass is queued.
   */
  return function request(uid: string, minVersion?: number): Promise<void> {
    const existing = slots.get(uid);
    const slot = existing ?? start(uid);
    if (minVersion !== undefined) slot.wanted = Math.max(slot.wanted ?? minVersion, minVersion);
    if (existing) {
      const covered = existing.readVersion === null || (minVersion !== undefined && existing.readVersion >= minVersion);
      if (!covered) existing.again = true;
    }
    return slot.done;
  };
}

/** The app's queue: one per server instance. */
export const requestWatchlistViewRebuild = createRebuildQueue((uid, onRead, skipIfVersion) =>
  rebuildWatchlistViewForUser(uid, onRead, skipIfVersion),
);
