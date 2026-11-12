/**
 * "Since you last looked" on the briefing: what changed on the person's own stocks between their previous briefing
 * visit and now, ranked, one card per stock. Pure: the reads are in lib/since-visit-server.ts, the visit stamps are
 * written by app/api/briefing/visit/route.ts.
 *
 * The visits live on the person's own user doc as `briefing_visits: { last_at, prev_at }`. A page view posts once;
 * a post within VISIT_DEBOUNCE_MS of `last_at` changes nothing, any later one moves `last_at` to `prev_at` and sets
 * `last_at` to now. The page reads before the post lands, so the view that records a visit still shows what changed.
 */

import { callWordOf, citesOtherMove, reportInstant, type CallWord, type FaceStock } from "@/lib/briefing-face";
import type { BriefingPosition } from "@/lib/briefing";
import { absoluteDay, capitalize, dayPossessive, dayWords, daysFromToday, etDayOf, etToday, onDayWords, stampWords, weekdayName } from "@/lib/day-words";
import { etWallTimeToUtcMs } from "@/lib/market-session";
import { etDayOfStamp } from "@/lib/quote-time";
import { isTradingDay } from "@/lib/results/build";

/* ── visits ─────────────────────────────────────────────────────────────── */

/** Views closer together than this are one visit: the stamps are not moved for them. */
export const VISIT_DEBOUNCE_MS = 30 * 60 * 1000;
/** A previous visit closer than this hides the module: the page below already says it all. */
export const SINCE_MIN_GAP_MS = 3 * 60 * 60 * 1000;
/** The window never reaches further back than this. */
export const SINCE_MAX_DAYS = 14;
/** At most this many cards. */
export const SINCE_MAX_CARDS = 6;
/** A card's fact line is at most this many words. */
export const LINE_MAX_WORDS = 12;

export type BriefingVisits = { last_at: string | null; prev_at: string | null };

const DAY_MS = 86_400_000;

