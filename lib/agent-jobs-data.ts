/**
 * Store access for standing jobs: definitions in `tm_agent_jobs`, one run per
 * job per market day in `tm_agent_runs`. Both are keyed by the person's uid
 * (`{uid}__{jobId}` and `{uid}__{jobId}__{day}`), written additively, and
 * never hard deleted: removing a job archives it and keeps its run log.
 *
 * This module only talks to the store directly (no Next cache helpers), so the
 * runner script in `scripts/run-agent-jobs.ts` can use it outside the app.
 */

import { randomBytes } from "node:crypto";

import { loadFilingFacts, loadNewsFacts } from "@/lib/agent-events-data";
import { runningBasketCount } from "@/lib/basket-agent/count";
import { listEarningsDayReports } from "@/lib/earnings-day";
import type { EarningsReportFact } from "@/lib/earnings-day-agent";
import { earningsDayHref, toneOfGuidance, toneOfVerdict } from "@/lib/earnings-day-shared";
import { limitFor, systemPlanOf, type Plan } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { isCovered, viewerFromUserDoc } from "@/lib/entitlements-server";
import { callWord } from "@/lib/stock-chart";
import { getUserDoc, resolveIsSubscribed, type UserDoc } from "@/lib/watchlist";
import {
  AGENT_JOB_ID_RE,
  EMPTY_FACTS,
  MAX_JOBS_PER_USER,
  MAX_SCOPE_TICKERS,
  REPLAY_WEEKS,
  addDays,
  evaluateJob,
  jobDocId,
  planMayRun,
  PRO_EVENTS_PAUSED,
  replayJob,
  runDocId,
  isAgentCall,
  type AgentCall,
  type AgentCallChange,
  type AgentFacts,
  type AgentJob,
  type AgentJobDraft,
  type AgentReplay,
  type AgentRun,
  type AgentScope,
  type AgentTrigger,
} from "@/lib/agent-jobs";

export const AGENT_JOBS_COLLECTION = "tm_agent_jobs";
export const AGENT_RUNS_COLLECTION = "tm_agent_runs";
const HISTORY_SESSIONS = 70;
const CALENDAR_SYMBOL = "SPY";
const EVENT_LOOKBACK_DAYS = 7 * REPLAY_WEEKS + 12;
/** Headlines: the replay window plus ten sessions of "normal day" before its first day. */
const NEWS_REPLAY_DAYS = 7 * REPLAY_WEEKS + 18;
/** A live run only needs the last check's window and the ten sessions before it. */
const NEWS_RUN_DAYS = 21;
const MAX_RUNS_LISTED = 240;
/** A watchlist can be longer than a hand-picked list; past this the job says it was cut. */
export const MAX_WATCHLIST_TICKERS = 60;
const CLOSE_SETTLED_MINUTES_ET = 16 * 60 + 15;

/**
 * The last day whose closing price is final. During the session the price
 * history carries a bar for today that is still moving; a rule on "the close"
 * must not read it.
 */
export function lastSettledDay(now: Date = new Date()): string {
  const today = agentMarketDay(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute >= CLOSE_SETTLED_MINUTES_ET ? today : addDays(today, -1);
}

export class AgentJobError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    /** The entitlements feature behind a refusal, so the page can show its lock card. */
    public readonly feature: "agents" | "agent_events" | null = null,
  ) {
    super(message);
    this.name = "AgentJobError";
  }
}

/** The US Eastern calendar day: the day the market calls today. */
export function agentMarketDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* ── jobs ───────────────────────────────────────────────────────────────── */

function jobFromDoc(data: Record<string, unknown> | undefined, uid: string): AgentJob | null {
  if (!data || data.uid !== uid || !AGENT_JOB_ID_RE.test(text(data.id))) return null;
  const trigger = data.trigger as AgentJob["trigger"] | undefined;
  const scope = data.scope as AgentJob["scope"] | undefined;
  if (!trigger || typeof trigger !== "object" || !scope || typeof scope !== "object") return null;
  return {
    id: text(data.id),
    uid,
    template: text(data.template),
    name: text(data.name) || "Job",
    trigger,
    scope,
    mode: "tell_me",
    enabled: data.enabled === true,
    archived: data.archived === true,
    created_at: text(data.created_at),
    updated_at: text(data.updated_at),
    last_checked_day: text(data.last_checked_day) || null,
    last_close_seen: text(data.last_close_seen) || null,
    ...(data.calls_seen && typeof data.calls_seen === "object" ? { calls_seen: cleanCallsSeen(data.calls_seen) } : {}),
  };
}

