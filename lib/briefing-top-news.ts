/**
 * The briefing's top market news (owner, Nov 12: "bring out the top three most important news items combined in the
 * market"): the three stories that mattered most to the whole market today, from the same wire /news reads.
 *
 * Importance, in this order:
 *   1. a macro event (the Fed, inflation, jobs), when a publisher wrote it up today;
 *   2. the biggest moves in market value that have a confirmed reason: a reason-grade headline on the stock that
 *      agrees with its move (lib/briefing-news.ts newsRank), ranked by the dollars the move added or took away;
 *   3. a market wrap ("Wall Street falls as yields jump") when the S&P 500 moved a lot.
 * One story per stock and per event, the same story from two feeds counted once. Every figure is measured: the
 * stock's move and price, its share of the S&P 500's move, the 10-year yield or the sectors. Nothing is made up;
 * a story with no measured line has none. Pure.
 */

import { capitalize, dayWords } from "@/lib/day-words";
import { newsJunk, newsRank } from "@/lib/briefing-news";
import { withoutSourceTag } from "@/lib/plain-copy";
import { better, isForeignLanguage, namesPastYear, titleKey } from "@/lib/wire-companies";
import type { WireItem } from "@/lib/wire-shared";

/** A headline on a card is at most this many words. */
export const TOP_HEADLINE_WORDS = 12;
/** The line under it is at most this many. */
export const TOP_WHY_WORDS = 15;
/** How many stories the section shows; with fewer it is not shown (no half-empty row). */
export const TOP_STORIES = 3;
/** A stock's move must be at least this big (percent) to be market news. */
const MIN_MOVE_PCT = 1;
/** A wrap leads only when the S&P 500 moved at least this much. */
const WRAP_MOVE_PCT = 0.75;
/** A stock's push on the S&P 500 (percent) worth saying in its line. */
const INDEX_PUSH_PCT = 0.05;

export type TopStoryIcon = "capitol" | "percent" | "briefcase" | "globe";

export type TopStory = {
  id: string;
  kind: "stock" | "macro";
  /** The stock, for a stock story. */
  ticker: string | null;
  name: string | null;
  /** The icon for a macro story. */
  icon: TopStoryIcon | null;
  headline: string;
  /** One measured line on why it matters, ≤15 words; null when we have none. */
  why: string | null;
  /** The market's reaction: the stock's move (with its price), or the S&P 500's. */
  reaction: { label: string; pct: number; price: number | null };
  /** "today", "yesterday", "Tuesday". */
  day: string;
  source: string;
  url: string;
};