function stampOf(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/** The stored stamps from a user doc's `briefing_visits`, each null when missing or not a time. */
export function readVisits(raw: unknown): BriefingVisits {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { last_at: stampOf(doc.last_at), prev_at: stampOf(doc.prev_at) };
}

/**
 * What a view at `now` writes, or null when it writes nothing (a view within the debounce of the last one, or a
 * `last_at` in the future from a skewed clock).
 */
export function nextVisits(visits: BriefingVisits, now: Date): BriefingVisits | null {
  const last = visits.last_at ? Date.parse(visits.last_at) : NaN;
  if (Number.isFinite(last) && now.getTime() - last < VISIT_DEBOUNCE_MS) return null;
  return { last_at: now.toISOString(), prev_at: visits.last_at };
}

/**
 * Where "since" starts for a view at `now`, read before the view's own post: the last visit, or, when that visit is
 * this same sitting (within the debounce), the one before it. Null on a first visit.
 */
export function visitStart(visits: BriefingVisits, now: Date): string | null {
  const last = visits.last_at ? Date.parse(visits.last_at) : NaN;
  if (!Number.isFinite(last)) return null;
  return now.getTime() - last < VISIT_DEBOUNCE_MS ? visits.prev_at : visits.last_at;
}

export type SinceWindow = {
  /** The visit the window starts at, as stored. */
  since: string;
  /** Where the window starts, in ms: the visit, or SINCE_MAX_DAYS ago when the visit is older. */
  from: number;
  /** The New York day `from` falls on. */
  fromDay: string;
  capped: boolean;
  /** "Since you looked yesterday", "Since Monday", "In the last two weeks". */
  title: string;
  /** "Nothing changed on your stocks since yesterday". */
  quiet: string;
};

/** The window for a view, or null when the module hides: no previous visit, or one under SINCE_MIN_GAP_MS ago. */
export function sinceWindow(since: string | null, now: Date): SinceWindow | null {
  const at = since ? Date.parse(since) : NaN;
  if (!since || !Number.isFinite(at)) return null;
  const gap = now.getTime() - at;
  if (gap < SINCE_MIN_GAP_MS) return null;
  const capped = gap > SINCE_MAX_DAYS * DAY_MS;
  const from = capped ? now.getTime() - SINCE_MAX_DAYS * DAY_MS : at;
  const fromDay = etDayOf(new Date(from).toISOString()) ?? etToday(now);
  const words = sinceWords(since, now, capped);
  return { since, from, fromDay, capped, ...words };
}

const ET_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" });

/** The header and the quiet line for a window starting at `since`. */
export function sinceWords(since: string, now: Date, capped = false): { title: string; quiet: string } {
  const nothing = "Nothing changed on your stocks";
  if (capped) return { title: "In the last two weeks", quiet: `${nothing} in the last two weeks` };
  const today = etToday(now);
  const day = etDayOf(since);
  const gap = day ? daysFromToday(day, today) : null;
  if (gap === null || !day) return { title: "Since you last looked", quiet: `${nothing} since you last looked` };
  if (gap >= 0) {
    const morning = Number(ET_HOUR.format(new Date(since))) < 12;
    return morning
      ? { title: "Since you looked this morning", quiet: `${nothing} since this morning` }
      : { title: "Since you looked earlier today", quiet: `${nothing} since earlier today` };
  }
  if (gap === -1) return { title: "Since you looked yesterday", quiet: `${nothing} since yesterday` };
  const named = gap >= -6 ? weekdayName(day) : absoluteDay(day, today);
  return { title: `Since ${named}`, quiet: `${nothing} since ${named}` };
}

/* ── events ─────────────────────────────────────────────────────────────── */

/**
 * A day-dated event (a call change, a reason check) has no time of its own: it is new only when its New York day is
 * after the visit's day. On the visit's own day it may already have been seen, so it is not shown again.
 */
export function dayIsAfterVisit(day: string, from: number): boolean {
  const visitDay = etDayOf(new Date(from).toISOString());
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Boolean(visitDay) && day > visitDay!;
}

/** A day-dated event's instant for ordering: the end of its New York day. */
export function dayInstant(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return etWallTimeToUtcMs(Number(match[1]), Number(match[2]), Number(match[3]), 23, 59);
}

/** A close's instant: 4 PM New York on its day. */
function closeInstant(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.slice(0, 10));
  if (!match) return null;
  return etWallTimeToUtcMs(Number(match[1]), Number(match[2]), Number(match[3]), 16, 0);
}

export type CallStep = "Add" | "Hold" | "Trim";
const CALL_PLAIN: Record<CallStep, CallWord> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

export type Verdict = "holds" | "weaker" | "broken" | "played_out";

export type SinceInputs = {
  /** The steady call's change log per ticker (tm_call_stability `changes`), any order. */
  calls?: Record<string, Array<{ date: string; from: CallStep | null; to: CallStep }>>;
  /** Daily closes per ticker, oldest first. */
  series?: Record<string, ReadonlyArray<{ date: string; close: number }>>;
  /** The person's agent runs that notified. */
  agentRuns?: Array<{ ran_at: string; job_name: string; findings: AgentFindingLite[] }>;
  /** Reason checks per ticker: the current verdict, its change history, and the person's own words. */
  reasons?: Record<string, { verdict: Verdict; history: Array<{ day: string; verdict: Verdict }>; reason: string | null; kind: string | null }>;
  /** Results reads: ticker, report day and session, and the headline fact ("Beat by 18%"). */
  results?: Array<{ ticker: string; reportDate: string; session: string | null; fact: string | null }>;
  /** Open-market Form 4 trades (already without 10b5-1 plan trades), filed_at an instant. */
  insiders?: Array<{ symbol: string; side: "buy" | "sell"; value: number | null; role: string; insider: string; filed_at: string }>;
  /** Major filings (lib/agent-events-filings `isMajorFiling`), with a short line already worded. */
  filings?: Array<{ ticker: string; filed_at: string; line: string }>;
};

export type AgentFindingLite = {
  ticker: string | null;
  headline: string;
  kind?: string;
  close?: number;
  level?: number | null;
  zone?: "add" | "trim" | null;
  call_from?: string | null;
  call_to?: string;
};

export type SinceKind = "call" | "reason" | "results" | "move" | "filing" | "insider" | "agent";