function cleanCallsSeen(raw: unknown): Record<string, AgentCall> {
  const out: Record<string, AgentCall> = {};
  for (const [ticker, call] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (isAgentCall(call)) out[ticker.toUpperCase()] = call;
  return out;
}

/** Whether a job reads our calls: the sell zone and the call-change agent. */
export function watchesCalls(trigger: AgentTrigger | undefined): boolean {
  return (trigger?.type === "price" && trigger.rule === "enters_sell_zone") || (trigger?.type === "event" && trigger.event === "call_change");
}

export type StoredJob = AgentJob;

export async function listJobs(uid: string): Promise<StoredJob[]> {
  const snap = await adminFirestore.collection(AGENT_JOBS_COLLECTION).where("uid", "==", uid).get();
  return snap.docs
    .map((doc) => jobFromDoc(doc.data() as Record<string, unknown>, uid))
    .filter((job): job is StoredJob => job !== null && !job.archived)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getJob(uid: string, jobId: string): Promise<StoredJob | null> {
  if (!AGENT_JOB_ID_RE.test(jobId)) return null;
  const snap = await adminFirestore.collection(AGENT_JOBS_COLLECTION).doc(jobDocId(uid, jobId)).get();
  if (!snap.exists) return null;
  const job = jobFromDoc(snap.data() as Record<string, unknown>, uid);
  return job && !job.archived ? job : null;
}

/**
 * `runLimit` is how many jobs the account's plan may have switched on at once
 * (lib/entitlements.ts: `agents`). A job made past it, or one the plan cannot
 * run (`planMayRun`), is saved switched off, never discarded: the caller tells
 * the person it is paused and why.
 */
export async function createJob(
  uid: string,
  draft: AgentJobDraft,
  now = new Date(),
  runLimit = MAX_JOBS_PER_USER,
  plan: Plan = "pro",
): Promise<StoredJob> {
  const existing = await listJobs(uid);
  if (existing.length >= MAX_JOBS_PER_USER) {
    throw new AgentJobError(`You can have up to ${MAX_JOBS_PER_USER} jobs. Remove one to add another.`);
  }
  const stamp = now.toISOString();
  const job: StoredJob = {
    ...draft,
    id: randomBytes(8).toString("hex").slice(0, 12),
    uid,
    mode: "tell_me",
    // Idea-basket agents that are switched on count toward the same limit (lib/basket-agent).
    enabled: planMayRun(draft, plan) && existing.filter((job) => job.enabled).length + (await runningBasketCount(uid)) < runLimit,
    created_at: stamp,
    updated_at: stamp,
    last_checked_day: null,
    last_close_seen: null,
  };
  await adminFirestore.collection(AGENT_JOBS_COLLECTION).doc(jobDocId(uid, job.id)).set(job);
  return job;
}

export async function updateJob(
  uid: string,
  jobId: string,
  patch: { enabled?: boolean; archived?: boolean },
  now = new Date(),
  runLimit = MAX_JOBS_PER_USER,
  plan: Plan = "pro",
): Promise<StoredJob | null> {
  const job = await getJob(uid, jobId);
  if (!job) throw new AgentJobError("That job does not exist.", 404);
  if (patch.enabled === true && !job.enabled && !planMayRun(job, plan)) {
    throw new AgentJobError(PRO_EVENTS_PAUSED, 409, "agent_events");
  }
  if (patch.enabled === true && !job.enabled) {
    const running = (await listJobs(uid)).filter((other) => other.enabled && other.id !== jobId).length + (await runningBasketCount(uid));
    if (running >= runLimit) {
      throw new AgentJobError(
        runLimit === 1
          ? "Your plan runs one agent at a time. Pause the one that is running to run this one."
          : `Your plan runs ${runLimit} agents at a time. Pause another to run this one.`,
        409,
        "agents",
      );
    }
  }
  const update: Record<string, unknown> = { updated_at: now.toISOString() };
  if (typeof patch.enabled === "boolean") update.enabled = patch.enabled;
  if (patch.archived === true) {
    update.archived = true;
    update.enabled = false;
  }
  await adminFirestore.collection(AGENT_JOBS_COLLECTION).doc(jobDocId(uid, jobId)).set(update, { merge: true });
  return patch.archived === true ? null : { ...job, ...(update as Partial<StoredJob>) };
}

/* ── runs ───────────────────────────────────────────────────────────────── */

function runFromDoc(data: Record<string, unknown> | undefined, uid: string): AgentRun | null {
  if (!data || data.uid !== uid || !text(data.job_id) || !text(data.day)) return null;
  const decision = data.decision;
  if (decision !== "notify" && decision !== "nothing" && decision !== "could_not_check") return null;
  return {
    id: text(data.id),
    job_id: text(data.job_id),
    uid,
    job_name: text(data.job_name),
    day: text(data.day),
    ran_at: text(data.ran_at),
    decision,
    summary: text(data.summary),
    findings: Array.isArray(data.findings) ? (data.findings as AgentRun["findings"]) : [],
    checked: Array.isArray(data.checked) ? (data.checked as string[]).filter((line) => typeof line === "string") : [],
    latest_close: text(data.latest_close) || null,
    ...(data.counts && typeof data.counts === "object" ? { counts: data.counts as AgentRun["counts"] } : {}),
  };
}

/** A person's runs, newest first. */
export async function listRuns(uid: string, limit = MAX_RUNS_LISTED): Promise<AgentRun[]> {
  const snap = await adminFirestore.collection(AGENT_RUNS_COLLECTION).where("uid", "==", uid).get();
  return snap.docs
    .map((doc) => runFromDoc(doc.data() as Record<string, unknown>, uid))
    .filter((run): run is AgentRun => run !== null)
    .sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at))
    .slice(0, limit);
}

