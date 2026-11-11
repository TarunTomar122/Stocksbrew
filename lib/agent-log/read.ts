import { isMajorFiling, filingFact, ITEM_WORDS, MAJOR_ITEMS, type FilingFact } from "@/lib/agent-events-filings";
import { normalizeFiling } from "@/lib/filings-shared";
import { adminFirestore } from "@/lib/firebase-admin";
import { LocalFirestore } from "@/lib/local-firestore";
import { isConfirmedMove, type MoveLike } from "@/lib/seo/families";

import { batchTime, nyDayBounds, nyDayOf, nyInstant, previousWeekday } from "./time";
import {
  PREMARKET_GAP_PCT,
  type AgentRunsFacts,
  type BriefsFacts,
  type CallChange,
  type CallsFacts,
  type EarningsFacts,
  type FilingsFacts,
  type FlaggedFiling,
  type InsidersFacts,
  type MovesFacts,
  type PremarketFacts,
} from "./words";

/**
 * The store reads behind the agent log, one per source, each for one New York day. Reads only, and only the
 * fields a count needs (LocalDB `select`; Firebase, the rollback, reads whole documents). A source that fails
 * throws, and the loader (./server.ts) leaves it out. Counts only: no user ids or personal data are read.
 */

type Doc = { id: string; exists?: boolean; data(): unknown };
type Snap = { docs: Doc[] };
type Selectable = { select?: (...fields: unknown[]) => { get(): Promise<Snap> }; get(): Promise<Snap> };

const isLocal = () => (adminFirestore as unknown) instanceof LocalFirestore;

/** A query with only `fields` read back. LocalDB takes the list as one array, Firebase as arguments. */
function selectGet(query: unknown, fields: string[]): Promise<Snap> {
  const q = query as Selectable;
  if (!q.select) return q.get();
  return isLocal() ? q.select(fields).get() : q.select(...fields).get();
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const onDay = (iso: string, day: string) => Boolean(iso) && nyDayOf(iso) === day;

/** The latest of some timestamps, or "" when none parses. */
function latest(stamps: string[]): string {
  let best = "";
  let bestMs = -Infinity;
  for (const stamp of stamps) {
    const ms = Date.parse(stamp);
    if (Number.isFinite(ms) && ms > bestMs) {
      best = stamp;
      bestMs = ms;
    }
  }
  return best;
}

/** "US_BRK_B" -> "BRK.B". */
function tickerOf(instrumentId: string): string {
  return instrumentId.toUpperCase().replace(/^(US|IN)_/, "").replace(/_/g, ".");
}

/* ── before the open ─────────────────────────────────────────────────────── */

export async function readPremarket(day: string): Promise<PremarketFacts | null> {
  const doc = await adminFirestore.collection("tm_premarket_movers").doc("US__latest").get();
  if (!doc.exists) return null;
  const data = doc.data() as { date?: unknown; generated_at?: unknown; by_ticker?: unknown };
  const at = str(data.generated_at);
  if (str(data.date).slice(0, 10) !== day || !onDay(at, day)) return null;
  const quotes = data.by_ticker && typeof data.by_ticker === "object" ? Object.entries(data.by_ticker as Record<string, { pre_market_change_pct?: unknown }>) : [];
  const moves = quotes
    .map(([ticker, quote]) => ({ ticker: ticker.toUpperCase(), pct: num(quote?.pre_market_change_pct) }))
    .filter((row): row is { ticker: string; pct: number } => row.pct !== null);
  const big = moves.filter((row) => Math.abs(row.pct) >= PREMARKET_GAP_PCT).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return { at, scanned: moves.length, bigMoves: big.length, leader: big[0] ?? null };
}

/* ── stock briefs ────────────────────────────────────────────────────────── */

export const BRIEFS_COLLECTION = "tm_news_runs/US__us_core_155/stock_intelligence";

export async function readBriefs(day: string): Promise<BriefsFacts | null> {
  const [start, end] = nyDayBounds(day);
  const snap = await selectGet(
    adminFirestore.collection(BRIEFS_COLLECTION).where("generated_at", ">=", start).where("generated_at", "<", end),
    ["generated_at", "coverage_type"],
  );
  const stamps: string[] = [];
  let withNews = 0;
  let typed = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { generated_at?: unknown; coverage_type?: unknown };
    const at = str(data.generated_at);
    if (!onDay(at, day)) continue;
    stamps.push(at);
    // "on_demand_news" read fresh articles; "on_demand_no_news" was brought up to date on prices and filings alone.
    const coverage = str(data.coverage_type);
    if (!coverage) continue;
    typed += 1;
    if (!/no_news/.test(coverage)) withNews += 1;
  }
  // Without the field on every brief, how many had news cannot be said.
  return stamps.length ? { at: batchTime(stamps), count: stamps.length, withNews: typed === stamps.length ? withNews : null } : null;
}

/* ── steady calls ────────────────────────────────────────────────────────── */

const CALLS = new Set(["Add", "Hold", "Trim"]);