export type SinceEvent = {
  ticker: string;
  kind: SinceKind;
  line: string;
  score: number;
  at: number;
  /** An agent's level finding: the level and side it crossed, so a stock back over its level drops out. */
  level?: { price: number; zone: "add" | "trim" };
};

export type SinceCard = FaceStock & { line: string; kind: SinceKind };

export type SinceView = {
  /** When the person last looked: "Yesterday, 2:06 PM ET", for the tile that ends a short row. */
  lookedAt: string;
  /** Their next report not already on the page, for the same tile: "XPEV reports Monday before the open". */
  next: { ticker: string; line: string } | null;
  title: string;
  quiet: string;
  cards: SinceCard[];
  /** False when a read failed or timed out: the visit is not recorded then, so nothing unseen is lost. */
  complete: boolean;
  /** Whether "Nothing changed" may show: no cards, every read answered, and no change left to another module. */
  quiet_ok: boolean;
};

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const upper = (ticker: string | null | undefined) => (ticker ?? "").trim().toUpperCase();

/** The line, or null when it is over the word budget. */
export function fits(line: string | null | undefined): string | null {
  const text = (line ?? "").trim();
  return text && wordCount(text) <= LINE_MAX_WORDS ? text : null;
}

/** 9.13 → "9.1%", 12.4 → "12%". */
function pctText(value: number): string {
  const abs = Math.abs(value);
  return `${abs >= 10 ? Math.round(abs) : abs.toFixed(1).replace(/\.0$/, "")}%`;
}

/** "$142.07", "$1,204". */
function priceText(value: number): string {
  const cents = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
}