export type TopNewsInput = {
  /** The wire's items, already in sentence case. */
  items: readonly WireItem[];
  /** Today's move, price and company name by ticker (the wire's price snapshot). */
  quotes: Readonly<Record<string, { pct: number | null; price: number | null; name: string }>>;
  /** Market value in dollars by ticker, where the screener has one. */
  caps: Readonly<Record<string, number>>;
  /** Each stock's weight in the S&P 500, percent (SPY's holdings). */
  indexWeights: Readonly<Record<string, number>>;
  sp500: number | null;
  /** The 10-year yield and its day's change in basis points. */
  tenYear: { level: number; bps: number } | null;
  /** How many of the 11 sector funds rose and fell today. */
  sectors: { up: number; down: number; total: number } | null;
  /** Only stories published at or after this instant. */
  sinceMs: number;
  /** New York day, YYYY-MM-DD. */
  today: string;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** "$1.2T", "$45B", "$800M". */
export function bigDollars(value: number): string {
  const size = Math.abs(value);
  if (size >= 1e12) return `$${(size / 1e12).toFixed(1)}T`;
  if (size >= 1e10) return `$${Math.round(size / 1e9)}B`;
  if (size >= 1e9) return `$${(size / 1e9).toFixed(1)}B`;
  return `$${Math.round(size / 1e6)}M`;
}

/** A desk's roundup prefix, which says nothing about the story: "Stock market today: Nasdaq slides…". */
const WRAP_PREFIX = /^(?:stock market (?:news )?today|stocks? today|markets? (?:wrap|today))\s*[:\-–]\s*/i;

/**
 * The headline as a card shows it: no desk tag, no "- Reuters" tail, no roundup prefix, one line of whitespace.
 * Null when it runs past the word budget: a long headline is never cut short.
 */
export function cardHeadline(title: string): string | null {
  const clean = withoutSourceTag(title)
    .replace(/\s+[-|–]\s+[A-Za-z][\w .&']{1,24}$/, "")
    .replace(WRAP_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || wordCount(clean) > TOP_HEADLINE_WORDS) return null;
  return capitalize(clean);
}

/* ── macro events ──────────────────────────────────────────────────────── */

type MacroKind = "fed" | "inflation" | "jobs" | "wrap";

const MACRO_RULES: Array<{ kind: Exclude<MacroKind, "wrap">; pattern: RegExp }> = [
  { kind: "fed", pattern: /\b(?:fed|federal reserve|fomc|powell|rate (?:cut|hike|decision)s?|cuts? rates|raises? rates|holds? rates)\b/i },
  { kind: "inflation", pattern: /\b(?:cpi|consumer prices?|inflation|pce|ppi|producer prices?)\b/i },
  { kind: "jobs", pattern: /\b(?:jobs report|payrolls?|nonfarm|unemployment rate|jobless claims|hiring)\b/i },
];
const WRAP = /\b(?:stocks|wall st(?:reet)?|s&p 500|nasdaq|dow)\b.*\b(?:fall|falls|fell|slide|slides|slid|drop|drops|dropped|sink|sinks|sank|tumble|tumbles|tumbled|rise|rises|rose|rally|rallies|rallied|gain|gains|gained|climb|climbs|climbed|jump|jumps|jumped|surge|surges|surged|slump|slumps|slumped|record)\b/i;

/** Before the event, or a guess about it: "Jobless claims due Thursday", "Fed could cut", "what to watch". */
const NOT_YET = /\b(?:due|ahead|preview|previews|what to (?:watch|expect|know)|week ahead|on deck|to watch|could|may|might|will|expected to|set to|poised to|likely|odds|bets?)\b|\?\s*$/i;

function macroKind(title: string): MacroKind | null {
  if (NOT_YET.test(title)) return null;
  for (const rule of MACRO_RULES) if (rule.pattern.test(title)) return rule.kind;
  return WRAP.test(title) ? "wrap" : null;
}

const MACRO_ICON: Record<MacroKind, TopStoryIcon> = { fed: "capitol", inflation: "percent", jobs: "briefcase", wrap: "globe" };

/** The measured line under a macro story: the 10-year's day for rates news, the sectors for a wrap. */
function macroWhy(kind: MacroKind, input: TopNewsInput): string | null {
  if (kind !== "wrap") {
    const ten = input.tenYear;
    if (!ten || !fin(ten.bps) || !fin(ten.level)) return null;
    const bps = Math.round(Math.abs(ten.bps) * 10) / 10;
    return bps < 0.5
      ? `The 10-year yield held at ${ten.level.toFixed(2)}%.`
      : `The 10-year yield ${ten.bps > 0 ? "rose" : "fell"} ${bps.toFixed(1)} bps to ${ten.level.toFixed(2)}%.`;
  }
  const sectors = input.sectors;
  const sp = input.sp500;
  if (!sectors || sectors.total < 4 || !fin(sp) || sp === 0) return null;
  const count = sp < 0 ? sectors.down : sectors.up;
  if (count <= sectors.total / 2) return null;
  return `${count === sectors.total ? "All" : count} of ${sectors.total} sectors ${sp < 0 ? "fell" : "rose"}.`;
}

/** Shared words over all words, on the headline's content words: "the same story from two feeds" when high. */
function overlap(a: string, b: string): number {
  const words = (text: string) => new Set(titleKey(text).split(" ").filter((word) => word.length > 2));
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/* ── the ranking ───────────────────────────────────────────────────────── */

type Candidate = TopStory & { score: number; key: string; title: string };

function inWindow(item: WireItem, input: TopNewsInput): boolean {
  const at = Date.parse(item.publishedAt);
  return Number.isFinite(at) && at >= input.sinceMs && !isForeignLanguage(item.title) && !namesPastYear(item.title, at);
}

function storyDay(item: WireItem, today: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.publishedAt));
  return dayWords(day, today);
}

/** The best macro story of each kind: a publisher's, about the market rather than one company, newest first. */
function macroCandidates(input: TopNewsInput): Candidate[] {
  if (!fin(input.sp500)) return [];
  const best = new Map<MacroKind, WireItem>();
  const ordered = [...input.items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  for (const item of ordered) {
    if (item.tickers.length > 0 || item.sourceKind === "press_release" || item.sourceKind === "official" || !inWindow(item, input)) continue;
    if (!item.topics.some((topic) => topic === "macro" || topic === "policy")) continue;
    if (newsJunk({ title: item.title, summary: "" }, { headlineOnly: true })) continue;
    const kind = macroKind(item.title);
    if (!kind || best.has(kind) || !cardHeadline(item.title)) continue;
    best.set(kind, item);
  }
  const out: Candidate[] = [];
  for (const [kind, item] of best) {
    // A wrap is news only on a day the market really moved.
    if (kind === "wrap" && Math.abs(input.sp500!) < WRAP_MOVE_PCT) continue;
    const headline = cardHeadline(item.title)!;
    out.push({
      id: item.id,
      kind: "macro",
      ticker: null,
      name: null,
      icon: MACRO_ICON[kind],
      headline,
      why: macroWhy(kind, input),
      reaction: { label: "S&P 500", pct: input.sp500!, price: null },
      day: storyDay(item, input.today),
      source: item.source,
      url: item.url,
      // Events outrank every stock story; a wrap sits between the first and second stock.
      score: kind === "wrap" ? 0 : 3 - MACRO_RULES.findIndex((rule) => rule.kind === kind),
      key: titleKey(item.title),
      title: item.title,
    });
  }
  return out;
}

/** The measured line under a stock story: its push on the S&P 500 when it is a big holding, else its market value. */
function stockWhy(ticker: string, pct: number, input: TopNewsInput): string | null {
  const weight = input.indexWeights[ticker];
  if (fin(weight) && weight > 0) {
    const push = (weight * pct) / 100;
    if (Math.abs(push) >= INDEX_PUSH_PCT) return `On its own it moved the S&P 500 ${push < 0 ? "down" : "up"} about ${Math.abs(push).toFixed(2)}%.`;
  }
  const cap = input.caps[ticker];
  if (!fin(cap) || cap <= 0) return null;
  // The value before today's move, times the move: what the day added or took away.
  const before = cap / (1 + pct / 100);
  const moved = before * (pct / 100);
  if (Math.abs(moved) < 1e8) return null;
  return `It ${moved < 0 ? "lost" : "gained"} about ${bigDollars(moved)} in market value.`;
}

/** Each stock's best reason-grade story, scored by the dollars its move added or took away. */
function stockCandidates(input: TopNewsInput): Candidate[] {
  const byTicker = new Map<string, WireItem[]>();
  for (const item of input.items) {
    if (!inWindow(item, input)) continue;
    for (const ticker of item.tickers) byTicker.set(ticker, [...(byTicker.get(ticker) ?? []), item]);
  }
  const out: Candidate[] = [];
  for (const [ticker, stories] of byTicker) {
    const quote = input.quotes[ticker];
    const pct = quote?.pct;
    const cap = input.caps[ticker];
    if (!quote || !fin(pct) || Math.abs(pct) < MIN_MOVE_PCT || !fin(cap) || cap <= 0) continue;
    const stock = { ticker, name: quote.name, day_change_pct: pct };
    const picked = [...stories]
      .sort(better)
      .find((item) => cardHeadline(item.title) && newsRank({ title: item.title, summary: "", published_at: item.publishedAt }, stock, { headlineOnly: true }) === 2);
    if (!picked) continue;
    const before = cap / (1 + pct / 100);
    out.push({
      id: picked.id,
      kind: "stock",
      ticker,
      name: quote.name,
      icon: null,
      headline: cardHeadline(picked.title)!,
      why: stockWhy(ticker, pct, input),
      reaction: { label: ticker, pct, price: fin(quote.price) && quote.price > 0 ? quote.price : null },
      day: storyDay(picked, input.today),
      source: picked.source,
      url: picked.url,
      score: Math.abs(before * (pct / 100)),
      key: titleKey(picked.title),
      title: picked.title,
    });
  }
  return out.sort((a, b) => b.score - a.score || (a.ticker ?? "").localeCompare(b.ticker ?? ""));
}

/**
 * The day's top three market stories, most important first (see the file's note). Fewer than three found means none:
 * the section is a row of three or nothing.
 */
export function topMarketNews(input: TopNewsInput): TopStory[] {
  const macro = macroCandidates(input).sort((a, b) => b.score - a.score);
  const events = macro.filter((story) => story.score > 0).slice(0, 1);
  const wrap = macro.find((story) => story.score === 0) ?? null;
  const stocks = stockCandidates(input);
  const ordered = [...events, ...stocks.slice(0, 1), ...(wrap ? [wrap] : []), ...stocks.slice(1)];
  const picked: Candidate[] = [];
  for (const story of ordered) {
    // The same story from two feeds, or one story naming two stocks, counts once.
    if (picked.some((seen) => seen.key === story.key || overlap(seen.title, story.title) >= 0.5)) continue;
    if (story.why && wordCount(story.why) > TOP_WHY_WORDS) story.why = null;
    picked.push(story);
    if (picked.length === TOP_STORIES) break;
  }
  if (picked.length < TOP_STORIES) return [];
  return picked.map(({ score: _score, key: _key, title: _title, ...story }) => story);
}
