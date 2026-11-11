import { DEDUPE_WINDOW_MS, FIRST_SEEN_DAYS, MAX_ITEMS, type InboxItem, type InboxKind } from "./types";

/**
 * Merging the sources into one list: drop what is older than `since`, keep one
 * copy of an event two sources both reported, keep only the newest item on a
 * thread (one stock's call), then newest first. Pure, no server imports.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A record stamped with a day and no time of day. */
export function isBareDay(value: unknown): boolean {
  return typeof value === "string" && DAY_RE.test(value.trim());
}

/** The New York day of an instant, YYYY-MM-DD; null for anything that is not a time. */
export function nyDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * A record's time as an ISO instant. A full time stays as it is; a bare day ("2026-11-06") becomes that day's US
 * close, 4 PM in New York (21:00 UTC in winter, 20:00 in summer), which is when a day's records are complete. A
 * wall time with no zone ("2026-11-10T17:17:54", how SEC filings are stamped) is read as New York time.
 */
export function instantOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (DAY_RE.test(raw)) return nyWallToIso(`${raw}T16:00:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) return nyWallToIso(raw);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A New York wall time ("2026-11-10T17:17:54") as an ISO instant, whatever the daylight-saving offset that day. */
function nyWallToIso(wall: string): string | null {
  const asUtc = new Date(`${wall}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // The offset New York had at about that moment: format the UTC instant there and see how far the clock is off.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(asUtc)
      .map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offset = shown - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}

function time(item: Pick<InboxItem, "at">): number {
  const value = Date.parse(item.at);
  return Number.isNaN(value) ? 0 : value;
}

/** Newest first; the same moment falls back to the id so the order never shuffles between reads. */
export function newestFirst(a: InboxItem, b: InboxItem): number {
  return time(b) - time(a) || a.id.localeCompare(b.id);
}

/** Which of two reports of one event to keep: the heavier source, then the one with a reason, then the earlier report. */
function better(a: InboxItem, b: InboxItem): InboxItem {
  if (a.weight !== b.weight) return a.weight > b.weight ? a : b;
  if (Boolean(a.detail) !== Boolean(b.detail)) return a.detail ? a : b;
  return time(a) <= time(b) ? a : b;
}

/**
 * One list from every source's items. `since` (ISO) drops older items; items without a valid time are dropped too,
 * since an inbox cannot place them.
 */
export function mergeInbox(lists: ReadonlyArray<ReadonlyArray<InboxItem>>, since: string, now: Date, max = MAX_ITEMS): InboxItem[] {
  const floor = Date.parse(since);
  const ceiling = now.getTime();
  // Where a record stamped ahead of now goes: the start of today in New York. A fixed point, so "Mark all read" holds
  // for it (placing it at "now" would move it past the read mark on every rebuild).
  const todayStart = Date.parse(instantOf(`${nyDay(now.toISOString())}T00:00:00`) ?? now.toISOString());
  const byId = new Map<string, InboxItem>();
  for (const list of lists) {
    for (const raw of list) {
      const at = time(raw);
      if (at === 0 || (!Number.isNaN(floor) && at < floor) || !raw.text.trim()) continue;
      // A record stamped ahead of now (a fill dated for tomorrow's session) is placed at the start of today.
      const item = at > ceiling ? { ...raw, at: new Date(todayStart).toISOString(), day: nyDay(new Date(todayStart).toISOString()) ?? raw.day, exact: false } : raw;
      // The same id from two sources (the call log and the steady call on one day) is one record: keep the better report.
      const seen = byId.get(item.id);
      byId.set(item.id, seen ? better(seen, item) : item);
    }
  }

  // One event, two sources: same key, close in time. Walk oldest first so each item meets the copies before it.
  const kept: InboxItem[] = [];
  for (const item of [...byId.values()].sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id))) {
    const twin = kept.findIndex((other) => other.dedupeKey === item.dedupeKey && Math.abs(time(other) - time(item)) <= DEDUPE_WINDOW_MS);
    if (twin === -1) kept.push(item);
    else kept[twin] = better(kept[twin]!, item);
  }

  // A thread keeps its newest item: NVDA's call moving twice in two weeks shows where it stands now.
  const newest = new Map<string, InboxItem>();
  for (const item of kept) {
    if (!item.thread) continue;
    const seen = newest.get(item.thread);
    if (!seen || newestFirst(item, seen) < 0) newest.set(item.thread, item);
  }
  return kept
    .filter((item) => !item.thread || newest.get(item.thread) === item)
    .sort(newestFirst)
    .slice(0, max);
}

/** The time read state starts from: when they last marked the inbox read, or FIRST_SEEN_DAYS ago for someone who never has. */
export function effectiveSeenAt(seenAt: string | null | undefined, now: Date): string {
  const parsed = typeof seenAt === "string" ? Date.parse(seenAt) : Number.NaN;
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date(now.getTime() - FIRST_SEEN_DAYS * 86_400_000).toISOString();
}

/** Whether an item arrived after the read mark. A quiet check never counts. */
export function isUnread(item: Pick<InboxItem, "at" | "quiet">, seenAt: string): boolean {
  if (item.quiet) return false;
  const seen = Date.parse(seenAt);
  return Number.isNaN(seen) || time(item) > seen;
}

export function unreadCount(items: ReadonlyArray<InboxItem>, seenAt: string): number {
  return items.filter((item) => isUnread(item, seenAt)).length;
}

/** The bell's badge: the count, or "9+". */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(Math.max(0, Math.floor(count)));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Nov 9", parsed by hand so no time zone can move the day. */
export function shortDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${MONTHS[Number(match[2]) - 1] ?? ""} ${Number(match[3])}`;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Today", "Yesterday", "Monday, Nov 9". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  return weekday ? `${weekday}, ${shortDay(day)}` : shortDay(day);
}

export type InboxDay = { day: string; label: string; items: InboxItem[] };

/** Items (newest first) grouped by their New York day, in the same order. */
export function groupByDay(items: ReadonlyArray<InboxItem>, today: string): InboxDay[] {
  const out: InboxDay[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else out.push({ day: item.day, label: dayLabel(item.day, today), items: [item] });
  }
  return out;
}

/** How many items of each kind, for the filter chips, in the order kinds first appear. */
export function kindCounts(items: ReadonlyArray<InboxItem>): Array<{ kind: InboxKind; count: number }> {
  const counts = new Map<InboxKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }));
}

/** An item as the browser gets it: the merge's bookkeeping (dedupe keys, source weights, threads) left out. */
export function forClient(item: InboxItem): InboxItem {
  return { ...item, dedupeKey: "", weight: 0, thread: null };
}
