import { unstable_cache } from "next/cache";

import { agentMarketDay } from "@/lib/agent-jobs-data";
import { can, EXAMPLE_AGENTS_UID } from "@/lib/entitlements";
import { isCovered, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { normalizeFollowed } from "@/lib/follow-shared";
import { fingerprint, perUserCache } from "@/lib/per-user-cache";
import { EXAMPLE_STOCK_TICKERS } from "@/lib/portfolio-data";
import { readTrackedStrategies } from "@/lib/strategies";
import type { UserDoc } from "@/lib/watchlist";

import { effectiveSeenAt, mergeInbox, unreadRows } from "./merge";
import { agentSource, alertSource, callSource, followSource, insiderSource, memoSource, reasonSource, reportsSource, resultsSource, strategySource, type InboxStock } from "./sources";
import { INBOX_DAYS, type InboxItem, type UpcomingReport } from "./types";

/**
 * The inbox loader: every source read at once, each with its own time limit,
 * merged into one list. A source that fails or is slow is left out (never shown
 * as an item); the rest still arrive. Signed in, it is the person's own records
 * on the stocks they track and the investors and strategies they follow;
 * signed out, the example portfolio's real agent runs and call changes.
 */

/** How long one source may take before the inbox goes on without it. */
export const SOURCE_TIMEOUT_MS = 4000;
/** How long a person's merged inbox is reused: the bell and the page opened within a minute share one read. */
const USER_TTL_MS = 60_000;

export type InboxResult = {
  items: InboxItem[];
  /** Sources left out because they failed or were slow, for logs and tests; never shown. */
  missing: string[];
  /** New York day the inbox was read. */
  today: string;
  /** Reports coming up on the person's stocks (earnings prep), soonest first; not items, so never unread. */
  upcoming: UpcomingReport[];
};

type Source = { name: string; run: () => Promise<InboxItem[]> };

async function settle(sources: Source[]): Promise<{ lists: InboxItem[][]; missing: string[] }> {
  const missing: string[] = [];
  const lists = await Promise.all(
    sources.map(async (source) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SOURCE_TIMEOUT_MS);
      });
      try {
        // One retry on a failed read (a dropped connection), inside the same time limit.
        const result = await Promise.race([source.run().catch(() => source.run()), slow]);
        if (result === null) {
          missing.push(source.name);
          console.warn(`[inbox] ${source.name} took longer than ${SOURCE_TIMEOUT_MS}ms; left out`);
          return [];
        }
        return result;
      } catch (error) {
        missing.push(source.name);
        console.warn(`[inbox] ${source.name} failed; left out:`, error instanceof Error ? error.message : error);
        return [];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return { lists, missing };
}

/** The reports coming up, inside the same time limit as a source; left out (and named in `missing`) when slow or failed. */
async function settleReports(run: () => Promise<UpcomingReport[]>, missing: string[]): Promise<UpcomingReport[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SOURCE_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([run(), slow]);
    if (result === null) {
      missing.push("reports");
      console.warn(`[inbox] reports took longer than ${SOURCE_TIMEOUT_MS}ms; left out`);
      return [];
    }
    return result;
  } catch (error) {
    missing.push("reports");
    console.warn("[inbox] reports failed; left out:", error instanceof Error ? error.message : error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** A report that a results row already tells (it reported) is not prep any more. */
function stillAhead(upcoming: UpcomingReport[], items: InboxItem[]): UpcomingReport[] {
  const told = new Set(items.filter((item) => item.kind === "results").map((item) => item.id));
  return upcoming.filter((report) => !told.has(`results:${report.ticker}:${report.date}`));
}

/** An agent's report reminder the calendar also has is said once, in "Coming up" with its history. */
function withoutTold(items: InboxItem[], upcoming: UpcomingReport[]): InboxItem[] {
  const ahead = new Set(upcoming.map((report) => `report:${report.ticker}:${report.date}`));
  return items.filter((item) => !ahead.has(item.id));
}

export function windowStart(now: Date): { since: string; sinceDay: string } {
  const since = new Date(now.getTime() - INBOX_DAYS * 86_400_000).toISOString();
  return { since, sinceDay: agentMarketDay(new Date(since)) };
}

/** The person's US stocks, holdings first (they survive the cap), with whether the plan covers each. */
export function inboxStocks(doc: Pick<UserDoc, "tracked_stocks" | "watchlist_positions"> | null, viewer: Viewer): InboxStock[] {
  const tracked = Array.isArray(doc?.tracked_stocks) ? doc!.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const positions = doc?.watchlist_positions ?? {};
  const out: InboxStock[] = [];
  const seen = new Set<string>();
  for (const raw of tracked) {
    const id = raw.trim().toUpperCase();
    if (!id.startsWith("US_") || seen.has(id)) continue;
    seen.add(id);
    const ticker = id.slice(3);
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
    out.push({ instrumentId: id, ticker, position: positions[raw] === "holding" || positions[id] === "holding" ? "holding" : "watchlist", covered: isCovered(viewer, id) });
  }
  return out.sort((a, b) => Number(b.position === "holding") - Number(a.position === "holding"));
}

const userInboxes = perUserCache<InboxResult>({
  ttlMs: USER_TTL_MS,
  max: 500,
  // A read with a source missing is shown, but built again next time.
  keep: (result) => result.missing.length === 0,
});

/** A signed-in person's inbox. `doc` and `viewer` are theirs, already read for this request. */
export async function loadUserInbox(viewer: Viewer, doc: UserDoc | null, now: Date = new Date()): Promise<InboxResult> {
  const uid = viewer.uid;
  if (!uid) throw new Error("loadUserInbox needs a signed-in viewer");
  const stocks = inboxStocks(doc, viewer);
  const followed = normalizeFollowed((doc as { followedSources?: unknown } | null)?.followedSources);
  const strategies = readTrackedStrategies(doc).map((entry) => entry.slug);
  const strategiesLocked = !can("followed_strategies", viewer.plan);
  const { since, sinceDay } = windowStart(now);
  const today = agentMarketDay(now);
  // Everything the result depends on besides the stores, so an edit (a new stock, a follow, an upgrade) reads again at once.
  const key = fingerprint({ plan: viewer.plan, stocks, followed, strategies, sinceDay, today });
  return userInboxes.get(uid, key, async () => {
    const reportsMissing: string[] = [];
    const [{ lists, missing }, upcoming] = await Promise.all([
      settle([
      { name: "agents", run: () => agentSource(uid, "mine", sinceDay, today) },
      { name: "calls", run: () => callSource({ stocks, uid, mode: "mine", since, sinceDay, today }) },
      { name: "results", run: () => resultsSource(stocks, "mine", sinceDay, today) },
      { name: "alerts", run: () => alertSource(uid, sinceDay) },
      { name: "reasons", run: () => (can("reason_watch", viewer.plan) ? reasonSource(uid, stocks, sinceDay) : Promise.resolve([])) },
      { name: "follow", run: () => followSource(followed, stocks, sinceDay) },
      { name: "insiders", run: () => insiderSource(stocks, sinceDay) },
      { name: "strategies", run: () => strategySource(strategies, strategiesLocked, sinceDay) },
      { name: "memo", run: () => memoSource(uid, sinceDay) },
      ]),
      settleReports(() => reportsSource(stocks, today), reportsMissing),
    ]);
    const merged = mergeInbox(lists, since, now);
    const ahead = stillAhead(upcoming, merged);
    return { items: withoutTold(merged, ahead), missing: [...missing, ...reportsMissing], today, upcoming: ahead };
  });
}

/** The example portfolio's stocks: its holdings, which its agents watch. */
function exampleStocks(): InboxStock[] {
  return EXAMPLE_STOCK_TICKERS.map((ticker) => ({ instrumentId: `US_${ticker}`, ticker, position: "holding" as const, covered: false }));
}

async function buildExampleInbox(today: string): Promise<InboxResult> {
  const now = new Date();
  const { since, sinceDay } = windowStart(now);
  const reportsMissing: string[] = [];
  const [{ lists, missing: sourcesMissing }, upcoming] = await Promise.all([
    settle([
      { name: "agents", run: () => agentSource(EXAMPLE_AGENTS_UID, "example", sinceDay, today) },
      { name: "calls", run: () => callSource({ stocks: exampleStocks(), uid: null, mode: "example", since, sinceDay, today }) },
      { name: "results", run: () => resultsSource(exampleStocks(), "example", sinceDay, today) },
    ]),
    settleReports(() => reportsSource(exampleStocks(), today), reportsMissing),
  ]);
  const merged = mergeInbox(lists, since, now);
  const ahead = stillAhead(upcoming, merged);
  const missing = [...sourcesMissing, ...reportsMissing];
  const result: InboxResult = { items: withoutTold(merged, ahead), missing, today, upcoming: ahead };
  // A read with a source missing must not be the cached answer for the next ten minutes.
  if (missing.length > 0) throw Object.assign(new Error(`example inbox incomplete: ${missing.join(", ")}`), { partial: result });
  return result;
}

const cachedExampleInbox = unstable_cache(buildExampleInbox, ["inbox-example-v2"], { revalidate: 600 });

/** The example portfolio's inbox, the same for every visitor: shared and cached for ten minutes. */
export async function loadExampleInbox(now: Date = new Date()): Promise<InboxResult> {
  const today = agentMarketDay(now);
  try {
    return await cachedExampleInbox(today);
  } catch (error) {
    // An incomplete read is still shown (it is real), just not kept.
    const partial = (error as { partial?: InboxResult } | null)?.partial;
    if (partial) return partial;
    console.warn("[inbox] example inbox failed:", error instanceof Error ? error.message : error);
    return { items: [], missing: ["example"], today, upcoming: [] };
  }
}

/** The read mark on the person's user doc, or null when they have never set one. */
export function storedSeenAt(doc: UserDoc | null): string | null {
  const value = (doc as { inbox_seen_at?: unknown } | null)?.inbox_seen_at;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** The read mark, and how many rows (each stock once a day) are unread under it. */
export function readState(items: InboxItem[], doc: UserDoc | null, today: string, now: Date = new Date()): { seenAt: string; unread: number } {
  const seenAt = effectiveSeenAt(storedSeenAt(doc), now);
  return { seenAt, unread: unreadRows(items, seenAt, today) };
}

/**
 * Mark everything up to `at` read: one field, `inbox_seen_at`, merged into the signed-in person's own user doc.
 * Nothing else on the doc is rewritten. The mark only moves forward: the read and the write are one transaction,
 * so a slower "Mark all read" from another tab cannot write an older time over a newer one.
 */
export async function markInboxSeen(uid: string, at: Date = new Date()): Promise<string> {
  if (!uid) throw new Error("markInboxSeen needs a uid");
  const ref = adminFirestore.collection("users").doc(uid);
  const next = at.toISOString();
  return adminFirestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw Object.assign(new Error("profile_not_ready"), { status: 409 });
    const current = storedSeenAt(snap.data() as UserDoc);
    if (current && Date.parse(current) >= at.getTime()) return current;
    transaction.set(ref, { inbox_seen_at: next }, { merge: true });
    return next;
  });
}
