/**
 * The "news" agent event: the news about a stock in scope got much heavier
 * than its own normal, or turned clearly negative or positive by our stored
 * tone read, on enough stories to mean something. Each finding names the
 * biggest story with its source, time and link.
 *
 * Pure, and no model is called here: the headlines come from `tm_agent_news`
 * (backend/agentdata/news_feed.py) and the tone of each one from
 * `tm_agent_news_tone` (backend/agentdata/news_tone.py), read through
 * lib/agent-events-data.ts. Nothing dated after the day being checked is
 * read: a story counts from the day it was published (after the 4 PM close it
 * counts for the next day) and a tone label only once it had been written by
 * that day's check, so a replay never knows more than a real run would have.
 */

import type { AgentEvaluation, AgentFinding, AgentScope } from "@/lib/agent-jobs";
import { etClock } from "@/lib/agent-events-filings";
import { isForeignLanguage, titleKey } from "@/lib/wire-companies";

/* ── what a news watch can ask for ──────────────────────────────────────── */

/**
 * any: heavier than usual, or clearly negative or positive.
 * busy: heavier than usual only. tone: clearly negative or positive.
 */
export const NEWS_WATCHES = ["any", "busy", "negative", "positive", "tone"] as const;
export type NewsWatch = (typeof NEWS_WATCHES)[number];

export function cleanNewsWatch(raw: unknown): NewsWatch {
  return (NEWS_WATCHES as readonly string[]).includes(String(raw)) ? (raw as NewsWatch) : "any";
}

/* ── facts ──────────────────────────────────────────────────────────────── */

export type NewsStory = {
  id: string;
  title: string;
  url: string;
  source: string;
  /** "publisher" | "official" | "press_release" | "" */
  source_kind: string;
  /** ISO instant. */
  published_at: string;
  tickers: string[];
  /** The market day the story counts for: see `newsKnownDay`. */
  day: string;
};

export type NewsToneLabel = {
  tone: "positive" | "negative" | "neutral";
  scope: "stock" | "market" | "other";
  /** When the label was written; it can only be used by checks after this. */
  scored_at: string;
};

export type NewsFacts = {
  stories: NewsStory[];
  tones: Record<string, NewsToneLabel>;
  /**
   * The first market day whose headlines we kept in full, with the same sources
   * as today. A window that reaches back before it cannot be judged.
   */
  coverage_from: string | null;
  /** The first time a tone label was written. Checks before it cannot read tone. */
  tone_from: string | null;
  /** Market sessions, oldest first, for the "normal day" baseline. Weekdays are used without it. */
  sessions?: string[];
};

/* ── the rules ──────────────────────────────────────────────────────────── */

/**
 * Aimed at about one or two heads-ups a month per stock, not one a day.
 * Measured with scripts/measure-agent-events.ts on the 20 biggest US stocks
 * (Nov 11, 2026): the tone rule (65% of at least 5 stories, 3 to 1 against
 * the other side) fired on 2 of 24 stock-sessions with tone reads, about 1.75
 * a month per stock; 60% fired on 4 (3.5 a month), 70% on 1. Tone reads only
 * go back to Nov 10, so that is two sessions of evidence. "Heavier than usual"
 * cannot be measured yet: the wire took on new sources on Nov 9 and stories
 * per stock jumped several times over, so a normal day is only counted from
 * Nov 10 (NEWS_SOURCES_SINCE in lib/agent-events-data.ts). Re-run the script
 * once there are four weeks of it.
 */
export const NEWS_RULES = {
  /** Sessions in the "normal day" baseline. */
  baselineSessions: 10,
  /** Fewer kept sessions than this and "heavier than usual" cannot be judged. */
  minBaselineSessions: 5,
  /** Heavier than usual: at least this many times a normal day's stories ... */
  busyRatio: 3,
  /** ... and at least this many stories. */
  busyMinStories: 6,
  /** Clearly negative or positive: at least this many stories with a tone read ... */
  toneMinStories: 5,
  /** ... with at least this share of them on one side, in percent ... */
  toneSharePct: 65,
  /** ... and at least three times as many on that side as on the other. */
  toneOverOther: 3,
  /** Fire on the turn only: not again while the previous session already met the same rule. */
  onTurnOnly: true,
  /** A story published after 4 PM New York counts for the next market day. */
  storyCutoffMinutes: 16 * 60,
  /** The check runs from 5:30 PM New York: a tone label written after that is for the next day. */
  checkMinutes: 17 * 60 + 30,
};
export type NewsRules = typeof NEWS_RULES;

