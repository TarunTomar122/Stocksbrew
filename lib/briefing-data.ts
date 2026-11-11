/**
 * Server loader for the Briefing: gathers what the store already holds, hands
 * it to the pure builder in `lib/briefing.ts`, and keeps one small document per
 * person per day in `tm_briefing_state` (what they dismissed or kept, plus the
 * briefing as it read, so earlier days can be opened again).
 *
 * Writes are additive and scoped to the signed-in person: the document id is
 * always `{uid}__{day}` with the uid taken from the verified session.
 */

import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { getSessionUser } from "@/lib/auth-server";
import {
  BRIEFING_DAY_RE,
  BRIEFING_ITEM_ID_RE,
  briefingWindow,
  buildBriefing,
  gateSavedBriefing,
  daysBetween,
  marketDay,
  seenKeys,
  type Briefing,
  type BriefingCallChange,
  type BriefingInput,
  type BriefingItemStatus,
  type BriefingPosition,
  type BriefingAgentRun,
  type BriefingStateMap,
  type BriefingTriggeredAlert,
  type BriefingUpcomingEarnings,
} from "@/lib/briefing";
import {
  attentionFromRadar,
  callChangeFromEvent,
  callChangesSince,
  callsOf,
  congressTradeFromDoc,
  discussionFromSnapshot,
  earningsReportFromDoc,
  indexFromHero,
  newsFromArticle,
  withMarketIndexFigures,
  positionFromRow,
  uncoveredPosition,
  triggeredAlertFromDoc,
} from "@/lib/briefing-inputs";
import { listRuns } from "@/lib/agent-jobs-data";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings, getNextEarningsCalendarEventCached } from "@/lib/earnings";
import { getLatestEarningsIntelForInstruments, listAllEarningsIntelDocs } from "@/lib/earnings-intel";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getHeroIndices } from "@/lib/hero-indices";
import { getMarketsData } from "@/lib/markets";
import { etDayOf, quoteDay } from "@/lib/benchmark-day";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { getNewsFeed } from "@/lib/news";
import { getPowerTradesCached } from "@/lib/power-trades";
import { getPreEarningsIntelForInstruments } from "@/lib/pre-earnings-intel";
import { getRedditCues, hasRedditBrief } from "@/lib/reddit-cues";
import { afterResponse } from "@/lib/after-response";
import { fingerprint, perUserCache } from "@/lib/per-user-cache";
import { sharedCache } from "@/lib/shared-cache";
import { getUserDoc } from "@/lib/watchlist";
import { isCovered, viewerFromUserDoc } from "@/lib/entitlements-server";
import {
  getRadarStockStates,
  getRadarUserView,
  getWatchlistView,
  isActiveRadarUserView,
  type WatchlistRow,
} from "@/lib/watchlist-view";

export const BRIEFING_STATE_COLLECTION = "tm_briefing_state";
const SNAPSHOT_REFRESH_MS = 20 * 60 * 1000;
const MAX_STATE_ITEMS = 300;
const EARNINGS_TIME_LOOKAHEAD_DAYS = 7;

export type BriefingStateDoc = {
  uid: string;
  date: string;
  items?: BriefingStateMap;
  /** The briefing as it read the last time it was opened that day. */
  snapshot?: Briefing;
  snapshot_built_at?: string;
  seen?: string[];
  calls?: Record<string, string>;
  updated_at?: string;
};

export type BriefingDayLink = { day: string; available: boolean };

export type BriefingViewer =
  | { kind: "signed_out" }
  /** Signed in, nothing tracked yet. */
  | { kind: "empty"; uid: string }
  /** Signed in with tracked names, but their research rows are not built yet. */
  | { kind: "pending"; uid: string; tracked: number }
  | { kind: "member"; uid: string };