/* ── facts ──────────────────────────────────────────────────────────────── */

export type ResolvedScope = {
  tickers: string[];
  levels: AgentFacts["levels"];
  /** Company names by ticker from the person's list, as filed ("Meta Platforms, Inc."). Only for a signed-in person. */
  names?: Record<string, string>;
  /** Our call on each ticker, when asked for (`options.calls`). Null when the calls could not be read. */
  calls?: AgentFacts["calls"] | null;
};

/** "BRK.B" is filed as US_BRK_B. */
function instrumentIdOf(ticker: string): string {
  return `US_${ticker.toUpperCase().replace(/\./g, "_")}`;
}

/**
 * Our call on each ticker today and the changes it made (tm_call_stability, the call people see), plus its kept
 * levels for the ones the plan covers and the person's list did not already give. The call itself is free; the
 * earlier call and the reason are left out (`locked`) where the plan does not cover the stock, as in the inbox.
 * Null when the store could not be read, so a run says "could not check" rather than "nothing changed".
 */
async function loadCalls(
  tickers: string[],
  idOf: (ticker: string) => string,
  covered: (id: string) => boolean,
  levels: AgentFacts["levels"],
  stances: Map<string, AgentCall>,
): Promise<AgentFacts["calls"] | null> {
  if (tickers.length === 0) return {};
  const collection = adminFirestore.collection("tm_call_stability");
  const snaps = await adminFirestore.getAll(...tickers.map((ticker) => collection.doc(idOf(ticker)))).catch(() => null);
  if (!snaps) return null;
  const calls: NonNullable<AgentFacts["calls"]> = {};
  tickers.forEach((ticker, index) => {
    const snap = snaps[index];
    const open = covered(idOf(ticker));
    const data = snap?.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
    const changes: AgentCallChange[] = [];
    for (const raw of Array.isArray(data?.changes) ? (data!.changes as Array<Record<string, unknown>>) : []) {
      const date = text(raw?.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isAgentCall(raw?.to)) continue;
      changes.push({ date, from: isAgentCall(raw?.from) ? raw.from : null, to: raw.to, reason: open ? text(raw?.reason) || null : null });
    }
    changes.sort((a, b) => a.date.localeCompare(b.date));
    const call = isAgentCall(data?.call) ? data!.call : stances.get(ticker) ?? null;
    calls[ticker] = { call, changes, ...(open ? {} : { locked: true as const }) };
    // A stock named outright that is not on the person's list: its levels come from the call's own state.
    if (!levels[ticker]) {
      const kept = (data?.levels ?? null) as { accumulate_below?: unknown; trim_above?: unknown } | null;
      const add = finite(kept?.accumulate_below);
      const trim = finite(kept?.trim_above);
      levels[ticker] = open ? { add_below: add != null && add > 0 ? add : null, trim_above: trim != null && trim > 0 ? trim : null } : { add_below: null, trim_above: null, locked: true };
    }
  });
  return calls;
}

