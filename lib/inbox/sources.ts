import { unstable_cache } from "next/cache";

import { AGENT_RUNS_COLLECTION, listJobs } from "@/lib/agent-jobs-data";
import { runTickers } from "@/lib/agent-watch";
import { moveReason } from "@/lib/briefing";
import { normalizeEarnings } from "@/lib/calendar-shared";
import { getDailyAnomalyTickers } from "@/lib/daily-anomalies";
import { bigVsDayWords } from "@/lib/briefing-move-facts";
import { historyWords, moveStats } from "@/lib/earnings-season";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { adminFirestore } from "@/lib/firebase-admin";
import { getInsiderBuys, getSourceActivity } from "@/lib/follow";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { moveLine } from "@/lib/move-line";
import { getRebalancesSince } from "@/lib/strategies-rebalances";
import { lastChange, readStoredCheck, CHECKS_COLLECTION } from "@/lib/thesis-watch/store";
import { MEMO_COLLECTION } from "@/lib/memo/store";
import { resultsForChecked } from "@/lib/results/server";
import { RESULTS_DAYS } from "@/lib/results/types";

import { nyDay } from "./merge";
import { UPCOMING_DAYS, type InboxItem, type UpcomingReport } from "./types";
import {
  agentItem,
  alertItem,
  callItem,
  changesFromDays,
  findingItems,
  followItem,
  insiderItems,
  memoItem,
  moveTickers,
  plainCall,
  quietItems,
  reasonItem,
  resultsItem,
  strategyItem,
  type AgentRunRecord,
  type Mode,
  type MoveContext,
  type RunFinding,
  type PlainCall,
  type Position,
  type Verdict,
} from "./words";

/**
 * The store reads behind the inbox, one function per source. Each reads only
 * what its records need (selected fields, documents by id, the shared cached
 * feeds for public data) and returns finished items. A source that fails
 * throws; the loader (./server.ts) leaves that source out and shows the rest.
 * Reads only: nothing here writes.
 */

/** One of the person's stocks, as the inbox needs it. */
export type InboxStock = { instrumentId: string; ticker: string; position: Position; covered: boolean };

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to && out.length < 60; day = shiftDay(day, 1)) out.push(day);
  return out;
}

type Snap = { exists: boolean; id: string; data(): unknown };

/** Documents by path with only `fields` read back (LocalDB), or whole documents in chunks (Firebase rollback). */
async function readSelected(paths: string[], fields: string[]): Promise<Snap[]> {
  if (paths.length === 0) return [];
  const local = localFirestoreFromEnv();
  if (local) {
    const refs = paths.map((path) => {
      const cut = path.lastIndexOf("/");
      return local.collection(path.slice(0, cut)).doc(path.slice(cut + 1));
    });
    return (await local.getAllSelected(refs, fields)) as unknown as Snap[];
  }
  const out: Snap[] = [];
  for (let start = 0; start < paths.length; start += 100) {
    const refs = paths.slice(start, start + 100).map((path) => adminFirestore.doc(path));
    out.push(...((await adminFirestore.getAll(...refs)) as unknown as Snap[]));
  }
  return out;
}

/** How long the extra reads behind a row (a normal day, a confirmed reason, a report's history) may take before the rows go without them. */
const CONTEXT_BUDGET_MS = 2500;
/** Most stocks the context is read for: each is a shared cached read, but a cold one is a few documents. */
const MAX_CONTEXT_STOCKS = 16;