export type BriefingPageData = {
  briefing: Briefing;
  viewer: BriefingViewer;
  state: BriefingStateMap;
  /** Today plus earlier days that have a saved briefing. Empty when there is no history. */
  days: BriefingDayLink[];
  /** True when `briefing` is a saved earlier day, shown as it read then. */
  archived: boolean;
  /** Set when the loader could not reach part of the data. */
  degraded: string[];
};

function stateRef(uid: string, day: string) {
  return adminFirestore.collection(BRIEFING_STATE_COLLECTION).doc(`${uid}__${day}`);
}

function cleanState(raw: unknown): BriefingStateMap {
  const out: BriefingStateMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!BRIEFING_ITEM_ID_RE.test(id) || !value || typeof value !== "object") continue;
    const entry = value as { status?: unknown; at?: unknown };
    if (entry.status !== "dismissed" && entry.status !== "kept" && entry.status !== "open") continue;
    out[id] = { status: entry.status, at: typeof entry.at === "string" ? entry.at : "" };
  }
  return out;
}

/**
 * Everything in a day's document but the saved briefing itself. The window
 * reads seven days on every open; the snapshots are whole briefings, so they
 * are only read for the one earlier day someone opens (`loadSavedBriefing`).
 */
const STATE_FIELDS = ["uid", "date", "items", "snapshot_built_at", "seen", "calls", "updated_at"];

/** The last seven days of this person's briefing documents, newest first, without their snapshots. */
async function loadStateDocs(uid: string, today: string): Promise<Map<string, BriefingStateDoc>> {
  const days = briefingWindow(today);
  const out = new Map<string, BriefingStateDoc>();
  if (days.length === 0) return out;
  const local = localFirestoreFromEnv();
  const snaps = local
    ? await local.getAllSelected(
        days.map((day) => local.collection(BRIEFING_STATE_COLLECTION).doc(`${uid}__${day}`)),
        STATE_FIELDS,
      )
    : await adminFirestore.getAll(...days.map((day) => stateRef(uid, day)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as BriefingStateDoc;
    // The id carries the uid, and the stored uid has to agree with it.
    if (!data || data.uid !== uid || !BRIEFING_DAY_RE.test(String(data.date))) continue;
    out.set(data.date, data);
  }
  return out;
}

/** Whether a day's document holds a saved briefing (saveSnapshot writes both fields together). */
function hasSavedBriefing(doc: BriefingStateDoc | undefined): boolean {
  return Boolean(doc && (typeof doc.snapshot_built_at === "string" || isBriefing(doc.snapshot)));
}

/** One earlier day's saved briefing, read in full when someone opens that day. */
async function loadSavedBriefing(uid: string, day: string): Promise<Briefing | null> {
  const snap = await stateRef(uid, day).get();
  const data = snap.exists ? (snap.data() as BriefingStateDoc) : null;
  if (!data || data.uid !== uid || data.date !== day) return null;
  return isBriefing(data.snapshot) ? data.snapshot : null;
}

/** Read one day of saved item state for the signed-in person. */
export async function readBriefingState(uid: string, day: string): Promise<BriefingStateMap> {
  const snap = await stateRef(uid, day).get();
  if (!snap.exists) return {};
  const data = snap.data() as BriefingStateDoc;
  return data?.uid === uid ? cleanState(data.items) : {};
}

export class BriefingStateError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "BriefingStateError";
  }
}

/**
 * Save one item's state for one day. Read-modify-write inside a transaction,
 * because the store replaces map fields whole and two quick taps must not
 * lose each other.
 */
