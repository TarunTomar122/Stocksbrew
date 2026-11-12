import { redactOurLevels } from "@/lib/entitlements";
import { shortDay } from "@/lib/inbox/merge";
import { signedMove } from "@/lib/inbox/read";
import type { InboxItem, UpcomingReport } from "@/lib/inbox/types";
import { reportSentence } from "@/lib/inbox/words";
import type { DailySeries } from "@/lib/portfolio-shared";

import type { PlainCallWord, Thread, ThreadCall, ThreadDay, ThreadFigure, ThreadNote, ThreadStatus, ThreadStep } from "./types";

/**
 * The agent thread, built from records the app already reads (the morning briefing's read, the inbox's items and
 * reports coming up, each stock's daily closes and our calls). Pure: the store reads live in ./server.ts, so every
 * note's wording is tested here on plain records. A record that cannot make a whole note is left out, never padded.
 */

/** Our call on a stock as the thread says it: the plain word and its own level, when the viewer may see it. */
export type CallLine = { word: PlainCallWord; level: string | null };

/** How a group of stocks closed one session against the S&P 500, from their daily closes. */
export type SessionMove = {
  day: string;
  /** The average close-to-close move of the stocks counted, percent. */
  pct: number;
  /** The S&P 500 (SPY) the same session, percent, or null without its closes. */
  marketPct: number | null;
  /** The stocks that had both closes. */
  tickers: string[];
};

/** The morning briefing's read for the thread's today (lib/briefing-read.ts briefingRead). */
export type MorningRead = {
  headline: string;
  /** The New York day the read's prices are from: an earlier session before the open or on a weekend. */
  sessionDay: string;
  /** The holdings' move in the headline, percent, when the person's sizes give one. */
  pct: number | null;
};

export type ThreadInput = {
  status: ThreadStatus;
  example: boolean;
  today: string;
  items: readonly InboxItem[];
  upcoming: readonly UpcomingReport[];
  morning: MorningRead | null;
  sessions: readonly SessionMove[];
  /** How many stocks the session lines are about, and whether they are holdings or watched names. */
  group: { total: number; holdings: boolean };
  calls: Readonly<Record<string, CallLine>>;
  /** Whether the viewer's plan shows our levels on this stock. Anything else has its levels taken out. */
  levels: (ticker: string) => boolean;
  stocks: number;
  /** Most days shown, today included. */
  maxDays?: number;
};

export const THREAD_DAYS = 5;
/** A report this many days ahead or fewer is the step after a move on that stock. */
const STEP_REPORT_DAYS = 14;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ── small words ────────────────────────────────────────────────────────── */

function dayGap(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function weekday(day: string): string {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? "";
}

/** "Today", "Yesterday", "Tuesday" within the week, else "Nov 3". */
export function dayName(day: string, today: string): string {
  const gap = dayGap(day, today);
  if (gap === 0) return "Today";
  if (gap === 1) return "Yesterday";
  if (gap > 1 && gap < 7) return weekday(day);
  return shortDay(day);
}

/** How a session's day is said inside a sentence: "today", "yesterday", "on Tuesday", "on Nov 3". */
function sessionWhen(day: string, today: string): string {
  const name = dayName(day, today);
  return name === "Today" || name === "Yesterday" ? name.toLowerCase() : `on ${name}`;
}

function pct(value: number, digits = 1): string {
  return `${Math.abs(value).toFixed(digits)}%`;
}

export function signedPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : "−"}${pct(value, digits)}`;
}

function toneOf(value: number, band = 0.05): "up" | "down" | "flat" {
  return value > band ? "up" : value < -band ? "down" : "flat";
}

/** "4:35 PM ET" in New York. */
export function clockOf(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

export function callHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}#call`;
}

/** "before Tuesday", "before tomorrow", "before the report": when a step has to happen by. */
function beforeWords(date: string, today: string): string {
  const gap = dayGap(today, date);
  if (gap <= 0) return "before the report";
  if (gap === 1) return "before tomorrow";
  if (gap < 7) return `before ${weekday(date)}`;
  return `before ${shortDay(date)}`;
}

/* ── how the stocks closed ──────────────────────────────────────────────── */