/** `read` within `ms`, else `fallback`: a slow extra never holds up the inbox. A failed read is the fallback too. */
async function within<T>(read: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([
      read.catch((error) => {
        console.warn("[inbox] extra read failed; rows go without it:", error instanceof Error ? error.message : error);
        return fallback;
      }),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * For each stock: what a normal day is (its average absolute daily move over 120 sessions, from the shared cached
 * earnings history) and the confirmed reason for its latest move (the researched movers feed, one batched read).
 * A reason counts only when it has sources and names a cause; the row then says it, and says nothing otherwise.
 */
async function moveContext(tickers: string[], today: string): Promise<Map<string, MoveContext>> {
  const unique = [...new Set(tickers)].slice(0, MAX_CONTEXT_STOCKS);
  const out = new Map<string, MoveContext>();
  if (unique.length === 0) return out;
  const [anomalies, earnings] = await within(
    Promise.all([getDailyAnomalyTickers("US", unique).catch(() => new Map()), loadTickerEarnings(unique, today).catch(() => new Map())]),
    CONTEXT_BUDGET_MS,
    [new Map(), new Map()] as [Awaited<ReturnType<typeof getDailyAnomalyTickers>>, Awaited<ReturnType<typeof loadTickerEarnings>>],
  );
  for (const ticker of unique) {
    const anomaly = anomalies.get(ticker) ?? null;
    let reason: MoveContext["reason"] = null;
    if (anomaly && moveReason(anomaly).status === "confirmed" && Number.isFinite(anomaly.day_change_pct)) {
      const day = quoteDay(anomaly.price_as_of ?? anomaly.narrative_as_of);
      const line = moveLine(anomaly).trim();
      if (day && line) reason = { day, pct: anomaly.day_change_pct, line };
    }
    const normal = earnings.get(ticker)?.history.typicalDayPct;
    out.set(ticker, { normalPct: typeof normal === "number" && Number.isFinite(normal) && normal > 0 ? normal : null, reason });
  }
  return out;
}

/* ── agent runs ─────────────────────────────────────────────────────────── */

/**
 * The runs of the person's standing agents that still exist (or the example account's), as items. Only the window's
 * runs are read (one run per job per day, so a long history never makes this read grow), with the fields the item needs.
 */
export async function agentSource(uid: string, mode: Mode, sinceDay: string, today: string): Promise<InboxItem[]> {
  const query = adminFirestore.collection(AGENT_RUNS_COLLECTION).where("uid", "==", uid).where("day", ">=", sinceDay) as unknown as {
    select?: (fields: string[]) => { get(): Promise<{ docs: Array<{ data(): unknown }> }> };
    get(): Promise<{ docs: Array<{ data(): unknown }> }>;
  };
  const fields = ["uid", "job_id", "job_name", "day", "ran_at", "decision", "summary", "findings"];
  const [jobs, snap] = await Promise.all([listJobs(uid), localFirestoreFromEnv() && query.select ? query.select(fields).get() : query.get()]);
  const live = new Set(jobs.map((job) => job.id));
  const records: AgentRunRecord[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const decision = data.decision;
    const day = str(data.day);
    if (data.uid !== uid || !live.has(str(data.job_id)) || day < sinceDay) continue;
    if (decision !== "notify" && decision !== "nothing" && decision !== "could_not_check") continue;
    records.push({
      jobId: str(data.job_id),
      jobName: str(data.job_name),
      day,
      ranAt: str(data.ran_at),
      decision,
      summary: str(data.summary),
      tickers: runTickers(Array.isArray(data.findings) ? (data.findings as Array<{ ticker: string | null }>) : []),
      findings: Array.isArray(data.findings) ? readFindings(data.findings) : [],
    });
  }
  // Newest runs first, so the context goes to the stocks whose moves are freshest.
  records.sort((a, b) => b.day.localeCompare(a.day));
  const context = await moveContext(moveTickers(records), today);
  const items: InboxItem[] = [];
  for (const run of records) {
    // A run with findings says them stock by stock; an older run without them keeps its own summary.
    const found = findingItems(run, mode, context, today);
    if (found) items.push(...found);
    else {
      const item = agentItem(run, mode);
      if (item) items.push(item);
    }
  }
  return [...items, ...quietItems(records, mode, today)];
}

function readFindings(raw: unknown[]): RunFinding[] {
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  return raw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      ticker: str(row.ticker) || null,
      headline: str(row.headline),
      detail: str(row.detail),
      at: str(row.at),
      kind: str(row.kind) || undefined,
      change_pct: num(row.change_pct),
      close: num(row.close),
      zone: row.zone === "add" || row.zone === "trim" ? row.zone : null,
      call_from: str(row.call_from) || null,
      call_to: str(row.call_to) || null,
      level: num(row.level) ?? null,
      time: str(row.time) || null,
    }));
}

/**
 * The New York trading day a mover's quote is from. A midnight-UTC stamp is a daily bar's date label, not an
 * instant (read in New York it would be the day before), as lib/daily-anomalies.ts reads it.
 */
function quoteDay(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)$/.test(raw)) return raw.slice(0, 10);
  return raw ? nyDay(raw) : null;
}

