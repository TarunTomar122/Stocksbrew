/**
 * The wire, read for what it means: how the news is leaning, which stories are
 * driving it, and which stocks everyone is talking about. Pure, so every rule
 * here is tested without a store.
 *
 * Inputs are the headlines (`WireItem`), the day moves, and one label per
 * headline from `backend/agentdata/news_tone.py` (tone, scope, theme). The
 * labels are the only model-written part; every share, count and change below
 * is plain arithmetic over them, and a headline without a label is left out of
 * the tone figures rather than guessed.
 */

import { balancePct, pickInsights, sharePct, type Insight, type InsightTone, type TheRead } from "@/lib/insights";
import { better, isForeignLanguage, storyRelevance, storyWeight, titleKey } from "@/lib/wire-companies";
import { themeKey, wireHref, WIRE_PAGE_SIZE, type WireFilters, type WireItem } from "@/lib/wire-shared";

export type NewsTone = "positive" | "negative" | "neutral";
export type NewsScope = "stock" | "market" | "other";
export type NewsLabel = { tone: NewsTone; scope: NewsScope; theme: string | null };
export type NewsLabels = Record<string, NewsLabel>;
export type ToneCounts = { positive: number; negative: number; neutral: number };
export type Quotes = Record<string, { pct: number | null; name: string }>;

const HOUR = 3_600_000;
/** A story's pull on "most talked about" halves every eight hours. */
const HALF_LIFE_HOURS = 8;
/** A theme needs this many distinct stories to count as something driving the news. */
export const MIN_THEME_STORIES = 3;

export function emptyCounts(): ToneCounts {
  return { positive: 0, negative: 0, neutral: 0 };
}

export function totalOf(counts: ToneCounts): number {
  return counts.positive + counts.negative + counts.neutral;
}

/** "positive" when good news clearly outweighs bad, "negative" the other way, "mixed" otherwise. Null without labels. */
export function leanOf(counts: ToneCounts, margin = 10): "positive" | "negative" | "mixed" | null {
  const total = totalOf(counts);
  if (total === 0) return null;
  const gap = ((counts.positive - counts.negative) / total) * 100;
  return gap >= margin ? "positive" : gap <= -margin ? "negative" : "mixed";
}

export function leanTone(counts: ToneCounts): InsightTone {
  const lean = leanOf(counts);
  return lean === "positive" ? "up" : lean === "negative" ? "down" : "flat";
}

function pctOf(quotes: Quotes, ticker: string): number | null {
  const pct = quotes[ticker]?.pct;
  return typeof pct === "number" && Number.isFinite(pct) ? pct : null;
}

function nameOf(quotes: Quotes, ticker: string): string | null {
  const name = quotes[ticker]?.name;
  return name && name !== ticker ? name : null;
}

/**
 * One copy of each story published in [sinceMs, untilMs): English, newest
 * first. When two feeds carried the same headline, the copy that has a label
 * (then the one naming more stocks) is kept, so nothing is lost by the merge.
 */
export function storiesBetween(items: WireItem[], labels: NewsLabels, sinceMs: number, untilMs: number): WireItem[] {
  const byKey = new Map<string, WireItem>();
  for (const item of items) {
    const at = Date.parse(item.publishedAt);
    if (!Number.isFinite(at) || at < sinceMs || at >= untilMs) continue;
    if (isForeignLanguage(item.title)) continue;
    const key = titleKey(item.title);
    if (!key) continue;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, item);
      continue;
    }
    const merged = { ...(labels[seen.id] || !labels[item.id] ? seen : item) };
    merged.tickers = [...new Set([...seen.tickers, ...item.tickers])];
    byKey.set(key, merged);
  }
  return [...byKey.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
}

/** Tone counts over labelled stories, leaving out the ones nobody trading US stocks would act on. */
export function countTones(stories: WireItem[], labels: NewsLabels, keep: (item: WireItem, label: NewsLabel) => boolean = () => true): ToneCounts {
  const counts = emptyCounts();
  for (const item of stories) {
    const label = labels[item.id];
    if (!label || label.scope === "other" || !keep(item, label)) continue;
    counts[label.tone] += 1;
  }
  return counts;
}

/** The label's tone as the kit's up/down/flat, for a headline's glyph. */
export function headlineTone(label: NewsLabel | undefined): "up" | "down" | "flat" | null {
  if (!label) return null;
  return label.tone === "positive" ? "up" : label.tone === "negative" ? "down" : "flat";
}

/* ── Stocks in the news ────────────────────────────────────────────────── */