/** "$1.2M", "$840K". */
function usdText(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

/* ── call changes ───────────────────────────────────────────────────────── */

const SCORE = { call: 100, callSell: 110, reasonBroken: 95, reasonWeaker: 80, reasonPlayedOut: 70, reasonBack: 65, results: 90, filing: 62, insiderBuy: 58, insiderSell: 48, agent: 55, agentLevel: 45, move: 60 } as const;

/** The net call change inside the window: from the call before its first change to the call after its last. */
export function callEvents(calls: SinceInputs["calls"], from: number, today: string): SinceEvent[] {
  const out: SinceEvent[] = [];
  for (const [ticker, list] of Object.entries(calls ?? {})) {
    const inside = list
      .filter((change) => CALL_PLAIN[change.to] && dayIsAfterVisit(change.date.slice(0, 10), from))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (inside.length === 0) continue;
    const first = inside[0]!;
    const last = inside[inside.length - 1]!;
    const before = first.from && CALL_PLAIN[first.from] ? CALL_PLAIN[first.from] : null;
    const after = CALL_PLAIN[last.to];
    if (before === after) continue;
    const when = onDayWords(last.date.slice(0, 10), today);
    const line = fits(before ? `Call moved ${before} → ${after} ${when}` : `Call set to ${after} ${when}`) ?? `Call moved to ${after}`;
    const score = before === "Sell some" || after === "Sell some" ? SCORE.callSell : SCORE.call;
    out.push({ ticker: upper(ticker), kind: "call", line, score, at: dayInstant(last.date.slice(0, 10))! });
  }
  return out;
}

/* ── reason checks ──────────────────────────────────────────────────────── */

const KIND_WORD: Record<string, string> = { growth: "growth", dividend: "dividend", value: "value", product: "product", long_term: "long-term", trade: "trade" };

/** "Your reason “margins expanding”" when the person's words are four or fewer, else "Your growth reason", else "Your reason". */
export function reasonLead(reason: string | null, kind: string | null): string {
  const words = (reason ?? "").replace(/[.!?…]+$/, "").trim();
  if (words && wordCount(words) <= 4) return `Your reason “${words}”`;
  const kindWord = kind ? KIND_WORD[kind] : null;
  return kindWord ? `Your ${kindWord} reason` : "Your reason";
}

const VERDICT_RANK: Record<Verdict, number> = { broken: 0, weaker: 1, played_out: 2, holds: 3 };

/** A reason check whose verdict at the start of the window differs from now: broke, weakened, played out or recovered. */
export function reasonEvents(reasons: SinceInputs["reasons"], from: number): SinceEvent[] {
  const out: SinceEvent[] = [];
  for (const [ticker, check] of Object.entries(reasons ?? {})) {
    const rows = [...check.history].filter((row) => dayInstant(row.day) != null).sort((a, b) => a.day.localeCompare(b.day));
    const before = [...rows].reverse().find((row) => !dayIsAfterVisit(row.day, from));
    // A reason first checked inside the window has no "before": nothing changed for the person.
    if (!before || before.verdict === check.verdict) continue;
    const changed = rows.filter((row) => dayIsAfterVisit(row.day, from) && row.verdict === check.verdict).pop();
    const lead = reasonLead(check.reason, check.kind);
    let line: string;
    let score: number;
    if (check.verdict === "broken") [line, score] = [`${lead} broke`, SCORE.reasonBroken];
    else if (check.verdict === "weaker") [line, score] = [`${lead} got weaker`, SCORE.reasonWeaker];
    else if (check.verdict === "played_out") [line, score] = [`${lead} played out`, SCORE.reasonPlayedOut];
    else if (VERDICT_RANK[before.verdict] < VERDICT_RANK.holds) [line, score] = [`${lead} holds again`, SCORE.reasonBack];
    else continue;
    out.push({ ticker: upper(ticker), kind: "reason", line: fits(line) ?? "Your reason check changed", score, at: changed ? dayInstant(changed.day)! : from + 1 });
  }
  return out;
}

/* ── results ────────────────────────────────────────────────────────────── */

export function resultEvents(results: SinceInputs["results"], from: number, today: string, now: number = Date.now()): SinceEvent[] {
  const out: SinceEvent[] = [];
  for (const read of results ?? []) {
    const at = reportInstant(read.reportDate, read.session);
    // Out after the window started and already out now, with a figure to say (a row with no EPS yet is not a report).
    if (at == null || at <= from || at > now || !read.fact?.trim()) continue;
    // With no session time the 4 PM default is a guess: such a report is new only on a day after the visit's day.
    if (read.session !== "bmo" && read.session !== "amc" && !dayIsAfterVisit(read.reportDate, from)) continue;
    // "Missed by 7.3% in Monday's report", "Today's report was in line": led by the figure, the day once.
    const report = `${dayPossessive(read.reportDate, today)} report`;
    const fact = read.fact.trim();
    const said = /^in line\b/i.test(fact) ? `${capitalize(report)} was in line` : `${fact} in ${report}`;
    // Too long with the day: the figure alone, then its first clause ("Beat by 9.5%"), else no card.
    const line = fits(said) ?? fits(fact) ?? fits(fact.split(/,\s*/)[0]);
    if (!line) continue;
    out.push({ ticker: upper(read.ticker), kind: "results", line, score: SCORE.results, at });
  }
  return out;
}

/* ── big moves ──────────────────────────────────────────────────────────── */

/** A move counts when it is at least this big… */
export const MOVE_MIN_PCT = 4;
/** …and at least this many times the stock's usual move over as many sessions (usual day × √sessions). */
export const MOVE_USUAL_MULTIPLE = 2.5;
/** Daily moves the "usual" is measured on. */
const USUAL_SESSIONS = 60;

export type WindowMove = { pct: number; sessions: number; usual: number; ratio: number };

/** The first New York trading day after `day`, stepping over weekends and NYSE holidays. */
function nextTradingDay(day: string): string {
  let at = shiftDay(day, 1);
  for (let guard = 0; guard < 10 && !isTradingDay(at); guard++) at = shiftDay(at, 1);
  return at;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Trading days after `from` up to and including `to`. */
function tradingDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let at = shiftDay(from, 1), guard = 0; at <= to && guard < 40; at = shiftDay(at, 1), guard++) if (isTradingDay(at)) count += 1;
  return count;
}

/**
 * The move from the first price known after the visit to the price now: the visit day's close when the visit was
 * before that close, else the next session's close. Never from before the visit, so nothing the person already saw
 * is in the figure. With the stock's usual daily move (mean absolute daily change over the sessions up to that close).
 * Null without enough history, when the stored closes do not have that session (a stale history), or when no full
 * session has passed since it.
 */