function closeMove(series: DailySeries | null | undefined, day: string): number | null {
  if (!series) return null;
  const index = series.dates.lastIndexOf(day);
  if (index < 1) return null;
  const now = series.closes[index];
  const before = series.closes[index - 1];
  if (!(typeof now === "number" && now > 0 && typeof before === "number" && before > 0)) return null;
  return (now / before - 1) * 100;
}

/**
 * Each of the last `count` sessions on or before `today` (the benchmark's own trading days): the stocks' average
 * close-to-close move against the S&P 500's. A session counts only when at least half the stocks have both closes,
 * so a line never speaks for a group it barely measured.
 */
export function sessionMoves(input: {
  series: ReadonlyMap<string, DailySeries>;
  tickers: readonly string[];
  benchmark: DailySeries | null;
  today: string;
  count?: number;
}): SessionMove[] {
  const { benchmark, tickers } = input;
  if (!benchmark || tickers.length === 0) return [];
  const days = benchmark.dates.filter((day) => DAY_RE.test(day) && day <= input.today).slice(-(input.count ?? THREAD_DAYS));
  const out: SessionMove[] = [];
  for (const day of days) {
    const counted: string[] = [];
    let sum = 0;
    for (const ticker of tickers) {
      const move = closeMove(input.series.get(ticker), day);
      if (move === null || !Number.isFinite(move)) continue;
      counted.push(ticker);
      sum += move;
    }
    if (counted.length === 0 || counted.length * 2 < tickers.length) continue;
    out.push({ day, pct: sum / counted.length, marketPct: closeMove(benchmark, day), tickers: counted });
  }
  return out;
}

/** "0.4 points better than the S&P 500", "in line with the S&P 500", or "" without the market's figure. */
export function againstMarket(move: number, market: number | null): string {
  if (market === null || !Number.isFinite(market)) return "";
  const gap = Number((Number(move.toFixed(1)) - Number(market.toFixed(1))).toFixed(1));
  if (Math.abs(gap) < 0.15) return "in line with the S&P 500";
  return `${Math.abs(gap).toFixed(1)} ${Math.abs(gap) === 1 ? "point" : "points"} ${gap > 0 ? "better" : "worse"} than the S&P 500`;
}

/**
 * One sentence on how the stocks closed a session against the S&P 500: "Yesterday your 8 holdings rose 0.8% on
 * average, 0.5 points better than the S&P 500."
 */
export function sessionSentence(move: SessionMove, today: string, group: ThreadInput["group"]): string {
  const when = sessionWhen(move.day, today);
  const lead = when.charAt(0).toUpperCase() + when.slice(1);
  const flat = Math.abs(move.pct) < 0.05;
  const verb = flat ? "were flat" : `${move.pct > 0 ? "rose" : "fell"} ${pct(move.pct)}`;
  const versus = againstMarket(move.pct, move.marketPct);
  const tail = versus ? `, ${versus}` : "";
  if (move.tickers.length === 1) {
    const only = move.tickers[0]!;
    const verb1 = flat ? "was flat" : `${move.pct > 0 ? "rose" : "fell"} ${pct(move.pct)}`;
    return `${lead}, ${only} ${verb1}${tail}.`;
  }
  const noun = group.holdings ? "holdings" : "stocks";
  const who = move.tickers.length < group.total ? `${move.tickers.length} of your ${group.total} ${noun}` : `your ${move.tickers.length} ${noun}`;
  return `${lead}, ${who} ${verb}${flat ? "" : " on average"}${tail}.`;
}

/* ── notes ──────────────────────────────────────────────────────────────── */

function emptyNote(partial: Pick<ThreadNote, "id" | "kind" | "text"> & Partial<ThreadNote>): ThreadNote {
  return {
    at: null,
    clock: null,
    tickers: [],
    sub: null,
    figure: null,
    reason: null,
    call: null,
    step: null,
    recent: [],
    reports: [],
    source: null,
    locked: false,
    morning: false,
    ...partial,
  };
}

/** The agent itself is the one talking: its own name is never a note's source. */
const AGENT_SOURCES = new Set(["Your agent", "Your agents", "Example agent", "Example agents"]);

