import { cache } from "react";

import { listJobs, listRuns } from "@/lib/agent-jobs-data";
import { hiddenTemplateIds, planMayRun, templateById } from "@/lib/agent-jobs";
import { runningBasketCount } from "@/lib/basket-agent/count";
import { moveReason } from "@/lib/briefing";
import { getDailyAnomalyTickers } from "@/lib/daily-anomalies";
import { etDayOf } from "@/lib/day-words";
import { moveStats } from "@/lib/earnings-season";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { limitFor } from "@/lib/entitlements";
import { canSeeLevels, viewerFromUserDoc, type Viewer } from "@/lib/entitlements-server";
import { filingChangesHref } from "@/lib/filing-changes/inbox";
import { getFilingChangesFor } from "@/lib/filing-changes/server";
import { recordLine } from "@/lib/filing-changes/words";
import { adminFirestore } from "@/lib/firebase-admin";
import { getInsiderBuys, getInsiderTrades } from "@/lib/follow";
import type { InsiderTrade } from "@/lib/follow-shared";
import { STEADY_CALLS_SINCE } from "@/lib/inbox/sources";
import { clustersFromBuys } from "@/lib/insider-clusters";
import { BENCHMARK_SYMBOL, loadDailySeries, loadNextEarnings, newYorkToday } from "@/lib/portfolio-data";
import type { DailySeries } from "@/lib/portfolio-shared";
import { candidates, pickProposals, waitingOf } from "@/lib/proposals";
import { listProposals, loadProposalInputs, readQuotes } from "@/lib/proposals-server";
import { moveLine } from "@/lib/move-line";
import { hasTitleCaseLeftover } from "@/lib/plain-copy";
import { isCircularReason } from "@/lib/reason-quality";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { readTheses } from "@/lib/thesis";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";

import { pickOffers } from "./agents";
import { callMix, decide, findingsFrom, pickFindings, PLAIN, type CallCode, type LookFacts, type LookStock, type PlainCall } from "./rank";
import { firstLookView, nextFirstLook, readFirstLook, type FirstLookAction } from "./state";
import type { AgentOffers, FindingQuote, FirstLookRun, FirstLookState, FirstLookView, ReasonAsk } from "./types";

/**
 * The first look's reads, every one a loader the app already has: the screener's calls and levels, the latest quotes,
 * the steady calls' change lists, the earnings calendar and each stock's past reports, the stored daily closes with
 * the researched movers feed, the filing comparisons, the Form 4 trades, and the proposals the agent's sync would
 * draft now (built from its inputs, never stored here). Each read has its own time limit inside one deadline, so the
 * run ends in about eight seconds at most; a slow or failed read leaves its findings out and the decision says when
 * that left too little. Never calls a model. The only writes are the person's own `first_look` field, on their tap.
 */

/** The whole run's deadline: past it, the findings go with what has arrived. */
export const RUN_DEADLINE_MS = 7500;
/** One read's limit. */
const READ_MS = 4500;
/** The extras behind a read (a report's history) get what is left, at most this. */
const EXTRA_MS = 2500;
/** Most stocks read: holdings first. Past this the list is someone's whole watchlist. */
const MAX_STOCKS = 60;
const CHANGE_DAYS = 14;
const FILING_DAYS = 30;
const INSIDER_DAYS = 30;
const INSIDER_MIN_BUY = 25_000;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

type Timed<T> = { value: T | null; ok: boolean };