/* ── reports coming up ──────────────────────────────────────────────────── */

/** Every US report in the next few days, from the earnings calendar: one read shared by everyone, kept fifteen minutes. */
const upcomingRows = unstable_cache(
  async (from: string, to: string): Promise<Array<{ ticker: string; date: string; session: UpcomingReport["session"]; reported: boolean }>> => {
    const snap = await adminFirestore.collection("tm_earnings_events").where("market", "==", "US").where("event_date", ">=", from).where("event_date", "<=", to).get();
    const out: Array<{ ticker: string; date: string; session: UpcomingReport["session"]; reported: boolean }> = [];
    for (const doc of snap.docs) {
      const row = normalizeEarnings(doc.data() as Record<string, unknown>);
      if (row) out.push({ ticker: row.ticker, date: row.date, session: row.session, reported: row.epsActual !== null });
    }
    return out;
  },
  ["inbox-upcoming-reports-v1"],
  { revalidate: 900 },
);

const SESSION_ORDER: Record<UpcomingReport["session"], number> = { bmo: 0, unknown: 1, amc: 2 };
/** Most reports shown: a week of a big watchlist in earnings season can be dozens. */
const MAX_UPCOMING = 8;

/**
 * The person's stocks that report in the next UPCOMING_DAYS days and have not reported yet, soonest first, each with
 * how it has moved on its own past reports (only when measured). Funds have no reports and are left out.
 */
export async function reportsSource(stocks: InboxStock[], today: string): Promise<UpcomingReport[]> {
  if (stocks.length === 0) return [];
  const mine = new Set(stocks.map((stock) => stock.ticker));
  const rows = await upcomingRows(today, shiftDay(today, UPCOMING_DAYS - 1));
  const soonest = new Map<string, { ticker: string; date: string; session: UpcomingReport["session"] }>();
  for (const row of rows) {
    // Already out (a result is in, or it reported before today's open) is a recap, not prep: the results rows say it.
    if (!mine.has(row.ticker) || row.reported || row.date < today || (row.date === today && row.session === "bmo")) continue;
    const seen = soonest.get(row.ticker);
    if (!seen || row.date < seen.date) soonest.set(row.ticker, row);
  }
  const picked = [...soonest.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || SESSION_ORDER[a.session] - SESSION_ORDER[b.session] || a.ticker.localeCompare(b.ticker))
    .slice(0, MAX_UPCOMING);
  if (picked.length === 0) return [];
  const histories = await within(loadTickerEarnings(picked.map((row) => row.ticker), today), CONTEXT_BUDGET_MS, new Map());
  const out: UpcomingReport[] = [];
  for (const row of picked) {
    const loaded = histories.get(row.ticker);
    if (loaded?.fund) continue;
    const history = loaded?.history ?? null;
    const stats = history ? moveStats(history.past, history.typicalDayPct) : null;
    out.push({
      ticker: row.ticker,
      date: row.date,
      session: row.session,
      history: stats && history ? historyWords(stats, history.past, today) : null,
      usualPct: stats?.usual ?? null,
      vsDay: stats ? bigVsDayWords(stats.vsNormalDay) : null,
    });
  }
  return out;
}

/* ── call changes ───────────────────────────────────────────────────────── */

/** How many days before `since` the call log is read, so the first day in the window has a day to compare with. */
const CALL_LOOKBACK_DAYS = 7;
/** Most stocks whose calls are read: past this the list is someone's whole watchlist, and the newest ones count. */
export const MAX_CALL_STOCKS = 60;

const STABILITY_CALLS: Record<string, PlainCall> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/**
 * Call changes on the person's stocks, from three records of the same thing: the steady call's own change list
 * (tm_call_stability, with the reason), the daily call log (tm_directive_history, read by document id for each
 * day in the window), and, for an account, the call-change events (tm_lifecycle_events). The merge keeps one.
 * The call's earlier value and its reason are shown only for stocks the plan covers (lib/entitlements.ts
 * stock_zones: how a call has moved is part of the full read); the change itself is the call, which is free.
 */
/**
 * Steady calls went live on this day (backend/call_stability.py). Changes before it were the old day-to-day flips the
 * rule was built to stop, so the inbox starts its call news here rather than replaying them.
 */
export const STEADY_CALLS_SINCE = "2026-11-11";