/** The one next step after an event, specific to what happened. */
export function eventStep(item: InboxItem, reportsAhead: ReadonlyMap<string, string>, today: string): ThreadStep | null {
  const lead = item.tickers[0] ?? null;
  const one = item.tickers.length === 1 ? lead : null;
  switch (item.kind) {
    case "agent": {
      if (!one) return { label: "See what your agent found", href: item.href, external: item.external };
      const report = reportsAhead.get(one);
      return { label: report ? `Check our call on ${one} ${beforeWords(report, today)}` : `Check our call on ${one}`, href: callHref(one) };
    }
    case "alert":
      return one ? { label: `Check our call on ${one}`, href: callHref(one) } : null;
    case "call":
      return one ? { label: `See why our call on ${one} changed`, href: callHref(one) } : null;
    case "results":
      return one ? { label: `Read ${one}'s results`, href: item.href, external: item.external } : null;
    case "reason":
      return { label: one ? `See the check on ${one}` : "See the check", href: item.href, external: item.external };
    case "follow":
      return { label: item.external ? "Open the filing" : "See the trades", href: item.href, external: item.external };
    case "insider":
      return { label: item.external ? "Read the Form 4" : "See the trade", href: item.href, external: item.external };
    case "strategy":
      return { label: "See the rebalance", href: item.href, external: item.external };
    case "memo":
      return { label: "Read this week's memo", href: item.href, external: item.external };
    default:
      return null;
  }
}

/** The figure an event shows big: the move it reports, when it reports one. */
function eventFigure(item: InboxItem, text: string): ThreadFigure | null {
  if (item.move && Number.isFinite(item.move.pct)) return { value: signedPct(item.move.pct), tone: toneOf(item.move.pct) };
  // Only kinds whose sentence is about a price: a fund's "raised its stake 25%" is not a move.
  if (item.kind !== "agent" && item.kind !== "alert" && item.kind !== "results") return null;
  const move = signedMove(text);
  return move ? { value: move.value, tone: move.tone } : null;
}

const MONEY = /[$₹]\s?\d/;
const OUR_LEVEL = /\bour call\b|\bbuy[- ]more\b|\bsell[- ]some\b|\blevels?\b|\bzones?\b|\bagainst [$₹]/i;

/**
 * A sentence with one of our price levels in it is the plan's (lib/entitlements redactOurLevels), and so is one that
 * puts a price beside what our call says to do ("at or below $142.07, where our call says to buy more").
 */
export function withoutLevels(text: string): string {
  return redactOurLevels(text)
    .split(/(?<=[.!?;])\s+/)
    .filter((sentence) => !(MONEY.test(sentence) && OUR_LEVEL.test(sentence)))
    .join(" ")
    .trim();
}

/** An event as a note, with the levels taken out of anything the viewer's plan does not show. Null when nothing is left. */
export function eventNote(item: InboxItem, input: Pick<ThreadInput, "levels" | "today">, reportsAhead: ReadonlyMap<string, string>): ThreadNote | null {
  // A note about no stock in particular (a memo, a rebalance) is treated as gated: its levels are taken out too.
  const visible = item.tickers.length > 0 && item.tickers.every((ticker) => input.levels(ticker));
  const text = (visible ? item.text : withoutLevels(item.text)).trim();
  if (!text) return null;
  // A level finding's second line is each close against our level ("AMD at $140.10 against $142.07"): all plan.
  const levelDetail = item.id.startsWith("level:");
  const detail = item.detail && (visible || !levelDetail) ? (visible ? item.detail : withoutLevels(item.detail)).trim() : "";
  const clock = item.exact ? clockOf(item.at) : null;
  if (item.quiet) return emptyNote({ id: item.id, kind: "quiet", text, at: item.at, clock });
  return emptyNote({
    id: item.id,
    kind: "event",
    at: item.at,
    clock,
    tickers: item.tickers,
    text,
    figure: eventFigure(item, text),
    reason: detail || null,
    step: eventStep(item, reportsAhead, input.today),
    source: AGENT_SOURCES.has(item.source) ? null : item.source,
    locked: item.locked,
  });
}