/* ── share classes ──────────────────────────────────────────────────────── */

/** The wire tags one listing of a company with two share classes (Alphabet is tagged GOOG): both count. */
const SHARE_CLASSES: Record<string, string> = { GOOGL: "GOOG", GOOG: "GOOGL", "BRK.B": "BRK.A", "BRK.A": "BRK.B", FOXA: "FOX", FOX: "FOXA", NWSA: "NWS", NWS: "NWSA" };

/** The tickers a story may carry for this stock. */
export function newsTickersFor(ticker: string): string[] {
  const other = SHARE_CLASSES[ticker];
  return other ? [ticker, other] : [ticker];
}

/* ── dates ──────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function dayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : day;
}

function timeLabel(iso: string): string {
  const clock = etClock(iso);
  if (!clock) return "";
  const hour = Math.floor(clock.minutes / 60);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(clock.minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} ET`;
}

/** The market day a story counts for: its New York day, or the next one when published after the close. */
export function newsKnownDay(publishedAt: string, cutoffMinutes = NEWS_RULES.storyCutoffMinutes): string | null {
  const clock = etClock(publishedAt);
  if (!clock) return null;
  return clock.minutes >= cutoffMinutes ? shiftDay(clock.day, 1) : clock.day;
}

/** The instant (ISO UTC) of `minutes` after midnight in New York on `day`. */
export function etInstant(day: string, minutes: number): string {
  // New York is UTC-5 in winter and UTC-4 in summer; pick the offset that reads back as the same wall time.
  for (const offset of [5, 4]) {
    const ms = Date.parse(`${day}T00:00:00Z`) + (minutes + offset * 60) * 60_000;
    const clock = etClock(new Date(ms).toISOString());
    if (clock && clock.day === day && clock.minutes === minutes) return new Date(ms).toISOString();
  }
  return new Date(Date.parse(`${day}T00:00:00Z`) + (minutes + 300) * 60_000).toISOString();
}

