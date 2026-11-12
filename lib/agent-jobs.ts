/**
 * Standing jobs ("agents"): a rule a person sets up once in plain language,
 * checked for them on a schedule, on an event or against a price.
 *
 * Everything here is pure. A job plus dated facts goes in, a decision comes
 * out, and the evaluator only ever looks at facts dated on or before the day
 * it is evaluating. That is what lets the same function run a live check and
 * a four-week replay without hindsight.
 *
 * There is one mode: tell me. A job never places a trade.
 */

import {
  cleanFilingFilter,
  evaluateFilingEvent,
  filingFilterAllowsAnyStock,
  filingReplayNotes,
  filingWhen,
  filingTriggerLabel,
  type FilingFact,
  type FilingFilter,
} from "@/lib/agent-events-filings";
import { cleanNewsWatch, evaluateNewsEvent, newsReplayNotes, newsTriggerLabel, newsWatchPhrase, type NewsFacts, type NewsWatch } from "@/lib/agent-events-news";
import { typicalDailyMove } from "@/lib/calendar-insights";
import { evaluateEarningsReported, type EarningsReportFact } from "@/lib/earnings-day-agent";
import { vsDayWords } from "@/lib/earnings-season";
import { can, type Plan } from "@/lib/entitlements";

/* ── types ──────────────────────────────────────────────────────────────── */

export type AgentScheduleCadence = "daily_open" | "weekly";
export type AgentEventKind =
  | "fund_13f"
  | "congress_trade"
  | "insider_trade"
  | "earnings_approaching"
  | "earnings_reported"
  | "mover"
  /** A stock in scope filed a new SEC form (lib/agent-events-filings.ts). */
  | "sec_filing"
  /** The news about a stock in scope got much heavier or turned one way (lib/agent-events-news.ts). */
  | "news";
export type AgentPriceRule = "crosses_above" | "crosses_below" | "moves_pct" | "enters_buy_zone";

export type AgentTrigger =
  | { type: "schedule"; cadence: AgentScheduleCadence; /** 1 = Monday … 5 = Friday. Weekly only. */ weekday?: number }
  | {
      type: "event";
      event: AgentEventKind;
      /** Earnings only: how many days ahead. */
      days_before?: number;
      /** sec_filing only: which forms and 8-K items. None means any filing. */
      filings?: FilingFilter;
      /** news only: heavier than usual, a tone, or either. */
      news?: NewsWatch;
    }
  | { type: "price"; rule: AgentPriceRule; level?: number; pct?: number };

export type AgentScope =
  /** Whatever the person tracks when the job runs. */
  | { kind: "watchlist" }
  | { kind: "tickers"; tickers: string[] }
  /** Any name at all. Only meaningful for filings and disclosures. */
  | { kind: "any" };

export type AgentJobDraft = {
  template: string;
  name: string;
  trigger: AgentTrigger;
  scope: AgentScope;
};

/**
 * True for an agent that acts on a new SEC filing or a turn in the news
 * (lib/entitlements.ts: `agent_events`, Pro only on the tighter line).
 */
export function usesProEvents(job: Pick<AgentJobDraft, "trigger">): boolean {
  return job.trigger.type === "event" && (job.trigger.event === "sec_filing" || job.trigger.event === "news");
}

/** What a filing or news agent says when the plan does not include `agent_events` (one sentence everywhere: API errors, the run button, the plain box). */
export const PRO_EVENTS_PAUSED =
  "Watching filings and news is part of Pro. Change what this agent watches to a price, an earnings date or a big move to run it on Free.";

/** Whether this plan may run this job at all, before the count limit: everything, except filing and news agents where the plan has no `agent_events`. */
export function planMayRun(job: Pick<AgentJobDraft, "trigger">, plan: Plan): boolean {
  return !usesProEvents(job) || can("agent_events", plan);
}

export type AgentJob = AgentJobDraft & {
  id: string;
  uid: string;
  mode: "tell_me";
  enabled: boolean;
  archived?: boolean;
  created_at: string;
  updated_at: string;
  /** The last day the job was evaluated, YYYY-MM-DD. */
  last_checked_day?: string | null;
  /** The newest closing price date a run has already read. */
  last_close_seen?: string | null;
};

export type AgentDecision = "notify" | "nothing" | "could_not_check";

export type AgentFindingKind = "move" | "level" | "earnings" | "congress" | "insider" | "filing" | "mover" | "news";

export type AgentFinding = {
  ticker: string | null;
  headline: string;
  detail: string;
  source: string;
  url: string | null;
  /** The date the fact is from, YYYY-MM-DD. */
  at: string;
  /*
   * Structured copies of the numbers in the sentences, so a run can be shown
   * as a table. Optional: runs recorded before these existed only have text.
   */
  kind?: AgentFindingKind;
  /** Percent change over the move: one session, or five for the weekly review. */
  change_pct?: number;
  close?: number;
  /** The close the move is measured from, and its date. */
  from_close?: number;
  from_date?: string;
  /** Where the close sits against the levels in the name's research call. */
  zone?: "add" | "trim" | null;
  /** The level that `zone` refers to, or the level a price rule crossed. */
  level?: number | null;
  /** Earnings only: "bmo" or "amc" when known. */
  time?: string | null;
  /** SEC filings only: the exact form, like "8-K" or "10-K/A". */
  form?: string;
  /** News only: distinct stories in the window, and on a normal session. */
  stories?: number;
  normal?: number | null;
  /** News only: the side the news leaned, and the share of read stories on it. */
  tone?: "negative" | "positive" | null;
  tone_pct?: number | null;
};

/** How many things a run found in total, before the list was capped. */
export type AgentRunCounts = {
  /** Names with a usable close. */
  priced?: number;
  /** Names in scope. */
  names?: number;
  moves?: number;
  up?: number;
  down?: number;
  earnings?: number;
  trades?: number;
  /** The move size a digest counts, in percent. */
  threshold?: number;
};

export type AgentEvaluation = {
  decision: AgentDecision;
  /** One sentence a person can read on its own. */
  summary: string;
  findings: AgentFinding[];
  /** What the run looked at, so "nothing to do" is still an answer. */
  checked: string[];
  /** The newest closing price date the run read, when it read prices. */
  latest_close?: string | null;
  counts?: AgentRunCounts;
};

export type AgentRun = AgentEvaluation & {
  id: string;
  job_id: string;
  uid: string;
  job_name: string;
  /** The market day the run evaluated. */
  day: string;
  ran_at: string;
};

export type AgentPriceSeries = { dates: string[]; closes: number[] };

export type AgentFacts = {
  /** Daily closes by ticker, oldest first. */
  prices: Record<string, AgentPriceSeries>;
  /** The add-below level from the current research call, by ticker. */
  /** `locked`: the agent does not cover this stock for the account, so its levels were not loaded (lib/agent-jobs-data resolveScope). */
  levels: Record<string, { add_below: number | null; trim_above?: number | null; locked?: true }>;
  earnings: Array<{ ticker: string; date: string; time?: string | null }>;
  fund_filings: Array<{ id: string; fund: string; date: string; headline: string; url: string | null; tickers: string[] }>;
  congress: Array<{
    id: string;
    person: string;
    ticker: string;
    tx_type: string;
    amount_low: number | null;
    amount_high: number | null;
    disclosed: string;
    url: string | null;
  }>;
  insiders: Array<{
    id: string;
    ticker: string;
    person: string;
    role: string | null;
    tx_type: string;
    value: number | null;
    filed: string;
    url: string | null;
  }>;
  movers: Array<{ ticker: string; date: string; day_change_pct: number; reason: string | null }>;
  /** Earnings reports written from the company's own release (lib/earnings-day-agent.ts). */
  earnings_reports?: EarningsReportFact[];
  /** The days we kept a movers list for. A day outside it cannot be checked. */
  mover_days: string[];
  /** SEC filings for every covered company (tm_agent_filings), each on the day it could first be read. */
  filings?: FilingFact[];
  /** Headlines naming the names in scope, with their tone labels (tm_agent_news, tm_agent_news_tone). */
  news?: NewsFacts;
  /**
   * Whether each source has been collected at all. A source we do not have is
   * reported as "could not check", never as "nothing happened".
   */
  available: {
    fund_filings: boolean;
    congress: boolean;
    insiders: boolean;
    earnings: boolean;
    movers: boolean;
    earnings_reports?: boolean;
    filings?: boolean;
    news?: boolean;
  };
};