/** Reports coming up, as one note: alone it is the stock's own note, several share one with a row each. */
export function upcomingNote(reports: readonly UpcomingReport[], today: string, calls: Readonly<Record<string, CallLine>>): ThreadNote | null {
  const sorted = [...reports].filter((report) => DAY_RE.test(report.date)).sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  const first = sorted[0];
  if (!first) return null;
  const step: ThreadStep = { label: `Check our call on ${first.ticker} ${beforeWords(first.date, today)}`, href: callHref(first.ticker) };
  if (sorted.length === 1) {
    const usual = first.usualPct !== null && Number.isFinite(first.usualPct) && first.usualPct > 0 ? first.usualPct : null;
    const call = calls[first.ticker];
    return emptyNote({
      id: `upcoming:${first.ticker}:${first.date}`,
      kind: "upcoming",
      tickers: [first.ticker],
      text: reportSentence(first, today),
      figure: usual !== null ? { value: pct(usual), tone: "flat", label: "usual report move" } : null,
      call: call ? { ticker: first.ticker, ...call } : null,
      step,
    });
  }
  const last = sorted[sorted.length - 1]!;
  const span = dayGap(today, last.date);
  const by = span <= 0 ? "today" : span === 1 ? "by tomorrow" : span < 7 ? `by ${weekday(last.date)}` : `by ${shortDay(last.date)}`;
  return emptyNote({
    id: `upcoming:${sorted.map((report) => `${report.ticker}:${report.date}`).join(",")}`,
    kind: "upcoming",
    tickers: sorted.map((report) => report.ticker),
    text: `${countWord(sorted.length)} of your stocks report ${by}.`,
    reports: sorted.map((report) => ({ ticker: report.ticker, date: report.date, text: reportSentence(report, today) })),
    step,
  });
}

/**
 * The day's opening note from the morning read: one line on how the stocks did against the S&P 500, with the
 * briefing one tap away. No cards of what matters under it (owner, Nov 12: the read blocks were "super useless").
 */
function morningNote(morning: MorningRead, session: SessionMove | null, input: ThreadInput): ThreadNote {
  // A read without the holdings' move (no sizes entered) leads with the closes' line instead.
  const lead = morning.pct === null && session ? sessionSentence(session, input.today, input.group) : morning.headline;
  const figureMove = morning.pct ?? session?.pct ?? null;
  return emptyNote({
    id: `opener:${input.today}`,
    kind: "opener",
    text: lead,
    figure: figureMove !== null && Number.isFinite(figureMove) ? { value: signedPct(figureMove), tone: toneOf(figureMove) } : null,
    step: { label: input.example ? "Open the example's briefing" : "Open today's briefing", href: "/briefing" },
    morning: true,
  });
}

function sessionNote(session: SessionMove, input: ThreadInput): ThreadNote {
  return emptyNote({
    id: `opener:${session.day}`,
    kind: "opener",
    text: sessionSentence(session, input.today, input.group),
    figure: { value: signedPct(session.pct), tone: toneOf(session.pct) },
  });
}

function byTime(a: ThreadNote, b: ThreadNote): number {
  const at = a.at ? Date.parse(a.at) : Infinity;
  const bt = b.at ? Date.parse(b.at) : Infinity;
  return at - bt || a.id.localeCompare(b.id);
}

/**
 * Our call is said once in the whole thread, beside the newest note about each stock (the call is today's), and a
 * step is offered once: an older note whose step goes where a newer one's does offers none (owner rule 1).
 */
export function sayOnce(days: ThreadDay[], calls: Readonly<Record<string, CallLine>>): void {
  const called = new Set<string>();
  const stepped = new Set<string>();
  for (let d = days.length - 1; d >= 0; d--) {
    const notes = days[d]!.notes;
    for (let n = notes.length - 1; n >= 0; n--) {
      const note = notes[n]!;
      if (note.call) {
        if (called.has(note.call.ticker)) note.call = null;
        else called.add(note.call.ticker);
      } else if (note.kind === "event" && note.tickers.length === 1) {
        const ticker = note.tickers[0]!;
        const call = calls[ticker];
        if (call && !called.has(ticker)) {
          note.call = { ticker, ...call };
          called.add(ticker);
        }
      }
      // Two labels for one place ("Check our call on NVDA", "... before Tuesday") are one step: the newest says it.
      if (note.step) {
        if (stepped.has(note.step.href)) note.step = null;
        else stepped.add(note.step.href);
      }
    }
  }
}

