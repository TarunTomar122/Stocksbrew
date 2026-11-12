import { DIGEST_DAILY_MOVE_PCT, shortDate, type AgentDecision, type AgentScope, type AgentTrigger } from "@/lib/agent-jobs";
import { agentHref, latestRunByJob, nextCheckFor } from "@/lib/agent-watch";
import { onDayWords } from "@/lib/day-words";

import { findingClose } from "./example-check";
import type { AgentsSource } from "./log";

/**
 * A person's agents as rows that read in two seconds (owner, Nov 11: "what is this design and why is it so text"):
 * an icon for the kind of watch, a short name ("Big moves over 5%"), what the last run came to as a figure ("5 flagged",
 * "quiet"), the day it ran, and the stocks it flagged as small chips with their move, under one sentence that says
 * what they came to ("Flagged NVDA, down 5.5% to $168.89 on Nov 10. Earnings and filings were quiet."). What it
 * checked and its sources stay on /agents, which the row opens. Built only from the stored jobs and runs. Pure.
 */

export type AgentKind = "digest" | "weekly" | "move" | "price" | "zone" | "sell" | "call" | "earnings" | "reported" | "congress" | "insider" | "fund" | "filing" | "news" | "movers" | "reasons";

export type AgentChip = {
  ticker: string;
  /** "+20.0%", "Nov 12", or null when the finding has no figure of its own. */
  figure: string | null;
  tone: "up" | "down" | null;
  /**
   * The day of a move that is not today's ("Tue", or "Nov 3" past a week), so yesterday's −5.5% is never read as
   * today's beside the stock's live move. Unset for today's moves and for chips that are not moves.
   */
  when?: string | null;
  /** YYYY-MM-DD of the move (the finding's own date), for `when`; unset when it is not a move. */
  moveDay?: string | null;
  /** The close the move ended at, from the run's own evidence; unset when it did not say or it is not a move. */
  close?: number | null;
};

export type AgentStatus = "flagged" | "quiet" | "failed" | "waiting";

export type AgentLine = {
  id: string;
  href: string;
  kind: AgentKind;
  /** Short and whole: "Big moves over 5%", "Earnings, 3 days ahead", "Congress trades". */
  name: string;
  /** The full rule, for the row's title. */
  rule: string;
  status: AgentStatus;
  /** "5 flagged", "quiet", "could not check", "not run yet". */
  figure: string;
  /** YYYY-MM-DD of the last run, or null when it has not run. */
  day: string | null;
  /** When the last run finished, New York time ("6:12 PM"), from the run's own stamp; null without one. */
  time?: string | null;
  chips: AgentChip[];
  /** Flagged stocks past the chips. */
  more: number;
};

export type AgentLines = {
  lines: AgentLine[];
  /** Switched-off agents, counted only. */
  paused: number;
  /** The day every line last ran, when they all share one: said once for the list instead of on each row. */
  sharedDay: string | null;
  /** True when the rows' run times differ, so each row says its own; one shared time is not repeated on every row. */
  ownTimes: boolean;
  /** The one time every row ran at ("6:19 AM"), said once under the list with the shared day; null otherwise. */
  sharedTime: string | null;
  /** The earliest next after-close check, when the run log proves the runner is checking. */
  next: string | null;
  /** What the latest runs came to as one sentence, for the top of the card; null when there is nothing to say. */
  lead: string | null;
};

