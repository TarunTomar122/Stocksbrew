/**
 * The Briefing builder: one ordered daily read for one person (or for the
 * whole market when nobody is signed in).
 *
 * Pure on purpose. Every input is passed in, nothing here reads the store or
 * the clock, so the same inputs always produce the same briefing and the
 * wording can be unit tested. The loader in `lib/briefing-data.ts` gathers
 * the inputs; the page renders the output.
 *
 * Rules the copy follows (docs/product-voice.md):
 * - the number and the reason sit together
 * - when there is no confirmed reason for a move we say so, we never write one
 * - a next step is a thing to check or read, never an instruction to trade
 */

import { hasResearchBackedNarrative } from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { callShift } from "@/lib/tone";

export type BriefingKind =
  | "price_move"
  | "call_changed"
  | "zone_entered"
  | "earnings_upcoming"
  | "earnings_reported"
  | "congress_trade"
  | "news"
  | "alert_triggered"
  | "discussion_spike"
  | "filing"
  | "technical"
  | "agent_job";

export type BriefingRelation = "holding" | "watching" | "market";
export type BriefingSeverity = "high" | "medium" | "low";
export type BriefingTone = "up" | "down" | "flat";
export type BriefingReasonStatus = "confirmed" | "unconfirmed" | "not_applicable";
export type BriefingMode = "personal" | "market";

export type BriefingEvidence = {
  /** What the source says or shows. */
  label: string;
  /** Who it comes from: a publisher, a filing system, our own research. */
  source: string;
  url: string | null;
  /** ISO time or YYYY-MM-DD the source refers to. */
  at: string | null;
};

export type BriefingAlertSuggestion = {
  instrument_id: string;
  ticker: string;
  condition: "above" | "below";
  target_price: number;
  label: string;
};

export type BriefingItem = {
  /** Stable for the day: same event, same id, so saved state survives a reload. */
  id: string;
  kind: BriefingKind;
  ticker: string;
  instrument_id: string | null;
  name: string;
  relation: BriefingRelation;
  severity: BriefingSeverity;
  needs_you: boolean;
  tone: BriefingTone;
  /** What happened, with the number. */
  headline: string;
  /** The short figure shown large beside the headline. */
  metric: string | null;
  /** One or two plain sentences. */
  why: string;
  reason_status: BriefingReasonStatus;
  /** Something to check or read. Never a trade instruction. */
  next_step: string;
  /** A clause for the spoken summary line, without a trailing period. */
  spoken: string;
  evidence: BriefingEvidence[];
  as_of: string | null;
  /** Days until the thing happens. Null when there is no deadline. */
  deadline_days: number | null;
  price: number | null;
  day_change_pct: number | null;
  alert: BriefingAlertSuggestion | null;
  href: string;
  /**
   * Why this is the person's business: how much they hold, or that they only
   * watch it. Null for the market view. Absent on briefings saved before it existed.
   */
  position_note?: string | null;
  /**
   * The current research call on the stock ("Accumulate"), so a group of items
   * about one stock can say it once. Null when there is none or in the market
   * view; absent on briefings saved before it existed.
   */
  call?: string | null;
};

/** What the person's holdings did today, from the sizes they entered. */
export type BriefingPortfolio = {
  /** Value of the holdings that have both a size and a price. */
  value: number;
  day_change_value: number;
  day_change_pct: number;
  /** Holdings that could be counted, out of all holdings. */
  counted: number;
  holdings: number;
  as_of: string | null;
};

export type BriefingQuietName = {
  ticker: string;
  relation: "holding" | "watching";
  day_change_pct: number | null;
};

export type BriefingMarketMover = {
  ticker: string;
  name: string;
  price: number | null;
  day_change_pct: number;
  reason: string;
  reason_status: BriefingReasonStatus;
  as_of: string | null;
};

export type BriefingIndex = { name: string; price: number; change_pct: number };

export type Briefing = {
  date: string;
  built_at: string;
  mode: BriefingMode;
  /** The spoken-style line at the top, assembled from the items. */
  summary: string;
  needs_you: BriefingItem[];
  also_today: BriefingItem[];
  nothing_needs_you: boolean;
  quiet: { text: string; names: BriefingQuietName[] };
  market: {
    indices: BriefingIndex[];
    gainers: BriefingMarketMover[];
    losers: BriefingMarketMover[];
    as_of: string | null;
  };
  counts: { holdings: number; watching: number };
  /** Set when the freshest data is from an earlier session than `date`. */
  stale_note: string | null;
  /** Null when no holding has a size, or in the market view. */
  portfolio?: BriefingPortfolio | null;
};

/* ── inputs ─────────────────────────────────────────────────────────────── */

export type BriefingPosition = {
  instrument_id: string;
  ticker: string;
  name: string;
  relation: "holding" | "watching";
  price: number | null;
  day_change_pct: number | null;
  price_as_of: string | null;
  stance: string | null;
  call_summary: string | null;
  /** What the research says would change the call. */
  watch_out: string | null;
  add_below: number | null;
  breakout_above: number | null;
  trim_above: number | null;
  earnings_date: string | null;
  earnings_time: "bmo" | "amc" | "during" | null;
  pre_earnings_headline: string | null;
  /** Shares held, when the person entered them. */
  quantity?: number | null;
  /** What the holding is worth, in dollars, when known. */
  market_value?: number | null;
};

/** A standing job's run that found something, to surface under "Needs you". */
export type BriefingAgentRun = {
  job_id: string;
  job_name: string;
  day: string;
  ran_at: string;
  summary: string;
  findings: Array<{ ticker: string | null; headline: string; detail: string; source: string; url: string | null; at: string }>;
};

export type BriefingUpcomingEarnings = {
  ticker: string;
  name: string;
  date: string;
  time: "bmo" | "amc" | "during" | null;
};

export type BriefingCallChange = {
  ticker: string;
  instrument_id: string;
  prev_stance: string;
  new_stance: string;
  at: string;
  text: string | null;
};

export type BriefingTriggeredAlert = {
  id: string;
  ticker: string;
  instrument_id: string;
  condition: "above" | "below" | null;
  target_price: number | null;
  triggered_at: string;
  directive_text: string | null;
};

export type BriefingCongressTrade = {
  trade_id: string;
  person_name: string;
  chamber: string;
  party: string;
  state: string;
  ticker: string;
  company: string;
  tx_type: string;
  amount_low: number | null;
  amount_high: number | null;
  transaction_date: string;
  disclosure_date: string;
  lag_days: number | null;
  source_url: string;
};

export type BriefingNews = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  summary: string;
  tickers: string[];
};

export type BriefingEarningsReport = {
  ticker: string;
  instrument_id: string;
  event_date: string;
  generated_at: string;
  headline: string;
  summary: string;
  for_holders: string | null;
  for_watchers: string | null;
  monitor: string | null;
};

export type BriefingDiscussionTicker = {
  ticker: string;
  company_name: string | null;
  mention_count: number;
  sentiment: string;
  summary: string;
  latest_post_at: string | null;
};

export type BriefingDiscussion = {
  generated_at: string;
  window_hours: number;
  tickers: BriefingDiscussionTicker[];
};

export type BriefingAttention = {
  item_id: string;
  instrument_id: string;
  ticker: string;
  event_type: string;
  direction: string;
  headline: string;
  what_changed: string;
  why_it_matters: string;
  next_trigger: string | null;
  occurred_at: string;
  citations: Array<{ title: string; url: string; publisher?: string; published_at?: string }>;
};

export type BriefingInput = {
  /** The market day this briefing is for, YYYY-MM-DD in US Eastern. */
  date: string;
  /** Build time, ISO. Passed in so the builder never reads the clock. */
  now: string;
  mode: BriefingMode;
  positions: BriefingPosition[];
  movers: AnomalyItem[];
  /** The session the movers feed describes, YYYY-MM-DD. */
  movers_date: string | null;
  movers_as_of: string | null;
  indices: BriefingIndex[];
  earnings_reports: BriefingEarningsReport[];
  congress_trades: BriefingCongressTrade[];
  news: BriefingNews[];
  alerts: BriefingTriggeredAlert[];
  call_changes: BriefingCallChange[];
  discussion: BriefingDiscussion | null;
  attention: BriefingAttention[];
  /**
   * `kind:TICKER` keys that were already in an earlier day's briefing. A name
   * that was in its add zone yesterday is "still in" it today, not news.
   */
  seen_before?: string[];
  /** Runs of the person's standing jobs that ended in "told you". */
  agent_runs?: BriefingAgentRun[];
  /** Market view only: widely followed names that report in the next week. */
  upcoming_earnings?: BriefingUpcomingEarnings[];
};

/* ── tuning ─────────────────────────────────────────────────────────────── */