/**
 * The steady-call state of every stock reviewed on the day's prices (backend/call_stability.py: `session` is the
 * price day the rule decided on). A change is one in its change list dated that day; a call "held against the
 * vote" is one where the day's review pointed elsewhere and the rule kept it.
 */
export async function readCalls(day: string): Promise<CallsFacts | null> {
  const snap = await selectGet(adminFirestore.collection("tm_call_stability").where("session", "==", day), [
    "session",
    "call",
    "last_raw",
    "changes",
    "updated_at",
    "instrument_id",
  ]);
  const stamps: string[] = [];
  const changes: CallChange[] = [];
  let held = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const updated = str(data.updated_at);
    if (str(data.session) !== day || !CALLS.has(str(data.call)) || !onDay(updated, day)) continue;
    stamps.push(updated);
    const raw = str(data.last_raw);
    if (raw && CALLS.has(raw) && raw !== data.call) held += 1;
    for (const change of Array.isArray(data.changes) ? (data.changes as Array<Record<string, unknown>>) : []) {
      const to = str(change?.to);
      if (str(change?.date) !== day || !CALLS.has(to) || to === str(change?.from)) continue;
      changes.push({ ticker: tickerOf(str(data.instrument_id) || doc.id), to: to as CallChange["to"], trigger: str(change?.trigger) || null });
    }
  }
  if (stamps.length === 0) return null;
  return { at: batchTime(stamps), reviewed: stamps.length, changes: changes.sort((a, b) => a.ticker.localeCompare(b.ticker)), heldAgainst: held };
}

/* ── big moves ───────────────────────────────────────────────────────────── */

/**
 * The day's big moves (tm_daily_anomalies: the live `US__latest` and the dated copy) and how many have a confirmed
 * reason, by the rule the movers pages use (lib/seo/families.ts `isConfirmedMove`). Read here rather than through
 * the movers pages' cached reader, which turns a failed read into "no moves": a failed read here throws, so the
 * log leaves the line out and is not cached without it.
 */
export async function readMoves(day: string): Promise<MovesFacts | null> {
  const collection = adminFirestore.collection("tm_daily_anomalies");
  const [latestDoc, datedDoc] = await Promise.all([collection.doc("US__latest").get(), collection.doc(`US__${day}`).get()]);
  type Row = MoveLike & { ticker?: unknown; day_change_pct?: unknown; narrative_as_of?: unknown };
  type DayDoc = { date?: unknown; anomaly_count?: unknown; anomalies?: unknown; reasoned_at?: unknown; generated_at?: unknown };
  const read = (doc: Doc) => {
    if (!doc.exists) return null;
    const data = doc.data() as DayDoc;
    const at = str(data.reasoned_at) || str(data.generated_at);
    if (str(data.date).slice(0, 10) !== day || !onDay(at, day)) return null;
    return { at, rows: Array.isArray(data.anomalies) ? (data.anomalies as Row[]) : [], count: num(data.anomaly_count) };
  };
  const live = read(latestDoc as unknown as Doc);
  const dated = read(datedDoc as unknown as Doc);
  if (!live && !dated) return null;
  // One per stock; the latest research wins, as on the movers pages.
  const confirmed = new Map<string, { ticker: string; pct: number; researched: string }>();
  for (const row of [...(dated?.rows ?? []), ...(live?.rows ?? [])]) {
    const ticker = str(row?.ticker).toUpperCase();
    const pct = num(row?.day_change_pct);
    if (!ticker || pct === null || !isConfirmedMove(row)) continue;
    const researched = str(row.narrative_as_of);
    const held = confirmed.get(ticker);
    if (!held || researched > held.researched) confirmed.set(ticker, { ticker, pct, researched });
  }
  const explained = [...confirmed.values()];
  const leader = explained.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null;
  // Only the live list holds every move the run looked into; the dated copy keeps the explained ones.
  const total = live ? Math.max(live.count ?? 0, live.rows.length) : explained.length;
  return {
    at: latest([live?.at ?? "", dated?.at ?? ""]),
    total,
    explained: explained.length,
    screened: Boolean(live),
    leader: leader ? { ticker: leader.ticker, pct: leader.pct } : null,
  };
}

/* ── SEC filings ─────────────────────────────────────────────────────────── */

/** What a flagged filing is, in a few words: "a new material agreement", "an annual report". */
export function flaggedWhat(filing: FilingFact): string {
  if (filing.group === "10-K") return "an annual report";
  if (filing.group === "S-1") return "a share offering";
  if (filing.group === "13D/G") return "an active stake above 5%";
  const item = (MAJOR_ITEMS as readonly string[]).find((code) => filing.items.includes(code));
  return item ? (ITEM_WORDS[item] ?? "an 8-K") : "an 8-K";
}

/**
 * The SEC filings the day's checks read: each filing counts on the day anyone could first read it
 * (lib/agent-events-filings.ts `filingKnownDay`: after 5 PM it is the next day's). The time is the filings job's
 * own last run that day (tm_agent_filings_meta/US); without a run that day there is no line.
 */