export function windowMove(series: ReadonlyArray<{ date: string; close: number }> | undefined, from: number, price: number | null, priceAsOf: string | null): WindowMove | null {
  if (!series || series.length < 22 || !fin(price) || price <= 0) return null;
  const fromDay = etDayOf(new Date(from).toISOString());
  if (!fromDay) return null;
  let refDay = fromDay;
  if (!isTradingDay(refDay) || (closeInstant(refDay) ?? -Infinity) < from) refDay = nextTradingDay(refDay);
  const refIndex = series.findIndex((point) => point.date.slice(0, 10) === refDay);
  if (refIndex < 20) return null;
  const ref = series[refIndex]!.close;
  if (!fin(ref) || ref <= 0) return null;
  const priceDay = etDayOfStamp(priceAsOf);
  if (!priceDay || priceDay <= refDay) return null;
  const changes: number[] = [];
  for (let index = Math.max(1, refIndex - USUAL_SESSIONS + 1); index <= refIndex; index += 1) {
    const a = series[index - 1]!.close;
    const b = series[index]!.close;
    if (fin(a) && fin(b) && a > 0) changes.push(Math.abs(b / a - 1) * 100);
  }
  if (changes.length < 20) return null;
  const usual = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  if (!(usual > 0)) return null;
  const sessions = Math.max(1, tradingDaysBetween(refDay, priceDay));
  const pct = (price / ref - 1) * 100;
  return { pct, sessions, usual, ratio: Math.abs(pct) / (usual * Math.sqrt(sessions)) };
}

export function isBigMove(move: WindowMove | null): move is WindowMove {
  return Boolean(move && Math.abs(move.pct) >= MOVE_MIN_PCT && move.ratio >= MOVE_USUAL_MULTIPLE);
}

/** "3×", "twice". */
function timesWords(ratio: number): string {
  const rounded = Math.round(ratio);
  return rounded <= 2 ? "twice" : `${rounded}×`;
}

/**
 * The move's line: "Down 16.6%, 3× its usual day", "Up 12% over 4 sessions", or with a confirmed reason from the
 * page's own "Why it moved" read: "Down 5.2%: Nvidia supply warning hits suppliers". The reason is only used when the
 * whole line fits and today's move goes the same way as the window's and is most of it.
 */
export function moveLine(move: WindowMove, reason: { line: string; todayPct: number | null } | null): { line: string; withReason: boolean } {
  const lead = `${move.pct >= 0 ? "Up" : "Down"} ${pctText(move.pct)}`;
  const reasonText = reason?.line?.trim().replace(/\.$/, "");
  const sameWay = reason && fin(reason.todayPct) && Math.sign(reason.todayPct) === Math.sign(move.pct) && Math.abs(reason.todayPct) >= Math.abs(move.pct) / 2;
  if (reasonText && sameWay && !citesOtherMove(reasonText, move.pct)) {
    const withReason = fits(`${lead}: ${reasonText}`);
    if (withReason) return { line: withReason, withReason: true };
  }
  if (move.sessions > 1) return { line: `${lead} over ${move.sessions} sessions`, withReason: false };
  const ratio = Math.abs(move.pct) / move.usual;
  return { line: ratio >= 2 ? `${lead}, ${timesWords(ratio)} its usual day` : lead, withReason: false };
}

/* ── agent findings, insiders, filings ──────────────────────────────────── */

/** Finding kinds that are a change worth a card here; moves and upcoming reports are told by other cards. */
const AGENT_KINDS = new Set(["level", "call", "filing", "insider", "congress", "news"]);