const MOVE_MIN_HOLDING_PCT = 3;
const MOVE_MIN_WATCHING_PCT = 4;
const MOVE_MIN_WITH_REASON_PCT = 2;
const MOVE_NEEDS_YOU_HOLDING_PCT = 4;
const MOVE_NEEDS_YOU_WATCHING_PCT = 8;
const ZONE_NEAR_PCT = 5;
const EARNINGS_AHEAD_DAYS = 7;
const EARNINGS_REPORTED_DAYS = 3;
const CONGRESS_DISCLOSED_DAYS = 4;
const NEWS_MAX_AGE_HOURS = 36;
const ALERT_MAX_AGE_HOURS = 36;
const CALL_CHANGE_MAX_AGE_HOURS = 48;
const ATTENTION_MAX_AGE_HOURS = 48;
const DISCUSSION_MIN_MENTIONS = 4;
const MAX_NEEDS_YOU = 6;
const MAX_ALSO_TODAY = 12;
/** A person's own list is theirs to read in full: a tracked name with news is never cut. */
const MAX_ALSO_TODAY_PERSONAL = 60;
const MAX_NEWS_ITEMS = 4;
const MARKET_LEAD_STORIES = 4;
const MARKET_STRIP_MOVERS = 3;
const MAX_DISPLAY_MOVE_PCT = 100;
const AGENT_RUN_MAX_AGE_HOURS = 36;
const MAX_AGENT_ITEMS = 3;
const MAX_MARKET_UPCOMING = 6;

export const NO_CONFIRMED_REASON = "We have not found a confirmed reason for the move.";
export const NOTHING_NEEDS_YOU = "Nothing needs you today";

/* ── small pure helpers ─────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dayKey(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(value));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dayToUtc(day: string): number | null {
  const key = dayKey(day);
  if (!key) return null;
  const ms = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Number.isFinite(ms) ? ms : null;
}

/** Calendar days from `from` to `to`. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayToUtc(from);
  const b = dayToUtc(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** The US Eastern calendar day for an instant: the day the market calls today. */