/** Stock chips shown per row; the rest are a count. */
export const MAX_CHIPS = 3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function scopeTickers(scope: AgentScope | undefined): string[] {
  return scope?.kind === "tickers" ? scope.tickers.map((ticker) => ticker.toUpperCase()) : [];
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

/** The kind of watch, for its icon. */
export function agentKind(trigger: AgentTrigger | undefined): AgentKind {
  if (!trigger) return "digest";
  if (trigger.type === "schedule") return trigger.cadence === "weekly" ? "weekly" : "digest";
  if (trigger.type === "price") {
    return trigger.rule === "moves_pct" ? "move" : trigger.rule === "enters_buy_zone" ? "zone" : trigger.rule === "enters_sell_zone" ? "sell" : "price";
  }
  switch (trigger.event) {
    case "call_change":
      return "call";
    case "earnings_approaching":
      return "earnings";
    case "earnings_reported":
      return "reported";
    case "congress_trade":
      return "congress";
    case "insider_trade":
      return "insider";
    case "fund_13f":
      return "fund";
    case "sec_filing":
      return "filing";
    case "news":
      return "news";
    default:
      return "movers";
  }
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "insider trades" after a ticker ("AMD insider trades"); names that start with a proper noun keep their capital. */
function afterTicker(name: string): string {
  return /^(Congress|SEC)\b/.test(name) ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/**
 * A watch's short name in plain words, said whole (judges, ship 53: "Earnings · 3 days…" was cut): what it watches
 * and its one setting ("Big moves over 5%", "NVDA below $180", "Earnings, 3 days ahead"), with the stock first when
 * it watches just one ("AMD insider trades"). Falls back to the name the person gave it.
 */
export function shortAgentName(job: { name: string; trigger?: AgentTrigger; scope?: AgentScope }): string {
  const trigger = job.trigger;
  if (!trigger) return job.name;
  const tickers = scopeTickers(job.scope);
  const one = tickers.length === 1 ? tickers[0]! : null;
  const on = (name: string) => (one ? `${one} ${afterTicker(name)}` : name);
  if (trigger.type === "schedule") {
    return trigger.cadence === "weekly" ? `Weekly review on ${WEEKDAY[trigger.weekday ?? 1] ?? "Mon"}` : `Daily check, ${DIGEST_DAILY_MOVE_PCT}% moves`;
  }
  if (trigger.type === "price") {
    const who = one ?? (tickers.length > 1 ? `${tickers.length} stocks` : "Your stocks");
    if (trigger.rule === "crosses_above" && typeof trigger.level === "number") return `${who} above ${money(trigger.level)}`;
    if (trigger.rule === "crosses_below" && typeof trigger.level === "number") return `${who} below ${money(trigger.level)}`;
    if (trigger.rule === "moves_pct") return on(`Big moves over ${trigger.pct ?? 5}%`);
    if (trigger.rule === "enters_sell_zone") return on("Sell-some watch");
    return on("Buy-more level");
  }
  switch (trigger.event) {
    case "call_change":
      return on(trigger.to === "Trim" ? "Call turns to Sell some" : trigger.to === "Add" ? "Call turns to Buy more" : trigger.to === "Hold" ? "Call turns to Keep" : "Call changes");
    case "earnings_approaching":
      return on(`Earnings, ${plural(trigger.days_before ?? 3, "day")} ahead`);
    case "earnings_reported":
      return on("Earnings results");
    case "congress_trade":
      return on("Congress trades");
    case "insider_trade":
      return on("Insider trades");
    case "fund_13f":
      return on("Fund 13F filings");
    case "sec_filing":
      return on(trigger.filings?.major ? "Big SEC filings" : "SEC filings");
    case "news":
      return on("News");
    default:
      return on("Movers list");
  }
}

type Finding = NonNullable<AgentsSource["runs"][number]["detail"]>["findings"][number];

const MOVE_WORDS = /\b(rose|fell|gained|lost|jumped|dropped|climbed|slid|sank|surged|up|down)\s+([\d.]+)%/i;
const DOWN_WORDS = /^(fell|lost|dropped|slid|sank|down)$/i;

/** The move a finding states: the stored figure, else the one in its headline ("IREN rose 20.02% in the last session"). */
export function findingMove(finding: Pick<Finding, "headline"> & { change_pct?: number }): number | null {
  if (typeof finding.change_pct === "number" && Number.isFinite(finding.change_pct)) return finding.change_pct;
  const match = MOVE_WORDS.exec(finding.headline ?? "");
  if (!match) return null;
  const size = Number(match[2]);
  if (!Number.isFinite(size)) return null;
  return DOWN_WORDS.test(match[1]!) ? -size : size;
}

/** Watches whose findings are price moves, so a percent in the headline is the stock's move (not "revenue up 12%"). */
const MOVE_KINDS: ReadonlySet<AgentKind> = new Set(["digest", "weekly", "move", "movers"]);

function moveOf(finding: Finding, kind: AgentKind): number | null {
  if (typeof finding.change_pct === "number" && Number.isFinite(finding.change_pct)) return finding.change_pct;
  return MOVE_KINDS.has(kind) && (!finding.kind || finding.kind === "move" || finding.kind === "mover") ? findingMove(finding) : null;
}

function chipFor(finding: Finding, kind: AgentKind): AgentChip | null {
  const ticker = (finding.ticker ?? "").toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
  const move = moveOf(finding, kind);
  if (move !== null) {
    const rounded = Math.abs(move) < 0.05 ? 0 : move;
    const close = findingClose(finding);
    return {
      ticker,
      figure: `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`,
      tone: rounded > 0 ? "up" : rounded < 0 ? "down" : null,
      moveDay: DAY.test(finding.at ?? "") ? finding.at : null,
      ...(close !== null ? { close } : {}),
    };
  }
  // A report coming up: its day.
  if ((kind === "earnings" || finding.kind === "earnings") && DAY.test(finding.at ?? "")) return { ticker, figure: shortDate(finding.at), tone: null };
  return { ticker, figure: null, tone: null };
}

/** The flagged stocks as chips, biggest move first, one per stock. */
export function agentChips(findings: Finding[], kind: AgentKind): AgentChip[] {
  const seen = new Set<string>();
  const chips: Array<AgentChip & { size: number }> = [];
  for (const finding of findings) {
    const chip = chipFor(finding, kind);
    if (!chip || seen.has(chip.ticker)) continue;
    seen.add(chip.ticker);
    const move = moveOf(finding, kind);
    chips.push({ ...chip, size: move === null ? -1 : Math.abs(move) });
  }
  // Moves biggest first; anything without a move keeps the run's own order after them.
  return chips
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => b.chip.size - a.chip.size || a.index - b.index)
    .map(({ chip: { size: _size, ...chip } }) => chip);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "6:12 PM" in New York time from a run's ISO stamp; null when it has no time of day. */
export function runTime(at: string | null | undefined): string | null {
  if (!at || !at.includes("T")) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(date);
}

/** "Tue" for a day in the past week, "Nov 3" before that, null for today (or a day that cannot be read). */
export function chipDay(day: string | null, today: string): string | null {
  if (!day || !DAY.test(day) || !DAY.test(today) || day >= today) return null;
  const at = Date.parse(`${day}T12:00:00Z`);
  const ago = Math.round((Date.parse(`${today}T12:00:00Z`) - at) / 86_400_000);
  return ago <= 6 ? (WEEKDAYS[new Date(at).getUTCDay()] ?? null) : shortDate(day);
}

const STATUS_FIGURE: Record<Exclude<AgentStatus, "flagged">, string> = { quiet: "quiet", failed: "could not check", waiting: "not run yet" };

function statusOf(decision: AgentDecision | null): AgentStatus {
  if (decision === "notify") return "flagged";
  if (decision === "nothing") return "quiet";
  if (decision === "could_not_check") return "failed";
  return "waiting";
}

/** Every active agent as a row, in the order they were made; `hrefFor` overrides where a row opens (the example's go to /agents). */
export function agentLines(source: AgentsSource, today: string, options: { hrefFor?: (id: string) => string; describe?: (job: AgentsSource["jobs"][number]) => string } = {}): AgentLines {
  const latest = latestRunByJob(source.runs);
  const active = source.jobs.filter((job) => job.enabled);
  const lines = active.map((job): AgentLine => {
    const run = latest.get(job.id) ?? null;
    const kind = agentKind(job.trigger);
    const status = statusOf(run?.decision ?? null);
    const findings = run?.detail?.findings ?? [];
    const runDay = run && DAY.test(run.day) ? run.day : null;
    // A move from before today says its day: the finding's own date, else the day the run was.
    const chips = (status === "flagged" ? agentChips(findings, kind) : []).map((chip) => {
      if (chip.moveDay === undefined) return chip;
      // The move's own day, else the run's, kept for the lead's "on Nov 10".
      const moveDay = chip.moveDay ?? runDay;
      const when = chipDay(moveDay, today);
      return { ...chip, moveDay, ...(when ? { when } : {}) };
    });
    // How many it flagged: a daily or weekly check counts its moves, reports and trades (it keeps only the biggest
    // as findings); any other watch, the stocks its findings name.
    const counts = run?.detail?.counts ?? null;
    const counted = counts && (kind === "digest" || kind === "weekly") ? (counts.moves ?? 0) + (counts.earnings ?? 0) + (counts.trades ?? 0) : 0;
    const flagged = status === "flagged" ? Math.max(run?.tickers?.length ?? 0, chips.length, counted) : 0;
    const count = flagged > 0 ? flagged : status === "flagged" ? (run?.detail?.findingCount ?? findings.length) : 0;
    return {
      id: job.id,
      href: options.hrefFor ? options.hrefFor(job.id) : agentHref(job.id),
      kind,
      name: shortAgentName({ name: job.name, trigger: job.trigger, scope: job.scope }),
      rule: options.describe ? options.describe(job) : job.name,
      status,
      figure: status === "flagged" ? (flagged > 0 ? `${flagged} flagged` : count > 0 ? `${count} found` : "found something") : STATUS_FIGURE[status],
      day: runDay,
      time: runDay ? runTime(run?.ran_at) : null,
      chips: chips.slice(0, MAX_CHIPS),
      more: Math.max(0, flagged - Math.min(MAX_CHIPS, chips.length)),
    };
  });
  const days = new Set(lines.map((line) => line.day ?? ""));
  const sharedDay = lines.length > 1 && days.size === 1 && lines[0]!.day ? lines[0]!.day : null;
  const nexts = active.map((job) => nextCheckFor(job, source.runs.filter((run) => run.job_id === job.id), today)).filter((day): day is string => Boolean(day));
  const times = new Set(lines.map((line) => line.time ?? ""));
  const ownTimes = lines.length > 1 && times.size > 1 && lines.every((line) => line.time);
  const sharedTime = sharedDay && times.size === 1 && lines[0]!.time ? lines[0]!.time : null;
  return { lines, paused: source.jobs.length - active.length, sharedDay, ownTimes, sharedTime, next: nexts.sort()[0] ?? null, lead: agentsLead(lines, today) };
}

/* ── the one sentence over the rows ────────────────────────────────────── */

/** What each kind of watch looks at, as the lead names it: "Earnings and filings were quiet." */
const KIND_NOUN: Record<AgentKind, { noun: string; one?: boolean }> = {
  digest: { noun: "the daily check", one: true },
  weekly: { noun: "the weekly review", one: true },
  move: { noun: "big moves" },
  movers: { noun: "movers" },
  price: { noun: "price levels" },
  zone: { noun: "buy-more levels" },
  sell: { noun: "sell-some prices" },
  call: { noun: "our calls" },
  earnings: { noun: "earnings" },
  reported: { noun: "earnings results" },
  congress: { noun: "Congress trades" },
  insider: { noun: "insider trades" },
  fund: { noun: "fund filings" },
  filing: { noun: "filings" },
  news: { noun: "the news", one: true },
  reasons: { noun: "your reasons" },
};

function capital(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "$168.89", "$1,234.50", as the flag on the briefing and in the inbox says a close. */
function priceWords(price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** " today", " yesterday", " on Tuesday", " on Nov 3": the day of a move (lib/day-words.ts). */
function onDay(day: string | null | undefined, today: string): string {
  if (!day || !DAY.test(day)) return "";
  const words = onDayWords(day, today);
  return words ? ` ${words}` : ` on ${shortDate(day)}`;
}

/** The size of a chip's move ("−5.5%" is 5.5), for ordering. */
function chipSize(chip: AgentChip): number {
  const value = Number((chip.figure ?? "").replace(/[+−%]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/** Stocks named in the lead; past these, a count. */
const LEAD_NAMES = 2;

/**
 * The agents' latest runs as one sentence over their rows, as the inbox opens with one (judges, ship 53): the moves
 * they flagged with where a lone one closed ("Flagged NVDA, down 5.5% to $168.89 on Nov 10."), any other stocks they
 * flagged, then what was quiet ("Earnings and filings were quiet.") and what could not be checked. Only from the
 * rows' own figures, so it never says more than the rows show. Null when no agent has run. Pure.
 */
export function agentsLead(lines: readonly AgentLine[], today: string): string | null {
  const sentences: string[] = [];
  const named = new Set<string>();
  const flagged = lines.filter((line) => line.status === "flagged");
  const isMove = (chip: AgentChip) => chip.moveDay !== undefined && Boolean(chip.figure);
  // Moves first, biggest first across every agent, one per stock: the biggest move a stock has on any row.
  const moves: AgentChip[] = [];
  for (const chip of flagged.flatMap((line) => line.chips.filter(isMove)).sort((a, b) => chipSize(b) - chipSize(a))) {
    if (named.has(chip.ticker)) continue;
    named.add(chip.ticker);
    moves.push(chip);
  }
  const moveRows = flagged.filter((line) => line.chips.some(isMove));
  if (moves.length > 0) {
    const shown = moves.slice(0, LEAD_NAMES);
    const oneDay = shown.every((chip) => chip.moveDay === shown[0]!.moveDay) ? (shown[0]!.moveDay ?? null) : null;
    const words = shown.map((chip) => {
      const size = chip.figure!.replace(/^[+−]/, "");
      const way = chip.tone === "down" ? `down ${size}` : chip.tone === "up" ? `up ${size}` : "unchanged";
      // The close only when one stock is named: two prices in one sentence is too much to read at a glance.
      const close = shown.length === 1 && typeof chip.close === "number" && chip.close > 0 ? ` to ${priceWords(chip.close)}` : "";
      return `${chip.ticker}, ${way}${close}${oneDay ? "" : onDay(chip.moveDay, today)}`;
    });
    // Everything else those rows flagged: moves past the named two, their other chips, and the rows' own counts.
    const otherChips = new Set(moveRows.flatMap((line) => line.chips.filter((chip) => !isMove(chip) && !named.has(chip.ticker)).map((chip) => chip.ticker)));
    otherChips.forEach((ticker) => named.add(ticker));
    const rest = moves.length - shown.length + otherChips.size + moveRows.reduce((sum, line) => sum + line.more, 0);
    // The day goes with the moves it belongs to, before "and 3 more", which may be from other days.
    const list = `${words.join(words.length === 2 && rest === 0 ? ", and " : ", ")}${oneDay ? onDay(oneDay, today) : ""}`;
    sentences.push(`Flagged ${list}${rest > 0 ? `, and ${rest} more` : ""}.`);
  }
  // Stocks flagged for something other than a move: "Flagged AMD on insider trades."
  for (const line of flagged) {
    if (moveRows.includes(line)) continue;
    const noun = KIND_NOUN[line.kind].noun;
    const others = line.chips.map((chip) => chip.ticker).filter((ticker) => !named.has(ticker));
    others.forEach((ticker) => named.add(ticker));
    if (others.length > 0) {
      const more = line.more + Math.max(0, others.length - LEAD_NAMES);
      sentences.push(`Flagged ${andList([...others.slice(0, LEAD_NAMES), ...(more > 0 ? [`${more} more`] : [])])} on ${noun}.`);
    } else if (line.chips.length === 0) {
      // No stocks to name: what it came to, in words ("Your filings agent found 3 things.").
      const found = /^(\d+) (?:flagged|found)$/.exec(line.figure);
      const count = found ? Number(found[1]) : null;
      sentences.push(`Your ${noun.replace(/^the /, "")} agent found ${count !== null ? `${count} ${count === 1 ? "thing" : "things"}` : "something"}.`);
    }
  }
  // A kind that flagged on one agent is not also "quiet" because a second agent of that kind was.
  const flaggedKinds = new Set(flagged.map((line) => line.kind));
  const quiet = [...new Set(lines.filter((line) => line.status === "quiet" && !flaggedKinds.has(line.kind)).map((line) => KIND_NOUN[line.kind]))];
  if (quiet.length > 0) {
    const nouns = [...new Set(quiet.map((kind) => kind.noun))];
    const singular = nouns.length === 1 && quiet[0]!.one === true;
    sentences.push(`${capital(andList(nouns))} ${singular ? "was" : "were"} quiet.`);
  }
  const failed = [...new Set(lines.filter((line) => line.status === "failed").map((line) => KIND_NOUN[line.kind].noun))];
  if (failed.length > 0) sentences.push(`We could not check ${andList(failed)} this time.`);
  return sentences.length > 0 ? sentences.join(" ") : null;
}