export const EMPTY_FACTS: AgentFacts = {
  prices: {},
  levels: {},
  earnings: [],
  fund_filings: [],
  congress: [],
  insiders: [],
  movers: [],
  mover_days: [],
  available: { fund_filings: false, congress: false, insiders: false, earnings: false, movers: false },
};

/* ── limits ─────────────────────────────────────────────────────────────── */

export const MAX_JOBS_PER_USER = 20;
export const MAX_SCOPE_TICKERS = 25;
export const MAX_FINDINGS = 8;
export const REPLAY_WEEKS = 4;
export const DIGEST_DAILY_MOVE_PCT = 3;
export const DIGEST_WEEKLY_MOVE_PCT = 5;
export const AGENT_JOB_ID_RE = /^[a-z0-9]{6,24}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── small helpers ──────────────────────────────────────────────────────── */

function dayMs(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayDiff(from: string, to: string): number | null {
  const a = dayMs(from);
  const b = dayMs(to);
  return a == null || b == null ? null : Math.round((b - a) / 86_400_000);
}

export function addDays(day: string, days: number): string {
  const ms = dayMs(day);
  return ms == null ? day : new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  const ms = dayMs(day);
  return ms == null ? -1 : new Date(ms).getUTCDay();
}

export function shortDate(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : "";
}

function inWindow(date: string, since: string | null, day: string): boolean {
  const key = (date ?? "").slice(0, 10);
  if (!key || key > day) return false;
  return since == null ? key === day : key > since;
}

function price(value: number): string {
  const whole = value >= 100 && Math.abs(value - Math.round(value)) < 0.005;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

function moneyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function bracket(low: number | null, high: number | null): string {
  if (low != null && high != null) return `${moneyShort(low)} to ${moneyShort(high)}`;
  if (low != null) return `${moneyShort(low)} or more`;
  return "amount not disclosed";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function signed(pct: number): string {
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listNames(names: string[], max = 4): string {
  if (names.length === 0) return "";
  if (names.length <= max) {
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** The last close on or before `day`, and the close before it. */
export function closesAsOf(
  series: AgentPriceSeries | undefined,
  day: string,
): { date: string; close: number; prevDate: string | null; prev: number | null; index: number } | null {
  if (!series) return null;
  const { dates, closes } = series;
  let index = Math.min(dates.length, closes.length) - 1;
  while (index >= 0 && dates[index] > day) index -= 1;
  while (index >= 0 && !(Number.isFinite(closes[index]) && closes[index] > 0)) index -= 1;
  if (index < 0) return null;
  let prevIndex = index - 1;
  while (prevIndex >= 0 && !(Number.isFinite(closes[prevIndex]) && closes[prevIndex] > 0)) prevIndex -= 1;
  return {
    date: dates[index],
    close: closes[index],
    prevDate: prevIndex >= 0 ? dates[prevIndex] : null,
    prev: prevIndex >= 0 ? closes[prevIndex] : null,
    index,
  };
}

/**
 * Whether a move took a name into its add zone (closed at or under the add
 * level from above) or past its trim level (closed at or over it from below).
 * Sitting in a zone is not news; crossing into one is. Without the earlier
 * close nothing can be said, so it returns null.
 */
export function zoneOf(
  levels: AgentFacts["levels"][string] | undefined,
  close: number,
  from: number | null | undefined,
): { zone: "add" | "trim"; level: number } | null {
  if (from == null || !(from > 0)) return null;
  const add = levels?.add_below;
  const trim = levels?.trim_above;
  if (add != null && add > 0 && from > add && close <= add) return { zone: "add", level: add };
  if (trim != null && trim > 0 && from < trim && close >= trim) return { zone: "trim", level: trim };
  return null;
}

/* ── templates ──────────────────────────────────────────────────────────── */

export type AgentTemplateField = "tickers" | "ticker" | "level" | "pct" | "days_before" | "weekday" | "direction";

export type AgentTemplate = {
  id: string;
  group: "Schedule" | "Event" | "Price";
  title: string;
  /** What it does, in the words a person would use to ask for it. */
  ask: string;
  /** What it would tell you, in one line, for the list of agents to start. */
  tells: string;
  fields: AgentTemplateField[];
  defaults: AgentJobDraft;
  /** The store collection this template depends on, when it is not always there. */
  needs?: keyof AgentFacts["available"];
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "morning-check",
    group: "Schedule",
    title: "Morning check",
    ask: "Every market day, check my names and tell me what moved, what reports soon and who disclosed a trade.",
    tells: "Each morning: which of your stocks moved 3% or more, which report earnings this week, and any trades in them by members of Congress.",
    fields: [],
    defaults: {
      template: "morning-check",
      name: "Morning check on my names",
      trigger: { type: "schedule", cadence: "daily_open" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "weekly-review",
    group: "Schedule",
    title: "Weekly review",
    ask: "Once a week, sum up the week for my names.",
    tells: "Once a week: your stocks that moved 5% or more, and which report earnings in the week ahead.",
    fields: ["weekday"],
    defaults: {
      template: "weekly-review",
      name: "Weekly review of my names",
      trigger: { type: "schedule", cadence: "weekly", weekday: 1 },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "fund-filing",
    group: "Event",
    title: "A fund reports its holdings",
    ask: "Tell me when a fund we track files a new 13F, and whether it touched my names.",
    tells: "When a fund we follow reports what it owns (its quarterly 13F), and whether your stocks are in it.",
    fields: [],
    needs: "fund_filings",
    defaults: {
      template: "fund-filing",
      name: "New 13F filings",
      trigger: { type: "event", event: "fund_13f" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "congress-trade",
    group: "Event",
    title: "Congress discloses a trade",
    ask: "Tell me when a member of Congress discloses a trade in one of my names.",
    tells: "When a member of Congress reports buying or selling one of your stocks.",
    fields: [],
    needs: "congress",
    defaults: {
      template: "congress-trade",
      name: "Congressional trades in my names",
      trigger: { type: "event", event: "congress_trade" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "insider-trade",
    group: "Event",
    title: "An insider trades",
    ask: "Tell me when an executive or director buys or sells one of my names.",
    tells: "When an executive or board member buys or sells shares of one of your stocks.",
    fields: [],
    needs: "insiders",
    defaults: {
      template: "insider-trade",
      name: "Insider trades in my names",
      trigger: { type: "event", event: "insider_trade" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "earnings-ahead",
    group: "Event",
    title: "Earnings are coming",
    ask: "Tell me a few days before one of my names reports earnings.",
    tells: "Three days before one of your stocks reports earnings.",
    fields: ["days_before"],
    needs: "earnings",
    defaults: {
      template: "earnings-ahead",
      name: "Earnings coming up",
      trigger: { type: "event", event: "earnings_approaching", days_before: 3 },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "earnings-out",
    group: "Event",
    title: "Earnings came out",
    ask: "Tell me when one of my names reports earnings: the numbers against expectations, the outlook and how the stock reacted.",
    tells: "The report on one of your names minutes after it files its results, with a link to the full read.",
    fields: [],
    needs: "earnings_reports",
    defaults: {
      template: "earnings-out",
      name: "Earnings reports on my names",
      trigger: { type: "event", event: "earnings_reported" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "mover",
    group: "Event",
    title: "One of my stocks moves a lot",
    ask: "Tell me when one of my names lands on the day's movers list, with the reason if we found one.",
    tells: "When one of your stocks is among the day's biggest moves, with the reason when we found one.",
    fields: [],
    needs: "movers",
    defaults: {
      template: "mover",
      name: "My names on the movers list",
      trigger: { type: "event", event: "mover" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "sec-filing",
    group: "Event",
    title: "A company files with the SEC",
    ask: "Tell me when one of my names files something with the SEC, like an 8-K or its annual report.",
    tells: "When one of your stocks files a new form with the SEC, what it is about, and a link to the original.",
    fields: [],
    needs: "filings",
    defaults: {
      template: "sec-filing",
      name: "New SEC filings from my names",
      trigger: { type: "event", event: "sec_filing" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "news",
    group: "Event",
    title: "The news about a stock changes",
    ask: "Tell me when the news about one of my names gets much heavier than usual or turns clearly negative or positive.",
    tells: "When one of your stocks is suddenly all over the news, or its stories turn clearly bad or good, with the biggest story to read.",
    fields: [],
    needs: "news",
    defaults: {
      template: "news",
      name: "News about my names",
      trigger: { type: "event", event: "news", news: "any" },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "price-level",
    group: "Price",
    title: "Crosses a level",
    ask: "Tell me when a stock closes above or below a price I choose.",
    tells: "When a stock you pick closes above or below your price.",
    fields: ["ticker", "direction", "level"],
    defaults: {
      template: "price-level",
      name: "Price level",
      trigger: { type: "price", rule: "crosses_below", level: 0 },
      scope: { kind: "tickers", tickers: [] },
    },
  },
  {
    id: "big-move",
    group: "Price",
    title: "A big move in one day",
    ask: "Tell me when one of my names moves more than a set percent in a day.",
    tells: "When one of your stocks closes 5% or more up or down on the day.",
    fields: ["pct"],
    defaults: {
      template: "big-move",
      name: "Big daily moves",
      trigger: { type: "price", rule: "moves_pct", pct: 5 },
      scope: { kind: "watchlist" },
    },
  },
  {
    id: "buy-zone",
    group: "Price",
    title: "Reaches our buy price",
    ask: "Tell me when one of my names closes at or below the buy-more level in its call.",
    tells: "When one of your stocks closes at or below the price where our call says we'd buy more.",
    fields: [],
    defaults: {
      template: "buy-zone",
      name: "Stocks reaching their buy-more level",
      trigger: { type: "price", rule: "enters_buy_zone" },
      scope: { kind: "watchlist" },
    },
  },
];

/** Names the app gave agents by default before it used the call's own words; a name a person typed stays as typed. */
const OLD_DEFAULT_NAMES: Record<string, string> = { "Names entering their add zone": "Stocks reaching their buy-more level" };

/** An agent's name as shown: an old default name in today's words (backend/mail/alerts.py does the same). */
export function jobDisplayName(name: string): string {
  return OLD_DEFAULT_NAMES[name] ?? name;
}

export function templateById(id: string): AgentTemplate | null {
  return AGENT_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * The "Earnings came out" agent reads tm_earnings_day, which only the VPS
 * earnings_day job writes. Until that job is on, the template is not offered
 * and the server refuses it, so nobody switches on an agent that never fires.
 * Read on the server only: the browser never sees this env var.
 */
export function earningsDayEnabled(): boolean {
  return typeof process !== "undefined" && process.env.EARNINGS_DAY_ENABLED === "1";
}

/** Template ids that are not offered right now (pass the result to the client). */
export function hiddenTemplateIds(earningsDay: boolean = earningsDayEnabled()): string[] {
  return earningsDay ? [] : ["earnings-out"];
}

/* ── describing a job ───────────────────────────────────────────────────── */

function scopePhrase(scope: AgentScope): string {
  if (scope.kind === "tickers") return listNames(scope.tickers) || "the stocks you pick";
  if (scope.kind === "any") return "any stock";
  return "the names you track";
}

/** "any of NVDA and AAPL", but just "MSFT" for one stock and "any stock" for every stock. */
function anyOf(scope: AgentScope, who: string): string {
  if (scope.kind === "any" || (scope.kind === "tickers" && scope.tickers.length === 1)) return who;
  return `any of ${who}`;
}

/**
 * "3 calendar days": the earnings rule counts calendar days, weekends included (earningsWithin uses dayDiff).
 * Checks run on market days, so the warning comes on the first market day within that many days of the report.
 */
export function calendarDays(days: number): string {
  return `${days} calendar ${days === 1 ? "day" : "days"}`;
}

/** "When" in a few words, for the job list. */
export function triggerLabel(trigger: AgentTrigger): string {
  if (trigger.type === "schedule") {
    return trigger.cadence === "daily_open"
      ? "Every market day"
      : `Every ${WEEKDAYS[trigger.weekday ?? 1] ?? "Monday"}`;
  }
  if (trigger.type === "price") {
    if (trigger.rule === "crosses_above") return `Closes above ${price(trigger.level ?? 0)}`;
    if (trigger.rule === "crosses_below") return `Closes below ${price(trigger.level ?? 0)}`;
    if (trigger.rule === "moves_pct") return `Moves ${trigger.pct ?? 5}% or more in a day`;
    return "Closes at its buy-more level";
  }
  if (trigger.event === "fund_13f") return "New 13F filing";
  if (trigger.event === "congress_trade") return "Congressional disclosure";
  if (trigger.event === "insider_trade") return "Insider trade";
  if (trigger.event === "earnings_approaching") return `${calendarDays(trigger.days_before ?? 3)} before earnings`;
  if (trigger.event === "earnings_reported") return "Earnings came out";
  if (trigger.event === "sec_filing") return filingTriggerLabel(trigger.filings);
  if (trigger.event === "news") return newsTriggerLabel(trigger.news ?? "any");
  return "On the movers list";
}

export function triggerKindLabel(trigger: AgentTrigger): "Schedule" | "Event" | "Price" {
  return trigger.type === "schedule" ? "Schedule" : trigger.type === "price" ? "Price" : "Event";
}

/** The job as one plain sentence, the way it would be said out loud. */
export function describeJob(job: Pick<AgentJobDraft, "trigger" | "scope">): string {
  const who = scopePhrase(job.scope);
  const { trigger } = job;
  if (trigger.type === "schedule") {
    return trigger.cadence === "daily_open"
      ? `Every market day, check ${who} and tell me what moved ${DIGEST_DAILY_MOVE_PCT}% or more, what reports within a week and who disclosed a trade.`
      : `Every ${WEEKDAYS[trigger.weekday ?? 1] ?? "Monday"}, tell me which of ${who} moved ${DIGEST_WEEKLY_MOVE_PCT}% or more over the last five sessions and what reports in the week ahead.`;
  }
  if (trigger.type === "price") {
    if (trigger.rule === "crosses_above") return `Tell me when ${who} closes above ${price(trigger.level ?? 0)}.`;
    if (trigger.rule === "crosses_below") return `Tell me when ${who} closes below ${price(trigger.level ?? 0)}.`;
    if (trigger.rule === "moves_pct") {
      return `Tell me when ${anyOf(job.scope, who)} closes ${trigger.pct ?? 5}% or more away from the day before.`;
    }
    return `Tell me when ${anyOf(job.scope, who)} closes at or below the buy-more level in its call.`;
  }
  if (trigger.event === "fund_13f") {
    return job.scope.kind === "any"
      ? "Tell me when a fund we track files a new 13F."
      : `Tell me when a fund we track files a new 13F, and point out ${anyOf(job.scope, who)} in it.`;
  }
  if (trigger.event === "congress_trade") return `Tell me when a member of Congress discloses a trade in ${who}.`;
  if (trigger.event === "insider_trade") return `Tell me when an executive or director reports a trade in ${who}.`;
  if (trigger.event === "earnings_approaching") {
    return `Tell me ${calendarDays(trigger.days_before ?? 3)} before ${anyOf(job.scope, who)} reports earnings.`;
  }
  if (trigger.event === "earnings_reported") {
    return `Tell me when ${anyOf(job.scope, who)} reports earnings, with the numbers against expectations and how the stock reacted.`;
  }
  if (trigger.event === "sec_filing") return `Tell me when ${filingWhen(trigger.filings, anyOf(job.scope, who), job.scope.kind === "any")}.`;
  if (trigger.event === "news") return `Tell me when ${newsWatchPhrase(trigger.news ?? "any", anyOf(job.scope, who))}.`;
  return `Tell me when ${anyOf(job.scope, who)} lands on the day's movers list.`;
}

/* ── validating what a person sends ─────────────────────────────────────── */

export function cleanTickers(raw: unknown, max = MAX_SCOPE_TICKERS): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const part of parts) {
    const ticker = String(part ?? "").trim().toUpperCase().replace(/^\$/, "");
    if (TICKER_RE.test(ticker) && !out.includes(ticker)) out.push(ticker);
    if (out.length >= max) break;
  }
  return out;
}

export type DraftResult = { ok: true; draft: AgentJobDraft } | { ok: false; error: string };

/** Turn untrusted input into a job draft, or say what is wrong with it in plain words. */
/**
 * The example job replayed for a signed-out visitor on /agents and drawn on
 * its share card (lib/og/tool-cards.ts): a 4% day on five big stocks.
 */
export const AGENT_SAMPLE_JOB = {
  template: "big-move",
  scope: { kind: "tickers", tickers: ["NVDA", "AAPL", "MSFT", "AMZN", "TSLA"] },
  trigger: { pct: 4 },
} as const;

export function parseJobDraft(raw: unknown, options: { hidden?: string[] } = {}): DraftResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Pick a template to start." };
  const input = raw as Record<string, unknown>;
  const template = templateById(String(input.template ?? ""));
  if (!template) return { ok: false, error: "Pick a template to start." };
  if ((options.hidden ?? hiddenTemplateIds()).includes(template.id)) {
    return { ok: false, error: "This agent is not available yet. Pick another one." };
  }

  const rawTrigger = (input.trigger ?? {}) as Record<string, unknown>;
  const rawScope = (input.scope ?? {}) as Record<string, unknown>;
  const base = template.defaults;

  let scope: AgentScope;
  if (rawScope.kind === "tickers") {
    const tickers = cleanTickers(rawScope.tickers);
    if (tickers.length === 0) return { ok: false, error: "Add at least one ticker, like AAPL." };
    scope = { kind: "tickers", tickers };
  } else if (rawScope.kind === "any") {
    scope = { kind: "any" };
  } else {
    scope = { kind: "watchlist" };
  }

  let trigger: AgentTrigger;
  if (base.trigger.type === "schedule") {
    const weekday = Number(rawTrigger.weekday);
    trigger =
      base.trigger.cadence === "weekly"
        ? { type: "schedule", cadence: "weekly", weekday: weekday >= 1 && weekday <= 5 ? Math.round(weekday) : 1 }
        : { type: "schedule", cadence: "daily_open" };
    if (scope.kind === "any") scope = { kind: "watchlist" };
  } else if (base.trigger.type === "price") {
    if (scope.kind === "any") scope = { kind: "watchlist" };
    if (template.id === "price-level") {
      const level = Number(rawTrigger.level);
      if (!Number.isFinite(level) || level <= 0 || level > 1_000_000) {
        return { ok: false, error: "Enter the price to watch, like 180." };
      }
      if (scope.kind !== "tickers" || scope.tickers.length !== 1) {
        return { ok: false, error: "A price level needs exactly one ticker." };
      }
      trigger = {
        type: "price",
        rule: rawTrigger.rule === "crosses_above" ? "crosses_above" : "crosses_below",
        level: Math.round(level * 100) / 100,
      };
    } else if (template.id === "big-move") {
      const pct = Number(rawTrigger.pct);
      if (!Number.isFinite(pct) || pct < 1 || pct > 50) {
        return { ok: false, error: "Enter a move between 1% and 50%." };
      }
      trigger = { type: "price", rule: "moves_pct", pct: Math.round(pct * 10) / 10 };
    } else {
      trigger = { type: "price", rule: "enters_buy_zone" };
    }
  } else {
    const event = base.trigger.event;
    if (event === "earnings_approaching") {
      const days = Number(rawTrigger.days_before ?? 3);
      if (!Number.isFinite(days) || days < 1 || days > 14) {
        return { ok: false, error: "Pick between 1 and 14 days before earnings." };
      }
      trigger = { type: "event", event, days_before: Math.round(days) };
    } else if (event === "sec_filing") {
      const filings = cleanFilingFilter(rawTrigger.filings);
      trigger = filings ? { type: "event", event, filings } : { type: "event", event };
      // Every company's 8-Ks would be a flood; only offerings and big stakes make sense market-wide.
      if (scope.kind === "any" && !filingFilterAllowsAnyStock(filings)) scope = { kind: "watchlist" };
    } else if (event === "news") {
      trigger = { type: "event", event, news: cleanNewsWatch(rawTrigger.news) };
    } else {
      trigger = { type: "event", event };
    }
    // Earnings, movers and news are about names the person follows; "any" would be the whole market.
    if (scope.kind === "any" && (event === "earnings_approaching" || event === "earnings_reported" || event === "mover" || event === "news")) scope = { kind: "watchlist" };
  }

  const typed = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  let name = typed || base.name;
  if (!typed && template.id === "price-level" && scope.kind === "tickers" && trigger.type === "price") {
    name = `${scope.tickers[0]} ${trigger.rule === "crosses_above" ? "above" : "below"} ${price(trigger.level ?? 0)}`;
  }
  return { ok: true, draft: { template: template.id, name, trigger, scope } };
}

/* ── the evaluator ──────────────────────────────────────────────────────── */

export type EvaluateOptions = {
  /** The market day being evaluated, YYYY-MM-DD. Nothing dated after it is read. */
  day: string;
  /** The day of the previous check. Null on a first run: only `day` itself counts. */
  since: string | null;
  /** The job's scope resolved to tickers. Empty for scope "any". */
  tickers: string[];
  /**
   * The newest close an earlier run already read. A morning run reads
   * yesterday's close, so this is tracked apart from the day of the check.
   * Defaults to `since`.
   */
  price_since?: string | null;
};

function capFindings(findings: AgentFinding[]): AgentFinding[] {
  return findings.slice(0, MAX_FINDINGS);
}

function nothing(summary: string, checked: string[]): AgentEvaluation {
  return { decision: "nothing", summary, findings: [], checked };
}

function couldNot(summary: string, checked: string[]): AgentEvaluation {
  return { decision: "could_not_check", summary, findings: [], checked };
}

function notify(summary: string, findings: AgentFinding[], checked: string[]): AgentEvaluation {
  return { decision: "notify", summary, findings: capFindings(findings), checked };
}

function noNames(): AgentEvaluation {
  return couldNot("Could not check: there are no names to look at yet. Add a stock to your watchlist.", [
    "Names in scope: 0",
  ]);
}

/** How far ahead a flagged move names the stock's next report as the thing to watch. */
const REPORT_WATCH_DAYS = 21;

/**
 * ", and reports on Nov 17" when the calendar has the stock's next report within three weeks after `day`; else "".
 * One sentence with the move, so the line stays a single short headline wherever it is shown. A report on `day`
 * itself is left out: the evaluator cannot tell whether it has already come out.
 */
function reportWatch(facts: AgentFacts, ticker: string | null | undefined, day: string): string {
  if (!ticker) return "";
  const last = addDays(day, REPORT_WATCH_DAYS);
  const next = facts.earnings
    .filter((event) => event.ticker === ticker && event.date > day && event.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return next ? `, and reports on ${shortDate(next.date)}` : "";
}

/**
 * "SPCX fell 2.3% to $139.75, below its $142.07 buy-more level": the move that brought a stock to a level of its
 * call, said with the close and the level. "at" when the close is the level to the cent.
 */
export function zoneHeadline(ticker: string, changePct: number, close: number, zone: "add" | "trim", level: number): string {
  const where = price(close) === price(level) ? "at" : zone === "add" ? "below" : "above";
  const word = zone === "add" ? "buy-more" : "sell-some";
  return `${ticker} ${changePct >= 0 ? "rose" : "fell"} ${Math.abs(changePct).toFixed(1)}% to ${price(close)}, ${where} its ${price(level)} ${word} level`;
}

/** The session before `date` in the closes the run read (the newest date before it in any series), or null. */
function sessionBeforeIn(prices: AgentFacts["prices"], date: string): string | null {
  let best: string | null = null;
  for (const series of Object.values(prices)) {
    const dates = series?.dates ?? [];
    for (let index = dates.length - 1; index >= 0; index -= 1) {
      if (dates[index] < date) {
        if (best == null || dates[index] > best) best = dates[index];
        break;
      }
    }
  }
  return best;
}

/**
 * Takes out (in place) the price findings older than the session before the newest close the run read: a stock
 * whose price stopped updating, whose "last session" is days behind the others. Said as today's news it would
 * mislead, the way the inbox leaves it out. Returns the tickers taken out.
 */
function dropBehind(findings: AgentFinding[], prices: AgentFacts["prices"], lastDate: string): string[] {
  if (!lastDate) return [];
  const floor = sessionBeforeIn(prices, lastDate);
  if (!floor) return [];
  const dropped: string[] = [];
  for (let index = findings.length - 1; index >= 0; index -= 1) {
    const finding = findings[index];
    if (finding.at < floor) {
      dropped.unshift(finding.ticker ?? "");
      findings.splice(index, 1);
    }
  }
  return dropped.filter(Boolean);
}

function evaluatePrice(
  trigger: Extract<AgentTrigger, { type: "price" }>,
  facts: AgentFacts,
  options: EvaluateOptions,
): AgentEvaluation {
  const { day, tickers } = options;
  const since = options.price_since === undefined ? options.since : options.price_since;
  if (tickers.length === 0) return noNames();

  const findings: AgentFinding[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const noLevel: string[] = [];
  const notCovered: string[] = [];
  let fresh = 0;
  let lastDate = "";

  for (const ticker of tickers) {
    const quote = closesAsOf(facts.prices[ticker], day);
    if (!quote || quote.prev == null) {
      missing.push(ticker);
      continue;
    }
    // A close the last run already saw must not fire twice.
    if (since != null && quote.date <= since) {
      stale.push(ticker);
      continue;
    }
    fresh += 1;
    if (quote.date > lastDate) lastDate = quote.date;
    const changePct = (quote.close / quote.prev - 1) * 100;
    const closeLine = `Closed at ${price(quote.close)} on ${shortDate(quote.date)}, ${signed(changePct)} on the day before (${price(quote.prev)}).`;
    const push = (headline: string, extra: Partial<AgentFinding> = {}) =>
      findings.push({
        ticker,
        headline,
        detail: closeLine,
        source: "Daily closing prices",
        url: `/stock/${ticker}`,
        at: quote.date,
        kind: "move",
        change_pct: round2(changePct),
        close: quote.close,
        from_close: quote.prev ?? undefined,
        from_date: quote.prevDate ?? undefined,
        ...extra,
      });

    if (trigger.rule === "crosses_above") {
      const levelValue = trigger.level ?? 0;
      if (quote.prev < levelValue && quote.close >= levelValue) push(`${ticker} closed above ${price(levelValue)}`, { kind: "level", level: levelValue });
    } else if (trigger.rule === "crosses_below") {
      const levelValue = trigger.level ?? 0;
      if (quote.prev > levelValue && quote.close <= levelValue) push(`${ticker} closed below ${price(levelValue)}`, { kind: "level", level: levelValue });
    } else if (trigger.rule === "moves_pct") {
      if (Math.abs(changePct) >= (trigger.pct ?? 5)) {
        const zone = zoneOf(facts.levels[ticker], quote.close, quote.prev);
        // Against the stock's own normal day ("about four times a normal day"), from the closes before this one.
        const usual = typicalDailyMove(facts.prices[ticker]!.closes.slice(0, quote.index), 60);
        const scale = usual !== null && usual > 0 ? vsDayWords(Math.abs(changePct) / usual) : null;
        push(`${ticker} ${changePct >= 0 ? "rose" : "fell"} ${Math.abs(changePct).toFixed(2)}% in a day${scale ? `, ${scale}` : ""}`, {
          zone: zone?.zone ?? null,
          level: zone?.level ?? null,
        });
      }
    } else {
      const addBelow = facts.levels[ticker]?.add_below ?? null;
      if (facts.levels[ticker]?.locked) {
        notCovered.push(ticker);
      } else if (addBelow == null || !(addBelow > 0)) {
        noLevel.push(ticker);
      } else if (quote.prev > addBelow && quote.close <= addBelow) {
        push(zoneHeadline(ticker, changePct, quote.close, "add", addBelow), { kind: "level", zone: "add", level: addBelow });
      }
    }
  }

  const checked = [
    `Daily closes for ${plural(fresh, "name")}${lastDate ? `, latest ${shortDate(lastDate)}` : ""}`,
    ...(stale.length ? [`No new close since the last check: ${listNames(stale)}`] : []),
    ...(missing.length ? [`No price history: ${listNames(missing)}`] : []),
    ...(noLevel.length ? [`No add level in the research call: ${listNames(noLevel)}`] : []),
    ...(notCovered.length ? [`Not covered on your plan, so not checked: ${listNames(notCovered)}`] : []),
  ];

  const latest_close = lastDate || null;
  const behind = dropBehind(findings, facts.prices, lastDate);
  if (behind.length) checked.push(`Price not updated for the latest session: ${listNames(behind)}`);
  // A name that reached its level leads, then the biggest moves.
  findings.sort((a, b) => Number(Boolean(b.zone)) - Number(Boolean(a.zone)) || Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));
  if (findings.length > 0) {
    return {
      counts: {
        names: tickers.length,
        priced: fresh,
        moves: findings.length,
        up: findings.filter((f) => (f.change_pct ?? 0) > 0).length,
        down: findings.filter((f) => (f.change_pct ?? 0) < 0).length,
        ...(trigger.rule === "moves_pct" ? { threshold: trigger.pct ?? 5 } : {}),
      },
      ...notify(
        findings.length === 1 ? `${findings[0].headline}${reportWatch(facts, findings[0].ticker, day)}.` : `${plural(findings.length, "name")} met the rule: ${listNames(findings.map((f) => f.ticker ?? ""))}.`,
        findings,
        checked,
      ),
      latest_close,
    };
  }
  if (fresh === 0 && stale.length === 0) {
    return couldNot(`Could not check: no price history for ${listNames(missing)}.`, checked);
  }
  if (trigger.rule === "enters_buy_zone" && notCovered.length === fresh && fresh > 0) {
    return { ...couldNot(`Could not check: ${fresh === 1 ? "this stock is" : "none of these stocks is"} covered on your plan, so ${fresh === 1 ? "its" : "their"} add levels are not checked.`, checked), latest_close };
  }
  if (trigger.rule === "enters_buy_zone" && noLevel.length + notCovered.length === fresh && fresh > 0) {
    return { ...couldNot("Could not check: none of these names has an add level we can check on your plan.", checked), latest_close };
  }
  if (fresh === 0) return nothing("Checked, nothing to do. There has been no new close since the last check.", checked);
  return {
    ...nothing(
      `Checked, nothing to do. ${fresh === 1 ? "The one name did not meet" : `None of the ${fresh} names met`} the rule on ${shortDate(lastDate)}.`,
      checked,
    ),
    latest_close,
    counts: { names: tickers.length, priced: fresh, moves: 0, ...(trigger.rule === "moves_pct" ? { threshold: trigger.pct ?? 5 } : {}) },
  };
}

function scopeMatch(tickers: string[], scope: AgentScope): (ticker: string) => boolean {
  if (scope.kind === "any") return () => true;
  const set = new Set(tickers);
  return (ticker) => set.has(ticker.toUpperCase());
}

function windowLabel(since: string | null, day: string): string {
  return since == null || since === addDays(day, -1) ? shortDate(day) : `${shortDate(addDays(since, 1))} to ${shortDate(day)}`;
}

function congressFindings(facts: AgentFacts, match: (ticker: string) => boolean, since: string | null, day: string): AgentFinding[] {
  return facts.congress
    .filter((trade) => inWindow(trade.disclosed, since, day) && match(trade.ticker))
    .sort((a, b) => (b.amount_low ?? 0) - (a.amount_low ?? 0) || a.id.localeCompare(b.id))
    .map((trade) => {
      const verb = trade.tx_type === "buy" ? "bought" : trade.tx_type === "sell" ? "sold" : "traded";
      return {
        ticker: trade.ticker.toUpperCase(),
        headline: `${trade.person} ${verb} ${trade.ticker.toUpperCase()}`,
        detail: `Disclosed ${shortDate(trade.disclosed)}: ${bracket(trade.amount_low, trade.amount_high)}. Filings report a bracket, never an exact amount.`,
        source: "Congressional disclosures",
        kind: "congress" as const,
        url: trade.url,
        at: trade.disclosed.slice(0, 10),
      };
    });
}

function earningsWithin(facts: AgentFacts, match: (ticker: string) => boolean, day: string, days: number) {
  return facts.earnings
    .map((event) => ({ ...event, ticker: event.ticker.toUpperCase(), ahead: dayDiff(day, event.date) }))
    .filter((event) => event.ahead != null && event.ahead >= 0 && event.ahead <= days && match(event.ticker))
    .sort((a, b) => (a.ahead as number) - (b.ahead as number) || a.ticker.localeCompare(b.ticker));
}

function earningsFinding(event: { ticker: string; date: string; time?: string | null; ahead: number | null }): AgentFinding {
  const when = event.ahead === 0 ? "today" : event.ahead === 1 ? "tomorrow" : `in ${event.ahead} days`;
  const time = event.time === "bmo" ? " before the open" : event.time === "amc" ? " after the close" : "";
  return {
    ticker: event.ticker,
    headline: `${event.ticker} reports earnings ${when}`,
    detail: `Scheduled for ${shortDate(event.date)}${time}.`,
    source: "Earnings calendar",
    url: `/stock/${event.ticker}`,
    at: event.date.slice(0, 10),
    kind: "earnings",
    time: event.time ?? null,
  };
}

function evaluateEvent(
  trigger: Extract<AgentTrigger, { type: "event" }>,
  scope: AgentScope,
  facts: AgentFacts,
  options: EvaluateOptions,
): AgentEvaluation {
  const { day, since, tickers } = options;
  const match = scopeMatch(tickers, scope);
  const span = windowLabel(since, day);
  const scoped = scope.kind !== "any";
  if (scoped && tickers.length === 0 && trigger.event !== "fund_13f") return noNames();
  const namesNote = scoped ? `Names in scope: ${tickers.length}` : "Names in scope: any";

  if (trigger.event === "fund_13f") {
    if (!facts.available.fund_filings) {
      return couldNot("Could not check: 13F filings have not been collected yet.", ["13F filings: none collected"]);
    }
    const filings = facts.fund_filings.filter((filing) => inWindow(filing.date, since, day));
    const checked = [`13F filings dated ${span}: ${filings.length}`, namesNote];
    if (filings.length === 0) return nothing(`Checked, nothing to do. No tracked fund filed a 13F on ${span}.`, checked);
    const findings = filings
      .sort((a, b) => b.date.localeCompare(a.date) || a.fund.localeCompare(b.fund))
      .map((filing) => {
        const mine = scoped ? filing.tickers.filter((ticker) => match(ticker)) : [];
        return {
          ticker: mine[0] ?? null,
          headline: `${filing.fund} filed a 13F`,
          detail: [filing.headline, mine.length ? `It lists changes in ${listNames(mine)}.` : scoped ? "None of your names are among its biggest changes." : ""]
            .filter(Boolean)
            .join(" "),
          source: "SEC EDGAR form 13F",
          kind: "filing" as const,
          url: filing.url,
          at: filing.date.slice(0, 10),
        };
      });
    return notify(
      filings.length === 1 ? `${filings[0].fund} filed a new 13F on ${shortDate(filings[0].date)}.` : `${filings.length} tracked funds filed a 13F on ${span}.`,
      findings,
      checked,
    );
  }

  if (trigger.event === "congress_trade") {
    if (!facts.available.congress) {
      return couldNot("Could not check: congressional disclosures were not available.", ["Congressional disclosures: unavailable"]);
    }
    const all = facts.congress.filter((trade) => inWindow(trade.disclosed, since, day)).length;
    const findings = congressFindings(facts, match, since, day);
    const checked = [`Congressional disclosures dated ${span}: ${all}`, namesNote];
    if (findings.length === 0) {
      return nothing(
        all === 0
          ? `Checked, nothing to do. No congressional trades were disclosed on ${span}.`
          : `Checked, nothing to do. ${plural(all, "trade")} disclosed on ${span}, none in your names.`,
        checked,
      );
    }
    return notify(
      findings.length === 1 ? `${findings[0].headline}, disclosed ${shortDate(findings[0].at)}.` : `${plural(findings.length, "congressional trade")} disclosed in ${listNames([...new Set(findings.map((f) => f.ticker ?? ""))])}.`,
      findings,
      checked,
    );
  }

  if (trigger.event === "insider_trade") {
    if (!facts.available.insiders) {
      return couldNot("Could not check: insider (Form 4) trades have not been collected yet.", ["Insider trades: none collected"]);
    }
    const inSpan = facts.insiders.filter((trade) => inWindow(trade.filed, since, day));
    const hits = inSpan.filter((trade) => match(trade.ticker));
    const checked = [`Insider filings dated ${span}: ${inSpan.length}`, namesNote];
    if (hits.length === 0) return nothing(`Checked, nothing to do. No insider trades in your names were filed on ${span}.`, checked);
    const findings = hits
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.id.localeCompare(b.id))
      .map((trade) => {
        const verb = trade.tx_type === "buy" ? "bought" : trade.tx_type === "sell" ? "sold" : "traded";
        return {
          ticker: trade.ticker.toUpperCase(),
          headline: `${trade.person}${trade.role ? `, ${trade.role},` : ""} ${verb} ${trade.ticker.toUpperCase()}`,
          detail: `Filed ${shortDate(trade.filed)}${trade.value != null ? `, about ${moneyShort(trade.value)}` : ""}.`,
          source: "SEC EDGAR form 4",
          kind: "insider" as const,
          url: trade.url,
          at: trade.filed.slice(0, 10),
        };
      });
    return notify(
      findings.length === 1 ? `${findings[0].headline}.` : `${plural(findings.length, "insider trade")} filed in ${listNames([...new Set(findings.map((f) => f.ticker ?? ""))])}.`,
      findings,
      checked,
    );
  }

  if (trigger.event === "earnings_reported") return evaluateEarningsReported(facts, { day, since, tickers }, MAX_FINDINGS);
  if (trigger.event === "sec_filing") return evaluateFilingEvent(trigger.filings, scope, facts, { day, since, tickers }, MAX_FINDINGS);
  if (trigger.event === "news") return evaluateNewsEvent(trigger.news ?? "any", scope, facts, { day, since, tickers }, MAX_FINDINGS);
  if (trigger.event === "earnings_approaching") {
    if (!facts.available.earnings) {
      return couldNot("Could not check: the earnings calendar was not available.", ["Earnings calendar: unavailable"]);
    }
    const days = trigger.days_before ?? 3;
    const upcoming = earningsWithin(facts, match, day, days);
    // Say it once: only dates that were outside the window at the last check.
    const fresh = upcoming.filter((event) => {
      if (since == null) return true;
      const before = dayDiff(since, event.date);
      return before == null || before > days;
    });
    const checked = [`Earnings dates within ${calendarDays(days)} of ${shortDate(day)}: ${upcoming.length}`, namesNote];
    if (fresh.length === 0) {
      return nothing(
        upcoming.length === 0
          ? `Checked, nothing to do. None of your names reports within ${calendarDays(days)}.`
          : `Checked, nothing to do. ${listNames(upcoming.map((e) => e.ticker))} ${upcoming.length === 1 ? "reports" : "report"} soon, and you were already told.`,
        checked,
      );
    }
    const findings = fresh.map(earningsFinding);
    return notify(
      findings.length === 1 ? `${findings[0].headline}, on ${shortDate(findings[0].at)}.` : `${listNames(fresh.map((e) => e.ticker))} report earnings within ${calendarDays(days)}.`,
      findings,
      checked,
    );
  }

  if (!facts.available.movers) {
    return couldNot("Could not check: the movers list was not available for this day.", ["Movers list: unavailable"]);
  }
  if (!facts.mover_days.some((kept) => inWindow(kept, since, day))) {
    return couldNot(`Could not check: we did not keep a movers list for ${span}.`, [`Movers list for ${span}: not kept`]);
  }
  const inSpan = facts.movers.filter((mover) => inWindow(mover.date, since, day));
  const hits = inSpan.filter((mover) => match(mover.ticker));
  const checked = [`Names on the movers list on ${span}: ${inSpan.length}`, namesNote];
  if (hits.length === 0) return nothing(`Checked, nothing to do. None of your names was on the movers list on ${span}.`, checked);
  const findings = hits
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
    .map((mover) => ({
      ticker: mover.ticker.toUpperCase(),
      headline: `${mover.ticker.toUpperCase()} ${mover.day_change_pct >= 0 ? "rose" : "fell"} ${Math.abs(mover.day_change_pct).toFixed(2)}%`,
      detail: mover.reason ? mover.reason : "",
      source: "stocksbrew movers",
      url: `/stock/${mover.ticker.toUpperCase()}`,
      at: mover.date.slice(0, 10),
      kind: "mover" as const,
      change_pct: round2(mover.day_change_pct),
    }));
  return notify(
    findings.length === 1 ? `${findings[0].headline} on ${shortDate(findings[0].at)}.` : `${plural(findings.length, "name")} of yours on the movers list: ${listNames(findings.map((f) => f.ticker ?? ""))}.`,
    findings,
    checked,
  );
}

/** Whether a scheduled job is due on `day`, given when it last ran. */
export function scheduleDue(trigger: Extract<AgentTrigger, { type: "schedule" }>, day: string, since: string | null): boolean {
  if (since != null && since >= day) return false;
  if (trigger.cadence === "daily_open") return true;
  const target = trigger.weekday ?? 1;
  // Due on the chosen weekday, or on the first check after one was missed (a market holiday, say).
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(day, -offset);
    if (since != null && candidate <= since) return false;
    if (weekdayOf(candidate) === target) return true;
    if (since == null) return false;
  }
  return false;
}

function evaluateSchedule(
  trigger: Extract<AgentTrigger, { type: "schedule" }>,
  facts: AgentFacts,
  options: EvaluateOptions,
): AgentEvaluation {
  const { day, since, tickers } = options;
  const priceSince = options.price_since === undefined ? since : options.price_since;
  if (tickers.length === 0) return noNames();
  const weekly = trigger.cadence === "weekly";
  const match = scopeMatch(tickers, { kind: "tickers", tickers });
  const findings: AgentFinding[] = [];
  let priced = 0;
  let lastDate = "";

  for (const ticker of tickers) {
    const series = facts.prices[ticker];
    const quote = closesAsOf(series, day);
    if (!quote || quote.prev == null || !series) continue;
    priced += 1;
    if (quote.date > lastDate) lastDate = quote.date;
    if (weekly) {
      const startIndex = Math.max(0, quote.index - 5);
      const start = series.closes[startIndex];
      if (!(start > 0) || startIndex === quote.index) continue;
      const changePct = (quote.close / start - 1) * 100;
      if (Math.abs(changePct) >= DIGEST_WEEKLY_MOVE_PCT) {
        const zone = zoneOf(facts.levels[ticker], quote.close, start);
        findings.push({
          ticker,
          headline: `${ticker} ${changePct >= 0 ? "rose" : "fell"} ${Math.abs(changePct).toFixed(2)}% over five sessions`,
          detail: `From ${price(start)} on ${shortDate(series.dates[startIndex])} to ${price(quote.close)} on ${shortDate(quote.date)}.`,
          source: "Daily closing prices",
          url: `/stock/${ticker}`,
          at: quote.date,
          kind: "move",
          change_pct: round2(changePct),
          close: quote.close,
          from_close: start,
          from_date: series.dates[startIndex],
          zone: zone?.zone ?? null,
          level: zone?.level ?? null,
        });
      }
    } else {
      if (priceSince != null && quote.date <= priceSince) continue;
      const changePct = (quote.close / quote.prev - 1) * 100;
      if (Math.abs(changePct) >= DIGEST_DAILY_MOVE_PCT) {
        const zone = zoneOf(facts.levels[ticker], quote.close, quote.prev);
        findings.push({
          ticker,
          headline: `${ticker} ${changePct >= 0 ? "rose" : "fell"} ${Math.abs(changePct).toFixed(2)}% in the last session`,
          detail: `Closed at ${price(quote.close)} on ${shortDate(quote.date)}, from ${price(quote.prev)}.`,
          source: "Daily closing prices",
          url: `/stock/${ticker}`,
          at: quote.date,
          kind: "move",
          change_pct: round2(changePct),
          close: quote.close,
          from_close: quote.prev,
          from_date: quote.prevDate ?? undefined,
          zone: zone?.zone ?? null,
          level: zone?.level ?? null,
        });
      }
    }
  }
  const behind = dropBehind(findings, facts.prices, lastDate);
  // A name in its add or trim zone leads, then the biggest moves.
  findings.sort((a, b) => Number(Boolean(b.zone)) - Number(Boolean(a.zone)) || Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));
  const moves = findings.length;
  const up = findings.filter((finding) => (finding.change_pct ?? 0) > 0).length;

  const upcoming = facts.available.earnings ? earningsWithin(facts, match, day, 7) : [];
  const trades = facts.available.congress ? congressFindings(facts, match, weekly ? addDays(day, -7) : since, day) : [];
  // Each section is capped on its own, so a busy day of moves never hides who reports this week.
  const kept = [
    ...findings.slice(0, MAX_FINDINGS),
    ...upcoming.map(earningsFinding).slice(0, MAX_FINDINGS),
    ...trades.slice(0, MAX_FINDINGS),
  ];
  const counts: AgentRunCounts = {
    names: tickers.length,
    priced,
    moves,
    up,
    down: moves - up,
    earnings: upcoming.length,
    trades: trades.length,
    threshold: weekly ? DIGEST_WEEKLY_MOVE_PCT : DIGEST_DAILY_MOVE_PCT,
  };

  const checked = [
    `Daily closes for ${plural(priced, "name")} of ${tickers.length}${lastDate ? `, latest ${shortDate(lastDate)}` : ""}`,
    facts.available.earnings ? `Earnings in the next 7 days: ${upcoming.length}` : "Earnings calendar: unavailable",
    facts.available.congress ? `Congressional disclosures in your names: ${trades.length}` : "Congressional disclosures: unavailable",
    ...(behind.length ? [`Price not updated for the latest session: ${listNames(behind)}`] : []),
  ];

  const latest_close = lastDate || null;
  if (kept.length === 0) {
    return {
      counts,
      ...nothing(
        weekly
          ? `Checked, nothing to do. None of your ${tickers.length} names moved ${DIGEST_WEEKLY_MOVE_PCT}% or more over five sessions and none reports this week.`
          : `Checked, nothing to do. None of your ${tickers.length} names moved ${DIGEST_DAILY_MOVE_PCT}% or more, none reports within a week and nobody disclosed a trade.`,
        checked,
      ),
      latest_close,
    };
  }
  const parts = [
    moves ? `${plural(moves, "name")} moved` : "",
    upcoming.length ? `${plural(upcoming.length, "name")} ${upcoming.length === 1 ? "reports" : "report"} within a week` : "",
    trades.length ? `${plural(trades.length, "congressional trade")} disclosed` : "",
  ].filter(Boolean);
  return {
    ...notify(`${listNames(parts)}.`.replace(/^./, (char) => char.toUpperCase()), [], checked),
    findings: kept,
    latest_close,
    counts,
  };
}

/**
 * Evaluate one job for one day. Returns null when a scheduled job is not due.
 * Reads nothing dated after `options.day`.
 */
export function evaluateJob(
  job: Pick<AgentJobDraft, "trigger" | "scope">,
  facts: AgentFacts,
  options: EvaluateOptions,
): AgentEvaluation | null {
  const tickers = [...new Set(options.tickers.map((ticker) => ticker.toUpperCase()))];
  const opts = { ...options, tickers };
  if (job.trigger.type === "schedule") {
    if (!scheduleDue(job.trigger, options.day, options.since)) return null;
    return evaluateSchedule(job.trigger, facts, opts);
  }
  if (job.trigger.type === "price") return evaluatePrice(job.trigger, facts, opts);
  return evaluateEvent(job.trigger, job.scope, facts, opts);
}

/* ── replay ─────────────────────────────────────────────────────────────── */

export type ReplayDay = { day: string } & AgentEvaluation;

export type AgentReplay = {
  from: string;
  to: string;
  sessions: number;
  runs: ReplayDay[];
  counts: Record<AgentDecision, number>;
  /** What the replay cannot know, said plainly. */
  notes: string[];
};

/** Market sessions in the window, taken from the price history itself. */
export function sessionsBetween(facts: AgentFacts, from: string, to: string, calendar?: string[]): string[] {
  const days = new Set<string>();
  for (const day of calendar ?? []) if (day > from && day <= to) days.add(day);
  if (days.size === 0) {
    for (const series of Object.values(facts.prices)) {
      for (const day of series.dates) if (day > from && day <= to) days.add(day);
    }
  }
  return [...days].sort();
}

/**
 * Run the job once per market session over the last four weeks, each day
 * seeing only what was dated on or before it.
 */
export function replayJob(
  job: Pick<AgentJobDraft, "trigger" | "scope">,
  facts: AgentFacts,
  options: { end: string; tickers: string[]; weeks?: number; calendar?: string[] },
): AgentReplay {
  const weeks = options.weeks ?? REPLAY_WEEKS;
  const from = addDays(options.end, -7 * weeks);
  const sessions = sessionsBetween(facts, from, options.end, options.calendar);
  const runs: ReplayDay[] = [];
  const counts: Record<AgentDecision, number> = { notify: 0, nothing: 0, could_not_check: 0 };

  // The session before the window is the "last check" for the first day.
  const before = sessionsBetween(facts, addDays(from, -10), from, options.calendar);
  let since: string | null = before[before.length - 1] ?? from;
  for (const day of sessions) {
    const evaluation = evaluateJob(job, facts, { day, since, tickers: options.tickers });
    if (evaluation) {
      runs.push({ day, ...evaluation });
      counts[evaluation.decision] += 1;
      since = day;
    }
  }

  const notes = [
    "This is a replay, not a record. Each day is checked with only what was dated on or before it.",
  ];
  const { trigger } = job;
  if (trigger.type === "price" || trigger.type === "schedule") {
    notes.push("Prices are daily closes, adjusted for splits and dividends. A level touched during the day and lost by the close does not count.");
  }
  if (trigger.type === "price" && trigger.rule === "enters_buy_zone") {
    notes.push("The add level is the one in today's research call. We do not keep past levels, so earlier days are checked against today's.");
  }
  if (trigger.type === "event" && trigger.event === "earnings_approaching") {
    notes.push("Earnings dates are the ones on the calendar today. A date that was moved shows where it ended up.");
  }
  if (trigger.type === "event" && trigger.event === "mover") {
    notes.push("The movers list is replayed only for the days we kept it.");
  }
  if (trigger.type === "event" && trigger.event === "sec_filing") notes.push(...filingReplayNotes());
  if (trigger.type === "event" && trigger.event === "news") notes.push(...newsReplayNotes(facts.news));
  if ((trigger.type === "event" && trigger.event === "congress_trade") || trigger.type === "schedule") {
    notes.push("Congressional trades are placed on the day they were disclosed, which is when anyone could have known.");
  }
  if (job.scope.kind === "watchlist") {
    notes.push("It uses the names you track today, not the list as it was four weeks ago.");
  }

  return { from: addDays(from, 1), to: options.end, sessions: sessions.length, runs: runs.reverse(), counts, notes };
}

/* ── run ids and labels ─────────────────────────────────────────────────── */

export function jobDocId(uid: string, jobId: string): string {
  return `${uid}__${jobId}`;
}

/** One run per job per market day, so running the runner twice changes nothing. */
export function runDocId(uid: string, jobId: string, day: string): string {
  return `${uid}__${jobId}__${day}`;
}

/** The decision in a word or two. The page's chips come from lib/agent-jobs-present.ts, which can also say "Needs you". */
export function decisionLabel(decision: AgentDecision): string {
  if (decision === "notify") return "Heads-up";
  if (decision === "nothing") return "All quiet";
  return "Couldn't check";
}
