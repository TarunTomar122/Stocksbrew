import { instantOf, isBareDay, nyDay, shortDay } from "./merge";
import { onDayWords } from "@/lib/day-words";
import { sessionDayOf } from "@/lib/session-label";
import { sessionWords, vsDayWords, whenWords as reportWhen } from "@/lib/earnings-season";
import { isNyseHoliday } from "@/lib/market-session";
import type { ResultRead } from "@/lib/results/types";
import { moveShort, resultCardFacts, resultHeadline, resultLine, resultSentence, resultTone } from "@/lib/results/words";
import { findingClose } from "@/lib/portfolio-home/example-check";

import type { InboxItem, InboxMove, UpcomingReport } from "./types";

/**
 * Each source's records as inbox items: one full sentence on what happened and
 * why it matters to this person, and the evidence link. Pure:
 * the store reads live in ./sources.ts, so the wording is tested here on plain
 * records. A record that cannot make a whole sentence (no ticker, no day)
 * makes no item.
 */

export type Mode = "mine" | "example";
export type Position = "holding" | "watchlist" | null;
export type PlainCall = "Buy more" | "Keep" | "Sell some";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const RANK: Record<PlainCall, number> = { "Sell some": 0, Keep: 1, "Buy more": 2 };

/** The pipeline's stance words ("accumulate", "Trim", "avoid") as the call a reader sees. */
export function plainCall(stance: unknown): PlainCall | null {
  const key = String(stance ?? "").trim().toLowerCase();
  if (["accumulate", "buy", "add"].includes(key)) return "Buy more";
  if (["hold", "watch", "keep"].includes(key)) return "Keep";
  if (["trim", "avoid", "sell", "reduce"].includes(key)) return "Sell some";
  return null;
}

/** A call already in a reader's words ("Sell some", as an agent's finding stores it), or a pipeline stance word. */
function callWord(value: unknown): PlainCall | null {
  const word = String(value ?? "").trim();
  return word === "Buy more" || word === "Keep" || word === "Sell some" ? word : plainCall(word);
}

function cleanTicker(value: unknown): string | null {
  const ticker = String(value ?? "").trim().toUpperCase();
  return TICKER_RE.test(ticker) ? ticker : null;
}