function agentLine(finding: AgentFindingLite, ticker: string): string | null {
  if (finding.kind === "level" && fin(finding.level) && (finding.zone === "add" || finding.zone === "trim")) {
    // The card shows the price now; the line says where the agent saw it close against the level.
    const side = fin(finding.close) && Math.abs(finding.close - finding.level) < 0.005 ? "At" : finding.zone === "add" ? "Closed under" : "Closed over";
    return `${side} its ${priceText(finding.level)} ${finding.zone === "add" ? "buy-more" : "sell-some"} level`;
  }
  if (finding.kind === "call" && finding.call_to) {
    return fits(finding.call_from ? `Call moved ${finding.call_from} → ${finding.call_to}` : `Call moved to ${finding.call_to}`);
  }
  // Otherwise the agent's own headline, without the ticker the card already shows ("NVDA filed an 8-K…").
  const headline = finding.headline.trim();
  const stripped = headline.toUpperCase().startsWith(`${ticker} `) ? headline.slice(ticker.length + 1) : null;
  return stripped ? fits(capitalize(stripped.replace(/\.$/, ""))) : null;
}

export function agentEvents(runs: SinceInputs["agentRuns"], from: number): SinceEvent[] {
  const out: SinceEvent[] = [];
  for (const run of runs ?? []) {
    const at = Date.parse(run.ran_at);
    if (!Number.isFinite(at) || at <= from) continue;
    for (const finding of run.findings) {
      const ticker = upper(finding.ticker);
      if (!ticker || !finding.kind || !AGENT_KINDS.has(finding.kind)) continue;
      const line = agentLine(finding, ticker);
      if (!line) continue;
      // A call change the agent saw is a call change, whoever told it.
      const kind: SinceKind = finding.kind === "call" ? "call" : "agent";
      const level = finding.kind === "level" && fin(finding.level) && (finding.zone === "add" || finding.zone === "trim") ? { price: finding.level, zone: finding.zone } : undefined;
      out.push({ ticker, kind, line, score: kind === "call" ? SCORE.call : level ? SCORE.agentLevel : SCORE.agent, at, ...(level ? { level } : {}) });
    }
  }
  return out;
}

/** Form 4 trades of note: open-market buys from $100K, sales from $1M, outside a 10b5-1 plan (filtered upstream). */
export const INSIDER_BUY_MIN = 100_000;
export const INSIDER_SELL_MIN = 1_000_000;

/** "CEO", "CFO", "A director", "An insider". */
function roleWord(role: string): string {
  if (/\bchief executive|\bCEO\b/i.test(role)) return "CEO";
  if (/\bchief financial|\bCFO\b/i.test(role)) return "CFO";
  if (/\bpresident\b/i.test(role)) return "President";
  if (/\bdirector\b/i.test(role)) return "A director";
  return "An insider";
}

/**
 * The New York wall-clock times the Form 4 job stores ("2026-11-12T06:02:52", no zone) as instants. A stamp with a
 * zone is read as it is.
 */
export function insiderInstant(filedAt: string): number | null {
  const text = filedAt.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const at = Date.parse(text);
    return Number.isFinite(at) ? at : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(text);
  if (!match) return null;
  return etWallTimeToUtcMs(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0));
}

export function insiderEvents(trades: SinceInputs["insiders"], from: number): SinceEvent[] {
  const groups = new Map<string, { ticker: string; side: "buy" | "sell"; value: number; insiders: Map<string, string>; at: number }>();
  for (const trade of trades ?? []) {
    const at = insiderInstant(trade.filed_at);
    if (at == null || at <= from || !fin(trade.value) || trade.value <= 0) continue;
    const ticker = upper(trade.symbol);
    const key = `${ticker}:${trade.side}`;
    const group = groups.get(key) ?? { ticker, side: trade.side, value: 0, insiders: new Map<string, string>(), at };
    group.value += trade.value;
    group.insiders.set(trade.insider || trade.role, trade.role);
    group.at = Math.max(group.at, at);
    groups.set(key, group);
  }
  const out: SinceEvent[] = [];
  for (const group of groups.values()) {
    if (group.value < (group.side === "buy" ? INSIDER_BUY_MIN : INSIDER_SELL_MIN)) continue;
    const verb = group.side === "buy" ? "bought" : "sold";
    const who = group.insiders.size === 1 ? roleWord([...group.insiders.values()][0]!) : `${group.insiders.size} insiders`;
    out.push({
      ticker: group.ticker,
      kind: "insider",
      line: `${who} ${verb} ${usdText(group.value)} of shares`,
      score: (group.side === "buy" ? SCORE.insiderBuy : SCORE.insiderSell) + (group.value >= 1_000_000 ? 5 : 0),
      at: group.at,
    });
  }
  return out;
}