export async function callSource(input: { stocks: InboxStock[]; uid: string | null; mode: Mode; since: string; sinceDay: string; today: string }): Promise<InboxItem[]> {
  if (input.sinceDay < STEADY_CALLS_SINCE) input = { ...input, sinceDay: STEADY_CALLS_SINCE, since: input.since < `${STEADY_CALLS_SINCE}T00:00:00.000Z` ? `${STEADY_CALLS_SINCE}T00:00:00.000Z` : input.since };
  const stocks = input.stocks.slice(0, MAX_CALL_STOCKS);
  if (stocks.length === 0) return [];
  const byId = new Map(stocks.map((stock) => [stock.instrumentId, stock]));
  // The log is filed by the UTC date of each call, so an evening run in New York sits under the next day (a Friday
  // evening one under Saturday): every calendar day is read, through tomorrow.
  const days = daysBetween(shiftDay(input.sinceDay, -CALL_LOOKBACK_DAYS), shiftDay(input.today, 1));
  const historyPaths = stocks.flatMap((stock) => days.map((day) => `tm_directive_history/${stock.instrumentId}/calls/${day}`));
  const [history, stability, events] = await Promise.all([
    readSelected(historyPaths, ["instrument_id", "stance", "generated_at", "stability_reason"]),
    readSelected(
      stocks.map((stock) => `tm_call_stability/${stock.instrumentId}`),
      ["instrument_id", "changes"],
    ),
    input.uid && input.mode === "mine"
      ? adminFirestore
          .collection("tm_lifecycle_events")
          .where("uid", "==", input.uid)
          .where("type", "==", "directive_change")
          .where("created_at", ">=", input.since)
          .limit(200)
          .get()
      : Promise.resolve(null),
  ]);
  const items: InboxItem[] = [];
  const shows = (stock: InboxStock) => input.mode === "mine" && stock.covered;

  // The daily call log: a change is a day whose call differs from the day before.
  const daily = new Map<string, Array<{ at: string; call: PlainCall; reason: string | null }>>();
  for (const snap of history) {
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    const id = str(data.instrument_id).toUpperCase();
    const call = plainCall(data.stance);
    const at = str(data.generated_at);
    if (!byId.has(id) || !call || !at) continue;
    daily.set(id, [...(daily.get(id) ?? []), { at, call, reason: str(data.stability_reason) || null }]);
  }
  for (const [id, rows] of daily) {
    const stock = byId.get(id)!;
    for (const change of changesFromDays(rows)) {
      const day = nyDay(change.row.at);
      if (!day || day < input.sinceDay) continue;
      const item = callItem(
        { ticker: stock.ticker, at: change.row.at, from: shows(stock) ? change.from : null, to: change.to, position: stock.position, reason: shows(stock) ? change.row.reason : null, weight: 2 },
        input.mode,
      );
      if (item) items.push(item);
    }
  }

  // The steady call's change list: the call people see, with its reason.
  for (const snap of stability) {
    if (!snap.exists) continue;
    const data = snap.data() as { instrument_id?: unknown; changes?: unknown };
    const stock = byId.get(str(data.instrument_id).toUpperCase()) ?? byId.get(snap.id.toUpperCase());
    if (!stock || !Array.isArray(data.changes)) continue;
    for (const raw of data.changes as Array<Record<string, unknown>>) {
      const day = str(raw?.date);
      const from = STABILITY_CALLS[str(raw?.from)] ?? null;
      const to = STABILITY_CALLS[str(raw?.to)] ?? null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < input.sinceDay || !to || from === to) continue;
      const item = callItem(
        { ticker: stock.ticker, at: day, from: shows(stock) ? from : null, to, position: stock.position, reason: shows(stock) ? str(raw?.reason) || null : null, weight: 3 },
        input.mode,
      );
      if (item) items.push(item);
    }
  }

  // The call-change events the watchlist job records for some accounts.
  for (const doc of events?.docs ?? []) {
    const data = doc.data() as Record<string, unknown>;
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    const stock = byId.get(str(payload.instrument_id).toUpperCase());
    const at = str(data.created_at);
    const day = at ? nyDay(at) : null;
    const from = plainCall(payload.prev_stance);
    const to = plainCall(payload.new_stance);
    if (!stock || !day || day < input.sinceDay || !to) continue;
    const item = callItem({ ticker: stock.ticker, at, from: shows(stock) ? from : null, to, position: stock.position, reason: null, weight: 1 }, input.mode);
    if (item) items.push(item);
  }
  return items;
}