export type StockBuzz = {
  ticker: string;
  name: string | null;
  pct: number | null;
  /** Distinct stories naming the stock in the window. */
  count: number;
  /** Stories naming it in the window before, for "up from" comparisons. */
  prevCount: number;
  /** Share of all stock mentions in the window, in whole percent. */
  share: number;
  tones: ToneCounts;
  /** The one headline to read first. */
  lead: WireItem;
  /** Recency-weighted coverage; the ranking key. */
  score: number;
  latestAt: string;
};

/**
 * Stocks ranked by how much is being said about them now: every story naming
 * them, weighted by how recent it is, a publisher's story over a press
 * release, and a story about one company over a roundup of ten.
 */
export function stockBuzz(
  stories: WireItem[],
  options: { labels: NewsLabels; quotes: Quotes; nowMs: number; previous?: WireItem[]; limit?: number },
): StockBuzz[] {
  const { labels, quotes, nowMs, previous = [], limit } = options;
  const prev = new Map<string, number>();
  for (const item of previous) for (const ticker of item.tickers) prev.set(ticker, (prev.get(ticker) ?? 0) + 1);

  const byTicker = new Map<string, { items: WireItem[]; score: number; tones: ToneCounts }>();
  let mentions = 0;
  for (const item of stories) {
    if (!item.tickers.length) continue;
    const label = labels[item.id];
    if (label?.scope === "other") continue;
    const ageHours = Math.max(0, (nowMs - Date.parse(item.publishedAt)) / HOUR);
    const recency = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
    const dilution = Math.max(0.25, 1 - 0.25 * (item.tickers.length - 1));
    for (const ticker of item.tickers) {
      const group = byTicker.get(ticker) ?? { items: [], score: 0, tones: emptyCounts() };
      group.items.push(item);
      group.score += storyWeight(item) * dilution * recency;
      if (label) group.tones[label.tone] += 1;
      byTicker.set(ticker, group);
      mentions += 1;
    }
  }

  const rows: StockBuzz[] = [];
  for (const [ticker, group] of byTicker) {
    // The headline to read first: a publisher's story about this company that says something, newest first.
    const pull = (item: WireItem) => storyRelevance(item) + (labels[item.id] && labels[item.id]!.tone !== "neutral" ? 0.3 : 0);
    const lead = [...group.items].sort((a, b) => pull(b) - pull(a) || (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))[0]!;
    rows.push({
      ticker,
      name: nameOf(quotes, ticker),
      pct: pctOf(quotes, ticker),
      count: group.items.length,
      prevCount: prev.get(ticker) ?? 0,
      share: sharePct(group.items.length, mentions) ?? 0,
      tones: group.tones,
      lead,
      score: group.score,
      latestAt: group.items.reduce((latest, item) => (item.publishedAt > latest ? item.publishedAt : latest), ""),
    });
  }
  rows.sort((a, b) => b.score - a.score || b.count - a.count || a.ticker.localeCompare(b.ticker));
  return limit ? rows.slice(0, limit) : rows;
}

/* ── Themes ────────────────────────────────────────────────────────────── */

export type NewsTheme = {
  name: string;
  /** Distinct stories in the window. */
  count: number;
  prevCount: number;
  tones: ToneCounts;
  /** Stocks the stories name, most named first. */
  tickers: Array<{ ticker: string; count: number; pct: number | null }>;
  /** Best first. */
  items: WireItem[];
  /** Most of its stories are about the economy or the market rather than companies. */
  market: boolean;
  latestAt: string;
};