/**
 * The tickers a scope means for this person right now, with add levels from
 * their research rows. Levels are only filled for stocks the agent covers for
 * this account (Pro: every stock; Free: the covered few), the rule the personal
 * briefing uses (isCovered). Unlike the public stock page (canSeeLevels), the
 * showcase stocks are not opened here: an agent is personal work. An uncovered
 * stock carries `locked` and no numbers, so neither the page, a run, nor an
 * email can name its level.
 */
export async function resolveScope(
  uid: string | null,
  scope: AgentScope,
  options: {
    /** Also read our call on each ticker (agents that watch the call: watchesCalls). */
    calls?: boolean;
  } = {},
): Promise<ResolvedScope> {
  if (scope.kind === "any") return { tickers: [], levels: {} };
  const levels: AgentFacts["levels"] = {};
  let tickers: string[] = scope.kind === "tickers" ? scope.tickers.slice(0, MAX_SCOPE_TICKERS) : [];
  // Signed out (a replay on the page): the call is free, its levels are not.
  if (!uid) return options.calls ? { tickers, levels, calls: await loadCalls(tickers, instrumentIdOf, () => false, levels, new Map()) } : { tickers, levels };

  const [userSnap, viewSnap] = await adminFirestore.getAll(
    adminFirestore.collection("users").doc(uid),
    adminFirestore.collection("tm_watchlist_views").doc(uid),
  );
  const tracked = userSnap.exists
    ? ((userSnap.data()?.tracked_stocks as unknown[]) ?? []).filter((id): id is string => typeof id === "string")
    : [];
  const rows = viewSnap.exists ? ((viewSnap.data()?.rows as Array<Record<string, unknown>>) ?? []) : [];
  const viewer = viewerFromUserDoc(uid, userSnap.exists ? ({ ...(userSnap.data() as Record<string, unknown>), uid } as UserDoc) : null);
  const tickerById = new Map<string, string>();
  const names: Record<string, string> = {};
  const stances = new Map<string, AgentCall>();
  for (const row of rows) {
    const ticker = text(row.ticker).toUpperCase();
    const id = text(row.instrument_id);
    if (!ticker) continue;
    if (id) tickerById.set(id, ticker);
    const name = text(row.instrument_name);
    if (name) names[ticker] = name;
    const directive = (row.directive_v2 ?? row.ai_directive) as { stance?: unknown; zones?: { accumulate_below?: unknown; trim_above?: unknown } } | undefined;
    const stance = callWord(text(directive?.stance));
    if (stance) stances.set(ticker, stance);
    if (!isCovered(viewer, id || ticker)) {
      levels[ticker] = { add_below: null, trim_above: null, locked: true };
      continue;
    }
    const addBelow = finite(directive?.zones?.accumulate_below);
    const trimAbove = finite(directive?.zones?.trim_above);
    levels[ticker] = {
      add_below: addBelow != null && addBelow > 0 ? addBelow : null,
      trim_above: trimAbove != null && trimAbove > 0 ? trimAbove : null,
    };
  }
  if (scope.kind === "watchlist") {
    tickers = tracked
      // US names only: the price history and the filings are US.
      .filter((id) => id.startsWith("US_"))
      .map((id) => tickerById.get(id) ?? id.replace(/^US_/, ""))
      .filter((ticker, index, list) => ticker && list.indexOf(ticker) === index)
      .slice(0, MAX_WATCHLIST_TICKERS);
  }
  if (!options.calls) return { tickers, levels, names };
  const idByTicker = new Map([...tickerById].map(([id, ticker]) => [ticker, id]));
  const idOf = (ticker: string) => idByTicker.get(ticker) ?? instrumentIdOf(ticker);
  const calls = await loadCalls(tickers, idOf, (id) => isCovered(viewer, id), levels, stances);
  return { tickers, levels, names, calls };
}