export function filingEvents(filings: SinceInputs["filings"], from: number): SinceEvent[] {
  const out: SinceEvent[] = [];
  for (const filing of filings ?? []) {
    const at = Date.parse(filing.filed_at);
    const line = fits(filing.line);
    if (!Number.isFinite(at) || at <= from || !line) continue;
    out.push({ ticker: upper(filing.ticker), kind: "filing", line, score: SCORE.filing, at });
  }
  return out;
}

/* ── the view ───────────────────────────────────────────────────────────── */

/** "Yesterday, 2:06 PM ET", "Today, 9:41 AM ET", "Monday, 4:12 PM ET", "Over two weeks ago". */
export function lookedAtWords(window: SinceWindow, now: Date): string {
  if (window.capped) return "Over two weeks ago";
  const words = stampWords(window.since, now);
  return /^\d/.test(words) ? `Today, ${words}` : capitalize(words);
}

/**
 * The person's next report that has not come out yet and that no other card already names: "XPEV reports Monday
 * before the open". Null when none is scheduled.
 */
export function nextReport(positions: readonly BriefingPosition[], skip: ReadonlySet<string>, now: Date): { ticker: string; line: string } | null {
  const today = etToday(now);
  const upcoming = positions
    .filter((position) => position.earnings_date && position.earnings_date >= today && !skip.has(upper(position.ticker)))
    .map((position) => ({ position, at: reportInstant(position.earnings_date!, position.earnings_time) }))
    .filter((entry): entry is { position: BriefingPosition; at: number } => entry.at != null && entry.at > now.getTime())
    .sort((a, b) => a.at - b.at || a.position.ticker.localeCompare(b.position.ticker));
  const first = upcoming[0]?.position;
  if (!first) return null;
  const when = first.earnings_time === "bmo" ? " before the open" : first.earnings_time === "amc" ? " after the close" : "";
  const ticker = upper(first.ticker);
  return { ticker, line: `${ticker} reports ${dayWords(first.earnings_date!, today)}${when}` };
}

/**
 * Every stock another module on the briefing shows today, worked out before this module takes any: the top news,
 * every "Why it moved" card (results cards too), "Buy more levels" and the week's reports. Do today is `exclude`.
 */
export function toldElsewhere(modules: {
  topNews: Iterable<string>;
  moved: ReadonlyArray<{ ticker: string }>;
  levels: ReadonlyArray<{ ticker: string }>;
  week: ReadonlyArray<{ stocks: ReadonlyArray<{ ticker: string }> }>;
}): Set<string> {
  return new Set([
    ...modules.topNews,
    ...modules.moved.map((card) => card.ticker),
    ...modules.levels.map((row) => row.ticker),
    ...modules.week.flatMap((day) => day.stocks.map((stock) => stock.ticker)),
  ].map(upper));
}

/** Whether the module has anything to show: cards, or the quiet line. */
export function sinceShows(view: SinceView | null): view is SinceView {
  return Boolean(view && (view.cards.length > 0 || view.quiet_ok));
}

/**
 * The module for one view. Null when it hides: no window (no previous visit, or one under three hours ago), or no
 * positions. With a window and nothing changed it is a view with no cards (the quiet line).
 *
 * - `exclude`: stocks a module above already shows today (Do today): never a card here.
 * - `told`: every stock another module on the page shows today (toldElsewhere: top news, Why it moved with its
 *   results cards, Buy more levels, the week's reports). A move, insider trade, filing or agent finding on one is left
 *   there; only a call change, a reason check or a report takes the stock here.
 */