/** The stories driving the news: labelled themes with at least `MIN_THEME_STORIES` stories, biggest first. */
export function newsThemes(stories: WireItem[], options: { labels: NewsLabels; quotes: Quotes; previous?: WireItem[]; limit?: number }): NewsTheme[] {
  const { labels, quotes, previous = [], limit } = options;
  const keyOf = themeKey;
  const prev = new Map<string, number>();
  for (const item of previous) {
    const theme = labels[item.id]?.theme;
    if (theme && labels[item.id]?.scope !== "other") prev.set(keyOf(theme), (prev.get(keyOf(theme)) ?? 0) + 1);
  }
  type Group = { names: Map<string, number>; items: WireItem[]; tones: ToneCounts; tickers: Map<string, number>; market: number };
  const groups = new Map<string, Group>();
  for (const item of stories) {
    const label = labels[item.id];
    if (!label?.theme || label.scope === "other") continue;
    const key = keyOf(label.theme);
    if (!key) continue;
    const group: Group = groups.get(key) ?? { names: new Map(), items: [], tones: emptyCounts(), tickers: new Map(), market: 0 };
    group.names.set(label.theme, (group.names.get(label.theme) ?? 0) + 1);
    group.items.push(item);
    group.tones[label.tone] += 1;
    if (label.scope === "market") group.market += 1;
    for (const ticker of item.tickers) group.tickers.set(ticker, (group.tickers.get(ticker) ?? 0) + 1);
    groups.set(key, group);
  }
  const out: NewsTheme[] = [];
  for (const [key, group] of groups) {
    if (group.items.length < MIN_THEME_STORIES) continue;
    const name = [...group.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    out.push({
      name,
      count: group.items.length,
      prevCount: prev.get(key) ?? 0,
      tones: group.tones,
      tickers: [...group.tickers.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(([ticker, count]) => ({ ticker, count, pct: pctOf(quotes, ticker) })),
      items: [...group.items].sort(better),
      market: group.market * 2 > group.items.length,
      latestAt: group.items.reduce((latest, item) => (item.publishedAt > latest ? item.publishedAt : latest), ""),
    });
  }
  out.sort((a, b) => b.count - a.count || (a.latestAt < b.latestAt ? 1 : -1));
  return limit ? out.slice(0, limit) : out;
}

/* ── The read ──────────────────────────────────────────────────────────── */

function signed(pct: number, digits = 1): string {
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(digits)}%`;
}

function moveClause(ticker: string, pct: number | null): string | null {
  if (pct === null) return null;
  if (Math.abs(pct) < 0.05) return `${ticker} is flat today.`;
  return `${ticker} is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% today.`;
}

/** "70% negative" for whichever side leads, or "split evenly" when neither does. */
function sideOf(counts: ToneCounts): { text: string; tone: InsightTone } {
  const pct = balancePct({ ...counts });
  const lean = leanOf(counts);
  if (lean === "positive") return { text: `${pct.positive}% positive`, tone: "up" };
  if (lean === "negative") return { text: `${pct.negative}% negative`, tone: "down" };
  return { text: `split ${pct.positive}% positive, ${pct.negative}% negative`, tone: "flat" };
}

export type MarketReadInput = {
  today: WireItem[];
  yesterday: WireItem[];
  labels: NewsLabels;
  buzz: StockBuzz[];
  themes: NewsTheme[];
  sources: number;
  asOf: string | null;
  /** Who labelled the tone, for the source line. */
  labelledBy: string | null;
  filters: WireFilters;
};

/** Stories with a usable label in a window: enough to say how the news leans. */
export const MIN_LABELLED = 40;

/**
 * The read at the top of the wire: how the news leans against the day before,
 * the story driving it, and the stock everyone is talking about. Each insight
 * is left out when the data under it is too thin.
 */
export function marketRead(input: MarketReadInput): TheRead | null {
  const { today, yesterday, labels, buzz, themes, filters } = input;
  const now = countTones(today, labels);
  const total = totalOf(now);
  if (total < MIN_LABELLED) return null;
  const pct = balancePct({ ...now });
  const before = countTones(yesterday, labels);
  const beforePct = totalOf(before) >= MIN_LABELLED ? balancePct({ ...before }) : null;
  const lean = leanOf(now);
  const top = themes[0] ?? null;

  const leanWord = lean === "positive" ? "leans positive" : lean === "negative" ? "leans negative" : "is mixed";
  const headline = top ? `Stock news ${leanWord} today. Biggest story: ${top.name}` : `Stock news ${leanWord} today`;

  const insights: Array<Insight | null> = [];

  // 1. The balance, against the day before.
  {
    const change = beforePct ? pct.positive - beforePct.positive : null;
    const versus =
      beforePct && change !== null
        ? Math.abs(change) < 2
          ? `, about the same as the day before (${beforePct.positive}%)`
          : `, ${change > 0 ? "up" : "down"} from ${beforePct.positive}% the day before`
        : "";
    insights.push({
      id: "balance",
      tone: change !== null && Math.abs(change) >= 2 ? (change > 0 ? "up" : "down") : leanTone(now),
      text: `${pct.positive}% of the last day's ${total.toLocaleString("en-US")} stories read positive and ${pct.negative}% negative${versus}.`,
      soWhat: pct.neutral >= 50 ? "Most of the rest is routine: filings, fund flows and previews." : undefined,
    });
  }

  // 2. The story driving it.
  if (top) {
    const side = sideOf(top.tones);
    const lead = top.tickers[0] ?? null;
    const grew = top.prevCount > 0 && top.count >= top.prevCount * 2 ? `, up from ${top.prevCount} the day before` : top.prevCount === 0 ? ", all of them new today" : "";
    insights.push({
      id: "theme",
      tone: side.tone,
      text: `The biggest story is ${top.name}: ${top.count} stories${grew}, ${side.text}.`,
      soWhat: lead ? moveClause(lead.ticker, lead.pct) ?? undefined : undefined,
      tickers: top.tickers.slice(0, 4).map((row) => row.ticker),
      action: { label: "Read them", href: wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { theme: top.name }) },
    });
  }

  // 3. The stock with the most coverage (the next one when the biggest story already covers it),
  // or one whose news and price disagree.
  const storyStock = top?.tickers[0]?.ticker ?? null;
  const leaderIndex = buzz.findIndex((row) => row.ticker !== storyStock);
  const leader = leaderIndex >= 0 ? buzz[leaderIndex]! : null;
  const disagreement = buzz.slice(0, 15).find((row) => {
    if (row.pct === null || Math.abs(row.pct) < 2 || totalOf(row.tones) < 3) return false;
    const rowLean = leanOf(row.tones, 20);
    return (rowLean === "positive" && row.pct < 0) || (rowLean === "negative" && row.pct > 0);
  });
  if (leader) {
    const side = totalOf(leader.tones) >= 3 ? sideOf(leader.tones) : null;
    if (!disagreement || disagreement.ticker !== leader.ticker) {
      // Starts with the ticker: the read shows a single stock's logo and symbol in front of the sentence.
      const opener =
        leaderIndex === 0 ? `${leader.ticker} is the most talked-about stock` : `${leader.ticker} is the most talked-about stock after ${buzz[0]!.ticker}`;
      insights.push({
        id: "leader",
        tone: side?.tone ?? "flat",
        text: `${opener}, with ${leader.share}% of company coverage (${leader.count} stories)${side ? `, ${side.text}` : ""}.`,
        soWhat: moveClause(leader.ticker, leader.pct) ?? undefined,
        tickers: [leader.ticker],
        action: { label: "Its headlines", href: wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: leader.ticker }) },
      });
    }
  }
  if (disagreement && disagreement.pct !== null) {
    const rowLean = leanOf(disagreement.tones, 20);
    const pctTones = balancePct({ ...disagreement.tones });
    insights.push({
      id: "disagree",
      tone: disagreement.pct > 0 ? "up" : "down",
      text: `${disagreement.ticker}: ${rowLean === "positive" ? `${pctTones.positive}% of today's headlines about it read as good news` : `${pctTones.negative}% of today's headlines about it read as bad news`}, yet the stock is ${signed(disagreement.pct)} today.`,
      // Say what we see, not why: the headlines alone do not explain this move.
      soWhat: "The headlines alone don't explain the move.",
      tickers: [disagreement.ticker],
      action: { label: "Its headlines", href: wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: disagreement.ticker }) },
    });
  }

  const sourceBits = [`${total.toLocaleString("en-US")} stories from ${input.sources} ${input.sources === 1 ? "source" : "sources"}`];
  if (input.labelledBy) sourceBits.push(`tone read per headline by ${input.labelledBy}`);
  return { headline, insights: pickInsights(insights, 3), source: sourceBits.join(" · "), asOf: input.asOf };
}