async function loadPrices(tickers: string[], end: string): Promise<{ prices: AgentFacts["prices"]; calendar: string[] }> {
  // Price documents are large, so they are read a few at a time.
  const symbols = [...new Set([...tickers, CALENDAR_SYMBOL])];
  const prices: AgentFacts["prices"] = {};
  let calendar: string[] = [];
  if (symbols.length === 0) return { prices, calendar };
  const snaps = [];
  for (let start = 0; start < symbols.length; start += 20) {
    snaps.push(
      ...(await adminFirestore.getAll(
        ...symbols.slice(start, start + 20).map((symbol) => adminFirestore.collection("tm_price_history_daily").doc(symbol)),
      )),
    );
  }
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data() as { dates?: unknown; closes?: unknown };
    const dates = Array.isArray(data.dates) ? (data.dates as string[]) : [];
    const closes = Array.isArray(data.closes) ? (data.closes as number[]) : [];
    const size = Math.min(dates.length, closes.length);
    let last = size;
    while (last > 0 && dates[last - 1] > end) last -= 1;
    const start = Math.max(0, last - HISTORY_SESSIONS);
    const series = { dates: dates.slice(start, last), closes: closes.slice(start, last) };
    const symbol = symbols[index];
    if (symbol === CALENDAR_SYMBOL) calendar = series.dates;
    if (tickers.includes(symbol)) prices[symbol] = series;
  });
  return { prices, calendar };
}

const collectionReads = new Map<string, { at: number; value: Promise<Array<Record<string, unknown>> | null> }>();

/**
 * A whole small collection. The runner checks every job in turn and each one
 * needs the same congressional, 13F and insider rows, so a read is shared for
 * a few minutes instead of repeated per job. A failed read is not kept.
 */
async function loadCollection(name: string, limit = 2000): Promise<Array<Record<string, unknown>> | null> {
  const key = `${name}:${limit}`;
  const hit = collectionReads.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = adminFirestore
    .collection(name)
    .limit(limit)
    .get()
    .then((snap) => snap.docs.map((doc) => doc.data() as Record<string, unknown>))
    .catch(() => null);
  collectionReads.set(key, { at: Date.now(), value });
  value.then((rows) => {
    if (rows == null) collectionReads.delete(key);
  });
  return value;
}

async function loadEarnings(tickers: string[], from: string, to: string): Promise<AgentFacts["earnings"] | null> {
  try {
    const snap = await adminFirestore
      .collection("tm_earnings_events")
      .where("market", "==", "US")
      .where("event_date", ">=", from)
      .where("event_date", "<=", to)
      .get();
    const wanted = new Set(tickers);
    return snap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((event) => wanted.has(text(event.ticker).toUpperCase()))
      .map((event) => ({ ticker: text(event.ticker).toUpperCase(), date: text(event.event_date).slice(0, 10), time: text(event.time) || null }));
  } catch {
    return null;
  }
}

/** Earnings reports for these tickers (tm_earnings_day), as the "Earnings came out" agent reads them. */
async function loadEarningsReports(tickers: string[], from: string): Promise<EarningsReportFact[] | null> {
  try {
    const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
    const reports = await listEarningsDayReports(from);
    return reports
      .filter((report) => wanted.has(report.ticker))
      .map((report) => {
        const filedDay = report.filing?.filed_at
          ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(report.filing.filed_at))
          : report.event_date;
        const verdictTone = toneOfVerdict(report.eps?.verdict);
        return {
          ticker: report.ticker,
          date: report.event_date,
          filed_day: filedDay,
          title: report.read?.title ?? `${report.company} earnings`,
          headline: report.read?.headline ?? `${report.ticker} reported earnings.`,
          href: earningsDayHref(report.ticker, report.event_date),
          url: report.filing?.url ?? null,
          tone: verdictTone !== "flat" ? verdictTone : toneOfGuidance(report.guidance?.change),
        };
      });
  } catch {
    return null;
  }
}