function isWeekday(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

/** The session before `day`: from the calendar when it reaches back that far, else the previous weekday. */
function sessionBefore(day: string, sessions: string[]): string {
  for (let index = sessions.length - 1; index >= 0; index -= 1) if (sessions[index] < day) return sessions[index];
  let candidate = shiftDay(day, -1);
  while (!isWeekday(candidate)) candidate = shiftDay(candidate, -1);
  return candidate;
}

/* ── per stock ──────────────────────────────────────────────────────────── */

type WindowRead = {
  /** Distinct stories naming the stock (press releases and foreign-language copies left out). */
  stories: NewsStory[];
  positive: number;
  negative: number;
  neutral: number;
  /** Stories with a usable tone label. */
  read: number;
};

function readWindow(stories: NewsStory[], tones: NewsFacts["tones"], from: string, to: string, labelBy: string): WindowRead {
  const seen = new Set<string>();
  const out: WindowRead = { stories: [], positive: 0, negative: 0, neutral: 0, read: 0 };
  for (const story of stories) {
    if (story.day <= from || story.day > to) continue;
    const key = titleKey(story.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = tones[story.id];
    if (label?.scope === "other") continue;
    out.stories.push(story);
    if (label && label.scored_at <= labelBy) {
      out.read += 1;
      out[label.tone] += 1;
    }
  }
  return out;
}

function leanOf(read: WindowRead, rules: NewsRules): "negative" | "positive" | null {
  if (read.read < rules.toneMinStories) return null;
  const share = (count: number) => (count / read.read) * 100;
  if (share(read.negative) >= rules.toneSharePct && read.negative >= rules.toneOverOther * Math.max(1, read.positive)) return "negative";
  if (share(read.positive) >= rules.toneSharePct && read.positive >= rules.toneOverOther * Math.max(1, read.negative)) return "positive";
  return null;
}

type Baseline = { mean: number; sessions: number };

export type NewsSignal = {
  ticker: string;
  stories: number;
  /** Stories on a normal session over the baseline, or null when it could not be measured. */
  normal: number | null;
  /** How many sessions the window spans (more than one after a missed check or a long weekend). */
  sessions: number;
  busy: boolean;
  lean: "negative" | "positive" | null;
  read: number;
  /** Share of the read stories on the lean's side, in whole percent. */
  lean_pct: number | null;
  /** The story to read first. */
  lead: NewsStory | null;
};

/** The story to read first: about this company alone rather than a roundup, on the lean's side, then the newest. */
function leadStory(read: WindowRead, tones: NewsFacts["tones"], lean: "negative" | "positive" | null, labelBy: string): NewsStory | null {
  const pull = (story: NewsStory) => {
    const label = tones[story.id];
    const usable = label && label.scored_at <= labelBy ? label : null;
    return (lean && usable?.tone === lean ? 1 : 0) + (usable && usable.tone !== "neutral" ? 0.3 : 0) - 0.2 * Math.max(0, story.tickers.length - 1);
  };
  return [...read.stories].sort((a, b) => pull(b) - pull(a) || b.published_at.localeCompare(a.published_at))[0] ?? null;
}

/**
 * How the news about each ticker looked in the window (since, day], against
 * the sessions before it. Exported for tests and for the threshold measurement.
 */
export function newsSignals(
  facts: NewsFacts,
  options: { day: string; since: string | null; tickers: string[] },
  rules: NewsRules = NEWS_RULES,
): { signals: NewsSignal[]; volumeReady: boolean; toneReady: boolean; baselineSessions: number; start: string } {
  const sessions = [...(facts.sessions ?? [])].filter((day) => day <= options.day).sort();
  const start = options.since ?? sessionBefore(options.day, sessions);
  const labelBy = etInstant(options.day, rules.checkMinutes);
  const windowSessions = Math.max(1, sessions.filter((day) => day > start && day <= options.day).length || (isWeekday(options.day) ? 1 : 0));

  // A window (from, to] is kept in full when its first day is on or after the coverage day.
  const covered = (from: string) => facts.coverage_from != null && shiftDay(from, 1) >= facts.coverage_from;
  // The baseline: one window per session before `start`, only where we kept headlines for the whole window.
  const windows: Array<{ from: string; to: string }> = [];
  let to = start;
  while (windows.length < rules.baselineSessions) {
    const from = sessionBefore(to, sessions);
    if (!covered(from)) break;
    windows.push({ from, to });
    to = from;
  }
  const volumeReady = windows.length >= rules.minBaselineSessions && covered(start);
  const toneReady = Boolean(facts.tone_from) && (facts.tone_from ?? "9999") <= labelBy;
  const previousEnd = start;
  const previousStart = sessionBefore(previousEnd, sessions);
  const previousLabelBy = etInstant(previousEnd, rules.checkMinutes);

  const byTicker = new Map<string, NewsStory[]>();
  const owners = new Map<string, string[]>();
  for (const ticker of options.tickers) for (const tag of newsTickersFor(ticker)) owners.set(tag, [...(owners.get(tag) ?? []), ticker]);
  for (const story of facts.stories) {
    if (story.source_kind === "press_release" || story.day > options.day || isForeignLanguage(story.title)) continue;
    const mine = new Set(story.tickers.flatMap((tag) => owners.get(tag) ?? []));
    for (const ticker of mine) {
      const list = byTicker.get(ticker) ?? [];
      list.push(story);
      byTicker.set(ticker, list);
    }
  }

  const signals: NewsSignal[] = [];
  for (const ticker of options.tickers) {
    const stories = byTicker.get(ticker) ?? [];
    const now = readWindow(stories, facts.tones, start, options.day, labelBy);
    let baseline: Baseline | null = null;
    if (volumeReady) {
      const counts = windows.map((window) => readWindow(stories, facts.tones, window.from, window.to, labelBy).stories.length);
      baseline = { mean: counts.reduce((sum, count) => sum + count, 0) / counts.length, sessions: counts.length };
    }
    const expected = baseline ? baseline.mean * windowSessions : null;
    const isBusy = (count: number, normal: number) => count >= rules.busyMinStories && count >= rules.busyRatio * Math.max(1, normal);
    let busy = expected != null && isBusy(now.stories.length, expected);
    let lean = toneReady ? leanOf(now, rules) : null;
    if (rules.onTurnOnly && (busy || lean)) {
      // The session before already met the same rule: it was said then (or would have been).
      const before = readWindow(stories, facts.tones, previousStart, previousEnd, previousLabelBy);
      if (busy && baseline && isBusy(before.stories.length, baseline.mean)) busy = false;
      if (lean && leanOf(before, rules) === lean) lean = null;
    }
    const leanCount = lean === "negative" ? now.negative : lean === "positive" ? now.positive : 0;
    signals.push({
      ticker,
      stories: now.stories.length,
      normal: baseline ? Math.round(baseline.mean * 10) / 10 : null,
      sessions: windowSessions,
      busy,
      lean,
      read: now.read,
      lean_pct: lean && now.read ? Math.round((leanCount / now.read) * 100) : null,
      lead: leadStory(now, facts.tones, lean, labelBy),
    });
  }
  return { signals, volumeReady, toneReady, baselineSessions: windows.length, start };
}

/* ── words ──────────────────────────────────────────────────────────────── */

/** After "when": "the news about NVDA turns negative". */
export function newsWatchPhrase(watch: NewsWatch, who: string): string {
  if (watch === "busy") return `${who} is in the news much more than usual`;
  if (watch === "negative") return `the news about ${who} turns clearly negative`;
  if (watch === "positive") return `the news about ${who} turns clearly positive`;
  if (watch === "tone") return `the news about ${who} turns clearly negative or positive`;
  return `the news about ${who} gets much heavier than usual or turns clearly negative or positive`;
}

export function newsTriggerLabel(watch: NewsWatch): string {
  if (watch === "busy") return "Much more news than usual";
  if (watch === "negative") return "News turns negative";
  if (watch === "positive") return "News turns positive";
  if (watch === "tone") return "News turns one way";
  return "News heavier or one-sided";
}

function wants(watch: NewsWatch): { busy: boolean; tone: "negative" | "positive" | "either" | null } {
  if (watch === "busy") return { busy: true, tone: null };
  if (watch === "negative" || watch === "positive") return { busy: false, tone: watch };
  if (watch === "tone") return { busy: false, tone: "either" };
  return { busy: true, tone: "either" };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function names(list: string[], max = 4): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(", ")} and ${list.length - max} more`;
}

function about(normal: number): string {
  if (normal < 1) return "fewer than one";
  return `about ${Math.round(normal)}`;
}

export function newsFinding(signal: NewsSignal, reported: { busy: boolean; lean: "negative" | "positive" | null }, since: string, day: string): AgentFinding {
  const t = signal.ticker;
  const headline =
    reported.busy && reported.lean
      ? `News about ${t} got much heavier and turned ${reported.lean}`
      : reported.busy
        ? `${t} was in the news much more than usual`
        : `News about ${t} turned ${reported.lean}`;
  const span = signal.sessions > 1 ? `from ${dayLabel(shiftDay(since, 1))} to ${dayLabel(day)}` : "since the last check";
  const parts: string[] = [];
  if (reported.busy && signal.normal != null) {
    const normal = signal.normal * signal.sessions;
    parts.push(`${plural(signal.stories, "story", "stories")} ${span}, against ${about(normal)} on a normal ${signal.sessions > 1 ? `stretch that long` : "day"}.`);
  }
  if (reported.lean && signal.lean_pct != null) {
    parts.push(`${signal.lean_pct}% of the ${plural(signal.read, "story", "stories")} we read for tone ${reported.busy ? "" : `${span} `}were ${reported.lean}.`.replace(/\s+/g, " "));
  }
  const lead = signal.lead;
  if (lead) {
    const clock = etClock(lead.published_at);
    parts.push(`The biggest: “${lead.title}” (${[lead.source, clock ? `${dayLabel(clock.day)}, ${timeLabel(lead.published_at)}` : ""].filter(Boolean).join(", ")}).`);
  }
  return {
    ticker: t,
    headline,
    detail: parts.join(" "),
    source: lead?.source || "Headlines",
    url: lead?.url ?? `/stock/${t}`,
    at: lead ? etClock(lead.published_at)?.day ?? day : day,
    kind: "news",
    stories: signal.stories,
    normal: signal.normal,
    tone: reported.lean,
    tone_pct: reported.lean ? signal.lean_pct : null,
  };
}

/* ── the evaluator ──────────────────────────────────────────────────────── */

function span(start: string, day: string): string {
  return shiftDay(start, 1) === day ? dayLabel(day) : `${dayLabel(shiftDay(start, 1))} to ${dayLabel(day)}`;
}

export function evaluateNewsEvent(
  watch: NewsWatch,
  scope: AgentScope,
  facts: { news?: NewsFacts; available: { news?: boolean } },
  options: { day: string; since: string | null; tickers: string[] },
  maxFindings: number,
  rules: NewsRules = NEWS_RULES,
): AgentEvaluation {
  const news = facts.news;
  if (!facts.available.news || !news) {
    return { decision: "could_not_check", summary: "Could not check: the news was not available.", findings: [], checked: ["Headlines: unavailable"] };
  }
  const want = wants(watch);
  const { signals, volumeReady, toneReady, baselineSessions, start } = newsSignals(news, options, rules);
  const when = span(start, options.day);
  const canBusy = want.busy && volumeReady;
  const canTone = want.tone != null && toneReady;
  const total = signals.reduce((sum, signal) => sum + signal.stories, 0);
  const read = signals.reduce((sum, signal) => sum + signal.read, 0);
  const checked = [
    `Headlines from ${when}: ${plural(total, "story", "stories")} about ${scope.kind === "tickers" && options.tickers.length === 1 ? options.tickers[0] : `your ${plural(options.tickers.length, "name")}`}`,
    want.busy
      ? volumeReady
        ? `A normal day: the average of the ${baselineSessions} sessions before`
        : `A normal day: not measured yet, ${baselineSessions} of the ${rules.minBaselineSessions} sessions it needs`
      : "",
    want.tone ? (toneReady ? `Tone read for ${plural(read, "story", "stories")}` : "Tone: not read for these days") : "",
  ].filter(Boolean);

  if (!canBusy && !canTone) {
    const why = want.tone && !want.busy
      ? "we had not read the tone of the headlines for this day."
      : !news.coverage_from || shiftDay(start, 1) < news.coverage_from
        ? `we only have headlines from all of today's sources from ${news.coverage_from ? dayLabel(news.coverage_from) : "a later day"}.`
        : `a normal day needs ${rules.minBaselineSessions} sessions of headlines and we had ${baselineSessions}.`;
    return { decision: "could_not_check", summary: `Could not check: ${why}`, findings: [], checked };
  }

  const fired = signals
    .map((signal) => {
      const busy = canBusy && signal.busy;
      const lean = canTone && signal.lean && (want.tone === "either" || want.tone === signal.lean) ? signal.lean : null;
      return { signal, busy, lean };
    })
    .filter((entry) => entry.busy || entry.lean)
    // Both at once first, then the most stories against normal.
    .sort(
      (a, b) =>
        Number(b.busy && Boolean(b.lean)) - Number(a.busy && Boolean(a.lean)) ||
        b.signal.stories / Math.max(1, b.signal.normal ?? 1) - a.signal.stories / Math.max(1, a.signal.normal ?? 1) ||
        a.signal.ticker.localeCompare(b.signal.ticker),
    );

  if (fired.length === 0) {
    const who = options.tickers.length === 1 ? `the news about ${options.tickers[0]}` : "the news about your names";
    const quiet =
      canBusy && canTone
        ? `${who.charAt(0).toUpperCase()}${who.slice(1)} on ${when} was about as heavy as usual and did not lean clearly one way.`
        : canBusy
          ? `${who.charAt(0).toUpperCase()}${who.slice(1)} on ${when} was about as heavy as usual.`
          : `${who.charAt(0).toUpperCase()}${who.slice(1)} on ${when} did not turn clearly ${want.tone === "either" ? "negative or positive" : want.tone}.`;
    return { decision: "nothing", summary: `Checked, nothing to do. ${quiet}`, findings: [], checked };
  }
  const findings = fired.slice(0, maxFindings).map((entry) => newsFinding(entry.signal, entry, start, options.day));
  const summary = findings.length === 1 ? `${findings[0].headline}.` : `The news moved for ${plural(fired.length, "name")} of yours: ${names(fired.map((entry) => entry.signal.ticker))}.`;
  return { decision: "notify", summary, findings, checked };
}

/** What a replay of this watch cannot know, said plainly. */
export function newsReplayNotes(news: NewsFacts | undefined): string[] {
  const notes = [
    "A story counts from the day it was published, and one published after the 4 PM close counts for the next day. A tone read counts only from when we wrote it.",
  ];
  if (news?.coverage_from) {
    notes.push(`We have headlines from all of today's sources from ${dayLabel(news.coverage_from)}, so earlier days could not be checked, and "more than usual" needs ${NEWS_RULES.minBaselineSessions} sessions of them first.`);
  }
  if (news?.tone_from) notes.push(`We started reading the tone of headlines on ${dayLabel(etClock(news.tone_from)?.day ?? news.tone_from.slice(0, 10))}.`);
  return notes;
}