export function marketDay(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "2026-11-09" to "Nov 9". */
export function shortDay(day: string | null | undefined): string {
  const key = dayKey(day);
  if (!key) return "";
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
}

function weekday(day: string): string {
  const ms = dayToUtc(day);
  return ms == null ? "" : WEEKDAYS[new Date(ms).getUTCDay()];
}

/** "today", "tomorrow", "on Thursday", "on Nov 19"; "yesterday", "on Friday" for the past. */
export function relativeDay(target: string, today: string): string {
  const diff = daysBetween(today, target);
  if (diff == null) return "";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (Math.abs(diff) <= 6) return `on ${weekday(target)}`;
  return `on ${shortDay(target)}`;
}

function hoursBetween(fromIso: string | null | undefined, toIso: string): number | null {
  const from = Date.parse(clean(fromIso));
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return (to - from) / 3_600_000;
}

function isRecent(iso: string | null | undefined, now: string, maxHours: number): boolean {
  const hours = hoursBetween(iso, now);
  return hours != null && hours >= -1 && hours <= maxHours;
}

export function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Price levels read better without cents once they are three digits. */
export function level(value: number): string {
  const whole = value >= 100 && Math.abs(value - Math.round(value)) < 0.005;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

function pct(value: number, digits = 2): string {
  return `${Math.abs(value).toFixed(digits)}%`;
}

function signedPct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
}

function moneyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function amountRange(low: number | null, high: number | null): string {
  if (low != null && high != null) return `${moneyShort(low)} to ${moneyShort(high)}`;
  if (low != null) return `${moneyShort(low)} or more`;
  return "amount not disclosed";
}

function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** The first one or two sentences of a longer text, capped so a card stays a card. */
export function leadSentences(text: string | null | undefined, count = 2, maxChars = 300): string {
  const value = clean(text);
  if (!value) return "";
  // Split after sentence punctuation followed by a space, so "$1.37 billion" stays whole.
  const parts = value.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let out = "";
  for (const part of parts.slice(0, count)) {
    const next = `${out} ${part.trim()}`.trim();
    if (out && next.length > maxChars) break;
    out = next;
  }
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).replace(/[\s,;:]+\S*$/, "")}…`;
  return out;
}

function sentence(text: string): string {
  const value = clean(text);
  if (!value) return "";
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function idPart(value: string): string {
  return clean(value).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function itemId(date: string, kind: BriefingKind, ticker: string, extra?: string): string {
  return [date, kind, idPart(ticker.toUpperCase()), extra ? idPart(extra) : ""].filter(Boolean).join("_");
}

/** The publisher's own name for the hosts our reasons cite most; any other host is shown as it is. */
const PUBLISHERS: Record<string, string> = {
  "reuters.com": "Reuters",
  "bloomberg.com": "Bloomberg",
  "cnbc.com": "CNBC",
  "finance.yahoo.com": "Yahoo Finance",
  "yahoo.com": "Yahoo Finance",
  "marketwatch.com": "MarketWatch",
  "wsj.com": "The Wall Street Journal",
  "barrons.com": "Barron's",
  "ft.com": "Financial Times",
  "apnews.com": "AP",
  "benzinga.com": "Benzinga",
  "investing.com": "Investing.com",
  "seekingalpha.com": "Seeking Alpha",
  "fool.com": "The Motley Fool",
  "investors.com": "Investor's Business Daily",
  "thestreet.com": "TheStreet",
  "zacks.com": "Zacks",
  "nasdaq.com": "Nasdaq",
  "businesswire.com": "Business Wire",
  "prnewswire.com": "PR Newswire",
  "globenewswire.com": "GlobeNewswire",
  "sec.gov": "SEC filing",
  "finnhub.io": "Finnhub news",
  "news.google.com": "Google News",
};

function sourceName(url: string | null | undefined): string {
  const value = clean(url);
  if (!value) return "";
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return PUBLISHERS[host] ?? PUBLISHERS[host.split(".").slice(-2).join(".")] ?? host;
  } catch {
    return "";
  }
}

function stanceLabel(stance: string | null | undefined): string {
  const value = clean(stance).toLowerCase();
  return value ? capitalise(value) : "";
}

function toneOf(value: number | null | undefined): BriefingTone {
  if (value == null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/* ── why a stock moved ──────────────────────────────────────────────────── */

export type MoveReason = {
  status: "confirmed" | "price_only" | "none";
  headline: string | null;
  detail: string | null;
  evidence: BriefingEvidence[];
};

/**
 * A reason counts as confirmed only when the research run found sources for
 * it. A "price action" read describes the chart, it does not explain the move,
 * so it is reported as such and never dressed up as a cause.
 */
export function moveReason(anomaly: AnomalyItem | null | undefined): MoveReason {
  if (!anomaly) return { status: "none", headline: null, detail: null, evidence: [] };
  const explanation = anomaly.move_explanation;
  const headline = clean(explanation?.headline) || null;
  const detail = leadSentences(explanation?.why_it_matters) || null;
  const sources = (explanation?.evidence ?? [])
    .map((entry) => ({ title: clean(entry?.title), url: clean(entry?.url) }))
    .filter((entry) => entry.title || entry.url);
  const causeType = clean(explanation?.cause_type).toLowerCase();
  const researched = hasResearchBackedNarrative(anomaly);

  if (researched && sources.length > 0 && causeType !== "price_action") {
    return {
      status: "confirmed",
      headline,
      detail,
      evidence: sources.slice(0, 3).map((entry) => ({
        label: entry.title || "Source",
        source: sourceName(entry.url) || "News",
        url: entry.url || null,
        at: anomaly.narrative_as_of ?? null,
      })),
    };
  }
  if (researched && headline) {
    return { status: "price_only", headline, detail, evidence: [] };
  }
  return { status: "none", headline: null, detail: null, evidence: [] };
}

function whyForMove(reason: MoveReason): { why: string; status: BriefingReasonStatus } {
  if (reason.status === "confirmed") {
    const lead = sentence(reason.headline ?? "");
    const detail = reason.detail && reason.detail !== reason.headline ? ` ${reason.detail}` : "";
    return { why: leadSentences(`${lead}${detail}`, 3, 360), status: "confirmed" };
  }
  if (reason.status === "price_only" && reason.headline) {
    return {
      why: `${NO_CONFIRMED_REASON} What the price shows: ${sentence(reason.headline)}`,
      status: "unconfirmed",
    };
  }
  return { why: NO_CONFIRMED_REASON, status: "unconfirmed" };
}

function quoteEvidence(price: number | null, asOf: string | null): BriefingEvidence[] {
  if (price == null) return [];
  return [{ label: `Price ${money(price)}`, source: "Market quote", url: null, at: asOf }];
}

/* ── per-position items ─────────────────────────────────────────────────── */

type Draft = BriefingItem;

function draft(item: BriefingItem): Draft {
  return item;
}

function alertFor(position: BriefingPosition): BriefingAlertSuggestion | null {
  const stance = clean(position.stance).toLowerCase();
  const price = position.price;
  if (stance === "avoid") return null;
  const wantsAdd = stance !== "trim";
  if (wantsAdd && position.add_below != null && (price == null || price > position.add_below)) {
    return {
      instrument_id: position.instrument_id,
      ticker: position.ticker,
      condition: "below",
      target_price: position.add_below,
      label: `Alert me below ${level(position.add_below)}`,
    };
  }
  if (
    position.relation === "holding" &&
    position.trim_above != null &&
    (price == null || price < position.trim_above)
  ) {
    return {
      instrument_id: position.instrument_id,
      ticker: position.ticker,
      condition: "above",
      target_price: position.trim_above,
      label: `Alert me above ${level(position.trim_above)}`,
    };
  }
  return null;
}

function callEvidence(position: BriefingPosition): BriefingEvidence[] {
  const stance = stanceLabel(position.stance);
  if (!stance) return [];
  const levels = [
    position.add_below != null ? `add below ${level(position.add_below)}` : "",
    position.trim_above != null ? `trim above ${level(position.trim_above)}` : "",
  ].filter(Boolean);
  return [
    {
      label: levels.length ? `Call: ${stance}, ${levels.join(", ")}` : `Call: ${stance}`,
      source: "stocksbrew research",
      url: `/stock/${position.ticker}`,
      at: null,
    },
  ];
}

function earningsTimePhrase(time: BriefingPosition["earnings_time"]): string {
  if (time === "bmo") return " before the open";
  if (time === "amc") return " after the close";
  return "";
}

function callLine(position: BriefingPosition): string {
  const stance = stanceLabel(position.stance);
  if (!stance) return `Open ${position.ticker} to read the research.`;
  const watchOut = leadSentences(position.watch_out, 1, 180);
  if (watchOut) return `The call is ${stance}. What would change it: ${sentence(watchOut)}`;
  return `The call is ${stance}. Open ${position.ticker} to see what would change it.`;
}

function nextStepForMove(position: BriefingPosition, movePct: number, date: string, reason: MoveReason): string {
  const stance = clean(position.stance).toLowerCase();
  const price = position.price;
  if (
    movePct < 0 &&
    price != null &&
    position.add_below != null &&
    stance !== "trim" &&
    stance !== "avoid" &&
    price > position.add_below
  ) {
    const gap = ((price - position.add_below) / price) * 100;
    if (gap <= ZONE_NEAR_PCT) {
      return `Check the add zone at ${level(position.add_below)}. The price is ${gap.toFixed(1)}% above it.`;
    }
  }
  if (
    movePct > 0 &&
    price != null &&
    position.relation === "holding" &&
    position.trim_above != null &&
    stance !== "avoid" &&
    price < position.trim_above
  ) {
    const gap = ((position.trim_above - price) / price) * 100;
    if (gap <= ZONE_NEAR_PCT) {
      return `Check the trim zone at ${level(position.trim_above)}. The price is ${gap.toFixed(1)}% below it.`;
    }
  }
  if (position.earnings_date) {
    const days = daysBetween(date, position.earnings_date);
    if (days != null && days >= 0 && days <= EARNINGS_AHEAD_DAYS) {
      return `Earnings are ${relativeDay(position.earnings_date, date)}${earningsTimePhrase(position.earnings_time)}. Read what would change the call before then.`;
    }
  }
  if (reason.status !== "confirmed" && !stanceLabel(position.stance)) {
    return `Open ${position.ticker} to check the latest news and filings yourself.`;
  }
  return callLine(position);
}

function moveItem(
  position: BriefingPosition,
  anomaly: AnomalyItem | undefined,
  date: string,
  sessionDay: string,
): Draft | null {
  const movePct = position.day_change_pct;
  if (movePct == null || Math.abs(movePct) > MAX_DISPLAY_MOVE_PCT) return null;
  const reason = moveReason(anomaly);
  const size = Math.abs(movePct);
  const floor = position.relation === "holding" ? MOVE_MIN_HOLDING_PCT : MOVE_MIN_WATCHING_PCT;
  const worthShowing = size >= floor || (reason.status === "confirmed" && size >= MOVE_MIN_WITH_REASON_PCT);
  if (!worthShowing) return null;

  const direction = movePct >= 0 ? "up" : "down";
  const when = relativeDay(sessionDay, date);
  const priceTail = position.price != null ? `, at ${money(position.price)}` : "";
  const { why, status } = whyForMove(reason);
  const holding = position.relation === "holding";
  const needsYou = holding ? size >= MOVE_NEEDS_YOU_HOLDING_PCT : size >= MOVE_NEEDS_YOU_WATCHING_PCT;
  const severity: BriefingSeverity =
    size >= (holding ? 7 : 10) ? "high" : size >= 4 ? "medium" : "low";

  return draft({
    id: itemId(date, "price_move", position.ticker),
    kind: "price_move",
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity,
    needs_you: needsYou,
    tone: toneOf(movePct),
    headline: `${position.ticker} is ${direction} ${pct(movePct)} ${when}${priceTail}`,
    metric: signedPct(movePct),
    why,
    reason_status: status,
    next_step: nextStepForMove(position, movePct, date, reason),
    spoken: `${position.ticker} is ${direction} ${pct(movePct)}`,
    evidence: [...quoteEvidence(position.price, position.price_as_of), ...reason.evidence],
    as_of: position.price_as_of,
    deadline_days: null,
    price: position.price,
    day_change_pct: movePct,
    alert: alertFor(position),
    href: `/stock/${position.ticker}`,
  });
}

type ZoneHit = { zone: "add" | "breakout" | "trim"; threshold: number };

function zoneHit(position: BriefingPosition): ZoneHit | null {
  const price = position.price;
  if (price == null) return null;
  const stance = clean(position.stance).toLowerCase();
  if (!stance || stance === "avoid") return null;
  if (stance !== "trim" && position.add_below != null && price <= position.add_below) {
    return { zone: "add", threshold: position.add_below };
  }
  // You cannot trim what you do not own, so the trim zone only speaks to holders.
  if (position.relation === "holding" && position.trim_above != null && price >= position.trim_above) {
    return { zone: "trim", threshold: position.trim_above };
  }
  if (
    (stance === "accumulate" || stance === "watch") &&
    position.add_below == null &&
    position.breakout_above != null &&
    price >= position.breakout_above
  ) {
    return { zone: "breakout", threshold: position.breakout_above };
  }
  return null;
}

function zoneItem(
  position: BriefingPosition,
  hit: ZoneHit,
  anomaly: AnomalyItem | undefined,
  date: string,
  seenBefore: Set<string>,
): Draft {
  const price = position.price as number;
  const stance = stanceLabel(position.stance);
  const still = seenBefore.has(`zone_entered:${position.ticker.toUpperCase()}`);
  const verb = still ? "is still" : "is";
  const zoneName = hit.zone === "add" ? "add zone" : hit.zone === "trim" ? "trim zone" : "add level";
  const side = hit.zone === "add" ? "below" : "above";
  const headline =
    hit.zone === "breakout"
      ? `${position.ticker} ${still ? "is still above" : "broke above"} its add level: ${money(price)}, above ${level(hit.threshold)}`
      : `${position.ticker} ${verb} in its ${zoneName}: ${money(price)}, ${side} ${level(hit.threshold)}`;

  const callSummary = leadSentences(position.call_summary, 2, 240);
  const whyParts = [
    callSummary ? `The call is ${stance}. ${sentence(callSummary)}` : `The call is ${stance}, and this is the level it named.`,
  ];
  const movePct = position.day_change_pct;
  if (movePct != null && Math.abs(movePct) >= MOVE_MIN_WITH_REASON_PCT) {
    const reason = moveReason(anomaly);
    const moveLine = `It is ${movePct >= 0 ? "up" : "down"} ${pct(movePct)} today.`;
    whyParts.push(
      reason.status === "confirmed" && reason.headline
        ? `${moveLine} ${sentence(reason.headline)}`
        : `${moveLine} ${NO_CONFIRMED_REASON}`,
    );
  }

  const watchOut = leadSentences(position.watch_out, 1, 180);
  const nextStep = watchOut
    ? `Reread the call before you act on it. What would break it: ${sentence(watchOut)}`
    : `Reread the call and what would break it before you act on it.`;

  return draft({
    id: itemId(date, "zone_entered", position.ticker, hit.zone),
    kind: "zone_entered",
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity: still ? "low" : position.relation === "holding" ? "high" : "medium",
    needs_you: !still,
    tone: hit.zone === "trim" ? "up" : hit.zone === "add" ? "down" : "up",
    headline,
    metric: money(price),
    why: whyParts.join(" "),
    reason_status: "not_applicable",
    next_step: nextStep,
    spoken:
      hit.zone === "breakout"
        ? `${position.ticker} ${still ? "is still above" : "broke above"} its add level`
        : `${position.ticker} ${verb} in its ${zoneName}`,
    evidence: [...quoteEvidence(price, position.price_as_of), ...callEvidence(position)],
    as_of: position.price_as_of,
    deadline_days: null,
    price,
    day_change_pct: movePct,
    alert: null,
    href: `/stock/${position.ticker}`,
  });
}

function earningsAheadItem(position: BriefingPosition, date: string): Draft | null {
  if (!position.earnings_date) return null;
  const days = daysBetween(date, position.earnings_date);
  if (days == null || days < 0 || days > EARNINGS_AHEAD_DAYS) return null;

  const when = relativeDay(position.earnings_date, date);
  const time = earningsTimePhrase(position.earnings_time);
  const stance = stanceLabel(position.stance);
  const holding = position.relation === "holding";
  const preview = leadSentences(position.pre_earnings_headline, 1, 220);
  const why = [
    preview ? sentence(preview) : "",
    stance
      ? `The call going in is ${stance}.`
      : holding
        ? "You hold it into the report."
        : "You are watching it into the report.",
  ]
    .filter(Boolean)
    .join(" ");

  const watchOut = leadSentences(position.watch_out, 1, 180);
  const dayName = days <= 1 ? when : weekday(position.earnings_date);
  const nextStep = watchOut
    ? `Earnings ${dayName}${time}. Here is what would change the call: ${sentence(watchOut)}`
    : `Earnings ${dayName}${time}. Read the pre-earnings notes on ${position.ticker} before then.`;

  return draft({
    id: itemId(date, "earnings_upcoming", position.ticker, position.earnings_date),
    kind: "earnings_upcoming",
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity: days <= 1 ? (holding ? "high" : "medium") : "low",
    needs_you: holding && days <= 2,
    tone: "flat",
    headline: `${position.ticker} reports earnings ${when}${time}`,
    metric: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
    why,
    reason_status: "not_applicable",
    next_step: nextStep,
    spoken: `${position.ticker} reports earnings ${when}`,
    evidence: [
      {
        label: `Earnings date ${shortDay(position.earnings_date)}`,
        source: "Earnings calendar",
        url: `/stock/${position.ticker}`,
        at: position.earnings_date,
      },
      ...callEvidence(position),
    ],
    as_of: position.earnings_date,
    deadline_days: days,
    price: position.price,
    day_change_pct: position.day_change_pct,
    alert: alertFor(position),
    href: `/stock/${position.ticker}`,
  });
}

function earningsReportedItem(
  report: BriefingEarningsReport,
  relation: BriefingRelation,
  name: string,
  position: BriefingPosition | null,
  date: string,
): Draft | null {
  const daysAgo = daysBetween(report.event_date, date);
  if (daysAgo == null || daysAgo < 0 || daysAgo > EARNINGS_REPORTED_DAYS) return null;
  const headline = clean(report.headline) || leadSentences(report.summary, 1, 200);
  if (!headline) return null;

  const when = relativeDay(report.event_date, date);
  const movePct = position?.day_change_pct ?? null;
  const moveTail =
    movePct != null && Math.abs(movePct) >= MOVE_MIN_WITH_REASON_PCT
      ? ` and is ${movePct >= 0 ? "up" : "down"} ${pct(movePct)} today`
      : "";
  const guide = relation === "holding" ? report.for_holders : report.for_watchers;
  const why = [sentence(headline), leadSentences(guide, 1, 220)].filter(Boolean).join(" ");
  const monitor = leadSentences(report.monitor, 1, 160);

  return draft({
    id: itemId(date, "earnings_reported", report.ticker, report.event_date),
    kind: "earnings_reported",
    ticker: report.ticker,
    instrument_id: report.instrument_id,
    name,
    relation,
    severity: relation === "holding" && daysAgo <= 1 ? "high" : "medium",
    needs_you: relation === "holding" && daysAgo <= 1,
    tone: toneOf(movePct),
    headline: `${report.ticker} reported earnings ${when}${moveTail}`,
    metric: movePct != null && moveTail ? signedPct(movePct) : null,
    why,
    reason_status: "not_applicable",
    next_step: monitor
      ? `Read the post-earnings report. The thing to watch next: ${sentence(monitor)}`
      : `Read the post-earnings report on ${report.ticker} to see what changed.`,
    spoken: `${report.ticker} reported earnings ${when}`,
    evidence: [
      {
        label: "Post-earnings report",
        source: "stocksbrew research",
        url: `/earnings-intel/${report.ticker}`,
        at: report.generated_at || report.event_date,
      },
      ...(position ? quoteEvidence(position.price, position.price_as_of) : []),
    ],
    as_of: report.generated_at || report.event_date,
    deadline_days: null,
    price: position?.price ?? null,
    day_change_pct: movePct,
    alert: position ? alertFor(position) : null,
    href: `/earnings-intel/${report.ticker}`,
  });
}

function callChangeItem(
  change: BriefingCallChange,
  position: BriefingPosition,
  date: string,
): Draft {
  const from = stanceLabel(change.prev_stance);
  const to = stanceLabel(change.new_stance);
  const text = leadSentences(change.text ?? position.call_summary, 2, 240);
  const holding = position.relation === "holding";
  return draft({
    id: itemId(date, "call_changed", position.ticker, change.new_stance),
    kind: "call_changed",
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity: holding ? "high" : "medium",
    needs_you: holding || change.new_stance.toLowerCase() === "accumulate",
    // Up for an upgrade, down for a downgrade, so the row can say which way it went.
    tone: callShift(change.prev_stance, change.new_stance)?.tone ?? "flat",
    headline: `The call on ${position.ticker} changed from ${from} to ${to}`,
    metric: to,
    why: text
      ? `The new call: ${sentence(text)}`
      : `The research now reads ${to} where it read ${from}.`,
    reason_status: "not_applicable",
    next_step: `Read what changed in the research on ${position.ticker} before you act on it.`,
    spoken: `the call on ${position.ticker} changed to ${to}`,
    evidence: [
      { label: `Call changed: ${from} to ${to}`, source: "stocksbrew research", url: `/stock/${position.ticker}`, at: change.at },
    ],
    as_of: change.at,
    deadline_days: null,
    price: position.price,
    day_change_pct: position.day_change_pct,
    alert: alertFor(position),
    href: `/stock/${position.ticker}`,
  });
}

function alertItem(alert: BriefingTriggeredAlert, position: BriefingPosition | null, date: string): Draft {
  const side = alert.condition === "above" ? "above" : alert.condition === "below" ? "below" : "";
  const target = alert.target_price != null && side ? `${side} ${level(alert.target_price)}` : "";
  const price = position?.price ?? null;
  const from = clean(alert.directive_text);
  const whyParts = [
    from ? `You set it from the call: "${from}".` : "You set this alert yourself.",
    price != null ? `The price is ${money(price)} now.` : "",
  ].filter(Boolean);
  return draft({
    id: itemId(date, "alert_triggered", alert.ticker, alert.id),
    kind: "alert_triggered",
    ticker: alert.ticker,
    instrument_id: alert.instrument_id,
    name: position?.name ?? alert.ticker,
    relation: position?.relation ?? "watching",
    severity: "high",
    needs_you: true,
    tone: alert.condition === "above" ? "up" : alert.condition === "below" ? "down" : "flat",
    headline: target
      ? `Your alert on ${alert.ticker} triggered: ${target}`
      : `Your alert on ${alert.ticker} triggered`,
    metric: alert.target_price != null ? level(alert.target_price) : null,
    why: whyParts.join(" "),
    reason_status: "not_applicable",
    next_step: position && stanceLabel(position.stance)
      ? `Check where ${alert.ticker} trades now, then reread the call. It is ${stanceLabel(position.stance)}.`
      : `Check where ${alert.ticker} trades now and whether the reason you set the alert still holds.`,
    spoken: `your alert on ${alert.ticker} triggered`,
    evidence: [
      { label: target ? `Alert: ${target}` : "Price alert", source: "Your price alert", url: null, at: alert.triggered_at },
      ...(position ? quoteEvidence(position.price, position.price_as_of) : []),
    ],
    as_of: alert.triggered_at,
    deadline_days: 0,
    price,
    day_change_pct: position?.day_change_pct ?? null,
    alert: null,
    href: `/stock/${alert.ticker}`,
  });
}

function chamberSource(chamber: string): string {
  const value = clean(chamber).toLowerCase();
  if (value === "house") return "House Clerk disclosures";
  if (value === "senate") return "Senate eFD disclosures";
  return "Congressional disclosures";
}

function memberLabel(trade: BriefingCongressTrade): string {
  const tag = [clean(trade.party), clean(trade.state)].filter(Boolean).join("-");
  return tag ? `${clean(trade.person_name)} (${tag})` : clean(trade.person_name);
}

function congressItem(
  trades: BriefingCongressTrade[],
  relation: BriefingRelation,
  name: string,
  instrumentId: string | null,
  date: string,
): Draft {
  const sorted = [...trades].sort((a, b) => b.disclosure_date.localeCompare(a.disclosure_date));
  const first = sorted[0];
  const ticker = first.ticker.toUpperCase();
  const verb = (trade: BriefingCongressTrade) =>
    trade.tx_type === "buy" ? "bought" : trade.tx_type === "sell" ? "sold" : "traded";
  const people = new Set(sorted.map((trade) => trade.person_name)).size;

  const headline =
    sorted.length === 1
      ? `${memberLabel(first)} ${verb(first)} ${ticker}: ${amountRange(first.amount_low, first.amount_high)}`
      : `${people === 1 ? memberLabel(first) : `${people} members of Congress`} disclosed ${sorted.length} trades in ${ticker}`;

  const lag =
    first.lag_days != null && first.lag_days >= 0
      ? `The trade was made on ${shortDay(first.transaction_date)} and filed ${first.lag_days} days later.`
      : `The trade was made on ${shortDay(first.transaction_date)}.`;
  const why =
    sorted.length === 1
      ? `${lag} Filings report a bracket, never an exact amount.`
      : `The newest was filed ${shortDay(first.disclosure_date)}: ${memberLabel(first)} ${verb(first)} ${amountRange(first.amount_low, first.amount_high)}. Filings report a bracket, never an exact amount.`;

  return draft({
    id: itemId(date, "congress_trade", ticker, first.trade_id),
    kind: "congress_trade",
    ticker,
    instrument_id: instrumentId,
    name,
    relation,
    severity: "low",
    needs_you: false,
    tone: first.tx_type === "buy" ? "up" : first.tx_type === "sell" ? "down" : "flat",
    headline,
    metric: sorted.length === 1 ? capitalise(verb(first)) : `${sorted.length} trades`,
    why,
    reason_status: "not_applicable",
    next_step: `See every disclosed trade in ${ticker} and who made it.`,
    spoken:
      sorted.length === 1
        ? `${clean(first.person_name)} ${verb(first)} ${ticker}`
        : `${sorted.length} congressional trades in ${ticker} were disclosed`,
    evidence: sorted.slice(0, 3).map((trade) => ({
      label: `${clean(trade.person_name)} ${verb(trade)}, ${amountRange(trade.amount_low, trade.amount_high)}`,
      source: chamberSource(trade.chamber),
      url: clean(trade.source_url) || null,
      at: trade.disclosure_date,
    })),
    as_of: first.disclosure_date,
    deadline_days: null,
    price: null,
    day_change_pct: null,
    alert: null,
    href: "/power-trades",
  });
}

function newsItem(article: BriefingNews, position: BriefingPosition, date: string): Draft {
  const summary = leadSentences(article.summary, 2, 260);
  const stance = stanceLabel(position.stance);
  return draft({
    id: itemId(date, "news", position.ticker, article.id.slice(-24)),
    kind: "news",
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity: "low",
    needs_you: false,
    tone: "flat",
    headline: `News on ${position.ticker}: ${clean(article.title)}`,
    metric: null,
    why: summary || "We have the headline but no summary yet. Open the article to read it.",
    reason_status: "not_applicable",
    next_step: stance
      ? `Read it, then check whether it changes the call. It is ${stance} today.`
      : `Read it, then open ${position.ticker} for the rest of the research.`,
    spoken: `there is news on ${position.ticker}`,
    evidence: [
      {
        label: clean(article.title),
        source: clean(article.source_name) || sourceName(article.url) || "News",
        url: article.url,
        at: article.published_at,
      },
    ],
    as_of: article.published_at,
    deadline_days: null,
    price: position.price,
    day_change_pct: position.day_change_pct,
    alert: null,
    href: `/stock/${position.ticker}`,
  });
}

function discussionItem(
  entry: BriefingDiscussionTicker,
  discussion: BriefingDiscussion,
  relation: BriefingRelation,
  name: string,
  instrumentId: string | null,
  date: string,
): Draft {
  const ticker = entry.ticker.toUpperCase();
  const days = Math.max(1, Math.round(discussion.window_hours / 24));
  const mood = clean(entry.sentiment).toLowerCase();
  const moodTail = mood === "bullish" || mood === "bearish" ? `, mostly ${mood}` : "";
  return draft({
    id: itemId(date, "discussion_spike", ticker),
    kind: "discussion_spike",
    ticker,
    instrument_id: instrumentId,
    name,
    relation,
    severity: "low",
    needs_you: false,
    tone: mood === "bullish" ? "up" : mood === "bearish" ? "down" : "flat",
    headline: `${ticker} is one of the most discussed stocks on Reddit: ${entry.mention_count} posts in ${days} days${moodTail}`,
    metric: `${entry.mention_count} posts`,
    why: leadSentences(entry.summary, 2, 280) || "People are posting about it, but we do not have a summary of what they are saying yet.",
    reason_status: "not_applicable",
    next_step: `Treat it as what people are saying, then check the claims against the research on ${ticker}.`,
    spoken: `${ticker} is getting a lot of discussion on Reddit`,
    evidence: [
      {
        label: `${entry.mention_count} posts in ${days} days`,
        source: "Reddit",
        url: "/reddit-buzz",
        at: entry.latest_post_at ?? discussion.generated_at,
      },
    ],
    as_of: entry.latest_post_at ?? discussion.generated_at,
    deadline_days: null,
    price: null,
    day_change_pct: null,
    alert: null,
    href: `/stock/${ticker}`,
  });
}

function attentionItem(entry: BriefingAttention, position: BriefingPosition, date: string): Draft | null {
  const type = clean(entry.event_type).toLowerCase();
  const kind: BriefingKind = type.includes("filing") ? "filing" : "technical";
  const headline = clean(entry.what_changed) || clean(entry.headline);
  const why = leadSentences(entry.why_it_matters, 2, 280);
  if (!headline || !why) return null;
  const next = leadSentences(entry.next_trigger, 1, 200);
  return draft({
    id: itemId(date, kind, position.ticker, entry.item_id.slice(-16)),
    kind,
    ticker: position.ticker,
    instrument_id: position.instrument_id,
    name: position.name,
    relation: position.relation,
    severity: kind === "filing" && position.relation === "holding" ? "medium" : "low",
    needs_you: false,
    tone: entry.direction === "positive" ? "up" : entry.direction === "negative" ? "down" : "flat",
    headline: sentence(headline).replace(/\.$/, ""),
    metric: null,
    why,
    reason_status: "not_applicable",
    next_step: next ? sentence(next) : callLine(position),
    spoken: kind === "filing" ? `${position.ticker} has a new filing` : `${position.ticker} had a technical change`,
    evidence: entry.citations
      .filter((citation) => clean(citation.title))
      .slice(0, 3)
      .map((citation) => ({
        label: clean(citation.title),
        source: clean(citation.publisher) || sourceName(citation.url) || "Source",
        url: clean(citation.url) || null,
        at: clean(citation.published_at) || entry.occurred_at,
      })),
    as_of: entry.occurred_at,
    deadline_days: null,
    price: position.price,
    day_change_pct: position.day_change_pct,
    alert: null,
    href: `/stock/${position.ticker}`,
  });
}

/* ── ordering ───────────────────────────────────────────────────────────── */

const RELATION_RANK: Record<BriefingRelation, number> = { holding: 0, watching: 1, market: 2 };
const SEVERITY_RANK: Record<BriefingSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * What needs the person comes first: what they own before what they watch,
 * things with a deadline before things without (soonest first), then the
 * bigger move. The ticker is the last tie-break so the order never flickers.
 */
export function compareItems(
  a: Pick<BriefingItem, "relation" | "deadline_days" | "severity" | "day_change_pct" | "ticker" | "id">,
  b: Pick<BriefingItem, "relation" | "deadline_days" | "severity" | "day_change_pct" | "ticker" | "id">,
): number {
  const relation = RELATION_RANK[a.relation] - RELATION_RANK[b.relation];
  if (relation !== 0) return relation;
  const aDeadline = a.deadline_days != null;
  const bDeadline = b.deadline_days != null;
  if (aDeadline !== bDeadline) return aDeadline ? -1 : 1;
  if (aDeadline && bDeadline && a.deadline_days !== b.deadline_days) {
    return (a.deadline_days as number) - (b.deadline_days as number);
  }
  const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severity !== 0) return severity;
  const magnitude = Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
  if (magnitude !== 0) return magnitude;
  return a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id);
}

/* ── market strip ───────────────────────────────────────────────────────── */

function displayable(anomaly: AnomalyItem): boolean {
  return (
    Boolean(clean(anomaly.ticker)) &&
    Number.isFinite(anomaly.day_change_pct) &&
    Math.abs(anomaly.day_change_pct) <= MAX_DISPLAY_MOVE_PCT
  );
}

function stripMover(anomaly: AnomalyItem): BriefingMarketMover {
  const reason = moveReason(anomaly);
  return {
    ticker: anomaly.ticker.toUpperCase(),
    name: clean(anomaly.name) || anomaly.ticker,
    price: num(anomaly.price),
    day_change_pct: anomaly.day_change_pct,
    reason:
      reason.status === "confirmed" && reason.headline ? reason.headline : "No confirmed reason yet",
    reason_status: reason.status === "confirmed" ? "confirmed" : "unconfirmed",
    as_of: anomaly.price_as_of ?? null,
  };
}

function buildMarketStrip(input: BriefingInput): Briefing["market"] {
  const movers = input.movers.filter(displayable);
  const gainers = movers
    .filter((row) => row.day_change_pct > 0)
    .sort((a, b) => b.day_change_pct - a.day_change_pct)
    .slice(0, MARKET_STRIP_MOVERS)
    .map(stripMover);
  const losers = movers
    .filter((row) => row.day_change_pct < 0)
    .sort((a, b) => a.day_change_pct - b.day_change_pct)
    .slice(0, MARKET_STRIP_MOVERS)
    .map(stripMover);
  return {
    indices: input.indices.filter((index) => Number.isFinite(index.price) && Number.isFinite(index.change_pct)),
    gainers,
    losers,
    as_of: input.movers_as_of,
  };
}

/* ── market-wide briefing (signed out, or nothing tracked yet) ──────────── */

function marketMoveItem(anomaly: AnomalyItem, date: string, sessionDay: string, lead: boolean): Draft {
  const reason = moveReason(anomaly);
  const movePct = anomaly.day_change_pct;
  const ticker = anomaly.ticker.toUpperCase();
  const direction = movePct >= 0 ? "up" : "down";
  const price = num(anomaly.price);
  const { why, status } = whyForMove(reason);
  return draft({
    id: itemId(date, "price_move", ticker),
    kind: "price_move",
    ticker,
    instrument_id: clean(anomaly.instrument_id) || null,
    name: clean(anomaly.name) || ticker,
    relation: "market",
    severity: Math.abs(movePct) >= 10 ? "high" : "medium",
    needs_you: lead,
    tone: toneOf(movePct),
    headline: `${ticker} is ${direction} ${pct(movePct)} ${relativeDay(sessionDay, date)}${price != null ? `, at ${money(price)}` : ""}`,
    metric: signedPct(movePct),
    why,
    reason_status: status,
    next_step: `Open ${ticker} for the full research, or add it to your watchlist to follow it here.`,
    spoken: `${ticker} is ${direction} ${pct(movePct)}`,
    evidence: [...quoteEvidence(price, anomaly.price_as_of ?? null), ...reason.evidence],
    as_of: anomaly.price_as_of ?? null,
    deadline_days: null,
    price,
    day_change_pct: movePct,
    alert: null,
    href: `/stock/${ticker}`,
  });
}

function buildMarketItems(input: BriefingInput, sessionDay: string): Draft[] {
  const { date } = input;
  const out: Draft[] = [];
  const movers = input.movers.filter(displayable);
  const confirmed = movers
    .filter((row) => moveReason(row).status === "confirmed")
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct));

  // Lead with explained moves in both directions, so the read is not one-sided.
  const lead: AnomalyItem[] = [];
  const topUp = confirmed.find((row) => row.day_change_pct > 0);
  const topDown = confirmed.find((row) => row.day_change_pct < 0);
  for (const pick of [topUp, topDown]) if (pick && !lead.includes(pick)) lead.push(pick);
  for (const row of confirmed) {
    if (lead.length >= MARKET_LEAD_STORIES) break;
    if (!lead.includes(row)) lead.push(row);
  }
  lead.sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct));
  for (const row of lead) out.push(marketMoveItem(row, date, sessionDay, true));

  const used = new Set(lead.map((row) => row.ticker.toUpperCase()));
  for (const row of confirmed.filter((entry) => !used.has(entry.ticker.toUpperCase())).slice(0, 3)) {
    used.add(row.ticker.toUpperCase());
    out.push(marketMoveItem(row, date, sessionDay, false));
  }
  // The biggest unexplained moves still belong in an honest market read.
  const unexplained = movers
    .filter((row) => !used.has(row.ticker.toUpperCase()))
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
    .slice(0, 2);
  for (const row of unexplained) {
    used.add(row.ticker.toUpperCase());
    out.push(marketMoveItem(row, date, sessionDay, false));
  }

  for (const report of input.earnings_reports.slice(0, 12)) {
    if (out.filter((item) => item.kind === "earnings_reported").length >= 3) break;
    const item = earningsReportedItem(report, "market", report.ticker, null, date);
    if (item) out.push({ ...item, needs_you: false, severity: "medium" });
  }

  const tradesByTicker = groupTrades(input.congress_trades, date);
  const congress = [...tradesByTicker.entries()]
    .sort((a, b) => (b[1][0]?.amount_low ?? 0) - (a[1][0]?.amount_low ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, 2);
  for (const [, trades] of congress) {
    out.push(congressItem(trades, "market", clean(trades[0].company) || trades[0].ticker, null, date));
  }

  if (input.discussion) {
    const hot = input.discussion.tickers
      .filter((entry) => entry.mention_count >= DISCUSSION_MIN_MENTIONS && clean(entry.summary))
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, 2);
    for (const entry of hot) {
      out.push(
        discussionItem(entry, input.discussion, "market", entry.company_name ?? entry.ticker, null, date),
      );
    }
  }
  return out;
}

function groupTrades(trades: BriefingCongressTrade[], date: string): Map<string, BriefingCongressTrade[]> {
  const out = new Map<string, BriefingCongressTrade[]>();
  for (const trade of trades) {
    const ticker = clean(trade.ticker).toUpperCase();
    if (!ticker) continue;
    const age = daysBetween(trade.disclosure_date, date);
    if (age == null || age < 0 || age > CONGRESS_DISCLOSED_DAYS) continue;
    const list = out.get(ticker) ?? [];
    list.push(trade);
    out.set(ticker, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => (b.amount_low ?? 0) - (a.amount_low ?? 0) || b.disclosure_date.localeCompare(a.disclosure_date));
  }
  return out;
}

/* ── personal briefing ──────────────────────────────────────────────────── */

function buildPersonalItems(input: BriefingInput, sessionDay: string): Draft[] {
  const { date, now } = input;
  const seenBefore = new Set((input.seen_before ?? []).map((key) => key.trim()));
  const out: Draft[] = [];
  const byTicker = new Map(input.positions.map((position) => [position.ticker.toUpperCase(), position]));
  const byInstrument = new Map(input.positions.map((position) => [position.instrument_id, position]));
  const anomalyByTicker = new Map(
    input.movers.filter(displayable).map((row) => [row.ticker.toUpperCase(), row]),
  );
  const reportByTicker = new Map(input.earnings_reports.map((report) => [report.ticker.toUpperCase(), report]));

  for (const position of input.positions) {
    const key = position.ticker.toUpperCase();
    const anomaly = anomalyByTicker.get(key);
    const positionDay = marketDay(position.price_as_of ?? "") || sessionDay;

    const report = reportByTicker.get(key);
    const reported = report ? earningsReportedItem(report, position.relation, position.name, position, date) : null;
    const hit = zoneHit(position);

    if (hit) {
      // The zone card carries the move and its reason, so there is no second card for the same price.
      out.push(zoneItem(position, hit, anomaly, date, seenBefore));
    } else if (reported) {
      // The earnings card carries today's move in its headline.
    } else {
      const move = moveItem(position, anomaly, date, positionDay);
      if (move) out.push(move);
    }
    if (reported) out.push(reported);

    const ahead = earningsAheadItem(position, date);
    // A report already in hand makes a stale upcoming date wrong, not useful.
    if (ahead && !reported) out.push(ahead);
  }

  const changedTickers = new Set<string>();
  const changes = [...input.call_changes].sort((a, b) => b.at.localeCompare(a.at));
  for (const change of changes) {
    if (!isRecent(change.at, now, CALL_CHANGE_MAX_AGE_HOURS)) continue;
    const position = byInstrument.get(change.instrument_id) ?? byTicker.get(clean(change.ticker).toUpperCase());
    if (!position || changedTickers.has(position.ticker)) continue;
    if (clean(change.prev_stance).toLowerCase() === clean(change.new_stance).toLowerCase()) continue;
    changedTickers.add(position.ticker);
    out.push(callChangeItem(change, position, date));
  }

  for (const alert of input.alerts) {
    if (!isRecent(alert.triggered_at, now, ALERT_MAX_AGE_HOURS)) continue;
    const position = byInstrument.get(alert.instrument_id) ?? byTicker.get(clean(alert.ticker).toUpperCase()) ?? null;
    out.push(alertItem(alert, position, date));
  }

  for (const [ticker, trades] of groupTrades(input.congress_trades, date)) {
    const position = byTicker.get(ticker);
    if (!position) continue;
    out.push(congressItem(trades, position.relation, position.name, position.instrument_id, date));
  }

  // News: newest article per tracked name, skipped when a confirmed move reason already tells the story.
  const explained = new Set(
    out.filter((item) => item.kind === "price_move" && item.reason_status === "confirmed").map((item) => item.ticker),
  );
  const newsByTicker = new Map<string, BriefingNews>();
  for (const article of [...input.news].sort((a, b) => b.published_at.localeCompare(a.published_at))) {
    if (!isRecent(article.published_at, now, NEWS_MAX_AGE_HOURS)) continue;
    for (const raw of article.tickers) {
      const ticker = clean(raw).toUpperCase();
      if (!byTicker.has(ticker) || explained.has(ticker) || newsByTicker.has(ticker)) continue;
      newsByTicker.set(ticker, article);
    }
  }
  const newsItems = [...newsByTicker.entries()]
    .map(([ticker, article]) => newsItem(article, byTicker.get(ticker) as BriefingPosition, date))
    .sort(compareItems)
    .slice(0, MAX_NEWS_ITEMS);
  out.push(...newsItems);

  if (input.discussion) {
    for (const entry of input.discussion.tickers) {
      const position = byTicker.get(clean(entry.ticker).toUpperCase());
      if (!position || entry.mention_count < DISCUSSION_MIN_MENTIONS || !clean(entry.summary)) continue;
      out.push(
        discussionItem(entry, input.discussion, position.relation, position.name, position.instrument_id, date),
      );
    }
  }

  const attentionSeen = new Set<string>();
  for (const entry of input.attention) {
    if (!isRecent(entry.occurred_at, now, ATTENTION_MAX_AGE_HOURS)) continue;
    const position = byInstrument.get(entry.instrument_id) ?? byTicker.get(clean(entry.ticker).toUpperCase());
    if (!position) continue;
    const item = attentionItem(entry, position, date);
    if (!item || attentionSeen.has(`${item.kind}:${item.ticker}`)) continue;
    attentionSeen.add(`${item.kind}:${item.ticker}`);
    out.push(item);
  }

  return out;
}

/* ── standing jobs and the week ahead ───────────────────────────────────── */

function agentRunItem(run: BriefingAgentRun, positions: Map<string, BriefingPosition>, date: string): Draft | null {
  const summary = sentence(run.summary);
  if (!summary || !clean(run.job_id)) return null;
  const first = run.findings[0];
  const ticker = clean(first?.ticker ?? "").toUpperCase();
  const position = ticker ? positions.get(ticker) ?? null : null;
  const name = clean(run.job_name) || "Your job";
  return draft({
    id: itemId(date, "agent_job", run.job_id, run.day),
    kind: "agent_job",
    ticker,
    instrument_id: position?.instrument_id ?? null,
    name: position?.name ?? name,
    relation: position?.relation ?? "watching",
    severity: "medium",
    needs_you: true,
    tone: "flat",
    headline: `Your job "${name}" found something: ${summary.replace(/\.$/, "")}`,
    metric: run.findings.length > 1 ? `${run.findings.length} findings` : null,
    why: first ? leadSentences(`${sentence(first.headline)} ${first.detail}`, 3, 320) : summary,
    reason_status: "not_applicable",
    next_step: "Open the job to see everything it checked on this run.",
    spoken: `your job "${name}" found something`,
    evidence: run.findings.slice(0, 3).map((finding) => ({
      label: clean(finding.headline),
      source: clean(finding.source) || "Standing job",
      url: clean(finding.url ?? "") || null,
      at: finding.at || run.day,
    })),
    as_of: run.ran_at,
    deadline_days: null,
    price: position?.price ?? null,
    day_change_pct: position?.day_change_pct ?? null,
    alert: null,
    href: `/agents?job=${encodeURIComponent(run.job_id)}`,
  });
}

function marketUpcomingItem(event: BriefingUpcomingEarnings, date: string): Draft | null {
  const days = daysBetween(date, event.date);
  if (days == null || days < 0 || days > EARNINGS_AHEAD_DAYS) return null;
  const ticker = event.ticker.toUpperCase();
  const when = relativeDay(event.date, date);
  const time = earningsTimePhrase(event.time);
  return draft({
    id: itemId(date, "earnings_upcoming", ticker, event.date),
    kind: "earnings_upcoming",
    ticker,
    instrument_id: null,
    name: clean(event.name) || ticker,
    relation: "market",
    severity: "low",
    needs_you: false,
    tone: "flat",
    headline: `${ticker} reports earnings ${when}${time}`,
    metric: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
    why: `${clean(event.name) || ticker} is one of the most followed stocks, so its report tends to move more than its own price.`,
    reason_status: "not_applicable",
    next_step: `Read the research on ${ticker} before the report, or add it to your watchlist to get the result here.`,
    spoken: `${ticker} reports earnings ${when}`,
    evidence: [{ label: `Earnings date ${shortDay(event.date)}`, source: "Earnings calendar", url: `/stock/${ticker}`, at: event.date }],
    as_of: event.date,
    deadline_days: days,
    price: null,
    day_change_pct: null,
    alert: null,
    href: `/stock/${ticker}`,
  });
}

function sharesText(quantity: number): string {
  const rounded = Math.round(quantity * 1000) / 1000;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${rounded === 1 ? "share" : "shares"}`;
}