export async function writeBriefingItemState(input: {
  uid: string;
  day: string;
  itemId: string;
  status: BriefingItemStatus;
  now?: Date;
}): Promise<BriefingStateMap> {
  const now = input.now ?? new Date();
  if (!BRIEFING_DAY_RE.test(input.day) || !briefingWindow(marketDay(now)).includes(input.day)) {
    throw new BriefingStateError("That day is outside the last seven days.");
  }
  if (!BRIEFING_ITEM_ID_RE.test(input.itemId) || !input.itemId.startsWith(`${input.day}_`)) {
    throw new BriefingStateError("That item does not belong to this day.");
  }
  if (input.status !== "dismissed" && input.status !== "kept" && input.status !== "open") {
    throw new BriefingStateError("Unknown status.");
  }

  const ref = stateRef(input.uid, input.day);
  return adminFirestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists ? (snap.data() as BriefingStateDoc) : null;
    if (existing && existing.uid !== input.uid) {
      throw new BriefingStateError("Not your briefing.", 403);
    }
    const items = cleanState(existing?.items);
    if (!(input.itemId in items) && Object.keys(items).length >= MAX_STATE_ITEMS) {
      throw new BriefingStateError("Too many saved items for one day.");
    }
    const stamp = now.toISOString();
    items[input.itemId] = { status: input.status, at: stamp };
    transaction.set(ref, { uid: input.uid, date: input.day, items, updated_at: stamp }, { merge: true });
    return items;
  });
}

/* ── shared market inputs ───────────────────────────────────────────────── */

type MarketInputs = Pick<
  BriefingInput,
  "movers" | "movers_date" | "movers_as_of" | "indices" | "congress_trades" | "discussion"
> & { degraded: string[] };

async function loadMarketInputs(): Promise<MarketInputs> {
  const degraded: string[] = [];
  const guard = <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch(() => {
      degraded.push(label);
      return fallback;
    });

  const [feed, indices, trades, reddit, markets] = await Promise.all([
    guard("movers", getDailyAnomalies("US"), null),
    guard("indices", getHeroIndices("US"), []),
    guard("congressional trades", getPowerTradesCached(30), null),
    guard("discussion", getRedditCues("US"), null),
    // Not a degraded source when it fails: the snapshot's index figures still stand.
    getMarketsData().catch(() => null),
  ]);

  return {
    movers: feed?.anomalies ?? [],
    movers_date: feed?.date ?? null,
    movers_as_of: feed?.generated_at ?? null,
    indices: withMarketIndexFigures(
      indices
        .map(indexFromHero)
        .filter((index): index is NonNullable<typeof index> => index !== null)
        // The briefing reads equity indices; volatility and commodities live on the market page.
        .filter((index) => index.name === "S&P 500" || index.name === "Nasdaq 100")
        .slice(0, 2),
      markets?.assets ?? [],
      // The New York day the movers are priced on (feed.date is a UTC date, a day ahead after 7 PM New York time).
      quoteDay((feed?.anomalies ?? []).map((item) => ({ price_at: item.price_as_of ?? undefined })), etDayOf(feed?.generated_at ?? null) ?? etDayOf(new Date().toISOString())),
    ),
    congress_trades: (trades?.trades ?? [])
      .map(congressTradeFromDoc)
      .filter((trade): trade is NonNullable<typeof trade> => trade !== null),
    discussion: discussionFromSnapshot(reddit, hasRedditBrief),
    degraded,
  };
}

/**
 * The names the market view follows for the week ahead: the largest and most
 * widely held US stocks. A fixed list on purpose, so the view never implies a
 * popularity ranking we do not measure.
 */
export const MARKET_VIEW_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "BRK.B", "JPM",
  "LLY", "V", "WMT", "XOM", "UNH", "MA", "COST", "NFLX", "HD", "AMD",
  "ORCL", "CRM", "BAC", "KO", "DIS", "PLTR", "MU", "INTC", "CSCO", "PFE",
] as const;

async function loadMarketUpcoming(today: string): Promise<BriefingUpcomingEarnings[]> {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + EARNINGS_TIME_LOOKAHEAD_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const wanted = new Set<string>(MARKET_VIEW_TICKERS);
  const events = await getEarnings("US", today, until);
  return events
    .filter((event) => wanted.has(event.ticker?.toUpperCase()))
    .map((event) => ({
      ticker: event.ticker.toUpperCase(),
      name: event.company || event.ticker,
      date: event.event_date.slice(0, 10),
      time: event.time === "bmo" || event.time === "amc" ? event.time : null,
    }));
}

