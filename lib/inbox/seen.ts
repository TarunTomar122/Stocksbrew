import { isUnread } from "./merge";
import type { InboxItem } from "./types";

/**
 * Reading the inbox clears it. The read mark (`inbox_seen_at`) is one time: everything at or before it is read. So
 * "everything shown is read" is the newest shown item's time, never "now", which would also clear an item that
 * arrived after the list was drawn. Pure, so the browser, the route and the tests share it.
 */

/** How long the list has to be in view before what it shows counts as read. */
export const SEEN_AFTER_MS = 2000;

/** The newest time among the items shown, or null when there are none with a valid time. */
export function newestShown(items: ReadonlyArray<Pick<InboxItem, "at">>): string | null {
  let best = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const at = Date.parse(item.at);
    if (Number.isFinite(at) && at > best) best = at;
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}

/** Whether marking up to `at` would clear anything: some shown item is still unread under `seenAt`. */
export function wouldClear(items: ReadonlyArray<Pick<InboxItem, "at" | "quiet">>, seenAt: string | null | undefined): boolean {
  if (!seenAt) return false;
  return items.some((item) => isUnread(item, seenAt));
}

/**
 * The time a POST /api/inbox/seen asks to mark: `at` from the body when it is a real time, never later than now
 * (a clock ahead of the server cannot mark the future read); now when there is no usable body ("Mark all read").
 */
export function seenAtFromBody(body: unknown, now: Date = new Date()): Date {
  const raw = body && typeof body === "object" ? (body as { at?: unknown }).at : undefined;
  const at = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(at)) return now;
  return new Date(Math.min(at, now.getTime()));
}

type Timers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

/**
 * Runs `fire` once the list has been in view for `delayMs` without a break: the clock starts when the page is
 * visible and starts over if the tab is hidden first. Returns a cancel. Visibility is passed in so this is tested
 * without a browser.
 */
export function afterInView(options: {
  delayMs?: number;
  fire: () => void;
  isVisible: () => boolean;
  /** Subscribes to visibility changes; returns an unsubscribe. */
  onVisibilityChange: (listener: () => void) => () => void;
  timers?: Timers;
}): () => void {
  const { delayMs = SEEN_AFTER_MS, fire, isVisible, onVisibilityChange } = options;
  const timers: Timers = options.timers ?? { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  let timer: unknown = null;
  let done = false;
  const stop = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const start = () => {
    if (done || timer !== null || !isVisible()) return;
    timer = timers.setTimeout(() => {
      timer = null;
      if (done) return;
      done = true;
      unsubscribe();
      fire();
    }, delayMs);
  };
  const unsubscribe = onVisibilityChange(() => (isVisible() ? start() : stop()));
  start();
  return () => {
    done = true;
    stop();
    unsubscribe();
  };
}