/** `work` within `ms` and before `deadline`; a slow or failed read is `{ ok: false }`, never thrown. */
function within<T>(work: () => Promise<T>, ms: number, deadline: number, label: string): Promise<Timed<T>> {
  const limit = Math.max(0, Math.min(ms, deadline - Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Timed<T>>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[first-look] ${label} took longer than ${limit}ms; left out`);
      resolve({ value: null, ok: false });
    }, limit);
  });
  const done = Promise.resolve()
    .then(work)
    .then(
      (value) => ({ value, ok: true }),
      (error) => {
        console.warn(`[first-look] ${label} failed; left out:`, error instanceof Error ? error.message : error);
        return { value: null, ok: false };
      },
    );
  return Promise.race([done, late]).finally(() => clearTimeout(timer));
}

function usTicker(instrumentId: string): string | null {
  return instrumentId.startsWith("US_") ? instrumentId.slice(3).replace(/_/g, ".").toUpperCase() : null;
}

/** The person's US stocks, holdings first, at most MAX_STOCKS. */
export function lookStocks(doc: Pick<UserDoc, "tracked_stocks" | "watchlist_positions" | "watchlist_holdings"> | null): LookStock[] {
  const tracked = Array.isArray(doc?.tracked_stocks) ? doc!.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const positions = (doc?.watchlist_positions ?? {}) as Record<string, string>;
  const holdings = (doc?.watchlist_holdings ?? {}) as Record<string, unknown>;
  const out: LookStock[] = [];
  const seen = new Set<string>();
  for (const id of tracked) {
    const ticker = usTicker(id.trim().toUpperCase());
    if (!ticker || seen.has(ticker) || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
    seen.add(ticker);
    out.push({ ticker, instrumentId: id, held: positions[id] === "holding" || (positions[id] === undefined && Boolean(holdings[id])) });
  }
  return out.sort((a, b) => Number(b.held) - Number(a.held)).slice(0, MAX_STOCKS);
}

/* ── the reads ──────────────────────────────────────────────────────────── */

/** Our call on each stock from its screener row, with only the level the call allows and only where the plan covers it. */
export function callsOf(rows: Map<string, ScreenerRow>, levels: (ticker: string) => boolean): LookFacts["calls"] {
  const out: LookFacts["calls"] = {};
  for (const [ticker, row] of rows) {
    const call = row.call;
    if (call !== "Add" && call !== "Hold" && call !== "Trim") continue;
    const covered = levels(ticker);
    out[ticker] = {
      call,
      addBelow: covered && call === "Add" && fin(row.add_below) && row.add_below > 0 ? row.add_below : null,
      trimAbove: covered && call === "Trim" && fin(row.trim_above) && row.trim_above > 0 ? row.trim_above : null,
    };
  }
  return out;
}

/** The steady call's latest change on each stock in the last two weeks; the earlier call only where the plan covers it. */
async function callChanges(stocks: LookStock[], today: string, covered: (ticker: string) => boolean): Promise<LookFacts["callChanges"]> {
  if (stocks.length === 0) return {};
  const since = [shiftDay(today, -CHANGE_DAYS), STEADY_CALLS_SINCE].sort()[1]!;
  const collection = adminFirestore.collection("tm_call_stability");
  const snaps = await adminFirestore.getAll(...stocks.map((stock) => collection.doc(stock.instrumentId)), { fieldMask: ["changes"] });
  const out: LookFacts["callChanges"] = {};
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const ticker = stocks[index]!.ticker;
    const changes = (snap.data() as { changes?: unknown } | undefined)?.changes;
    if (!Array.isArray(changes)) return;
    for (const raw of changes as Array<Record<string, unknown>>) {
      const day = typeof raw?.date === "string" ? raw.date.slice(0, 10) : "";
      const to = PLAIN[String(raw?.to) as CallCode] as PlainCall | undefined;
      const from = PLAIN[String(raw?.from) as CallCode] as PlainCall | undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || day > today || !to || from === to) continue;
      const seen = out[ticker];
      if (!seen || day >= seen.day) out[ticker] = { day, from: covered(ticker) ? (from ?? null) : null, to };
    }
  });
  return out;
}

/** Reports in the next 14 days, each with its usual move on results when measured (inside what is left of the budget). */
async function reports(tickers: string[], today: string, deadline: number): Promise<LookFacts["reports"]> {
  const calendar = await loadNextEarnings(today);
  const end = shiftDay(today, 14);
  const picked = tickers
    .map((ticker) => ({ ticker, next: calendar.get(ticker) }))
    .filter((row): row is { ticker: string; next: { date: string; time: "bmo" | "amc" | "during" | null } } => Boolean(row.next) && row.next!.date >= today && row.next!.date <= end);
  if (picked.length === 0) return [];
  const histories = await within(() => loadTickerEarnings(picked.map((row) => row.ticker), today), EXTRA_MS, deadline, "report history");
  const out: LookFacts["reports"] = [];
  for (const row of picked) {
    const loaded = histories.value?.get(row.ticker);
    // A fund has no reports; the calendar sometimes lists one anyway.
    if (loaded?.fund) continue;
    // Already out before today's open is a result, not prep.
    if (row.next.date === today && row.next.time === "bmo") continue;
    const stats = loaded?.history ? moveStats(loaded.history.past, loaded.history.typicalDayPct) : null;
    out.push({ ticker: row.ticker, date: row.next.date, session: row.next.time, usualPct: stats?.usual ?? null });
  }
  return out;
}

/** Five sessions back from the newest close, against the S&P 500 over the same days. */
export function weekMoveOf(series: DailySeries | undefined, benchmark: DailySeries | undefined): { pct: number; from: string; to: string; marketPct: number | null } | null {
  if (!series || series.closes.length < 6) return null;
  const last = series.closes.length - 1;
  const end = series.closes[last]!;
  const start = series.closes[last - 5]!;
  if (!fin(end) || !fin(start) || start <= 0) return null;
  const from = series.dates[last - 5]!;
  const to = series.dates[last]!;
  let marketPct: number | null = null;
  if (benchmark) {
    const a = benchmark.dates.indexOf(from);
    const b = benchmark.dates.indexOf(to);
    if (a >= 0 && b > a && fin(benchmark.closes[a]) && fin(benchmark.closes[b]) && benchmark.closes[a]! > 0) marketPct = (benchmark.closes[b]! / benchmark.closes[a]! - 1) * 100;
  }
  return { pct: (end / start - 1) * 100, from, to, marketPct };
}

/** A series whose newest close is older than this is not this week's news (a halted or delisted stock). */
const STALE_CLOSE_DAYS = 5;

async function weekMoves(tickers: string[], today: string, deadline: number): Promise<{ moves: LookFacts["weekMoves"]; ok: boolean }> {
  const [series, anomalies] = await Promise.all([
    within(() => loadDailySeries([...tickers, BENCHMARK_SYMBOL]), READ_MS, deadline, "closes"),
    within(() => getDailyAnomalyTickers("US", tickers), READ_MS, deadline, "move reasons"),
  ]);
  const moves: LookFacts["weekMoves"] = {};
  const benchmark = series.value?.get(BENCHMARK_SYMBOL);
  for (const ticker of tickers) {
    const move = weekMoveOf(series.value?.get(ticker), benchmark);
    if (!move || move.to < shiftDay(today, -STALE_CLOSE_DAYS)) continue;
    const anomaly = anomalies.value?.get(ticker) ?? null;
    let reason: string | null = null;
    if (anomaly) {
      const day = etDayOf(anomaly.price_as_of ?? anomaly.narrative_as_of ?? null);
      const read = moveReason(anomaly);
      // A confirmed reason from inside the five sessions that names a cause (not the move said again), else nothing.
      if (day && day > move.from && day <= move.to && read.status === "confirmed" && read.headline && !isCircularReason(read.headline, ticker, anomaly.name) && Number.isFinite(anomaly.day_change_pct)) {
        // In plain sentence case (a feed headline arrives in Title Case), and only when that worked (owner rule 8).
        const said = moveLine(anomaly).trim();
        if (said && !hasTitleCaseLeftover(said, anomaly.name)) reason = said;
      }
    }
    moves[ticker] = { pct: move.pct, to: move.to, marketPct: move.marketPct, reason };
  }
  return { moves, ok: series.ok };
}

async function filings(tickers: string[], today: string): Promise<LookFacts["filings"]> {
  const since = shiftDay(today, -FILING_DAYS);
  const out: LookFacts["filings"] = [];
  for (const doc of await getFilingChangesFor(tickers)) {
    for (const comparison of [doc.latest, ...doc.history]) {
      if (comparison.status !== "changes" || comparison.filing.filed < since) continue;
      const line = recordLine(doc.ticker, comparison);
      if (!line) continue;
      out.push({
        ticker: doc.ticker,
        form: comparison.filing.form,
        filed: comparison.filing.filed.slice(0, 10),
        added: comparison.added.length,
        dropped: comparison.dropped.length,
        line,
        href: filingChangesHref(doc.ticker),
      });
    }
  }
  return out;
}

/** "the CEO" for one buyer with a short title; null otherwise (lib/portfolio-home/stocks-server.ts). */
function whoOf(roles: Set<string>, people: number): string | null {
  const role = people === 1 && roles.size === 1 ? [...roles][0]! : null;
  return role && role.length <= 24 && !/,/.test(role) ? `the ${/^[A-Z]{2,5}$/.test(role) ? role : role.toLowerCase()}` : null;
}

/** Insider clusters (three or more people within 30 days, buying or selling) and big single buys, planned trades left out. */
export function insiderRows(trades: { buys: InsiderTrade[]; all: InsiderTrade[] }, tickers: Set<string>, today: string): LookFacts["insiders"] {
  const since = shiftDay(today, -INSIDER_DAYS);
  const unplanned = (trade: InsiderTrade) => !trade.plan_10b5_1 && tickers.has(trade.symbol.toUpperCase());
  const out: LookFacts["insiders"] = [];
  const clustered = new Set<string>();
  for (const cluster of clustersFromBuys(trades.buys.filter(unplanned), today)) {
    clustered.add(cluster.symbol.toUpperCase());
    out.push({ ticker: cluster.symbol.toUpperCase(), side: "buy", people: cluster.insiders, value: cluster.total_value, day: cluster.last_date, who: null });
  }
  // Selling clusters: the same rule over sales (clustersFromBuys reads buys, so sales go in marked as such).
  const sales = trades.all.filter((trade) => trade.tx_type === "sell" && unplanned(trade)).map((trade) => ({ ...trade, tx_type: "buy" as const }));
  for (const cluster of clustersFromBuys(sales, today)) {
    out.push({ ticker: cluster.symbol.toUpperCase(), side: "sell", people: cluster.insiders, value: cluster.total_value, day: cluster.last_date, who: null });
  }
  // One sizeable buy on a stock without a cluster.
  const single = new Map<string, { value: number; day: string; people: Set<string>; roles: Set<string> }>();
  for (const trade of trades.buys) {
    const ticker = trade.symbol.toUpperCase();
    const day = (trade.transaction_date || "").slice(0, 10);
    if (!unplanned(trade) || clustered.has(ticker) || trade.tx_type !== "buy" || day < since || day > today || !fin(trade.value) || trade.value < INSIDER_MIN_BUY) continue;
    const entry = single.get(ticker) ?? { value: 0, day, people: new Set<string>(), roles: new Set<string>() };
    entry.value += trade.value;
    if (day > entry.day) entry.day = day;
    entry.people.add(trade.insider_id || trade.insider);
    if (trade.role) entry.roles.add(trade.role.trim());
    single.set(ticker, entry);
  }
  for (const [ticker, entry] of single) out.push({ ticker, side: "buy", people: entry.people.size, value: entry.value, day: entry.day, who: whoOf(entry.roles, entry.people.size) });
  return out;
}

/* ── the run ────────────────────────────────────────────────────────────── */

/** How many sources the run reads, for the decision's "could not read most" check. */
const SOURCES = 9;

async function runFirstLook(uid: string, now: Date): Promise<FirstLookRun> {
  const started = Date.now();
  const deadline = started + RUN_DEADLINE_MS;
  const doc = await getUserDoc(uid).catch(() => null);
  const viewer: Viewer = viewerFromUserDoc(uid, doc);
  const today = newYorkToday(now);
  const stocks = lookStocks(doc);
  const tickers = stocks.map((stock) => stock.ticker);
  const levels = (ticker: string) => canSeeLevels(viewer, `US_${ticker}`);
  const missing: string[] = [];
  const note = <T,>(name: string, result: Timed<T>): T | null => {
    if (!result.ok) missing.push(name);
    return result.value;
  };

  const [quotes, rows, changes, upcoming, moves, filingRows, insiderTrades, proposalInputs, stored] = await Promise.all([
    within(() => readQuotes(stocks), READ_MS, deadline, "quotes"),
    within(() => getScreenerRows(tickers), READ_MS, deadline, "calls"),
    within(() => callChanges(stocks, today, levels), READ_MS, deadline, "call changes"),
    within(() => reports(tickers, today, deadline), READ_MS + EXTRA_MS, deadline, "reports"),
    within(() => weekMoves(tickers, today, deadline), READ_MS + 500, deadline, "moves"),
    within(() => filings(tickers, today), READ_MS, deadline, "filings"),
    within(() => Promise.all([getInsiderBuys(400), getInsiderTrades(1500)]), READ_MS, deadline, "insiders"),
    // The proposals' own reads each have a 2.5s limit (lib/proposals-server.ts); this keeps a stuck one off the run.
    within(() => loadProposalInputs(uid, doc, now), READ_MS + 1000, deadline, "proposals"),
    // What Needs you holds now: with the drafts, what it will show on this page.
    within(() => listProposals(uid), READ_MS, deadline, "waiting proposals"),
  ]);

  const screener = note("calls", rows) ?? new Map<string, ScreenerRow>();
  const prices: Record<string, FindingQuote> = {};
  for (const [ticker, quote] of Object.entries(note("quotes", quotes) ?? {})) prices[ticker] = { price: quote.price, dayPct: quote.dayPct };
  // A stock without a latest quote takes its screener price, so every card still shows a price.
  for (const [ticker, row] of screener) if (!prices[ticker] && fin(row.price) && row.price > 0) prices[ticker] = { price: row.price, dayPct: fin(row.day_pct) ? row.day_pct : null };
  const movesRead = note("moves", moves);
  if (movesRead && !movesRead.ok) missing.push("closes");
  const inputs = note("proposals", proposalInputs)?.inputs ?? null;
  const drafts = inputs ? candidates(inputs) : [];
  const existing = note("waiting proposals", stored) ?? [];
  // Needs you after this visit's sync: the waiting ones it keeps, and the new ones it would store (lib/proposals.ts).
  const picked = pickProposals(drafts, existing, now);
  const setAside = new Set(picked.outranked.map((proposal) => proposal.id));
  const needsYou = [...waitingOf(existing, now).filter((proposal) => !setAside.has(proposal.id)), ...picked.fresh].map((proposal) => ({ kind: proposal.kind, ticker: proposal.ticker }));
  const trades = note("insiders", insiderTrades);

  const facts: LookFacts = {
    today,
    stocks,
    calls: callsOf(screener, levels),
    callChanges: note("call changes", changes) ?? {},
    quotes: prices,
    reports: note("reports", upcoming) ?? [],
    weekMoves: movesRead?.moves ?? {},
    filings: note("filings", filingRows) ?? [],
    insiders: trades ? insiderRows({ buys: trades[0], all: trades[1] }, new Set(tickers), today) : [],
    results: (inputs?.results ?? []).map((read) => ({ ticker: read.ticker, reportDate: read.reportDate, movePct: read.movePct, moveSession: read.moveSession ?? null, epsVerdict: read.epsVerdict, epsSurprisePct: read.epsSurprisePct })),
    needsYou,
    proposals: inputs
      ? drafts.map((draft) => ({
          kind: draft.kind,
          ticker: draft.ticker,
          priority: draft.priority,
          why: draft.why[0] ?? null,
          figure: draft.figures[0]?.value ?? null,
          at: draft.event.at ?? null,
          href: draft.read.find((source) => source.href)?.href ?? null,
        }))
      : [],
  };

  const ranked = findingsFrom(facts);
  const findings = pickFindings(ranked);
  const decision = decide({ shown: findings, stocks: stocks.length, complete: missing.length === 0, missing: missing.length, sources: SOURCES });
  const names: Record<string, string> = {};
  for (const [ticker, row] of screener) if (row.name) names[ticker] = row.name;
  const ms = Date.now() - started;
  console.info(`[first-look] ${stocks.length} stocks, ${findings.length} findings, ${ms}ms${missing.length ? `, left out: ${missing.join(", ")}` : ""}`);
  const caught = ranked.flatMap((finding) => [finding.ticker, ...(finding.also ?? [])].map((ticker) => ({ kind: finding.kind, ticker })));
  return { stocks: stocks.length, findings, caught, decision, quotes: prices, calls: callMix(facts.calls), complete: missing.length === 0, missing, ms, today, names };
}

/** One run per request: the findings and the agent offers read the same one. */
export const loadFirstLook = cache((uid: string): Promise<FirstLookRun> => runFirstLook(uid, new Date()));

/* ── the agents ─────────────────────────────────────────────────────────── */

/** The agents to offer, against the plan's running limit (jobs and idea-basket agents together). */
export async function loadAgentOffers(uid: string, run: FirstLookRun | null): Promise<AgentOffers> {
  const doc = await getUserDoc(uid).catch(() => null);
  const viewer = viewerFromUserDoc(uid, doc);
  // Bounded like the run's reads: a stuck store leaves the offers out, never the panel waiting.
  const deadline = Date.now() + READ_MS;
  const [jobsRead, basketsRead] = await Promise.all([within(() => listJobs(uid), READ_MS, deadline, "agents"), within(() => runningBasketCount(uid), READ_MS, deadline, "basket agents")]);
  // Without the counts the room cannot be known: offer nothing rather than past the limit.
  if (!jobsRead.ok || !basketsRead.ok) return { offers: [], limitNote: null };
  const jobs = jobsRead.value ?? [];
  const baskets = basketsRead.value ?? 0;
  return pickOffers({
    plan: viewer.plan,
    limit: limitFor("agents", viewer.plan),
    running: jobs.filter((job) => job.enabled).length + baskets,
    existing: jobs.map((job) => ({ id: job.id, template: job.template, enabled: job.enabled, created_at: job.created_at })),
    since: readFirstLook(doc)?.started_at ?? null,
    hidden: hiddenTemplateIds(),
    mayRun: (template) => {
      const found = templateById(template);
      return Boolean(found) && planMayRun(found!.defaults, viewer.plan);
    },
    findings: run?.caught ?? [],
  });
}

/* ── the reason to ask for ──────────────────────────────────────────────── */

/**
 * Their holdings largest first (shares times the latest price, else the stored value, else the order they were added)
 * that have no reason saved yet; empty when every one has, or when they hold nothing.
 */
export function reasonAsks(doc: UserDoc | null, quotes: Record<string, FindingQuote>, names: Record<string, string>): ReasonAsk[] {
  const saved = readTheses((doc as { theses?: unknown } | null)?.theses);
  const stocks = lookStocks(doc);
  const holdings = (doc?.watchlist_holdings ?? {}) as Record<string, { quantity?: unknown; market_value?: unknown } | undefined>;
  const held = stocks.filter((stock) => stock.held);
  // Holdings only: "Why do you own X?" is never asked about a stock they only watch. Never one with a reason.
  const pool = held.filter((stock) => !saved[stock.instrumentId]);
  const size = (stock: LookStock): number => {
    const holding = holdings[stock.instrumentId];
    const price = quotes[stock.ticker]?.price;
    if (fin(holding?.quantity) && fin(price)) return holding!.quantity as number * price;
    return fin(holding?.market_value) ? (holding!.market_value as number) : 0;
  };
  return pool
    .map((stock, index) => ({ stock, size: size(stock), index }))
    .sort((a, b) => b.size - a.size || a.index - b.index)
    .slice(0, 8)
    .map(({ stock }) => ({ instrument_id: stock.instrumentId, ticker: stock.ticker, name: names[stock.ticker] ?? null }));
}

/* ── where it lives ─────────────────────────────────────────────────────── */

/** How long the check for a first agent run may take before the panel shows anyway. */
const RUNS_MS = 1200;

/** Whether /agent shows the panel, the one-time offer, or nothing, for this person on this request (read once). */
export const firstLookViewFor = cache((uid: string | null, preview: boolean): Promise<FirstLookView> => viewFor(uid, preview, new Date()));

async function viewFor(uid: string | null, preview: boolean, now: Date): Promise<FirstLookView> {
  if (!uid) return { show: "none" };
  const doc = await getUserDoc(uid).catch(() => null);
  const state = readFirstLook(doc);
  const stocks = lookStocks(doc).length;
  // Only a started, open look needs the runs read: the preview and the offer never wait on it.
  const open = !preview && state && !state.dismissed_at;
  const lastRunAt = open
    ? (await within(() => listRuns(uid, 1), RUNS_MS, Date.now() + RUNS_MS, "runs")).value?.[0]?.ran_at ?? null
    : null;
  return firstLookView({ signedIn: true, stocks, state, preview, lastRunAt, now });
}

/**
 * Start or dismiss the person's first look: one field, `first_look`, merged into their own user doc in a transaction
 * (nothing else on the doc is touched). Start never restarts a look; dismiss never reopens one.
 */
export async function saveFirstLook(uid: string, action: FirstLookAction, source: FirstLookState["source"], now: Date = new Date()): Promise<FirstLookState | null> {
  if (!uid) throw new Error("saveFirstLook needs a uid");
  const ref = adminFirestore.collection("users").doc(uid);
  return adminFirestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw Object.assign(new Error("profile_not_ready"), { status: 409 });
    const current = readFirstLook(snap.data());
    const next = nextFirstLook(current, action, now, source);
    if (!next) return current;
    transaction.set(ref, { first_look: next }, { merge: true });
    return next;
  });
}