async function loadAgentRuns(uid: string): Promise<BriefingAgentRun[]> {
  const runs = await listRuns(uid, 60);
  return runs
    .filter((run) => run.decision === "notify")
    .map((run) => ({
      job_id: run.job_id,
      job_name: run.job_name,
      day: run.day,
      ran_at: run.ran_at,
      summary: run.summary,
      findings: run.findings,
    }));
}

type MarketBuild = { briefing: Briefing; degraded: string[]; /** False when a read the page does not flag (reports, calendar) failed. */ complete: boolean };

async function buildMarketBriefing(now: Date): Promise<MarketBuild> {
  let complete = true;
  const missed = <T,>(fallback: T) => () => {
    complete = false;
    return fallback;
  };
  const [market, reports, upcoming] = await Promise.all([
    loadMarketInputs(),
    listAllEarningsIntelDocs().catch(missed([])),
    loadMarketUpcoming(marketDay(now)).catch(missed([] as BriefingUpcomingEarnings[])),
  ]);
  const { degraded, ...inputs } = market;
  const briefing = buildBriefing({
    ...inputs,
    date: marketDay(now),
    now: now.toISOString(),
    mode: "market",
    positions: [],
    earnings_reports: reports
      .filter((doc) => doc.market === "US")
      .map(earningsReportFromDoc)
      .filter((report): report is NonNullable<typeof report> => report !== null),
    news: [],
    alerts: [],
    call_changes: [],
    attention: [],
    upcoming_earnings: upcoming,
  });
  return { briefing, degraded, complete };
}

/** Thrown inside the cache so a build missing a source is never kept; carries the build so it is not redone. */
class IncompleteMarketBuild extends Error {
  declare readonly build: MarketBuild;
  constructor(build: MarketBuild) {
    super("market briefing built without every source");
    // Not enumerable, so Next's log line for a failed background refresh stays one line.
    Object.defineProperty(this, "build", { value: build, enumerable: false });
  }
}

/**
 * The market view is the same for everyone (signed out, and signed in with nothing tracked or not built yet), so
 * it is built once a minute per market day and shared, like the cached signed-out page. Without this every
 * signed-in market view read the whole earnings-report collection (~1-2MB) and an uncached calendar query.
 */
const marketBriefingCached = sharedCache(
  async (_day: string): Promise<MarketBuild> => {
    const build = await buildMarketBriefing(new Date());
    if (build.degraded.length > 0 || !build.complete) throw new IncompleteMarketBuild(build);
    return build;
  },
  ["briefing-market-v1"],
  { revalidate: 60 },
);

/** How old a shared market build may be. unstable_cache serves a stale entry however old it is (and refreshes it behind). */
const MARKET_BUILD_MAX_AGE_MS = 3 * 60_000;

async function marketBriefing(now: Date): Promise<MarketBuild> {
  try {
    const build = await marketBriefingCached(marketDay(now));
    const age = now.getTime() - Date.parse(build.briefing.built_at);
    // A copy from before the market day turned, or left over from a quiet stretch, is built again here.
    if (build.briefing.date === marketDay(now) && age >= -60_000 && age < MARKET_BUILD_MAX_AGE_MS) return build;
  } catch (error) {
    if (error instanceof IncompleteMarketBuild) return error.build;
  }
  return buildMarketBriefing(now);
}

/* ── per-person inputs ──────────────────────────────────────────────────── */

async function loadTriggeredAlerts(uid: string): Promise<BriefingTriggeredAlert[]> {
  const snap = await adminFirestore.collection("tm_alerts").where("uid", "==", uid).get();
  return snap.docs
    .map((doc) => triggeredAlertFromDoc(doc.id, doc.data() as Record<string, unknown>))
    .filter((alert): alert is BriefingTriggeredAlert => alert !== null);
}

