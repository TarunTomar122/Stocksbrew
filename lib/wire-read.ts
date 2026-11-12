/**
 * The wire, read for what it means: how the news is leaning, which stories are
 * driving it, and which stocks everyone is talking about. Pure, so every rule
 * here is tested without a store.
 *
 * Inputs are the headlines (`WireItem`), the day moves, and one label per
 * headline from `backend/agentdata/news_tone.py` (tone, scope, theme). The
 * labels are the only model-written part; every share, count and change below
 * is plain arithmetic over them. Where the model has not read a story, a page
 * may add a label from the headline's own words (`lib/wire-headline-tone.ts`,
 * marked `by: "words"`); a headline with neither is left out of the tone
 * figures rather than guessed.
 */

import { balancePct, pickInsights, sharePct, type Insight, type InsightTone, type TheRead } from "@/lib/insights";
import { better, isForeignLanguage, labelFor, namesPastYear, plainStory, storyRelevance, storyWeight, titleKey } from "@/lib/wire-companies";
import { headlineCase, shortCompanyName } from "@/lib/plain-copy";
import { themeKey, wireHref, WIRE_PAGE_SIZE, type WireFilters, type WireItem } from "@/lib/wire-shared";

export type NewsTone = "positive" | "negative" | "neutral";
export type NewsScope = "stock" | "market" | "other";
export type NewsLabel = {
  tone: NewsTone;
  scope: NewsScope;
  theme: string | null;
  /** Who said it: the model labeller (the default) or the headline word list, which never sets a theme. */
  by?: "model" | "words";
  /** A word-list label on a story naming two companies: the one stock its words are about. The other gets no tone. */
  ticker?: string;
};
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

/** At least this many stories with a tone before anything is said about how a stock's news leans. */
export const MIN_TONED = 3;

export type ToneLean = {
  side: "positive" | "negative";
  /** The leading side as a share of all the stories counted (with or without a tone), whole percent. */
  pct: number;
  /** "70% negative" when the side is most of the stories, "Leans negative" when it is a clear lean of fewer. */
  text: string;
};

/**
 * How a set of stories leans, when it clearly does: at least `MIN_TONED` of them have a tone, the leading side has
 * at least two stories and twice the other side's, and it is at least a quarter of all `stories`. `stories` is every
 * story counted, labelled or not (it defaults to the labelled ones), so "70% negative" is never 70% of a handful
 * read out of thirty. A lean of under half ("Leans negative") needs more: at least three stories on its side and over
 * three times the other's, so a couple of stray headlines cannot paint a stock. Null otherwise: nothing is said rather
 * than "no clear lean".
 */
export function toneLean(counts: ToneCounts, stories: number = totalOf(counts)): ToneLean | null {
  const labelled = totalOf(counts);
  if (labelled < MIN_TONED) return null;
  const side = counts.positive > counts.negative ? "positive" : counts.negative > counts.positive ? "negative" : null;
  if (!side) return null;
  const lead = side === "positive" ? counts.positive : counts.negative;
  const other = side === "positive" ? counts.negative : counts.positive;
  if (lead < 2 || lead < other * 2) return null;
  const base = Math.max(stories, labelled);
  const share = lead / base;
  if (share < 0.25) return null;
  const pct = Math.round(share * 100);
  if (share >= 0.5) return { side, pct, text: `${pct}% ${side}` };
  if (lead < 3 || lead <= other * 3) return null;
  return { side, pct, text: `Leans ${side}` };
}

/**
 * A ranked row's tone (owner rule 3: each row of a ranked list carries its mood), said only where the labels support
 * one: the clear lean when there is one (`toneLean`, "75% negative"), else, with at least `MIN_TONED` stories toned,
 * "62% neutral" when most stories are neutral. Null otherwise (a split with no lead included): too few toned stories say nothing, and the cell is left empty rather than a dash.
 */
export function toneWord(counts: ToneCounts, stories: number = totalOf(counts)): { text: string; side: "positive" | "negative" | "neutral" } | null {
  const lean = toneLean(counts, stories);
  if (lean) return { text: lean.text, side: lean.side };
  const labelled = totalOf(counts);
  if (labelled < MIN_TONED) return null;
  const base = Math.max(stories, labelled);
  const neutral = counts.neutral / base;
  if (neutral >= 0.5) return { text: `${Math.round(neutral * 100)}% neutral`, side: "neutral" };
  // Both sides with no lead is left unsaid: "Mixed" carried no figure (owner rules 3 and 5: one figure or nothing).
  return null;
}