/* ── price alerts ───────────────────────────────────────────────────────── */

export async function alertSource(uid: string, sinceDay: string): Promise<InboxItem[]> {
  const snap = await adminFirestore.collection("tm_alerts").where("uid", "==", uid).get();
  const items: InboxItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const triggeredAt = str(data.triggered_at);
    if (data.triggered !== true || !triggeredAt || (nyDay(triggeredAt) ?? "") < sinceDay) continue;
    const target = typeof data.target_price === "number" && Number.isFinite(data.target_price) ? data.target_price : null;
    const item = alertItem({
      id: doc.id,
      ticker: str(data.ticker),
      condition: data.condition === "above" ? "above" : data.condition === "below" ? "below" : null,
      target,
      triggeredAt,
    });
    if (item) items.push(item);
  }
  return items;
}

/* ── reason checks ──────────────────────────────────────────────────────── */

/** The person's stored reason checks (lib/thesis-watch/store.ts) whose verdict changed in the window, on stocks the plan checks. */
export async function reasonSource(uid: string, stocks: InboxStock[], sinceDay: string): Promise<InboxItem[]> {
  const covered = new Set(stocks.filter((stock) => stock.covered).map((stock) => stock.instrumentId));
  if (covered.size === 0) return [];
  const snap = await adminFirestore.collection(CHECKS_COLLECTION).where("uid", "==", uid).get();
  const items: InboxItem[] = [];
  for (const doc of snap.docs) {
    const check = readStoredCheck(doc.data());
    if (!check || check.uid !== uid || !covered.has(check.instrumentId.toUpperCase())) continue;
    const change = lastChange(check.history);
    const first = check.history.length === 1 ? check.history[0]! : null;
    // The last change is the one that led to the verdict standing now.
    const record = change
      ? { day: change.day, from: change.from as Verdict, verdict: check.verdict }
      : first
        ? { day: first.day, from: null, verdict: first.verdict }
        : null;
    if (!record || record.day < sinceDay) continue;
    const item = reasonItem({ ticker: check.ticker, day: record.day, verdict: record.verdict as Verdict, from: record.from, headline: check.headline }, "mine");
    if (item) items.push(item);
  }
  return items;
}

/* ── investors they follow ──────────────────────────────────────────────── */

/** Most followed investors read: each is one cached read of that investor's recent filings. */
const MAX_FOLLOWED_READ = 30;

export async function followSource(slugs: string[], stocks: InboxStock[], sinceDay: string): Promise<InboxItem[]> {
  if (slugs.length === 0) return [];
  const owned = new Set(stocks.filter((stock) => stock.position === "holding").map((stock) => stock.ticker));
  const watched = new Set(stocks.filter((stock) => stock.position !== "holding").map((stock) => stock.ticker));
  // Each investor's feed is a shared cached read; one failing investor does not hide the others.
  const feeds = await Promise.all(slugs.slice(0, MAX_FOLLOWED_READ).map((slug) => getSourceActivity(slug).catch(() => null)));
  if (feeds.every((feed) => feed === null)) throw new Error("no followed investor could be read");
  const items: InboxItem[] = [];
  feeds.forEach((feed, index) => {
    for (const activity of feed ?? []) {
      if (!activity.date || activity.date.slice(0, 10) < sinceDay) continue;
      const item = followItem(
        {
          id: activity.id,
          slug: slugs[index]!,
          headline: activity.headline,
          date: activity.date.slice(0, 10),
          tickers: (activity.items ?? []).map((row) => row.ticker ?? "").filter(Boolean),
        },
        { owned, watched },
      );
      if (item) items.push(item);
    }
  });
  return items;
}

/* ── insider buys in their stocks ───────────────────────────────────────── */

export async function insiderSource(stocks: InboxStock[], sinceDay: string, today: string | null = null): Promise<InboxItem[]> {
  if (stocks.length === 0) return [];
  const positions = new Map(stocks.map((stock) => [stock.ticker, stock.position]));
  // Open-market buys are rare next to sales, and a planned (10b5-1) buy was decided months before: neither is news here.
  const buys = await getInsiderBuys(400);
  return insiderItems(
    buys
      .filter((trade) => positions.has(trade.symbol) && !trade.plan_10b5_1 && (trade.filed_at ?? "").slice(0, 10) >= sinceDay)
      .map((trade) => ({ id: trade.id, ticker: trade.symbol, insider: trade.insider, role: trade.role, value: trade.value, filedAt: trade.filed_at, url: trade.url })),
    positions,
    today,
  );
}