function wholeMoney(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

/** What a holding is worth: the stored value, or shares times the price. */
function holdingValue(position: BriefingPosition): number | null {
  const quantity = num(position.quantity);
  if (quantity != null && quantity > 0 && position.price != null) return quantity * position.price;
  const value = num(position.market_value);
  return value != null && value > 0 ? value : null;
}

/** The dollars a holding gained or lost today, from its value and its day move. */
function holdingDayChange(position: BriefingPosition): number | null {
  const value = holdingValue(position);
  const pctMove = position.day_change_pct;
  if (value == null || pctMove == null || pctMove <= -100) return null;
  return value - value / (1 + pctMove / 100);
}

export function portfolioDayMove(positions: BriefingPosition[]): BriefingPortfolio | null {
  const holdings = positions.filter((position) => position.relation === "holding");
  let value = 0;
  let change = 0;
  let counted = 0;
  let asOf: string | null = null;
  for (const position of holdings) {
    const worth = holdingValue(position);
    const delta = holdingDayChange(position);
    if (worth == null || delta == null) continue;
    value += worth;
    change += delta;
    counted += 1;
    if (position.price_as_of && (!asOf || position.price_as_of > asOf)) asOf = position.price_as_of;
  }
  const before = value - change;
  if (counted === 0 || !(before > 0)) return null;
  return {
    value,
    day_change_value: change,
    day_change_pct: (change / before) * 100,
    counted,
    holdings: holdings.length,
    as_of: asOf,
  };
}

/** One sentence on why an item is this person's business. */
export function positionNote(position: BriefingPosition | null | undefined, totalValue: number | null): string | null {
  if (!position) return null;
  if (position.relation !== "holding") return "On your watchlist. You do not hold it.";
  const value = holdingValue(position);
  const quantity = num(position.quantity);
  if (value == null) return "You hold it. Add how much in Portfolio to see what a move is worth to you.";
  const size = quantity != null && quantity > 0 ? `${sharesText(quantity)}, about ${wholeMoney(value)}` : `about ${wholeMoney(value)}`;
  const weight = totalValue != null && totalValue > 0 ? ` (${((value / totalValue) * 100).toFixed(1)}% of your holdings)` : "";
  const delta = holdingDayChange(position);
  const today =
    delta != null && Math.abs(delta) >= 1 ? ` That is ${delta >= 0 ? "up" : "down"} about ${wholeMoney(delta)} today.` : "";
  return `You hold ${size}${weight}.${today}`;
}

/* ── summary line ───────────────────────────────────────────────────────── */

function countWord(count: number): string {
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
  return words[count] ?? String(count);
}

function reasonTail(lead: BriefingItem | undefined): string {
  if (!lead || lead.kind !== "price_move") return "";
  if (lead.reason_status === "confirmed") {
    const first = leadSentences(lead.why, 1, 160);
    return first ? ` On ${lead.ticker}: ${sentence(first)}` : "";
  }
  // No reason found: the summary says nothing about it (owner, Nov 11).
  return "";
}

function personalSummary(needsYou: BriefingItem[], also: BriefingItem[], trackedCount: number): string {
  if (needsYou.length === 0) {
    if (also.length === 0) {
      if (trackedCount === 0) return `${NOTHING_NEEDS_YOU}.`;
      return trackedCount === 1
        ? `${NOTHING_NEEDS_YOU}. The one name you track is quiet.`
        : `${NOTHING_NEEDS_YOU}. All ${trackedCount} names you track are quiet.`;
    }
    return also.length === 1
      ? `${NOTHING_NEEDS_YOU}. There is one smaller update: ${also[0].spoken}.`
      : `${NOTHING_NEEDS_YOU}. There are ${also.length} smaller updates, starting with this: ${also[0].spoken}.`;
  }
  const spoken = needsYou.slice(0, 3).map((item) => item.spoken);
  const rest = needsYou.length - spoken.length;
  const list = rest > 0 ? `${spoken.join(", ")} and ${rest} more` : joinList(spoken);
  const opener =
    needsYou.length === 1 ? "One thing needs you today" : `${countWord(needsYou.length)} things need you today`;
  return `${opener}: ${list}.${reasonTail(needsYou[0])}`;
}

function indexSentence(indices: BriefingIndex[]): string {
  const named = indices.slice(0, 2).map((index) => {
    const direction = index.change_pct > 0 ? "up" : index.change_pct < 0 ? "down" : "flat";
    return direction === "flat" ? `the ${index.name} is flat` : `the ${index.name} is ${direction} ${pct(index.change_pct)}`;
  });
  if (named.length === 0) return "";
  return `${capitalise(joinList(named))}.`;
}

function marketSummary(lead: BriefingItem[], indices: BriefingIndex[]): string {
  const opening = indexSentence(indices);
  if (lead.length === 0) {
    return [opening, "We do not have explained movers for this session yet."].filter(Boolean).join(" ");
  }
  const spoken = lead.slice(0, 3).map((item) => item.spoken);
  return [opening, `The biggest explained moves: ${joinList(spoken)}.${reasonTail(lead[0])}`]
    .filter(Boolean)
    .join(" ");
}

/* ── the builder ────────────────────────────────────────────────────────── */

export function buildBriefing(input: BriefingInput): Briefing {
  const sessionDay = dayKey(input.movers_date) ?? input.date;
  const drafts =
    input.mode === "market" ? buildMarketItems(input, sessionDay) : buildPersonalItems(input, sessionDay);

  // One id, one item: a duplicate source row must not produce a duplicate card.
  const positionByTicker = new Map(input.positions.map((position) => [position.ticker.toUpperCase(), position]));
  if (input.mode === "personal") {
    const runs = [...(input.agent_runs ?? [])]
      .filter((run) => isRecent(run.ran_at, input.now, AGENT_RUN_MAX_AGE_HOURS))
      .sort((a, b) => b.ran_at.localeCompare(a.ran_at));
    const jobsSeen = new Set<string>();
    for (const run of runs) {
      if (jobsSeen.size >= MAX_AGENT_ITEMS || jobsSeen.has(run.job_id)) continue;
      const item = agentRunItem(run, positionByTicker, input.date);
      if (!item) continue;
      jobsSeen.add(run.job_id);
      drafts.push(item);
    }
  } else {
    const upcoming = [...(input.upcoming_earnings ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker))
      .map((event) => marketUpcomingItem(event, input.date))
      .filter((item): item is Draft => item !== null)
      .slice(0, MAX_MARKET_UPCOMING);
    drafts.push(...upcoming);
  }

  const portfolio = input.mode === "personal" ? portfolioDayMove(input.positions) : null;
  const totalValue = input.positions
    .filter((position) => position.relation === "holding")
    .reduce((sum, position) => sum + (holdingValue(position) ?? 0), 0);

  const unique = new Map<string, Draft>();
  for (const item of drafts) {
    if (unique.has(item.id)) continue;
    const position = item.relation === "market" ? null : positionByTicker.get(item.ticker.toUpperCase());
    unique.set(item.id, {
      ...item,
      position_note: positionNote(position, totalValue > 0 ? totalValue : null),
      call: position ? stanceLabel(position.stance) || null : null,
    });
  }
  const items = [...unique.values()].sort(compareItems);

  const wanted = items.filter((item) => item.needs_you);
  // A job the person set up reports here by promise, so the cap never pushes it down.
  const fromJobs = wanted.filter((item) => item.kind === "agent_job");
  const others = wanted.filter((item) => item.kind !== "agent_job");
  const room = Math.max(0, MAX_NEEDS_YOU - fromJobs.length);
  const needsYou = [...fromJobs, ...others.slice(0, room)].sort(compareItems);
  const overflow = others.slice(room).map((item) => ({ ...item, needs_you: false }));
  const alsoToday = [...overflow, ...items.filter((item) => !item.needs_you)]
    .sort(compareItems)
    .slice(0, input.mode === "personal" ? MAX_ALSO_TODAY_PERSONAL : MAX_ALSO_TODAY);

  // Quiet means nothing was found, not "it did not fit": every item counts, shown or not.
  const mentioned = new Set(items.map((item) => item.ticker).filter(Boolean));
  const quietNames: BriefingQuietName[] = input.positions
    .filter((position) => !mentioned.has(position.ticker))
    .map((position) => ({
      ticker: position.ticker,
      relation: position.relation,
      day_change_pct: position.day_change_pct,
    }))
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0) || a.ticker.localeCompare(b.ticker));

  const holdings = input.positions.filter((position) => position.relation === "holding").length;
  const watching = input.positions.length - holdings;

  let quietText = "";
  if (input.mode === "personal" && quietNames.length > 0) {
    const top = quietNames[0];
    const everything = quietNames.length === input.positions.length;
    const subject = everything
      ? quietNames.length === 1
        ? "The one name you track is quiet."
        : `All ${quietNames.length} names you track are quiet.`
      : quietNames.length === 1
        ? "One other name is quiet."
        : `${quietNames.length} other names are quiet.`;
    const biggest =
      top.day_change_pct != null && quietNames.length > 1
        ? ` The biggest move among them is ${top.ticker}, ${top.day_change_pct >= 0 ? "up" : "down"} ${pct(top.day_change_pct)}.`
        : top.day_change_pct != null
          ? ` ${top.ticker} is ${top.day_change_pct >= 0 ? "up" : "down"} ${pct(top.day_change_pct)}.`
          : "";
    quietText = `${subject}${biggest}`;
  }

  // Your own briefing prices your stocks from their quotes, which can be fresher
  // than the movers feed: the note goes by the newest quote, not the feed's day.
  const quoteDays =
    input.mode === "personal"
      ? input.positions.map((position) => marketDay(position.price_as_of ?? "")).filter(Boolean)
      : [];
  const priceDay = quoteDays.reduce((latest, day) => (day > latest ? day : latest), sessionDay);
  const staleDays = daysBetween(priceDay, input.date);
  const staleNote =
    staleDays != null && staleDays > 0
      ? `Prices as of ${weekday(priceDay)}'s close.`
      : null;

  const finalNeeds = needsYou;
  const finalAlso = alsoToday;

  return {
    date: input.date,
    built_at: input.now,
    mode: input.mode,
    summary:
      input.mode === "market"
        ? marketSummary(finalNeeds, input.indices)
        : personalSummary(finalNeeds, finalAlso, input.positions.length),
    needs_you: finalNeeds,
    also_today: finalAlso,
    nothing_needs_you: finalNeeds.length === 0,
    quiet: { text: quietText, names: quietNames },
    market: buildMarketStrip(input),
    counts: { holdings, watching },
    stale_note: staleNote,
    portfolio,
  };
}