/**
 * A ranked row's tone, always said once the list has a tone column (owner rule 3, judges on ship 53: a blank cell read
 * as missing data). The supported tone when there is one (`toneWord`); "Mixed" when most stories have a tone and both
 * sides have at least two with neither leading; "Too few stories to say" when the stock has fewer stories than a tone
 * needs; and "No clear lean" otherwise (enough stories, but not enough of them lean one way to call it). Never a
 * made-up lean.
 */
export function rowTone(counts: ToneCounts, stories: number = totalOf(counts)): { text: string; side: "positive" | "negative" | "neutral" | "unsaid" } {
  const word = toneWord(counts, stories);
  if (word) return word;
  const labelled = totalOf(counts);
  const base = Math.max(stories, labelled);
  if (labelled >= MIN_TONED && labelled * 2 >= base && counts.positive >= 2 && counts.negative >= 2) return { text: "Mixed", side: "unsaid" };
  if (base < MIN_TONED) return { text: "Too few stories to say", side: "unsaid" };
  return { text: "No clear lean", side: "unsaid" };
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
    // A story naming a past year as its news ("winner of 2025 …" read in 2026) neither leads nor counts (owner rule 7).
    if (isForeignLanguage(item.title) || namesPastYear(item.title, at)) continue;
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
  /** The one headline to read first: one that says what happened (`plainStory`), null when every story is bait. */
  lead: WireItem | null;
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
      const own = labelFor(labels, item, ticker);
      if (own) group.tones[own.tone] += 1;
      byTicker.set(ticker, group);
      mentions += 1;
    }
  }

  const rows: StockBuzz[] = [];
  for (const [ticker, group] of byTicker) {
    // The headline to read first: a publisher's story about this company that says something, newest first.
    const pull = (item: WireItem) => storyRelevance(item) + ((labelFor(labels, item, ticker)?.tone ?? "neutral") !== "neutral" ? 0.3 : 0);
    // Bait headlines ("Dear Nebius stock fans…") never lead: told by the publisher's plain first sentence, or skipped.
    const plain = group.items.map(plainStory).filter((item): item is WireItem => item !== null);
    const lead = plain.sort((a, b) => pull(b) - pull(a) || (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))[0] ?? null;
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
  /** Who labelled the tone. Not shown: how the tone was read is mechanics (owner rule 8). */
  labelledBy: string | null;
  filters: WireFilters;
};

/** Stories with a usable label in a window: enough to say how the news leans. */
export const MIN_LABELLED = 40;
/** The most talked-about stock needs this many stories today before the read leads with it. */
export const MIN_LEAD_STORIES = 5;
/** How many of the most talked-about stocks the read looks through for a big move or a jump in coverage. */
const READ_DEPTH = 15;

/** The company as people say it ("NVIDIA", "Microsoft"), else the ticker. */
function spokenName(row: StockBuzz): string {
  return (row.name ? shortCompanyName(row.name) : "") || row.ticker;
}

/** Coverage at least three times the day before's: a new story, not an ongoing one. */
function isSurge(count: number, prev: number): boolean {
  return count >= Math.max(3, prev * 3);
}

/**
 * A surge against a real day before (at least three stories), so the headline's "up from" and the card never
 * disagree; a jump from one or two stories is noise and the headline uses the share instead.
 */
function surgeFromRealDay(count: number, prev: number): boolean {
  return prev >= 3 && isSurge(count, prev);
}

/** "against 12 the day before", "none the day before". */
function dayBefore(prev: number): string {
  return prev === 0 ? "none the day before" : `against ${prev} the day before`;
}

/** The stock's news leaning one way, as a share of all its stories (`toneLean`); null when it doesn't clearly. */
function stockLean(row: StockBuzz): ToneLean | null {
  return toneLean(row.tones, row.count);
}

function rose(pct: number): string {
  return `${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}%`;
}