function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function withoutStop(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

/** "NVDA", "NVDA and AMD", "NVDA, AMD and 2 more". */
export function listTickers(tickers: string[], max = 3): string {
  const shown = tickers.slice(0, max);
  const more = tickers.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

function usd(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function price(value: number): string {
  // Whole dollars stay whole ("$250"); cents always show two places ("$251.20", never "$251.2").
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 10 || !Number.isInteger(value) ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function base(fields: Omit<InboxItem, "day" | "detail" | "external" | "quiet" | "locked" | "weight" | "thread" | "tone" | "exact"> & Partial<InboxItem>): InboxItem | null {
  const day = nyDay(fields.at);
  if (!day) return null;
  return {
    move: null,
    exact: true,
    detail: null,
    external: false,
    quiet: false,
    locked: false,
    weight: 1,
    thread: null,
    tone: "flat",
    ...fields,
    day,
  };
}

/* ── agent runs ─────────────────────────────────────────────────────────── */

export type AgentRunRecord = {
  jobId: string;
  jobName: string;
  /** The market day the run checked. */
  day: string;
  ranAt: string;
  decision: "notify" | "nothing" | "could_not_check";
  summary: string;
  tickers: string[];
  /** What the run found, stock by stock (lib/agent-jobs.ts AgentFinding). Older runs may have none. */
  findings?: RunFinding[];
};

/** One finding of a stored run, the fields the inbox reads (lib/agent-jobs.ts AgentFinding). */
export type RunFinding = {
  ticker: string | null;
  headline: string;
  detail: string;
  /** The day the fact is from: the close for a move, the report day for earnings. */
  at: string;
  kind?: string;
  change_pct?: number;
  close?: number;
  zone?: "add" | "trim" | null;
  level?: number | null;
  /** Earnings only: "bmo" or "amc" when known. */
  time?: string | null;
  /** Call changes only (a call-change or sell watch), in plain words: null `call_from` when the plan does not cover the stock. */
  call_from?: string | null;
  call_to?: string | null;
};

/**
 * One call change is one inbox row, whoever reported it: the call's own records (callItem) or a person's call-change
 * or sell watch (findingItems). Both build their item from these, so the merge sees the same event: the id is the
 * stock and the day it changed, the dedupe key the stock and the call it turned to (the merge matches it within
 * DEDUPE_WINDOW_MS, since the watchlist job can log a Friday change on Monday). Together: ticker + call + day.
 */
export function callChangeId(ticker: string, day: string): string {
  return `call:${ticker}:${day}`;
}

export function callChangeKey(ticker: string, to: PlainCall): string {
  return `call:${ticker}:${to}`;
}

/** An agent's report of a call change outranks every call source (weights 1 to 3), so its wording is the one kept. */
export const AGENT_CALL_WEIGHT = 10;

/**
 * What the inbox knows about a stock beyond the run: what a normal day is for it (its average absolute daily
 * move) and the confirmed reason for its latest big move, if the researched movers feed has one.
 */
export type MoveContext = {
  normalPct: number | null;
  /** Only a reason with sources that names a cause (lib/briefing.ts moveReason, lib/reason-quality.ts). */
  reason: { day: string; pct: number; line: string } | null;
};

function agentName(name: string): string {
  const clean = name.replace(/[“”"]/g, "").trim();
  return clean ? `“${clean}”` : "";
}

/** A run that found something: the agent's own sentence, said as what the person's agent flagged. */
export function agentItem(run: AgentRunRecord, mode: Mode): InboxItem | null {
  if (run.decision !== "notify" || !run.summary.trim()) return null;
  const ranAt = instantOf(run.ranAt);
  const at = ranAt ?? instantOf(run.day);
  if (!at) return null;
  const tickers = run.tickers.map(cleanTicker).filter((t): t is string => t !== null);
  // "The example “5% moves in a day” agent", not "The example's …" (Nov 11 judge: the possessive reads awkwardly).
  const whose = mode === "mine" ? "Your" : "The example";
  const name = agentName(run.jobName);
  const text = `${whose} ${name ? `${name} ` : ""}agent flagged this: ${sentence(run.summary)}`;
  const lead = tickers[0] ?? null;
  return base({
    id: `agent:${run.jobId}:${run.day}`,
    kind: "agent",
    at,
    exact: ranAt !== null && !isBareDay(run.ranAt),
    tickers,
    text,
    href: mode === "mine" ? `/agents?job=${encodeURIComponent(run.jobId)}` : lead ? `/stock/${encodeURIComponent(lead)}` : "/portfolio",
    source: mode === "mine" ? "Your agent" : "Example agent",
    tone: "down",
    dedupeKey: `agent:${run.jobId}:${run.day}`,
  });
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A move's percent, one decimal: "11.9%". */
function pctText(value: number): string {
  return `${Math.abs(value).toFixed(1)}%`;
}

/** A move's percent from the finding's number, else from its own words ("IREN rose 20.02% in the last session"). */
function findingPct(finding: RunFinding): number | null {
  if (typeof finding.change_pct === "number" && Number.isFinite(finding.change_pct)) return finding.change_pct;
  const match = /\b(rose|fell|gained|lost|jumped|dropped|climbed|slid)\s+(\d+(?:\.\d+)?)%/i.exec(finding.headline);
  if (!match) return null;
  const size = Number(match[2]);
  if (!Number.isFinite(size)) return null;
  return /^(fell|lost|dropped|slid)$/i.test(match[1]!) ? -size : size;
}

type FindingKind = "move" | "span" | "level" | "earnings" | "call" | "other";

function findingKind(finding: RunFinding): FindingKind {
  const kind = String(finding.kind ?? "").toLowerCase();
  if (kind === "level") return "level";
  if (kind === "call" && callWord(finding.call_to) !== null) return "call";
  // The weekly review's moves are over five sessions, not one day: never said or counted as a day's move.
  if (/\bover \w+ sessions\b/i.test(finding.headline)) return "span";
  if (kind === "earnings" || (!kind && /\breports earnings\b/i.test(finding.headline))) return "earnings";
  if (kind === "move" || kind === "mover" || (!kind && findingPct(finding) !== null && /\b(rose|fell)\b/i.test(finding.headline))) return "move";
  return "other";
}

/** The tickers whose moves a run reports, for the context read (normal day, reason) before its items are made. */
export function moveTickers(runs: AgentRunRecord[]): string[] {
  const out: string[] = [];
  for (const run of runs) {
    if (run.decision !== "notify") continue;
    for (const finding of run.findings ?? []) {
      const ticker = cleanTicker(finding.ticker);
      const kind = findingKind(finding);
      if (ticker && (kind === "move" || kind === "level") && !out.includes(ticker)) out.push(ticker);
    }
  }
  return out;
}

/** The market session before `day`: a Monday's is the Friday, and a day after a market holiday skips it. */
export function sessionBefore(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    date.setUTCDate(date.getUTCDate() - 1);
    const key = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !isNyseHoliday(key)) return key;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A past day as a sentence says it: "today", "yesterday", "on Monday" within the week, "on Nov 3" before
 * (lib/day-words.ts). Without `today` (text that is kept and read later), always the date.
 */
export function pastWhen(day: string, today: string | null): string {
  if (!today) return `on ${shortDay(day)}`;
  return onDayWords(day, today) || `on ${shortDay(day)}`;
}

/** A move at least this many times the stock's normal day is "more than usual": the row says so and the read counts it. */
export const UNUSUAL_MOVE = 2;

/**
 * "MU rose 11.9% today, about three times a normal day." The comparison is only said when the move is at least
 * UNUSUAL_MOVE times the stock's normal day; a normal-sized move is just the move.
 */
export function moveSentence(ticker: string, pct: number, day: string, normalPct: number | null, today: string | null = null): string {
  const ratio = normalPct !== null && normalPct > 0 ? Math.abs(pct) / normalPct : null;
  const versus = ratio !== null && ratio >= UNUSUAL_MOVE ? vsDayWords(ratio) : null;
  return `${ticker} ${pct >= 0 ? "rose" : "fell"} ${pctText(pct)} ${pastWhen(day, today)}${versus ? `, ${versus}` : ""}.`;
}

/** The confirmed reason for this move: the researched feed's move on the same close, the same way. Null otherwise. */
function reasonFor(context: MoveContext | undefined, day: string, pct: number): string | null {
  const reason = context?.reason;
  if (!reason || reason.day !== day || Math.sign(reason.pct) !== Math.sign(pct)) return null;
  return reason.line;
}

/**
 * A run's findings as items, one per stock it is about: a move says the figure (and the reason when one is
 * confirmed, nothing when not), a price level says where the close sits against our call, anything else says the
 * finding's own sentence. Upcoming reports are left out: the earnings calendar gives every stock's report
 * (UpcomingReport), so the agent's reminder would say it twice. Null when the run has no findings to go on, so the
 * caller falls back to the run's own summary (agentItem).
 */
export function findingItems(run: AgentRunRecord, mode: Mode, context: ReadonlyMap<string, MoveContext> = new Map(), today: string | null = null): InboxItem[] | null {
  if (run.decision !== "notify") return [];
  const findings = (run.findings ?? []).filter((finding) => cleanTicker(finding.ticker) !== null);
  if (findings.length === 0) return null;
  const ranAt = instantOf(run.ranAt);
  const at = ranAt ?? instantOf(run.day);
  if (!at) return null;
  const exact = ranAt !== null && !isBareDay(run.ranAt);
  // A fact about a session is filed under that session, not the day the agent ran (judges, Nov 12: "NVDA fell 5.5%
  // on Tuesday" sat under "Yesterday", the day of the run, while the sentence said Tuesday). When the run checked
  // the same New York day, it keeps its own time; a run that reported an earlier close files it at that close.
  // It still arrived with the run, so it stays unread until read after the run (`arrivedAt`).
  const eventAt = (day: string): { at: string; exact: boolean; arrivedAt?: string } => {
    const session = DAY_RE.test(day) ? sessionDayOf(day) : null;
    if (!session || nyDay(at) === session) return { at, exact };
    const close = instantOf(session);
    return close && close < at ? { at: close, exact: false, arrivedAt: at } : { at, exact };
  };
  const source = mode === "mine" ? "Your agent" : "Example agent";
  const out: InboxItem[] = [];
  const levels: LevelFinding[] = [];
  findings.forEach((finding, index) => {
    const ticker = cleanTicker(finding.ticker)!;
    const day = DAY_RE.test(String(finding.at ?? "").slice(0, 10)) ? String(finding.at).slice(0, 10) : run.day;
    const kind = findingKind(finding);
    const href = `/stock/${encodeURIComponent(ticker)}`;
    const pct = findingPct(finding);
    const normalPct = context.get(ticker)?.normalPct ?? null;
    // The close the move ended at, so the read can end on it: the finding's own field, else its evidence line.
    const close = findingClose(finding);
    const move: InboxMove | null = pct !== null && DAY_RE.test(day) ? { pct, day, normalPct, close } : null;
    let item: InboxItem | null = null;
    // A price older than the session before the run is a stale quote (a stock whose price stopped updating), not
    // this run's news: filed under the run's day it would read as today's move.
    if ((kind === "move" || kind === "span" || kind === "level") && DAY_RE.test(day) && DAY_RE.test(run.day) && day < sessionBefore(run.day)) return;
    if (kind === "earnings") {
      // Prep: kept only while the report is still ahead. The calendar's own row (UpcomingReport) replaces it when it
      // has one (lib/inbox/server.ts), so a report is said once.
      const session = finding.time === "bmo" || /before the open/i.test(finding.detail) ? "bmo" : finding.time === "amc" || /after the close/i.test(finding.detail) ? "amc" : "unknown";
      if (!today || !DAY_RE.test(day) || day < today || (day === today && session === "bmo")) return;
      item = base({
        id: `report:${ticker}:${day}`,
        kind: "results",
        at,
        exact,
        tickers: [ticker],
        text: reportSentence({ ticker, date: day, session, history: null }, today),
        href,
        source,
        dedupeKey: `report:${ticker}:${day}`,
        thread: `report:${ticker}`,
      });
    } else if (kind === "span" && pct !== null) {
      item = base({
        id: `span:${ticker}:${day}`,
        kind: "agent",
        ...eventAt(day),
        tickers: [ticker],
        text: `${ticker} ${pct >= 0 ? "rose" : "fell"} ${pctText(pct)} over the five sessions to ${shortDay(day)}.`,
        href,
        source,
        tone: pct >= 0 ? "up" : "down",
        dedupeKey: `span:${ticker}:${day}`,
      });
    } else if (kind === "move" && pct !== null) {
      item = base({
        id: `move:${ticker}:${day}`,
        kind: "agent",
        ...eventAt(day),
        tickers: [ticker],
        text: moveSentence(ticker, pct, day, normalPct, today),
        detail: reasonFor(context.get(ticker), day, pct),
        href,
        source,
        tone: pct >= 0 ? "up" : "down",
        move,
        dedupeKey: `move:${ticker}:${day}`,
      });
    } else if (kind === "level" && (finding.zone === "add" || finding.zone === "trim")) {
      // Said together below: one line per zone, so "where our call says to buy more" is said once (owner rule 1).
      levels.push({ ticker, day, zone: finding.zone, close: finding.close ?? null, level: finding.level ?? null, move });
      return;
    } else if (kind === "call" && DAY_RE.test(day)) {
      // A call-change or sell watch firing on a turn of our call: the same event as the inbox's own call row
      // (callItem), under the same id and key, so the merge keeps one, and this one's words.
      const to = callWord(finding.call_to)!;
      const from = callWord(finding.call_from);
      item = base({
        id: callChangeId(ticker, day),
        kind: "agent",
        at,
        exact,
        tickers: [ticker],
        text: sentence(finding.headline),
        detail: finding.detail.trim() ? sentence(finding.detail) : null,
        href: `${href}#call`,
        source,
        tone: from && from !== to ? (RANK[to] > RANK[from] ? "up" : "down") : to === "Buy more" ? "up" : to === "Sell some" ? "down" : "flat",
        weight: AGENT_CALL_WEIGHT,
        dedupeKey: callChangeKey(ticker, to),
        thread: `call:${ticker}`,
      });
    } else if (finding.headline.trim()) {
      item = base({
        id: `finding:${run.jobId}:${run.day}:${ticker}:${index}`,
        kind: "agent",
        at,
        exact,
        tickers: [ticker],
        text: sentence(finding.headline),
        detail: finding.detail.trim() ? sentence(finding.detail) : null,
        href,
        source,
        dedupeKey: `finding:${run.jobId}:${run.day}:${ticker}:${index}`,
      });
    }
    if (item) out.push(item);
  });
  for (const zone of ["add", "trim"] as const) {
    const group = levels.filter((level) => level.zone === zone);
    // Closes from one session are filed under it; a mix of sessions stays under the run.
    const days = new Set(group.map((level) => level.day));
    const when = days.size === 1 ? eventAt([...days][0]!) : { at, exact };
    const item = levelItem(group, { run, ...when, source, today });
    if (item) out.push(item);
  }
  // Every finding left out (stale quotes, reports already past): the run's own summary still says what it found.
  return out.length > 0 ? out : null;
}

type LevelFinding = { ticker: string; day: string; zone: "add" | "trim"; close: number | null; level: number | null; move: InboxMove | null };

const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

/**
 * A run's stocks that closed in one zone of our call, in one item: one stock says its close and the level, several
 * share the sentence and list each close against its level underneath.
 */
function levelItem(
  levels: LevelFinding[],
  where: { run: AgentRunRecord; at: string; exact: boolean; arrivedAt?: string; source: string; today: string | null },
): InboxItem | null {
  const first = levels[0];
  if (!first) return null;
  const zone = first.zone;
  const name = zone === "add" ? "buy-more" : "sell-some";
  const days = new Set(levels.map((level) => level.day));
  const when = days.size === 1 ? `${pastWhen(first.day, where.today)}` : "";
  const side = levelSide(levels);
  let text: string;
  let detail: string | null = null;
  if (levels.length === 1) {
    // "AMD closed at $140.10 yesterday, below its $142.07 buy-more level." (owner rule 8: one short line).
    text = positive(first.level)
      ? positive(first.close) && side !== "at"
        ? `${first.ticker} closed at ${price(first.close)} ${when}, ${side} its ${price(first.level)} ${name} level.`
        : `${first.ticker} closed ${when} ${side} its ${price(first.level)} ${name} level.`
      : `${first.ticker} closed ${when} ${side} its ${name} level.`;
  } else {
    // "CGNX, LLY and DELL closed below their buy-more levels.": the day is the row's own, the pairs are the detail.
    const tickers = levels.map((level) => level.ticker);
    text = `${listTickers(tickers, 6)} closed ${side} their ${name} levels.`;
    const pairs = levels
      .filter((level) => positive(level.close) && positive(level.level))
      .map((level) => `${level.ticker} at ${price(level.close!)} against ${price(level.level!)}`);
    detail = pairs.length > 0 ? sentence(capitaliseFirst(pairs.join(", "))) : null;
  }
  const key = `level:${levels.length === 1 ? first.ticker : `${where.run.jobId}:${where.run.day}`}:${[...days].sort().pop()}:${zone}`;
  return base({
    id: key,
    kind: "agent",
    at: where.at,
    exact: where.exact,
    ...(where.arrivedAt ? { arrivedAt: where.arrivedAt } : {}),
    tickers: levels.map((level) => level.ticker),
    text: text.replace(/\s+/g, " ").replace(/ ,/g, ","),
    detail,
    href: levels.length === 1 ? `/stock/${encodeURIComponent(first.ticker)}` : where.source === "Your agent" ? `/agents?job=${encodeURIComponent(where.run.jobId)}` : "/portfolio",
    source: where.source,
    tone: zone === "add" ? "up" : "down",
    move: levels.length === 1 ? first.move : null,
    dedupeKey: key,
  });
}

/**
 * Where the closes sat against their levels, in the fewest true words: "below" (or "above" for the sell-some side) when
 * every close is known and strictly past its level, "at" when every one is the level itself, else "at or below".
 */
function levelSide(levels: LevelFinding[]): string {
  const add = levels[0]?.zone !== "trim";
  const past = add ? "below" : "above";
  const known = levels.every((level) => positive(level.close) && positive(level.level));
  if (!known) return `at or ${past}`;
  const cents = (value: number) => Math.round(value * 100);
  if (levels.every((level) => cents(level.close!) === cents(level.level!))) return "at";
  if (levels.every((level) => (add ? cents(level.close!) < cents(level.level!) : cents(level.close!) > cents(level.level!)))) return past;
  return `at or ${past}`;
}

function capitaliseFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ── reports coming up ──────────────────────────────────────────────────── */

/**
 * Earnings prep in one sentence: "NVDA reports on Tuesday after the close, and it has moved 3.2% on a typical
 * report." The history is said only when its own past reports measured it.
 */
export function reportSentence(report: Pick<UpcomingReport, "ticker" | "date" | "session" | "history">, today: string): string {
  const session = sessionWords(report.session);
  return `${report.ticker} reports ${reportWhen(report.date, today)}${session ? ` ${session}` : ""}${report.history ? `, and it ${report.history}` : ""}.`;
}

/**
 * The runs that found nothing, one line per day: still an answer ("checked, nothing needs you"), listed but never
 * counted as unread.
 */
export function quietItems(runs: AgentRunRecord[], mode: Mode, today: string | null = null): InboxItem[] {
  const byDay = new Map<string, AgentRunRecord[]>();
  for (const run of runs) {
    if (run.decision !== "nothing") continue;
    byDay.set(run.day, [...(byDay.get(run.day) ?? []), run]);
  }
  const out: InboxItem[] = [];
  for (const [day, list] of byDay) {
    const timed = list.filter((run) => !isBareDay(run.ranAt)).map((run) => instantOf(run.ranAt)).filter((at): at is string => at !== null).sort().pop() ?? null;
    const latest = timed ?? instantOf(day);
    if (!latest) continue;
    const whose = mode === "mine" ? "Your" : "The example";
    const on = pastWhen(day, today);
    const text =
      list.length === 1
        ? `${whose} ${agentName(list[0]!.jobName) || ""} agent checked ${on} and found nothing that needs ${mode === "mine" ? "you" : "a look"}.`.replace(/\s+/g, " ")
        : mode === "mine"
          ? `${list.length} of your agents checked ${on} and found nothing that needs you.`
          : `${list.length} example agents checked ${on} and found nothing that needs a look.`;
    const item = base({
      id: `quiet:${day}`,
      kind: "agent",
      at: latest,
      exact: timed !== null,
      tickers: [],
      text,
      href: mode === "mine" ? "/agents" : "/portfolio",
      source: mode === "mine" ? "Your agents" : "Example agents",
      quiet: true,
      dedupeKey: `quiet:${day}`,
    });
    if (item) out.push(item);
  }
  return out;
}

/* ── call changes ───────────────────────────────────────────────────────── */

export type CallChangeRecord = {
  ticker: string;
  /** When the new call was written (ISO), or the day it took effect. */
  at: string;
  /** Null when this person may not see the call's history (a stock their plan does not cover). */
  from: PlainCall | null;
  to: PlainCall;
  position: Position;
  /** Why it changed, in plain words, only for a covered stock. */
  reason: string | null;
  /** Which store said so: the steady call's own record outranks the call log, which outranks the change event. */
  weight: number;
};

function callClause(from: PlainCall, to: PlainCall, position: Position): string {
  if (position === "holding") {
    if (to === "Buy more") return "so it now backs adding to your shares";
    if (to === "Sell some") return "so it now says to sell some of your shares";
    return from === "Buy more" ? "so it no longer backs adding to your shares" : "so it no longer says to sell some of your shares";
  }
  if (to === "Buy more") return "so a stock you're watching now has a buy call";
  if (to === "Sell some") return "so we'd hold off on a stock you're watching";
  return from === "Buy more" ? "so a stock you're watching no longer has a buy call" : "so a stock you're watching is no longer marked to sell";
}

export function callItem(change: CallChangeRecord, mode: Mode): InboxItem | null {
  const ticker = cleanTicker(change.ticker);
  const at = instantOf(change.at);
  if (!ticker || !at || change.from === change.to) return null;
  const day = nyDay(at)!;
  const when = shortDay(day);
  let text: string;
  if (mode === "example") {
    const holds = change.position === "watchlist" ? "is watching" : "holds";
    text = `Our call on ${ticker}, which the example portfolio ${holds}, changed to ${change.to} on ${when}.`;
  } else if (!change.from) {
    const own = change.position === "holding" ? "own" : "watch";
    text = `Our call on ${ticker}, which you ${own}, changed to ${change.to} on ${when}.`;
  } else {
    text = `Our call on ${ticker} moved from ${change.from} to ${change.to} on ${when}, ${callClause(change.from, change.to, change.position)}.`;
  }
  const tone = change.from ? (RANK[change.to] > RANK[change.from] ? "up" : "down") : change.to === "Buy more" ? "up" : change.to === "Sell some" ? "down" : "flat";
  return base({
    id: callChangeId(ticker, day),
    kind: "call",
    at,
    exact: !isBareDay(change.at),
    tickers: [ticker],
    text,
    detail: mode === "mine" && change.reason ? sentence(change.reason) : null,
    href: `/stock/${encodeURIComponent(ticker)}`,
    source: "Our call",
    tone,
    weight: change.weight,
    dedupeKey: callChangeKey(ticker, change.to),
    thread: `call:${ticker}`,
  });
}

/**
 * Changes from a run of daily calls, oldest first: each day whose call differs from the day before (in the words a
 * reader sees, so "trim" to "avoid" is no change).
 */
export function changesFromDays<T extends { at: string; call: PlainCall }>(days: T[]): Array<{ from: PlainCall; to: PlainCall; row: T }> {
  const out: Array<{ from: PlainCall; to: PlainCall; row: T }> = [];
  const sorted = [...days].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1]!.call;
    const now = sorted[i]!.call;
    if (before !== now) out.push({ from: before, to: now, row: sorted[i]! });
  }
  return out;
}

/* ── price alerts ───────────────────────────────────────────────────────── */

export type AlertRecord = { id: string; ticker: string; condition: "above" | "below" | null; target: number | null; triggeredAt: string };

export function alertItem(alert: AlertRecord): InboxItem | null {
  const ticker = cleanTicker(alert.ticker);
  const at = instantOf(alert.triggeredAt);
  if (!ticker || !at || !alert.id) return null;
  const when = shortDay(nyDay(at)!);
  const level = alert.target != null && Number.isFinite(alert.target) && alert.target > 0 ? price(alert.target) : null;
  const text = level
    ? `${ticker} ${alert.condition === "above" ? "rose above" : alert.condition === "below" ? "fell below" : "reached"} ${level} on ${when}, the price you asked us to watch for.`
    : `${ticker} reached the price you asked us to watch for on ${when}.`;
  return base({
    id: `alert:${alert.id}`,
    kind: "alert",
    at,
    tickers: [ticker],
    text,
    href: `/stock/${encodeURIComponent(ticker)}`,
    source: "Your price alert",
    tone: alert.condition === "above" ? "up" : alert.condition === "below" ? "down" : "flat",
    dedupeKey: `alert:${alert.id}`,
  });
}

/* ── reason checks ──────────────────────────────────────────────────────── */

export type Verdict = "holds" | "weaker" | "broken" | "played_out";

export type ReasonRecord = {
  ticker: string;
  /** The day the verdict changed to this one (or the first check's day). */
  day: string;
  verdict: Verdict;
  /** The verdict before, or null on a first check. */
  from: Verdict | null;
  headline: string;
};

export function reasonItem(check: ReasonRecord, mode: Mode): InboxItem | null {
  const ticker = cleanTicker(check.ticker);
  const at = instantOf(check.day);
  if (!ticker || !at) return null;
  if (check.from === check.verdict) return null;
  // A first check that holds is not news.
  if (check.from === null && check.verdict === "holds") return null;
  const when = shortDay(check.day);
  const whose = mode === "mine" ? "you gave" : "the example gives";
  const what =
    check.verdict === "holds"
      ? `is holding up again as of ${when}`
      : check.verdict === "weaker"
        ? check.from === null
          ? `looked weaker at our first check on ${when}`
          : `got weaker on ${when}`
        : check.verdict === "broken"
          ? check.from === null
            ? `no longer held up at our first check on ${when}`
            : `stopped holding up on ${when}`
          : `played out on ${when}`;
  return base({
    id: `reason:${ticker}:${check.day}`,
    kind: "reason",
    at,
    exact: false,
    tickers: [ticker],
    text: `The reason ${whose} for owning ${ticker} ${what}.`,
    detail: check.headline ? sentence(check.headline) : null,
    href: mode === "mine" ? "/portfolio?reasons=1" : "/portfolio",
    source: "Reason watcher",
    tone: check.verdict === "holds" ? "up" : check.verdict === "played_out" ? "flat" : "down",
    dedupeKey: `reason:${ticker}:${check.day}`,
  });
}

/* ── investors they follow ──────────────────────────────────────────────── */

export type FollowRecord = {
  id: string;
  slug: string;
  /** "Nancy Pelosi reported on Nov 6: sold WBD." */
  headline: string;
  date: string;
  tickers: string[];
};

export function followItem(activity: FollowRecord, mine: { owned: Set<string>; watched: Set<string> }): InboxItem | null {
  const at = instantOf(activity.date);
  if (!at || !activity.id || !activity.headline.trim()) return null;
  const tickers = [...new Set(activity.tickers.map(cleanTicker).filter((t): t is string => t !== null))];
  const owned = tickers.filter((t) => mine.owned.has(t));
  const watched = tickers.filter((t) => !mine.owned.has(t) && mine.watched.has(t));
  const yours = [...owned, ...watched];
  const tail = owned.length > 0 ? `, including ${listTickers(owned)}, which you own` : watched.length > 0 ? `, including ${listTickers(watched)}, which you watch` : "";
  const text = tail ? `${withoutStop(activity.headline)}${tail}.` : sentence(activity.headline);
  const ordered = [...yours, ...tickers.filter((t) => !yours.includes(t))];
  return base({
    id: `follow:${activity.id}`,
    kind: "follow",
    at,
    exact: !isBareDay(activity.date),
    tickers: ordered.slice(0, 4),
    text,
    href: `/follow/${encodeURIComponent(activity.slug)}`,
    source: "An investor you follow",
    tone: "flat",
    dedupeKey: `follow:${activity.id}`,
  });
}

/* ── insider buys in their stocks ───────────────────────────────────────── */

export type InsiderRecord = { id: string; ticker: string; insider: string; role: string; value: number | null; filedAt: string; url: string | null };

/** A buy smaller than this is a routine employee purchase, not news. */
export const MIN_INSIDER_BUY = 25_000;

/** "Director", "SVP", "Chairman and CEO, Director" as they read inside a sentence: "director", "SVP", "chairman and CEO, director". */
function roleWords(role: string): string {
  return role
    .trim()
    .split(/(\s+|,)/)
    .map((word) => (/^[A-Z]{2,5}$/.test(word) ? word : word.toLowerCase()))
    .join("");
}

/**
 * Open-market buys in one of the person's stocks, one item per stock per filing day: a single buyer is named, a few
 * are counted with their total. Buys under MIN_INSIDER_BUY are left out.
 */
export function insiderItems(trades: InsiderRecord[], positions: Map<string, Position>, today: string | null = null): InboxItem[] {
  const groups = new Map<string, Array<InsiderRecord & { at: string; day: string; ticker: string }>>();
  for (const trade of trades) {
    const ticker = cleanTicker(trade.ticker);
    const at = instantOf(trade.filedAt);
    const day = at ? nyDay(at) : null;
    if (!ticker || !at || !day || !trade.id || !trade.insider.trim() || !positions.has(ticker)) continue;
    if (trade.value == null || !(trade.value >= MIN_INSIDER_BUY)) continue;
    const key = `${ticker}:${day}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...trade, ticker, at, day }]);
  }
  const out: InboxItem[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const top = sorted[0]!;
    const ticker = top.ticker;
    const total = sorted.reduce((sum, trade) => sum + (trade.value ?? 0), 0);
    const people = new Set(sorted.map((trade) => trade.insider.trim()));
    const role = roleWords(top.role);
    // One short line (owner rule 8): who, how much and when. The stock is the person's own, so it is not said again.
    const when = pastWhen(top.day, today);
    const text = (
      people.size === 1
        ? `${top.insider.trim()}, ${role ? `${role} at ${ticker}` : `an insider at ${ticker}`}, bought ${usd(total)} of ${ticker} ${when}.`
        : `${people.size} insiders at ${ticker} bought ${usd(total)} ${when}, led by ${top.insider.trim()}.`
    )
      .replace(/\s+/g, " ")
      .replace(/ ([.,])/g, "$1");
    const external = Boolean(top.url && /^https:\/\//.test(top.url));
    const latest = sorted.map((trade) => trade.at).sort().pop()!;
    const item = base({
      id: `insider:${key}`,
      kind: "insider",
      at: latest,
      exact: sorted.some((trade) => !isBareDay(trade.filedAt)),
      tickers: [ticker],
      text,
      href: external ? top.url! : `/stock/${encodeURIComponent(ticker)}`,
      external,
      source: "SEC Form 4",
      tone: "up",
      dedupeKey: `insider:${key}`,
    });
    if (item) out.push(item);
  }
  return out;
}

/* ── strategies they follow ─────────────────────────────────────────────── */

export type RebalanceRecord = {
  slug: string;
  name: string;
  /** The session the trades fill, which can be the day after the note was written. */
  date: string;
  /** When the note was written (ISO): the item's time, so a fill dated tomorrow does not sit on top as unread. */
  publishedAt: string | null;
  added: string[];
  removed: string[];
};

/** `locked`: the plan does not include following a strategy, so what it bought and sold is left out. */
export function strategyItem(rebalance: RebalanceRecord, locked: boolean): InboxItem | null {
  const at = instantOf(rebalance.publishedAt) ?? instantOf(rebalance.date);
  if (!at || !rebalance.slug || !rebalance.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(rebalance.date)) return null;
  const when = shortDay(rebalance.date);
  const name = rebalance.name.trim();
  let text: string;
  if (locked) {
    text = `${name}, a strategy you follow, rebalanced on ${when}, and what it bought and sold comes with Pro.`;
  } else {
    const parts = [
      rebalance.added.length > 0 ? `bought ${listTickers(rebalance.added)}` : null,
      rebalance.removed.length > 0 ? `sold ${listTickers(rebalance.removed)}` : null,
    ].filter(Boolean);
    text = parts.length > 0 ? `${name}, a strategy you follow, rebalanced on ${when}: it ${parts.join(" and ")}.` : `${name}, a strategy you follow, rebalanced on ${when} and kept the same stocks.`;
  }
  return base({
    id: `strategy:${rebalance.slug}:${rebalance.date}`,
    kind: "strategy",
    at,
    exact: Boolean(instantOf(rebalance.publishedAt)) && !isBareDay(rebalance.publishedAt),
    tickers: locked ? [] : [...rebalance.added, ...rebalance.removed].map(cleanTicker).filter((t): t is string => t !== null).slice(0, 4),
    text,
    href: `/strategies/${encodeURIComponent(rebalance.slug)}`,
    source: "A strategy you follow",
    locked,
    dedupeKey: `strategy:${rebalance.slug}:${rebalance.date}`,
  });
}

/* ── the weekly memo ────────────────────────────────────────────────────── */

export type MemoRecord = { weekKey: string; monday: string; writtenAt: string; headline: string | null };

export function memoItem(memo: MemoRecord): InboxItem | null {
  const at = instantOf(memo.writtenAt);
  if (!at || !memo.weekKey || !/^\d{4}-\d{2}-\d{2}$/.test(memo.monday)) return null;
  const head = memo.headline ? withoutStop(memo.headline) : "";
  return base({
    id: `memo:${memo.weekKey}`,
    kind: "memo",
    at,
    tickers: [],
    text: head ? `Your memo for the week of ${shortDay(memo.monday)} is ready: ${head}.` : `Your memo for the week of ${shortDay(memo.monday)} is ready.`,
    href: "/portfolio/memo",
    source: "Weekly memo",
    dedupeKey: `memo:${memo.weekKey}`,
  });
}

/* ── results ────────────────────────────────────────────────────────────── */

/** When a report reached the market, New York wall time: before the open, or the close for after it or an unknown time. */
function reportWall(read: Pick<ResultRead, "reportDate" | "session">): string {
  return `${read.reportDate}T${read.session === "bmo" ? "08:00" : "16:00"}`;
}

/**
 * A stock of theirs reported: the results read (lib/results) in one sentence. Placed at the report (before the open, or
 * the close), or when the figures were stored if that was later, so a result that lands after the person last looked is
 * still new to them. The move in it is said with its own day ("rose 25% yesterday", "fell 14% on Nov 10"), so the row
 * reads right under whichever day it sits. Where our call stands is said once by the read above the list, never on every
 * row (owner rule 1).
 */
export function resultsItem(read: ResultRead, position: Position, mode: Mode, today: string): InboxItem | null {
  const ticker = cleanTicker(read.ticker);
  const reported = instantOf(reportWall(read));
  // Never before the figures were stored: a result that lands after the person last looked must still be new to them.
  const stored = instantOf(read.eps?.asOf ?? read.revenue?.asOf ?? read.guidance?.asOf ?? null);
  const landed = reported && stored && Date.parse(stored) > Date.parse(reported) ? stored : reported;
  if (!ticker || !landed) return null;
  // The row sits under the session its move belongs to, the day its sentence names (council, Nov 12: "ASTS rose 8.7%
  // yesterday" and "…fell 8.7% on Tuesday" shared one row, Wednesday's move and Tuesday's report reaction). A move on a
  // later session than the figures is placed at its quote (or that session's close); one on an earlier session at that
  // session's close, still unread until read after the figures landed (`arrivedAt`).
  const moveDay = read.move && DAY_RE.test(read.move.day) ? read.move.day : null;
  let at = landed;
  let arrivedAt: string | undefined;
  if (moveDay && nyDay(landed) !== moveDay) {
    const quoted = instantOf(read.move?.asOf ?? null);
    const close = instantOf(moveDay);
    const placed = quoted && nyDay(quoted) === moveDay ? quoted : close;
    if (placed) {
      if (Date.parse(placed) < Date.parse(landed)) arrivedAt = landed;
      at = placed;
    }
  }
  const who =
    mode === "example"
      ? `${ticker}, which the example portfolio ${position === "watchlist" ? "is watching" : "holds"},`
      : `${ticker}, which you ${position === "holding" ? "own" : "watch"},`;
  // The row is one line, the result and the move (judges, ship 71: 28 words was too many); the read above the list
  // keeps the longer sentence that says whose stock it is.
  const text = resultLine(read, today);
  const headline = resultHeadline(read, today);
  if (!text || !headline) return null;
  const call = read.call && read.call.status !== "pending" ? { status: read.call.status, call: read.call.call } : null;
  return base({
    id: `results:${ticker}:${read.reportDate}`,
    kind: "results",
    at,
    ...(arrivedAt ? { arrivedAt } : {}),
    exact: false,
    tickers: [ticker],
    text,
    detail: null,
    href: `/stock/${encodeURIComponent(ticker)}`,
    source: "Results",
    tone: resultTone(read),
    weight: 1,
    dedupeKey: `results:${ticker}:${read.reportDate}`,
    thread: `results:${ticker}`,
    result: {
      headline,
      figures: resultSentence({ ...read, move: null }, who, today) || text,
      movePct: read.move?.pct ?? null,
      moveSession: read.move?.kind === "after_hours" ? "after_hours" : read.move?.kind === "before_open" ? "pre_market" : null,
      moveWords: read.move ? moveShort(read.move, today) : null,
      call,
      card: resultCardFacts(read),
      movePrice: read.move?.price ?? null,
    },
  });
}