export async function readFilings(day: string): Promise<FilingsFacts | null> {
  const [snap, meta] = await Promise.all([
    selectGet(
      adminFirestore
        .collection("tm_agent_filings")
        // From the previous weekday's 5 PM, so a Friday-evening filing (its known day is the Saturday) counts on Monday.
        .where("filed_at", ">=", nyInstant(previousWeekday(day), 17 * 60))
        .where("filed_at", "<", nyInstant(day, 17 * 60)),
      ["ticker", "company", "form", "form_group", "items", "filed_at", "role", "is_amendment", "url", "headline"],
    ),
    adminFirestore.collection("tm_agent_filings_meta").doc("US").get(),
  ]);
  const metaData = (meta.exists ? meta.data() : null) as { updated_at?: unknown; companies_checked?: unknown } | null;
  const at = str(metaData?.updated_at);
  if (!onDay(at, day)) return null;
  const seen = new Set<string>();
  const facts: FilingFact[] = [];
  for (const doc of snap.docs) {
    const filing = normalizeFiling(doc.data() as Record<string, unknown>, doc.id);
    const fact = filing ? filingFact(filing) : null;
    if (!fact || fact.day > day || fact.day <= previousWeekday(day) || seen.has(fact.id)) continue;
    seen.add(fact.id);
    facts.push(fact);
  }
  const flagged: FlaggedFiling[] = facts
    .filter(isMajorFiling)
    .sort((a, b) => Date.parse(b.filed_at) - Date.parse(a.filed_at))
    .map((fact) => ({ ticker: fact.ticker, what: flaggedWhat(fact) }));
  return { at, companies: num(metaData?.companies_checked), count: facts.length, flagged };
}

/* ── insider trades ──────────────────────────────────────────────────────── */

/**
 * Form 4 trades filed on the day (tm_insider_trades, `filing_date`), timed by the insider job's last run that day
 * (tm_insider_meta/run). Planned (10b5-1) buys were decided months before, so they are not counted as buys.
 */
export async function readInsiders(day: string): Promise<InsidersFacts | null> {
  const [snap, run] = await Promise.all([
    selectGet(adminFirestore.collection("tm_insider_trades").where("filing_date", "==", day), ["symbol", "tx_type", "value", "plan_10b5_1", "filing_date"]),
    adminFirestore.collection("tm_insider_meta").doc("run").get(),
  ]);
  const at = str((run.exists ? (run.data() as { generated_at?: unknown }) : null)?.generated_at);
  if (!onDay(at, day)) return null;
  let trades = 0;
  let buys = 0;
  let biggest: { ticker: string; value: number } | null = null;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const ticker = str(data.symbol).toUpperCase();
    if (!ticker || str(data.filing_date) !== day) continue;
    trades += 1;
    if (data.tx_type !== "buy" || data.plan_10b5_1 === true) continue;
    buys += 1;
    const value = num(data.value);
    if (value !== null && value > 0 && (!biggest || value > biggest.value)) biggest = { ticker, value };
  }
  return trades > 0 ? { at, trades, buys, biggest } : null;
}

/* ── earnings reports ────────────────────────────────────────────────────── */

/** Reports whose actual results were captured and compared with estimates on the day (tm_earnings_events). */
export async function readEarnings(day: string): Promise<EarningsFacts | null> {
  const [start, end] = nyDayBounds(day);
  const snap = await selectGet(
    adminFirestore.collection("tm_earnings_events").where("actuals_captured_at", ">=", start).where("actuals_captured_at", "<", end),
    ["market", "surprise_label", "actuals_captured_at", "event_date"],
  );
  // Only reports from the day or the evening before: the job also backfills older quarters, which are not the day's work.
  const from = previousWeekday(day);
  const stamps: string[] = [];
  let beat = 0;
  let missed = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const at = str(data.actuals_captured_at);
    const event = str(data.event_date).slice(0, 10);
    if (str(data.market).toUpperCase() !== "US" || !onDay(at, day) || event < from || event > day) continue;
    stamps.push(at);
    if (data.surprise_label === "beat") beat += 1;
    if (data.surprise_label === "miss") missed += 1;
  }
  return stamps.length ? { at: batchTime(stamps), count: stamps.length, beat, missed } : null;
}

/* ── members' agents ─────────────────────────────────────────────────────── */

/** lib/agent-jobs-data.ts AGENT_RUNS_COLLECTION, named here so the log does not pull in the agents runtime. */
const AGENT_RUNS_COLLECTION = "tm_agent_runs";

/** How many standing agents ran on the day and how many found something (tm_agent_runs). Counts only: no user ids. */
export async function readAgentRuns(day: string): Promise<AgentRunsFacts | null> {
  const [start, end] = nyDayBounds(day);
  const snap = await selectGet(adminFirestore.collection(AGENT_RUNS_COLLECTION).where("ran_at", ">=", start).where("ran_at", "<", end), ["ran_at", "decision"]);
  const stamps: string[] = [];
  let found = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const at = str(data.ran_at);
    if (!onDay(at, day) || (data.decision !== "notify" && data.decision !== "nothing")) continue;
    stamps.push(at);
    if (data.decision === "notify") found += 1;
  }
  return stamps.length ? { at: batchTime(stamps), runs: stamps.length, found } : null;
}