async function loadMovers(): Promise<{ movers: AgentFacts["movers"]; days: string[] } | null> {
  try {
    const snap = await adminFirestore.collection("tm_daily_anomalies").doc("US__latest").get();
    if (!snap.exists) return null;
    const data = snap.data() as { date?: unknown; anomalies?: unknown };
    const date = text(data.date).slice(0, 10);
    if (!date || !Array.isArray(data.anomalies)) return null;
    const movers = (data.anomalies as Array<Record<string, unknown>>)
      .map((row) => {
        const explanation = (row.move_explanation ?? {}) as { headline?: unknown; evidence?: unknown; cause_type?: unknown };
        const sourced =
          row.narrative_status !== "unverified" &&
          Array.isArray(explanation.evidence) &&
          explanation.evidence.length > 0 &&
          text(explanation.cause_type).toLowerCase() !== "price_action";
        return {
          ticker: text(row.ticker).toUpperCase(),
          date,
          day_change_pct: finite(row.day_change_pct) ?? Number.NaN,
          reason: sourced ? text(explanation.headline) || null : null,
        };
      })
      .filter((row) => row.ticker && Number.isFinite(row.day_change_pct) && Math.abs(row.day_change_pct) <= 100);
    return { movers, days: [date] };
  } catch {
    return null;
  }
}

/**
 * Everything the evaluator may read for these tickers, up to `end`. With a
 * trigger, filings and headlines are only read for the jobs that use them;
 * without one (the page's "which sources are in" check) everything is read.
 * `purpose: "run"` reads only as much news history as a live check needs.
 */
export async function loadFacts(
  tickers: string[],
  options: {
    end: string;
    levels?: AgentFacts["levels"];
    /** Our calls, from resolveScope with `calls`: null when they could not be read, left out when not wanted. */
    calls?: AgentFacts["calls"] | null;
    now?: Date;
    trigger?: AgentTrigger;
    purpose?: "run" | "replay";
  },
): Promise<{ facts: AgentFacts; calendar: string[] }> {
  const from = addDays(options.end, -EVENT_LOOKBACK_DAYS);
  const settled = lastSettledDay(options.now ?? new Date());
  const event = options.trigger?.type === "event" ? options.trigger.event : null;
  const wantsFilings = !options.trigger || event === "sec_filing";
  const wantsNews = !options.trigger || event === "news";
  const pricesRead = loadPrices(tickers, options.end < settled ? options.end : settled);
  const filingsRead = wantsFilings ? loadFilingFacts(from) : Promise.resolve(null);
  const newsRead = wantsNews
    ? pricesRead.then(({ calendar }) =>
        loadNewsFacts(tickers, addDays(options.end, -(options.purpose === "run" ? NEWS_RUN_DAYS : NEWS_REPLAY_DAYS)), calendar),
      )
    : Promise.resolve(null);
  const [{ prices, calendar }, congressDocs, fundDocs, insiderDocs, earnings, movers, earningsReports, filings, news] = await Promise.all([
    pricesRead,
    loadCollection("tm_power_trades"),
    loadCollection("tm_follow_activity"),
    loadCollection("tm_insider_trades"),
    loadEarnings(tickers, from, addDays(options.end, 21)),
    loadMovers(),
    loadEarningsReports(tickers, from),
    filingsRead,
    newsRead,
  ]);

  const facts: AgentFacts = {
    ...EMPTY_FACTS,
    prices,
    levels: options.levels ?? {},
    earnings: earnings ?? [],
    congress: (congressDocs ?? [])
      .map((doc) => ({
        id: text(doc.trade_id),
        person: text(doc.person_name),
        ticker: text(doc.ticker).toUpperCase(),
        tx_type: text(doc.tx_type),
        amount_low: finite(doc.amount_low),
        amount_high: finite(doc.amount_high),
        disclosed: text(doc.disclosure_date).slice(0, 10),
        url: text(doc.source_url) || null,
      }))
      .filter((trade) => trade.id && trade.person && trade.ticker && trade.disclosed >= from),
    fund_filings: (fundDocs ?? [])
      .filter((doc) => text(doc.type) === "13f_filing")
      .map((doc) => ({
        id: text(doc.id),
        fund: text(doc.name),
        date: text(doc.date).slice(0, 10),
        headline: text(doc.headline),
        url: text(doc.url) || null,
        tickers: Array.isArray(doc.items)
          ? [...new Set((doc.items as Array<Record<string, unknown>>).map((item) => text(item.ticker).toUpperCase()).filter(Boolean))]
          : [],
      }))
      .filter((filing) => filing.id && filing.fund && filing.date >= from),
    insiders: (insiderDocs ?? [])
      .map((doc) => ({
        id: text(doc.id) || text(doc.trade_id),
        ticker: text(doc.ticker).toUpperCase(),
        person: text(doc.person) || text(doc.insider_name) || text(doc.name),
        role: text(doc.role) || text(doc.title) || null,
        tx_type: text(doc.tx_type) || text(doc.action),
        value: finite(doc.value) ?? finite(doc.amount),
        filed: (text(doc.filed_at) || text(doc.filing_date) || text(doc.date)).slice(0, 10),
        url: text(doc.url) || text(doc.source_url) || null,
      }))
      .filter((trade) => trade.id && trade.ticker && trade.person && trade.filed >= from),
    movers: movers?.movers ?? [],
    mover_days: movers?.days ?? [],
    earnings_reports: earningsReports ?? [],
    ...(filings ? { filings } : {}),
    ...(news ? { news } : {}),
    ...(options.calls ? { calls: options.calls } : {}),
    available: {
      congress: congressDocs != null && congressDocs.length > 0,
      fund_filings: (fundDocs ?? []).length > 0,
      insiders: (insiderDocs ?? []).length > 0,
      earnings: earnings != null,
      movers: movers != null,
      earnings_reports: earningsReports != null,
      ...(wantsFilings ? { filings: filings != null && filings.length > 0 } : {}),
      ...(wantsNews ? { news: news != null && news.coverage_from != null } : {}),
      ...(options.calls !== undefined ? { calls: options.calls != null } : {}),
    },
  };
  return { facts, calendar };
}