async function loadCallChanges(uid: string): Promise<BriefingCallChange[]> {
  const snap = await adminFirestore
    .collection("tm_lifecycle_events")
    .where("uid", "==", uid)
    .where("type", "==", "directive_change")
    .limit(60)
    .get();
  return snap.docs
    .map((doc) => callChangeFromEvent(doc.data() as Record<string, unknown>))
    .filter((change): change is BriefingCallChange => change !== null);
}

async function loadEarningsTimes(
  positions: Array<{ ticker: string; earnings_date: string | null }>,
  today: string,
): Promise<Map<string, BriefingPosition["earnings_time"]>> {
  const soon = positions.filter((position) => {
    if (!position.earnings_date) return false;
    const days = daysBetween(today, position.earnings_date);
    return days != null && days >= 0 && days <= EARNINGS_TIME_LOOKAHEAD_DAYS;
  });
  const out = new Map<string, BriefingPosition["earnings_time"]>();
  await Promise.all(
    soon.map(async (position) => {
      const event = await getNextEarningsCalendarEventCached("US", position.ticker).catch(() => null);
      // Only trust the time of day when the calendar agrees on the date.
      if (event && event.event_date?.slice(0, 10) === position.earnings_date) {
        out.set(position.ticker, event.time === "bmo" || event.time === "amc" ? event.time : null);
      }
    }),
  );
  return out;
}

async function buildPersonalBriefing(input: {
  uid: string;
  rows: WatchlistRow[];
  now: Date;
  previous: { day: string; doc: BriefingStateDoc } | null;
  holdings: Record<string, { quantity?: number | null; market_value?: number | null }>;
  /** Whether the agent covers this stock for the account (lib/entitlements: briefing_personal is "covered"). */
  covers: (instrumentId: string) => boolean;
}): Promise<{ briefing: Briefing; positions: BriefingPosition[]; degraded: string[] }> {
  const { uid, rows, now, previous, holdings, covers } = input;
  const today = marketDay(now);
  const ids = rows.map((row) => row.instrument_id);
  const degraded: string[] = [];
  const guard = <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch(() => {
      degraded.push(label);
      return fallback;
    });

  const [market, quotes, labels, states, reports, preEarnings, news, alerts, lifecycleChanges, radarView, agentRuns] =
    await Promise.all([
      loadMarketInputs(),
      guard("prices", getLatestPriceQuotes(ids), new Map()),
      guard("names", getInstrumentLabels(ids), new Map()),
      guard("earnings dates", getRadarStockStates(ids), {}),
      guard("earnings reports", getLatestEarningsIntelForInstruments("US", ids), []),
      guard("earnings previews", getPreEarningsIntelForInstruments("US", ids), []),
      guard("news", getNewsFeed("US"), []),
      guard("alerts", loadTriggeredAlerts(uid), []),
      guard("call changes", loadCallChanges(uid), []),
      guard("filings", getRadarUserView(uid), null),
      guard("your jobs", loadAgentRuns(uid), []),
    ]);
  degraded.push(...market.degraded);

  const preById = new Map(preEarnings.map((doc) => [doc.instrument_id, doc]));
  const draftPositions = rows.map((row) => {
    const latest = quotes.get(row.instrument_id);
    const quote = latest?.quote;
    const position = positionFromRow(row, {
      state: states[row.instrument_id] ?? null,
      label: labels.get(row.instrument_id) ?? null,
      pre_earnings: preById.get(row.instrument_id) ?? null,
      holding: holdings[row.instrument_id] ?? null,
      quote: quote
        ? {
            price: typeof quote.current === "number" && Number.isFinite(quote.current) ? quote.current : null,
            day_change_pct:
              typeof quote.day_change_pct === "number" && Number.isFinite(quote.day_change_pct)
                ? quote.day_change_pct
                : null,
            as_of: latest?.captured_at ?? latest?.updated_at ?? null,
          }
        : null,
    });
    return covers(row.instrument_id) ? position : uncoveredPosition(position);
  });
  const times = await loadEarningsTimes(draftPositions, today);
  const positions = draftPositions.map((position) => ({
    ...position,
    earnings_time: times.get(position.ticker) ?? null,
  }));

  const nowIso = now.toISOString();
  const { degraded: _marketDegraded, ...marketInputs } = market;
  void _marketDegraded;
  const briefing = buildBriefing({
    ...marketInputs,
    date: today,
    now: nowIso,
    mode: "personal",
    positions,
    earnings_reports: reports
      .map(earningsReportFromDoc)
      .filter((report): report is NonNullable<typeof report> => report !== null),
    news: news.map(newsFromArticle),
    alerts,
    call_changes: [
      ...lifecycleChanges,
      ...callChangesSince(positions, previous?.doc.calls, previous?.day ?? null, nowIso, lifecycleChanges),
    ],
    attention: isActiveRadarUserView(radarView) ? radarView.attention_items.map(attentionFromRadar) : [],
    seen_before: previous?.doc.seen ?? [],
    agent_runs: agentRuns,
  });
  return { briefing, positions, degraded: [...new Set(degraded)] };
}