/** `kind:TICKER` keys for a briefing, stored so tomorrow can tell "still" from "new". */
export function seenKeys(briefing: Pick<Briefing, "needs_you" | "also_today">): string[] {
  const keys = new Set<string>();
  for (const item of [...briefing.needs_you, ...briefing.also_today]) {
    if (item.kind !== "agent_job") keys.add(`${item.kind}:${item.ticker.toUpperCase()}`);
  }
  return [...keys].sort();
}

/* ── per-item state ─────────────────────────────────────────────────────── */

export type BriefingItemStatus = "open" | "dismissed" | "kept";
export type BriefingItemState = { status: BriefingItemStatus; at: string };
export type BriefingStateMap = Record<string, BriefingItemState>;

export const BRIEFING_ITEM_STATUSES: readonly BriefingItemStatus[] = ["open", "dismissed", "kept"];
export const BRIEFING_ITEM_ID_RE = /^[A-Za-z0-9_-]{3,160}$/;
export const BRIEFING_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const BRIEFING_HISTORY_DAYS = 7;

export function statusOf(state: BriefingStateMap | null | undefined, id: string): BriefingItemStatus {
  const status = state?.[id]?.status;
  return status === "dismissed" || status === "kept" ? status : "open";
}

/** The days a person may read or write state for: today and the six before it. */
export function briefingWindow(today: string, days = BRIEFING_HISTORY_DAYS): string[] {
  const start = dayToUtc(today);
  if (start == null) return [];
  const out: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    out.push(new Date(start - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/* ── sections ───────────────────────────────────────────────────────────── */

export type BriefingSections = {
  /** Things that need a decision, still open. */
  needs_you: BriefingItem[];
  /** Smaller updates, still open. */
  worth_knowing: BriefingItem[];
  /** Earnings and dated events in the next seven days, soonest first. */
  coming_up: BriefingItem[];
  /** Items the person chose to keep watching. */
  kept: BriefingItem[];
  /** Items the person marked "Got it". */
  dismissed: BriefingItem[];
  /** How many open items need the person. */
  attention: number;
};

/**
 * The briefing as the page shows it, with the person's saved state applied.
 * A dated event that does not need a decision yet goes under "Coming up";
 * anything dismissed or kept leaves the open lists but is never lost.
 */
export function briefingSections(
  briefing: Pick<Briefing, "needs_you" | "also_today">,
  state: BriefingStateMap | null | undefined,
): BriefingSections {
  const all = [...briefing.needs_you, ...briefing.also_today];
  const open = (item: BriefingItem) => statusOf(state, item.id) === "open";
  const dated = (item: BriefingItem) => item.kind === "earnings_upcoming";
  const needs = briefing.needs_you.filter(open);
  return {
    needs_you: needs,
    worth_knowing: briefing.also_today.filter((item) => open(item) && !dated(item)),
    coming_up: briefing.also_today
      .filter((item) => open(item) && dated(item))
      .sort((a, b) => (a.deadline_days ?? 99) - (b.deadline_days ?? 99) || compareItems(a, b)),
    kept: all.filter((item) => statusOf(state, item.id) === "kept"),
    dismissed: all.filter((item) => statusOf(state, item.id) === "dismissed"),
    attention: needs.length,
  };
}

/**
 * Where "Ask why" goes: the copilot, with the question filled in. Set
 * `COPILOT_PATH` to null to fall back to the page that explains the item.
 */
export const COPILOT_PATH: string | null = "/ask";

export function askWhyQuestion(item: Pick<BriefingItem, "headline" | "ticker">): string {
  return `Why does this matter: ${item.headline}?`;
}

export function askWhyHref(item: Pick<BriefingItem, "headline" | "ticker" | "href">): string {
  if (COPILOT_PATH) return `${COPILOT_PATH}?q=${encodeURIComponent(askWhyQuestion(item))}`;
  return item.href;
}