export function buildSinceVisit(input: {
  window: SinceWindow | null;
  positions: readonly BriefingPosition[];
  inputs: SinceInputs;
  exclude?: ReadonlySet<string>;
  told?: ReadonlySet<string>;
  complete?: boolean;
  now: Date;
}): SinceView | null {
  const { window } = input;
  if (!window || input.positions.length === 0) return null;
  const today = etToday(input.now);
  const byTicker = new Map(input.positions.map((position) => [upper(position.ticker), position]));
  const covered = (ticker: string) => byTicker.get(ticker)?.covered !== false;
  const exclude = input.exclude ?? new Set<string>();

  const events: SinceEvent[] = [
    // A stock the plan does not cover gets no call, reason check or results read here, as elsewhere on the briefing.
    ...callEvents(input.inputs.calls, window.from, today).filter((event) => covered(event.ticker)),
    ...reasonEvents(input.inputs.reasons, window.from).filter((event) => covered(event.ticker)),
    ...resultEvents(input.inputs.results, window.from, today, input.now.getTime()).filter((event) => covered(event.ticker)),
    ...agentEvents(input.inputs.agentRuns, window.from).filter((event) => {
      if (!event.level) return true;
      // A level finding stays only while the price is still past the level, and only beside the call that level belongs
      // to (a call shows only its own level): a buy-more level under Buy more, a sell-some level under Sell some.
      const position = byTicker.get(event.ticker);
      const price = position?.price;
      const still = fin(price) && (event.level.zone === "add" ? price <= event.level.price : price >= event.level.price);
      const ownCall = callWordOf(position?.stance) === (event.level.zone === "add" ? "Buy more" : "Sell some");
      return still && ownCall && covered(event.ticker);
    }),
    ...insiderEvents(input.inputs.insiders, window.from),
    ...filingEvents(input.inputs.filings, window.from),
  ];
  // Changes left to another module on the page: "Nothing changed" must not show beside them.
  let elsewhere = 0;
  for (const [ticker, position] of byTicker) {
    const move = windowMove(input.inputs.series?.[ticker], window.from, position.price, position.price_as_of);
    if (!isBigMove(move)) continue;
    // A move on a stock another module shows (Why it moved with its reason, top news, …) stays there.
    if (input.told?.has(ticker)) {
      elsewhere += 1;
      continue;
    }
    const { line } = moveLine(move, null);
    events.push({ ticker, kind: "move", line, score: SCORE.move + Math.min(25, Math.round(move.ratio * 4)), at: input.now.getTime() });
  }

  // A stock another module tells today (Why it moved with its reason, Buy more levels, top news) keeps it there unless
  // the change here matters more than that: a call change, a reason check or a report. Moves never claim one.
  const told = input.told ?? new Set<string>();
  const claims = (event: SinceEvent) =>
    !told.has(event.ticker) || event.kind === "call" || event.kind === "reason" || event.kind === "results";
  // One card per stock: its most important change, held stocks first on a tie.
  const best = new Map<string, SinceEvent>();
  for (const event of events) {
    if (!byTicker.has(event.ticker)) continue;
    if (exclude.has(event.ticker) || !claims(event)) {
      elsewhere += 1;
      continue;
    }
    const held = best.get(event.ticker);
    if (!held || event.score > held.score || (event.score === held.score && event.at > held.at)) best.set(event.ticker, event);
  }
  const weight = (ticker: string) => (byTicker.get(ticker)?.relation === "holding" ? 3 : 0);
  const cards = [...best.values()]
    .sort((a, b) => b.score + weight(b.ticker) - (a.score + weight(a.ticker)) || b.at - a.at || a.ticker.localeCompare(b.ticker))
    .slice(0, SINCE_MAX_CARDS)
    .map((event): SinceCard => {
      const position = byTicker.get(event.ticker)!;
      return {
        ticker: event.ticker,
        name: position.name,
        price: position.price,
        pct: position.day_change_pct,
        call: callWordOf(position.stance),
        href: `/stock/${encodeURIComponent(event.ticker)}`,
        line: event.line,
        kind: event.kind,
      };
    });
  // "Nothing changed" would be wrong when a change was left to another module on the page.
  const complete = input.complete !== false;
  return { lookedAt: lookedAtWords(window, input.now), next: nextReport(input.positions, new Set([...exclude, ...cards.map((card) => card.ticker)]), input.now), title: window.title, quiet: window.quiet, cards, complete, quiet_ok: cards.length === 0 && complete && elsewhere === 0 };
}