/** The lead headline as a person would write it, quoted, for "the top story" lines. */
function topStory(row: StockBuzz, lead = "The top story"): string | null {
  if (!row.lead) return null;
  const title = headlineCase(row.lead.title, row.name ?? "").replace(/[.!]+$/, "");
  return title ? `${lead}: “${title}”.` : null;
}

/**
 * The read at the top of the wire, stocks first (owner rule 7): the stock leading the news, measured against the day
 * before, then the biggest price move among the stocks in the news, then the sharpest jump in coverage. Each card
 * names its stock, carries one number with its baseline and says what it means; a stock never takes two cards.
 * Tone (from the per-headline labels) is added only where it clearly leans, so the read stands when the labels are
 * behind. Null when no stock has enough coverage to lead.
 */
export function marketRead(input: MarketReadInput): TheRead | null {
  const { today, yesterday, labels, buzz, themes, filters } = input;
  const leader = buzz[0];
  if (!leader || leader.count < MIN_LEAD_STORIES) return null;
  const used = new Set<string>();
  const insights: Array<Insight | null> = [];
  const headlinesOf = (ticker: string) => wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker });

  // The headline: who leads the news, as one figure (owner rule 8): "190 stories on NVDA today." The day before goes
  // under it ("Up from 28 the day before."), never "7 times the stories it got the day before".
  const leaderName = spokenName(leader);
  const surgeHeadline = surgeFromRealDay(leader.count, leader.prevCount);
  const headline = surgeHeadline
    ? `${leader.count} stories on ${leader.ticker} today.`
    : `${leader.ticker} leads the news today, with ${leader.share}% of all company coverage.`;
  const sub = surgeHeadline ? `Up from ${leader.prevCount} the day before.` : undefined;

  // 1. The leader: its coverage against the day before, its move, and what the two together say.
  {
    const lean = stockLean(leader);
    const surge = isSurge(leader.count, leader.prevCount);
    const toneBit = lean ? (lean.pct >= 50 ? `, ${lean.pct}% of them ${lean.side}` : `, with the news leaning ${lean.side}`) : "";
    // The baseline is in the figure's label ("stories, 12 the day before"), so the sentence does not say it again.
    // The headline already gives the count ("191 stories on NVDA today."), so the card says the move and the tone
    // without the same figure again (owner rule 1).
    const text =
      leader.pct !== null && surgeHeadline
        ? `${leader.ticker} ${rose(leader.pct)} today${lean ? (lean.pct >= 50 ? `, with ${lean.pct}% of its stories ${lean.side}` : `, with its news leaning ${lean.side}`) : ""}.`
        : leader.pct !== null
          ? `${leader.ticker} ${rose(leader.pct)} today on ${leader.count} stories${toneBit}.`
          : surgeHeadline && lean
            ? `${lean.pct >= 50 ? `${lean.pct}% of ${leader.ticker}'s stories are ${lean.side}` : `${leader.ticker}'s news leans ${lean.side}`}.`
            : `${leader.ticker} drew ${leader.count} stories in the last day${toneBit}.`;
    let soWhat: string | undefined;
    // A price and a tone pointing opposite ways: the sentence above already says both, and nothing more is said, since
    // why buyers or sellers did it ("looking past the bad headlines") is a motive the figures do not show (owner rule 7).
    const against = Boolean(lean && leader.pct !== null && Math.abs(leader.pct) >= 2 && (lean.side === "negative") === leader.pct > 0);
    if (against) {
      // Nothing to add: the price and the tone are both in the sentence.
    } else if (surge && leader.pct !== null && Math.abs(leader.pct) < 1) {
      soWhat = "All that news has barely moved the stock so far.";
    } else if (surge && leader.pct !== null && Math.abs(leader.pct) >= 2) {
      soWhat = "Big news and a big move together: check what changed before you trade it.";
    } else if (!surge && leader.prevCount > 0) {
      // Not a surge, so said from the real comparison: fewer, about as many, or more stories than the day before.
      soWhat =
        leader.count < leader.prevCount * 0.8
          ? "Fewer stories than the day before: an older story winding down, not a new one."
          : leader.count <= leader.prevCount * 1.25
            ? "About as many stories as the day before: an ongoing story, not a new one."
            : "A bit more coverage than the day before: still an ongoing story.";
    }
    used.add(leader.ticker);
    insights.push({
      id: "leader",
      tone: leader.pct === null ? "flat" : leader.pct >= 0 ? "up" : "down",
      // The headline already gives the count against the day before when it surged, so the card's figure is its share
      // of the day's company news instead of the same two numbers again (owner rule 1).
      figure: surgeHeadline
        ? { value: `${leader.share}%`, label: "of all company coverage today" }
        : { value: String(leader.count), label: leader.prevCount > 0 ? `stories, ${leader.prevCount} the day before` : "stories, none the day before" },
      text,
      soWhat,
      tickers: [leader.ticker],
      leadName: leaderName !== leader.ticker ? leaderName : undefined,
      action: { label: "Its headlines", href: headlinesOf(leader.ticker) },
    });
  }

  // 2. A big story, when the tone labels name one about a company not already told. Market-wide stories
  // (inflation, the Fed) are left out: the stock they happen to name first is not what they are about.
  const topIndex = themes.findIndex((theme) => !theme.market && theme.tickers[0] && !used.has(theme.tickers[0].ticker));
  const top = topIndex >= 0 ? themes[topIndex]! : null;
  if (top) {
    const lead = top.tickers[0]!;
    const side = sideOf(top.tones);
    used.add(lead.ticker);
    insights.push({
      id: "theme",
      tone: side.tone,
      figure: { value: String(top.count), label: top.prevCount > 0 ? `stories, ${top.prevCount} the day before` : "stories, all new today" },
      text: `${lead.ticker}: ${topIndex === 0 ? "the biggest story" : "another big story"} is ${headlineCase(top.name)}, ${side.text}.`,
      soWhat: moveClause(lead.ticker, lead.pct) ?? undefined,
      tickers: [lead.ticker],
      action: { label: "Read them", href: wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { theme: top.name }) },
    });
  }

  // 3. A stock whose news and price point opposite ways, when the labels clearly say how its news leans.
  // Only when most of its stories (not most of a few labelled ones) read one way.
  const disagreement = buzz.slice(0, READ_DEPTH).find((row) => {
    if (used.has(row.ticker) || row.pct === null || Math.abs(row.pct) < 2) return false;
    const rowLean = stockLean(row);
    if (!rowLean || rowLean.pct < 50) return false;
    return (rowLean.side === "positive" && row.pct < 0) || (rowLean.side === "negative" && row.pct > 0);
  });
  const disagreeLean = disagreement ? stockLean(disagreement) : null;
  if (disagreement && disagreement.pct !== null && disagreeLean) {
    const good = disagreeLean.side === "positive";
    used.add(disagreement.ticker);
    insights.push({
      id: "disagree",
      tone: disagreement.pct > 0 ? "up" : "down",
      figure: { value: signed(disagreement.pct), label: `${disagreement.ticker} today` },
      text: `${disagreement.ticker}: ${disagreeLean.pct}% of today's headlines about it read as ${good ? "good" : "bad"} news, yet the stock ${rose(disagreement.pct)}.`,
      // Say what we see, not why: the headlines alone do not explain this move.
      soWhat: "The headlines alone don't explain the move; wait for a reason before acting on it.",
      tickers: [disagreement.ticker],
      action: { label: "Its headlines", href: headlinesOf(disagreement.ticker) },
    });
  }

  // 4. The biggest move among the stocks in the news, with the story behind it.
  const mover = buzz
    .slice(0, READ_DEPTH)
    .filter((row) => !used.has(row.ticker) && row.pct !== null && Math.abs(row.pct) >= 3 && row.count >= 3)
    .sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!) || a.ticker.localeCompare(b.ticker))[0];
  if (mover && mover.pct !== null) {
    used.add(mover.ticker);
    insights.push({
      id: "mover",
      tone: mover.pct >= 0 ? "up" : "down",
      figure: { value: signed(mover.pct), label: `${mover.ticker} today` },
      text: `${mover.ticker} ${rose(mover.pct)} today, the biggest move in the news, on ${mover.prevCount === 0 ? `${mover.count} stories that are all new today` : `${mover.count} stories, ${dayBefore(mover.prevCount)}`}.`,
      soWhat: topStory(mover) ?? undefined,
      tickers: [mover.ticker],
      action: { label: "Its headlines", href: headlinesOf(mover.ticker) },
    });
  }

  // 5. The sharpest jump in coverage: new attention, before or after the price notices.
  const jump = buzz
    .slice(0, READ_DEPTH)
    .filter((row) => !used.has(row.ticker) && row.count >= 8 && isSurge(row.count, row.prevCount))
    .sort((a, b) => b.count / Math.max(1, b.prevCount) - a.count / Math.max(1, a.prevCount) || b.count - a.count || a.ticker.localeCompare(b.ticker))[0];
  if (jump) {
    used.add(jump.ticker);
    // A ratio only against a real day before; "24×" over a single story is noise, so the count is the figure then.
    const ratio = jump.prevCount >= 2 ? Math.floor(jump.count / jump.prevCount) : null;
    // The figure carries the coverage and its baseline, so the sentence says what the stock did with it (owner rule 1).
    const text =
      jump.pct === null
        ? `${jump.ticker} is suddenly in the news, with no price move to read yet.`
        : Math.abs(jump.pct) < 1
          ? `${jump.ticker} is suddenly in the news, but the stock has barely moved on it so far.`
          : `${jump.ticker} ${rose(jump.pct)} today as the news about it took off.`;
    insights.push({
      id: "jump",
      tone: jump.pct === null || Math.abs(jump.pct) < 1 ? "flat" : jump.pct > 0 ? "up" : "down",
      figure: ratio !== null ? { value: `${ratio}×`, label: "its coverage the day before" } : { value: String(jump.count), label: jump.prevCount === 1 ? "stories, 1 the day before" : "stories, none the day before" },
      text,
      // Worded apart from the mover card's "The top story", so two cards never open the same way (owner rule 1).
      soWhat: topStory(jump, "Leading its coverage") ?? undefined,
      tickers: [jump.ticker],
      action: { label: "Its headlines", href: headlinesOf(jump.ticker) },
    });
  }

  // 6. How the whole wire leans, against the day before: only with enough labels, and only to fill a gap. Model
  // labels only: they read every story including the neutral ones, so their shares are of the whole wire, while the
  // headline word list only ever marks the stories that clearly lean.
  const byModel = (_item: WireItem, label: NewsLabel) => label.by !== "words";
  const now = countTones(today, labels, byModel);
  const total = totalOf(now);
  const wireLean = leanOf(now);
  if (total >= MIN_LABELLED && (wireLean === "positive" || wireLean === "negative")) {
    const pct = balancePct({ ...now });
    const before = countTones(yesterday, labels, byModel);
    const beforePct = totalOf(before) >= MIN_LABELLED ? balancePct({ ...before }) : null;
    const negative = wireLean === "negative";
    const share = negative ? pct.negative : pct.positive;
    const was = beforePct ? (negative ? beforePct.negative : beforePct.positive) : null;
    insights.push({
      id: "balance",
      tone: negative ? "down" : "up",
      figure: { value: `${share}%`, label: `of stories ${negative ? "negative" : "positive"}`, tone: negative ? "down" : "up" },
      text: `${share}% of the last day's stock news read ${negative ? "negative" : "positive"}${was !== null ? `, against ${was}% the day before` : ""}.`,
    });
  }

  const shown = pickInsights(insights, 3);
  const stories = today.length;
  // The source and the time only: how each headline's tone was read is mechanics, not news (owner rule 8).
  const source = `${stories.toLocaleString("en-US")} stories from ${input.sources} ${input.sources === 1 ? "source" : "sources"}`;
  return { headline, ...(sub ? { sub } : {}), headlineTickers: [leader.ticker], insights: shown, source, asOf: input.asOf };
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
  /** Labelled share of today's stories (the model's labels only), so a page can tell when the labels are behind. */
  labelledShare: number | null;
  /** Share of today's stories with any tone, the model's or the headline word list's. */
  tonedShare: number | null;
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
    // The read is about the stories, so it is as fresh as the newest one, not as the tone labels.
    asOf: source.newestAt ?? source.labelledAt,
    labelledBy: source.labelledBy,
    filters,
  });
  const labelled = today.filter((item) => source.labels[item.id] && source.labels[item.id]!.by !== "words").length;
  const toned = today.filter((item) => source.labels[item.id]).length;
  return { today, yesterday, buzz, themes, read, labelledShare: sharePct(labelled, today.length), tonedShare: sharePct(toned, today.length) };
}