export function buildThread(input: ThreadInput): Thread {
  const today = input.today;
  const maxDays = input.maxDays ?? THREAD_DAYS;
  const morning = input.morning;
  const sessionByDay = new Map(input.sessions.map((session) => [session.day, session]));

  // Reports still ahead, by stock, for the step after a move ("before Tuesday").
  const reportsAhead = new Map<string, string>();
  for (const report of [...input.upcoming].sort((a, b) => a.date.localeCompare(b.date))) {
    const gap = DAY_RE.test(report.date) ? dayGap(today, report.date) : -1;
    if (gap >= 0 && gap <= STEP_REPORT_DAYS && !reportsAhead.has(report.ticker)) reportsAhead.set(report.ticker, report.date);
  }

  const byDay = new Map<string, ThreadNote[]>();
  const add = (day: string, note: ThreadNote) => byDay.set(day, [...(byDay.get(day) ?? []), note]);

  // Today opens with the morning read. Before the open it is about an earlier session, whose own line it replaces.
  const opener = morning ? morningNote(morning, sessionByDay.get(morning.sessionDay) ?? null, input) : null;
  if (opener) add(today, opener);
  for (const session of input.sessions) {
    if (morning && session.day === morning.sessionDay) continue;
    // Today's close beside a morning read still about an earlier session: a chip on the opener, not a second opener.
    if (opener && session.day === today) {
      opener.recent.push({ day: today, label: "Today", value: signedPct(session.pct), tone: toneOf(session.pct) });
      continue;
    }
    add(session.day, sessionNote(session, input));
  }

  for (const item of input.items) {
    if (!DAY_RE.test(item.day) || item.day > today) continue;
    const note = eventNote(item, input, reportsAhead);
    if (note) add(item.day, note);
  }

  // A past day with nothing but how the stocks closed is not a day of its own: its figure rides as a small chip on the
  // newest opener (today's morning note, else the newest session's line), so the thread does not say the same sentence
  // day after day (owner rule 1).
  const anchorDay = opener ? today : [...input.sessions].map((session) => session.day).filter((day) => byDay.has(day)).sort().pop() ?? null;
  const anchor = anchorDay ? (byDay.get(anchorDay) ?? []).find((note) => note.kind === "opener") ?? null : null;
  if (anchor && anchorDay) {
    const quietDays = [...byDay.entries()]
      .filter(([day, notes]) => day < anchorDay && notes.every((note) => note.kind === "opener"))
      .map(([day]) => day)
      .sort();
    anchor.recent = [...quietDays.flatMap((day) => {
      const session = sessionByDay.get(day);
      return session ? [{ day, label: dayGap(day, today) < 7 ? SHORT_WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? shortDay(day) : shortDay(day), value: signedPct(session.pct), tone: toneOf(session.pct) }] : [];
    }), ...anchor.recent];
    for (const day of quietDays) byDay.delete(day);
  }

  const days = [...byDay.keys()].sort().slice(-maxDays);
  const out: ThreadDay[] = days.map((day) => {
    const notes = byDay.get(day) ?? [];
    const openers = notes.filter((note) => note.kind === "opener");
    const rest = notes.filter((note) => note.kind !== "opener").sort(byTime);
    return { day, label: dayName(day, today), date: shortDay(day), notes: [...openers, ...rest] };
  });

  // What is coming up closes today: the newest thing in the conversation is what to do next.
  const upcoming = upcomingNote(input.upcoming, today, input.calls);
  if (upcoming) {
    const last = out[out.length - 1];
    if (last && last.day === today) last.notes.push(upcoming);
    else out.push({ day: today, label: dayName(today, today), date: shortDay(today), notes: [upcoming] });
  }

  sayOnce(out, input.calls);
  return { status: input.status, example: input.example, today, days: out, stocks: input.stocks };
}