/* ── replay and run ─────────────────────────────────────────────────────── */

export type ReplayResult = AgentReplay & { tickers: string[]; available: AgentFacts["available"]; replayed_at: string };

/** Replay a draft over the last four weeks for this person. Reads only; writes nothing. */
export async function replayDraft(uid: string | null, draft: AgentJobDraft, now = new Date()): Promise<ReplayResult> {
  const end = agentMarketDay(now);
  const scope = await resolveScope(uid, draft.scope, { calls: watchesCalls(draft.trigger) });
  const { facts, calendar } = await loadFacts(scope.tickers, { end, levels: scope.levels, calls: scope.calls, now, trigger: draft.trigger, purpose: "replay" });
  // Replay through the last session whose close is final; today is still moving.
  const last = calendar[calendar.length - 1] ?? end;
  const replay = replayJob(draft, facts, { end: last, tickers: scope.tickers, calendar });
  return { ...replay, tickers: scope.tickers, available: facts.available, replayed_at: now.toISOString() };
}

export type RunOutcome =
  | { status: "recorded"; run: AgentRun }
  | { status: "already_ran"; run: AgentRun }
  | { status: "not_due" };

/**
 * Evaluate one job for today and record the decision. One run per job per
 * market day: a second call the same day returns the first run untouched.
 */
export async function runJob(job: StoredJob, now = new Date(), options: { dryRun?: boolean } = {}): Promise<RunOutcome> {
  const day = agentMarketDay(now);
  const runRef = adminFirestore.collection(AGENT_RUNS_COLLECTION).doc(runDocId(job.uid, job.id, day));
  const existing = await runRef.get();
  if (existing.exists) {
    const run = runFromDoc(existing.data() as Record<string, unknown>, job.uid);
    if (run) return { status: "already_ran", run };
  }

  const readsCalls = watchesCalls(job.trigger);
  const scope = await resolveScope(job.uid, job.scope, { calls: readsCalls });
  const { facts } = await loadFacts(scope.tickers, { end: day, levels: scope.levels, calls: scope.calls, now, trigger: job.trigger, purpose: "run" });
  const evaluation = evaluateJob(job, facts, {
    day,
    // Null on a first run: events dated today count, last week's do not, and an
    // earnings date already inside its window is still reported once.
    since: job.last_checked_day ?? null,
    // Null on a first run: the newest close is fair game, nothing has read it yet.
    price_since: job.last_close_seen ?? null,
    tickers: scope.tickers,
    // A live run of an agent that watches our call compares with what it last saw (empty on a first run).
    ...(readsCalls ? { calls_seen: job.calls_seen ?? {} } : {}),
  });
  if (!evaluation) return { status: "not_due" };

  const stamp = now.toISOString();
  const { calls_seen: callsSeen, ...result } = evaluation;
  const run: AgentRun = {
    ...result,
    latest_close: evaluation.latest_close ?? null,
    id: runDocId(job.uid, job.id, day),
    job_id: job.id,
    uid: job.uid,
    job_name: job.name,
    day,
    ran_at: stamp,
  };
  // A dry run reads and decides exactly as a real one, and writes nothing.
  if (options.dryRun) return { status: "recorded", run };
  await runRef.set(JSON.parse(JSON.stringify(run)));
  await adminFirestore
    .collection(AGENT_JOBS_COLLECTION)
    .doc(jobDocId(job.uid, job.id))
    .set(
      {
        last_checked_day: day,
        ...(evaluation.latest_close ? { last_close_seen: evaluation.latest_close } : {}),
        // Only the stocks in scope today: one that left the list and came back is read fresh, not against a months-old call.
        ...(callsSeen && Object.keys(callsSeen).length ? { calls_seen: callsSeen } : {}),
        updated_at: stamp,
      },
      { merge: true },
    );
  return { status: "recorded", run };
}