/**
 * This person's built briefing, kept for a minute in this server's memory (lib/per-user-cache.ts: keyed by uid,
 * never shared between people). A build missing a source is not kept.
 */
const personalBuilds = perUserCache<{ briefing: Briefing; positions: BriefingPosition[]; degraded: string[] }>({
  ttlMs: 60_000,
  max: 200,
  keep: (build) => build.degraded.length === 0,
});

/** Keep today's briefing so it can be reopened on a later day. Additive, own document only. */
async function saveSnapshot(
  uid: string,
  briefing: Briefing,
  positions: BriefingPosition[],
  existing: BriefingStateDoc | undefined,
  now: Date,
): Promise<void> {
  const builtAt = Date.parse(existing?.snapshot_built_at ?? "");
  if (Number.isFinite(builtAt) && now.getTime() - builtAt < SNAPSHOT_REFRESH_MS) return;
  const stamp = now.toISOString();
  // Plain JSON only: the store rejects undefined and class instances.
  const snapshot = JSON.parse(JSON.stringify(briefing)) as Briefing;
  await stateRef(uid, briefing.date).set(
    {
      uid,
      date: briefing.date,
      snapshot,
      snapshot_built_at: stamp,
      seen: seenKeys(briefing),
      calls: callsOf(positions),
      updated_at: stamp,
    },
    { merge: true },
  );
}

function isBriefing(value: unknown): value is Briefing {
  const candidate = value as Partial<Briefing> | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      typeof candidate.date === "string" &&
      typeof candidate.summary === "string" &&
      Array.isArray(candidate.needs_you) &&
      Array.isArray(candidate.also_today) &&
      candidate.market &&
      candidate.quiet,
  );
}

/**
 * Everything the /briefing page needs for the current request.
 *
 * `day` opens a saved earlier day. `persist` stores today's briefing so it can
 * be reopened later; embeds that only preview the briefing leave it off.
 */