/* ── results ────────────────────────────────────────────────────────────── */

/**
 * Results on the person's stocks from the last RESULTS_DAYS days (inside the inbox window), one item per report:
 * the shared cached list of recent reports, then one cached read per stock that reported. When a stock's read fails
 * the source throws with the rows it did read (`partial`): the inbox shows them, but names the source missing, so the
 * list is not cached as whole (lib/inbox/server.ts).
 */
export async function resultsSource(stocks: InboxStock[], mode: Mode, sinceDay: string, today: string): Promise<InboxItem[]> {
  if (stocks.length === 0) return [];
  const positions = new Map(stocks.map((stock) => [stock.ticker, stock.position]));
  const floor = shiftDay(today, -RESULTS_DAYS);
  const { reads, failed } = await resultsForChecked([...positions.keys()], { since: sinceDay > floor ? sinceDay : floor, today });
  const items = reads.map((read) => resultsItem(read, positions.get(read.ticker) ?? null, mode, today)).filter((item): item is InboxItem => item !== null);
  if (failed.length > 0) throw Object.assign(new Error(`results read failed for ${failed.join(", ")}`), { partial: items });
  return items;
}

/* ── strategies they follow ─────────────────────────────────────────────── */

export async function strategySource(slugs: string[], locked: boolean, sinceDay: string): Promise<InboxItem[]> {
  if (slugs.length === 0) return [];
  const wanted = new Set(slugs);
  const all = await getRebalancesSince(sinceDay);
  return all
    .filter((rebalance) => wanted.has(rebalance.slug))
    .map((rebalance) =>
      strategyItem(
        {
          slug: rebalance.slug,
          name: rebalance.name,
          date: rebalance.date,
          publishedAt: rebalance.generated_at || null,
          added: rebalance.added.map((row) => row.symbol),
          removed: rebalance.removed.map((row) => row.symbol),
        },
        locked,
      ),
    )
    .filter((item): item is InboxItem => item !== null);
}

/* ── the weekly memo ────────────────────────────────────────────────────── */

/** The person's newest weekly memo (an older week opened again later is not news), when it was written in the window. */
export async function memoSource(uid: string, sinceDay: string): Promise<InboxItem[]> {
  const query = adminFirestore.collection(MEMO_COLLECTION).where("uid", "==", uid) as unknown as {
    select?: (fields: string[]) => { get(): Promise<{ docs: Array<{ data(): unknown }> }> };
    get(): Promise<{ docs: Array<{ data(): unknown }> }>;
  };
  // LocalDB reads only the fields named; Firebase (rollback) reads the whole memo.
  const fields = ["uid", "memo.weekKey", "memo.monday", "memo.writtenAt", "memo.topLine", "memo.view.headline"];
  const snap = localFirestoreFromEnv() && query.select ? await query.select(fields).get() : await query.get();
  type Row = { uid?: unknown; memo?: { weekKey?: unknown; monday?: unknown; writtenAt?: unknown; topLine?: unknown; view?: { headline?: unknown } | null } };
  const newest = snap.docs
    .map((doc) => doc.data() as Row)
    .filter((data) => data.uid === uid && data.memo && /^\d{4}-\d{2}-\d{2}$/.test(str(data.memo.monday)))
    .sort((a, b) => str(b.memo!.monday).localeCompare(str(a.memo!.monday)))[0];
  const memo = newest?.memo;
  const writtenAt = str(memo?.writtenAt);
  if (!memo || !writtenAt || (nyDay(writtenAt) ?? "") < sinceDay) return [];
  // The page's own twelve-word headline; memos written before it existed lead with the first sentence of the top line.
  const headline = str(memo.view?.headline) || (str(memo.topLine).split(/(?<=[.!?])\s/)[0] ?? "") || null;
  const item = memoItem({ weekKey: str(memo.weekKey), monday: str(memo.monday), writtenAt, headline });
  return item ? [item] : [];
}