/* ── Everything at once ────────────────────────────────────────────────── */

export type WireReadSource = {
  items: WireItem[];
  quotes: Quotes;
  labels: NewsLabels;
  newestAt: string | null;
  labelledBy: string | null;
  labelledAt: string | null;
};

export type WireReading = {
  today: WireItem[];
  yesterday: WireItem[];
  buzz: StockBuzz[];
  themes: NewsTheme[];
  read: TheRead | null;
  /** Labelled share of today's stories, so a page can tell when the labels are behind. */
  labelledShare: number | null;
};

/**
 * The last day of the wire, read: anchored on the newest headline (never later
 * than now) so a quiet weekend still has a day to read, compared with the day
 * before it.
 */
export function readTheWire(source: WireReadSource, options: { nowMs: number; filters: WireFilters; buzzLimit?: number; themeLimit?: number }): WireReading {
  const { nowMs, filters } = options;
  const newest = source.newestAt ? Date.parse(source.newestAt) : Number.NaN;
  const anchor = Number.isFinite(newest) ? Math.min(nowMs, newest + 1) : nowMs;
  const today = storiesBetween(source.items, source.labels, anchor - 24 * HOUR, anchor + 1);
  const yesterday = storiesBetween(source.items, source.labels, anchor - 48 * HOUR, anchor - 24 * HOUR);
  const buzz = stockBuzz(today, { labels: source.labels, quotes: source.quotes, nowMs: anchor, previous: yesterday, limit: options.buzzLimit });
  const themes = newsThemes(today, { labels: source.labels, quotes: source.quotes, previous: yesterday, limit: options.themeLimit });
  const sources = new Set(today.map((item) => item.source).filter(Boolean)).size;
  const read = marketRead({
    today,
    yesterday,
    labels: source.labels,
    buzz,
    themes,
    sources,
    asOf: source.labelledAt ?? source.newestAt,
    labelledBy: source.labelledBy,
    filters,
  });
  const labelled = today.filter((item) => source.labels[item.id]).length;
  return { today, yesterday, buzz, themes, read, labelledShare: sharePct(labelled, today.length) };
}