export type RunAllSummary = {
  day: string;
  jobs: number;
  recorded: number;
  already_ran: number;
  not_due: number;
  failed: number;
  /** Switched on but past the account's plan (a Pro that lapsed): left as they are, not run. */
  over_plan: number;
  decisions: Record<AgentRun["decision"], number>;
};

/**
 * Evaluate every enabled job once. Safe to run more than once a day. With
 * `dryRun` every job is read and decided the same way and nothing is written
 * ("recorded" then means "would record").
 */
export async function runAllEnabledJobs(
  now = new Date(),
  log: (line: string) => void = () => {},
  options: { dryRun?: boolean; /** Only this account's jobs (the example agents' setup script runs its own). */ onlyUid?: string } = {},
): Promise<RunAllSummary> {
  const snap = await adminFirestore.collection(AGENT_JOBS_COLLECTION).where("enabled", "==", true).get();
  const jobs = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return jobFromDoc(data, text(data.uid));
    })
    .filter((job): job is StoredJob => job !== null && !job.archived && job.enabled && (!options.onlyUid || job.uid === options.onlyUid));
  // The plan caps how many jobs run at once (lib/entitlements.ts: agents). The API enforces it when a job is
  // switched on; this covers accounts whose plan changed since, by running the oldest ones up to the limit.
  // Nothing is switched off or deleted here.
  const byUid = new Map<string, StoredJob[]>();
  for (const job of jobs) byUid.set(job.uid, [...(byUid.get(job.uid) ?? []), job]);
  const runnable: StoredJob[] = [];
  let overPlan = 0;
  for (const [uid, owned] of byUid) {
    // A system account (the example portfolio's agents) has no user doc; its plan is fixed in lib/entitlements.ts.
    const system = systemPlanOf(uid);
    const doc = system ? null : await getUserDoc(uid).catch(() => undefined);
    // If the account cannot be read, run its jobs: an outage should not silence anyone's agents.
    const plan: Plan = system ?? (doc === undefined ? "pro" : resolveIsSubscribed(doc) ? "pro" : "free");
    const limit = !system && doc === undefined ? Number.POSITIVE_INFINITY : limitFor("agents", plan);
    // Filing and news agents a plan cannot run (a lapsed Pro, or Free on the tighter line) wait, switched on, until it can.
    const allowed = owned.filter((job) => planMayRun(job, plan));
    const sorted = [...allowed].sort((a, b) => a.created_at.localeCompare(b.created_at));
    runnable.push(...sorted.slice(0, limit));
    overPlan += owned.length - allowed.length + Math.max(0, sorted.length - limit);
  }
  const summary: RunAllSummary = {
    day: agentMarketDay(now),
    jobs: jobs.length,
    recorded: 0,
    already_ran: 0,
    not_due: 0,
    failed: 0,
    over_plan: overPlan,
    decisions: { notify: 0, nothing: 0, could_not_check: 0 },
  };
  for (const job of runnable) {
    try {
      const outcome = await runJob(job, now, options);
      summary[outcome.status] += 1;
      if (outcome.status === "recorded") summary.decisions[outcome.run.decision] += 1;
      // Job ids only: a run log line must never carry a person's uid or email.
      const status = options.dryRun && outcome.status === "recorded" ? "would record" : outcome.status;
      log(`${job.id} ${status}${outcome.status === "not_due" ? "" : ` ${outcome.run.decision}`}`);
    } catch (error) {
      summary.failed += 1;
      log(`${job.id} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return summary;
}
