import { capitalize, dayWords } from "@/lib/day-words";

import { DEDUPE_WINDOW_MS, FIRST_SEEN_DAYS, MAX_ITEMS, POPOVER_ROWS, type InboxItem, type InboxKind } from "./types";

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

/** Newest first; at the same moment (one agent run) the bigger move first, then the id, so the order never shuffles between reads. */
export function newestFirst(a: InboxItem, b: InboxItem): number {
  return time(b) - time(a) || Math.abs(b.move?.pct ?? 0) - Math.abs(a.move?.pct ?? 0) || a.id.localeCompare(b.id);
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

/** "Nov 9", parsed by hand so no time zone can move the day. */
export function shortDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${MONTHS[Number(match[2]) - 1] ?? ""} ${Number(match[3])}`;
}

/** "Today", "Yesterday", "Monday" within the week, "Nov 3" before (lib/day-words.ts). */
export function dayLabel(day: string, today: string): string {
  return capitalize(dayWords(day, today)) || shortDay(day);
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

export type InboxGroup = { key: string; ticker: string | null; items: InboxItem[] };

/** Price moves first inside a stock's row: the move is what happened, a price level or a filing comes after it. */
function rowRank(item: InboxItem): number {
  return item.id.startsWith("move:") ? 0 : item.move ? 1 : 2;
}

/**
 * One day's items (newest first) with each stock said once: items about one stock, and only that stock, share a
 * row, placed where the stock first appears. Items about several stocks or none stay rows of their own.
 */
export function groupByStock(items: ReadonlyArray<InboxItem>): InboxGroup[] {
  const out: InboxGroup[] = [];
  const byTicker = new Map<string, InboxGroup>();
  for (const item of items) {
    const ticker = item.tickers.length === 1 ? item.tickers[0]! : null;
    const seen = ticker ? byTicker.get(ticker) : undefined;
    if (seen) {
      seen.items.push(item);
      continue;
    }
    const group: InboxGroup = { key: ticker ? `stock:${ticker}:${item.id}` : item.id, ticker, items: [item] };
    if (ticker) byTicker.set(ticker, group);
    out.push(group);
  }
  for (const group of out) if (group.items.length > 1) group.items = group.items.map((item, index) => ({ item, index })).sort((a, b) => rowRank(a.item) - rowRank(b.item) || a.index - b.index).map(({ item }) => item);
  return out;
}

/** Rows as the page and the bell draw them: by day, then each stock once a day, newest first. */
export function inboxRows(items: ReadonlyArray<InboxItem>, today: string): Array<InboxGroup & { day: string }> {
  return groupByDay(items, today).flatMap((day) => groupByStock(day.items).map((row) => ({ ...row, day: day.day })));
}

/** Unread rows: one agent run that flags eight stocks is eight things, but MU's move and its price level are one. */
export function unreadRows(items: ReadonlyArray<InboxItem>, seenAt: string, today: string): number {
  return inboxRows(items, today).filter((row) => row.items.some((item) => isUnread(item, seenAt))).length;
}

/** Most rows the popover takes to finish one report (an agent run that flagged many stocks at one time). */
const POPOVER_MAX_ROWS = 16;

/**
 * What the bell's popover shows: the newest POPOVER_ROWS rows, findings first (a quiet check only when there is
 * nothing else). A report is never cut in half: the rows that share the oldest shown time come too (up to
 * POPOVER_MAX_ROWS), since the read mark is one time and half of one agent run could never be marked read.
 */
export function popoverItems(items: ReadonlyArray<InboxItem>, today: string, rows = POPOVER_ROWS): InboxItem[] {
  const findings = items.filter((item) => !item.quiet);
  const all = inboxRows(findings.length > 0 ? findings : items, today);
  const taken = all.slice(0, rows);
  // The oldest of the taken rows' newest times: a row whose newest item is at or after it belongs to the same report.
  const newestOf = (row: InboxGroup) => Math.max(...row.items.map((item) => Date.parse(item.at)).filter(Number.isFinite));
  const floor = Math.min(...taken.map(newestOf).filter(Number.isFinite));
  for (const row of all.slice(rows)) {
    if (taken.length >= POPOVER_MAX_ROWS || !(newestOf(row) >= floor)) break;
    taken.push(row);
  }
  return taken.flatMap((row) => row.items);
}

/**
 * Whether marking the shown items read (up to the newest shown) would clear only what was shown: no unread item that
 * is not shown sits at or before that time. The read mark is one time, so otherwise it would clear unseen items too.
 */
export function clearableBy(all: ReadonlyArray<InboxItem>, shown: ReadonlyArray<InboxItem>, seenAt: string): boolean {
  const ids = new Set(shown.map((item) => item.id));
  const newest = Math.max(...shown.map((item) => Date.parse(item.at)).filter(Number.isFinite));
  if (!Number.isFinite(newest)) return false;
  return !all.some((item) => !ids.has(item.id) && isUnread(item, seenAt) && Date.parse(item.at) <= newest);
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