export async function loadBriefingPage(
  options: { day?: string | null; persist?: boolean } = {},
): Promise<BriefingPageData> {
  const now = new Date();
  const today = marketDay(now);
  const session = await getSessionUser().catch(() => null);

  if (!session) {
    const { briefing, degraded } = await marketBriefing(now);
    return { briefing, viewer: { kind: "signed_out" }, state: {}, days: [], archived: false, degraded };
  }

  const uid = session.uid;
  const [userDoc, view, stateDocs] = await Promise.all([
    getUserDoc(uid).catch(() => null),
    getWatchlistView(uid).catch(() => null),
    loadStateDocs(uid, today).catch(() => new Map<string, BriefingStateDoc>()),
  ]);
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];

  const days: BriefingDayLink[] = briefingWindow(today)
    .map((day) => ({ day, available: day === today || hasSavedBriefing(stateDocs.get(day)) }))
    .filter((entry) => entry.available);
  const history = days.length > 1 ? days : [];

  const requested = options.day && BRIEFING_DAY_RE.test(options.day) ? options.day : null;
  if (requested && requested !== today) {
    const doc = stateDocs.get(requested);
    const saved = doc && hasSavedBriefing(doc) ? await loadSavedBriefing(uid, requested).catch(() => null) : null;
    if (doc && saved) {
      // Read back under today's coverage: an old day must not explain a stock the agent does not cover now.
      const coverage = viewerFromUserDoc(uid, userDoc);
      return {
        briefing: gateSavedBriefing(saved, (instrumentId) => isCovered(coverage, instrumentId)),
        viewer: { kind: "member", uid },
        state: cleanState(doc.items),
        days: history,
        archived: true,
        degraded: [],
      };
    }
  }

  if (tracked.length === 0) {
    const { briefing, degraded } = await marketBriefing(now);
    return { briefing, viewer: { kind: "empty", uid }, state: {}, days: [], archived: false, degraded };
  }

  const trackedSet = new Set(tracked);
  const positionTypes =
    userDoc?.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? userDoc.watchlist_positions
      : {};
  const rows = ((view?.rows ?? []) as WatchlistRow[])
    .filter((row) => trackedSet.has(row.instrument_id))
    .map((row) => ({
      ...row,
      position_type: positionTypes[row.instrument_id] === "holding" ? ("holding" as const) : ("watchlist" as const),
    }));

  if (rows.length === 0) {
    const { briefing, degraded } = await marketBriefing(now);
    return {
      briefing,
      viewer: { kind: "pending", uid, tracked: tracked.length },
      state: {},
      days: [],
      archived: false,
      degraded,
    };
  }

  // The same plan and coverage getViewer gives this person, from the doc already in hand (no second read).
  const coverage = viewerFromUserDoc(uid, userDoc);
  const previousDay = briefingWindow(today)
    .slice(1)
    .find((day) => stateDocs.has(day));
  const previousDoc = previousDay ? stateDocs.get(previousDay) : undefined;
  const previous = previousDay && previousDoc ? { day: previousDay, doc: previousDoc } : null;
  const holdings =
    userDoc?.watchlist_holdings && typeof userDoc.watchlist_holdings === "object" ? userDoc.watchlist_holdings : {};
  // Opening the briefing again within a minute reuses this person's last build. The key covers what they edit
  // (tracked rows, holdings, plan and coverage) and yesterday's calls, so an edit shows at once; alerts, call
  // changes, filings and agent runs can lag by up to that minute.
  const buildKey = fingerprint({
    today,
    rows,
    holdings,
    plan: coverage.plan,
    covered: coverage.covered,
    previous: previous ? { day: previous.day, seen: previous.doc.seen ?? [], calls: previous.doc.calls ?? {} } : null,
  });
  const { briefing, positions, degraded } = await personalBuilds.get(uid, buildKey, () =>
    buildPersonalBriefing({
      uid,
      rows,
      now,
      previous,
      holdings,
      covers: (instrumentId) => isCovered(coverage, instrumentId),
    }),
  );

  const todayDoc = stateDocs.get(today);
  if (options.persist) {
    // Bookkeeping for reopening this day later: it never holds the page.
    afterResponse("briefing snapshot", saveSnapshot(uid, briefing, positions, todayDoc, now));
  }

  return {
    briefing,
    viewer: { kind: "member", uid },
    state: cleanState(todayDoc?.items),
    days: history,
    archived: false,
    degraded,
  };
}

/** One build per request for surfaces that only need the top of the briefing. */
export const loadBriefingPreview = cache(async (): Promise<BriefingPageData> => loadBriefingPage());
