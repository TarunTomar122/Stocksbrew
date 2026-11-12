/**
 * The wire, read by company: who is in the news today, how much real coverage
 * they got, how the stock is moving, and the few headlines worth reading.
 * Pure, so the grouping and the noise rules can be tested without a store.
 */

import { firstFullSentence } from "@/lib/plain-copy";
import type { NewsLabel, NewsLabels, ToneCounts } from "@/lib/wire-read";
import type { WireItem } from "@/lib/wire-shared";

export type CompanyGroup = {
  ticker: string;
  name: string | null;
  /** Today's move in percent, when the snapshot has one. */
  pct: number | null;
  /** Stories about this company in the window, after duplicates are removed. */
  count: number;
  /** The headlines to show, best first: publisher stories before press releases, newest first. */
  items: WireItem[];
  latestAt: string;
  /** A company the viewer follows. */
  mine: boolean;
  /** How its labelled stories lean; all zero when none are labelled yet. */
  tones: ToneCounts;
};

const PER_COMPANY = 3;
/** Company cards per "more" step on the wire: eight rows of two (owner rule 5: about eight rows), the rest a step away. */
export const COMPANY_PAGE = 16;
/** A press release counts for less than a story a publisher chose to write. */
const PRESS_RELEASE_WEIGHT = 0.3;
/** Below this a company is not worth a card (a single press release on a quiet stock), unless the viewer follows it. */
const MIN_SCORE = 1;

/**
 * Lowercase letters and digits only, with a trailing " - Reuters" or " | CNBC" removed, so the same story from
 * two feeds collapses to one key.
 */
export function titleKey(title: string): string {
  return title
    .replace(/\s+[-|–]\s+[A-Za-z][\w .&']{1,24}$/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Function words of the languages wire services publish alongside English. They count only in lowercase:
// mid-sentence function words are lowercase, while "Las Vegas", "MIT", "Con Edison" and "Das" are capitalised.
const FOREIGN_STOPWORDS: Record<string, readonly string[]> = {
  fr: ["le", "la", "les", "des", "du", "et", "pour", "avec", "sur", "au", "aux", "dans", "une", "est", "obtient", "annonce"],
  de: ["der", "die", "das", "und", "für", "mit", "auf", "wird", "nach", "bei", "ist", "ein", "eine", "zum", "zur", "erhöht", "gemäß"],
  es: ["el", "los", "las", "del", "y", "para", "con", "una", "en", "resultados", "anuncia", "trimestre"],
  pt: ["o", "os", "da", "do", "das", "dos", "e", "para", "com", "uma", "também", "resultados"],
};
// Words that are never English, so one is enough.
const NEVER_ENGLISH = new Set(["obtient", "marquage", "règlement", "für", "und", "wird", "avec", "anuncia", "erhöht", "gemäß", "também", "trimestre"]);
const ENGLISH_STOPWORDS = new Set(["the", "of", "to", "and", "for", "on", "in", "with", "as", "after", "its", "at", "by", "from"]);

/** True for headlines a reader of an English wire has no use for: the French, German, Spanish or Portuguese copies. */
export function isForeignLanguage(title: string): boolean {
  // Split on anything that is not a letter, so "é" and "ü" stay inside their words.
  const words = title.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.some((word) => NEVER_ENGLISH.has(word))) return true;
  const lower = words.filter((word) => word === word.toLowerCase());
  if (!lower.some((word) => ENGLISH_STOPWORDS.has(word))) {
    for (const list of Object.values(FOREIGN_STOPWORDS)) {
      const hits = new Set(lower.filter((word) => list.includes(word)));
      if (hits.size >= 2) return true;
    }
  }
  // A long headline that is mostly accented letters is not English either. Short names like "Société Générale" are.
  const letters = words.join("");
  if (letters.length < 20) return false;
  const accented = letters.replace(/[A-Za-z]/g, "").length;
  return accented / letters.length > 0.15;
}

/**
 * Headlines written to make someone click rather than to say what happened (owner rule 8): "Dear Nebius stock fans,
 * mark your calendars", "Nebius is rocketing 15% higher, here's what could move shares next", "Should you buy?",
 * "What you should know", a first-person pitch ("I'd buy…"), the "$1,000 investment" sums. The feed leaves them out,
 * or says the story with the publisher's own first sentence when that sentence is plain (`plainStory`).
 */
const BAIT_PATTERNS: RegExp[] = [
  /^dear\b/i,
  /\bhere['’]s\b|\bhere is\b/i,
  /\bshould you\b/i,
  /\bwhat you (?:should|need to) know\b/i,
  /\b(?:a )?buy (?:right )?now\b(?!,? pay later)/i,
  /\bthis much\b/i,
  /\b(?:rocketing|skyrocketing)\b/i,
  /^prediction:/i,
  // The "$1,000 investment" sums; a deal "worth $10 billion" is news and stays.
  /\$\s?\d[\d,]*k? investment\b|\bwould have made\b/i,
  // A first-person pitch opening the headline or one of its sentences ("I'd buy Dutch Bros…"); capital "I" only, and
  // not a quote after "says" or a colon ("Huang: I think…").
  /(?:^|[.!?]\s+)I(?:['’](?:d|m|ll|ve)| (?:just|would|will|think))\b/,
  // A question about what to do with the stock ("Is it time to sell or load up?", "Is it still a buy?", "Who's right?"),
  // not any question that mentions a sale ("Will the Fed hold rates?").
  /(?:\bis (?:it|now)\b|\ba (?:buy|sell)\b|\btime to\b|\btoo late\b|\bload up\b|\bhold or fold\b|\bwho['’]s right\b)[^?]*\?\s*$/i,
];

export function isBaitTitle(title: string): boolean {
  const text = title.trim();
  return BAIT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Publisher openers that only describe the coverage or the site ("Zacks.com users have been watching…", "is on the AI
 * Stocks Dominating List of Biggest Winners", "Key Takeaways"), never what happened.
 */
const BOILERPLATE = /zacks\.com|\blist of\b|key takeaways|get prepared|brokerage recommendation|right combination of|\bwe know about\b|\bworth (?:exploring|knowing)\b/i;

/**
 * The publisher's own first sentence, when it plainly says what happened: a full sentence ending in a full stop, eight
 * words or more, not itself bait or site boilerplate. Never anything we wrote: an empty string when there is none.
 */
export function plainExcerpt(item: Pick<WireItem, "excerpt" | "excerptOrigin">): string {
  if (!item.excerpt || !item.excerptOrigin) return "";
  const sentence = firstFullSentence(item.excerpt).trim();
  if (!/[a-z0-9%)]\.$/i.test(sentence) || sentence.length > 220) return "";
  if (sentence.split(/\s+/).length < 8) return "";
  // "Why investing for the long run could reap huge rewards." is a teaser, not what happened.
  if (/^(?:why|how|what|who|when|which)\b/i.test(sentence)) return "";
  if (isBaitTitle(sentence) || BOILERPLATE.test(sentence)) return "";
  return sentence;
}

/**
 * A story as the feed shows it: as it came when its headline says what happened; told by the publisher's plain first
 * sentence when the headline is bait; null (left out of the feed, still counted) when there is no such sentence.
 */
export function plainStory(item: WireItem): WireItem | null {
  if (!isBaitTitle(item.title)) return item;
  const sentence = plainExcerpt(item);
  return sentence ? { ...item, title: sentence } : null;
}

export function storyWeight(item: WireItem): number {
  return item.sourceKind === "press_release" ? PRESS_RELEASE_WEIGHT : 1;
}

/** A story about one company beats a roundup naming five; a publisher story beats a press release. */
export function storyRelevance(item: WireItem): number {
  return storyWeight(item) - 0.2 * Math.max(0, item.tickers.length - 1);
}

/** Sort order for headlines: the most relevant first, then the newest. */
export function better(a: WireItem, b: WireItem): number {
  const score = storyRelevance(b) - storyRelevance(a);
  if (Math.abs(score) > 1e-9) return score;
  return a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0;
}

/** The story's label as it bears on one stock it names: none when the label is about the other stock in it. */
export function labelFor(labels: NewsLabels | null | undefined, item: WireItem, ticker: string): NewsLabel | undefined {
  const label = labels?.[item.id];
  return label && (!label.ticker || label.ticker === ticker) ? label : undefined;
}

/**
 * Group the wire by the companies it names, since `sinceMs`. Each story counts
 * once per company even when several feeds carried it. Companies the viewer
 * follows come first; the rest are ranked by coverage plus how far the stock moved.
 */
export function groupByCompany(
  items: WireItem[],
  options: {
    sinceMs: number;
    quotes: Record<string, { pct: number | null; name: string }>;
    mine?: ReadonlySet<string> | null;
    labels?: NewsLabels | null;
  },
): CompanyGroup[] {
  const { sinceMs, quotes, mine = null, labels = null } = options;
  const byTicker = new Map<string, { items: WireItem[]; keys: Set<string>; score: number }>();
  for (const item of items) {
    const at = Date.parse(item.publishedAt);
    if (!Number.isFinite(at) || at < sinceMs || !item.tickers.length) continue;
    if (isForeignLanguage(item.title)) continue;
    const key = titleKey(item.title);
    if (!key) continue;
    for (const ticker of item.tickers) {
      const group = byTicker.get(ticker) ?? { items: [], keys: new Set<string>(), score: 0 };
      if (group.keys.has(key)) continue;
      group.keys.add(key);
      group.items.push(item);
      // A roundup naming five companies is a fifth of a story about each.
      group.score += storyWeight(item) * Math.max(0.25, 1 - 0.25 * (item.tickers.length - 1));
      byTicker.set(ticker, group);
    }
  }

  const groups: Array<CompanyGroup & { score: number }> = [];
  for (const [ticker, group] of byTicker) {
    const quote = quotes[ticker];
    const pct = quote && typeof quote.pct === "number" && Number.isFinite(quote.pct) ? quote.pct : null;
    const followed = Boolean(mine?.has(ticker));
    // A big move with even one story is news; a lone press release on a flat stock is not.
    // Capped, so a penny stock up 200% on one press release does not top the page.
    const score = group.score + (pct === null ? 0 : Math.min(Math.abs(pct), 15) * 0.5);
    if (!followed && score < MIN_SCORE) continue;
    // Every story counts above; only the ones that say what happened are shown (bait headlines are left out, or told by
    // the publisher's plain first sentence). A company with none of those has no card (it would be a card of nothing),
    // unless the viewer follows it: then its card stays, with its move and story count.
    const ordered = group.items.map(plainStory).filter((item): item is WireItem => item !== null).sort(better);
    if (!ordered.length && !followed) continue;
    const tones = { positive: 0, negative: 0, neutral: 0 };
    for (const item of group.items) {
      const label = labelFor(labels, item, ticker);
      if (label) tones[label.tone] += 1;
    }
    groups.push({
      ticker,
      name: quote?.name && quote.name !== ticker ? quote.name : null,
      pct,
      count: group.items.length,
      items: ordered.slice(0, PER_COMPANY),
      latestAt: group.items.reduce((latest, item) => (item.publishedAt > latest ? item.publishedAt : latest), ""),
      mine: followed,
      tones,
      score,
    });
  }

  return groups
    .sort(
      (a, b) =>
        Number(b.mine) - Number(a.mine) ||
        b.score - a.score ||
        (a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0) ||
        a.ticker.localeCompare(b.ticker),
    )
    .map(({ score: _score, ...group }) => group);
}

/**
 * Headlines about the market and the economy rather than one company: tagged
 * macro or policy, naming no ticker, written by a publisher, English, one copy
 * of each, newest first. Company stories that merely lack a ticker stay out.
 */
export function marketHeadlines(items: WireItem[], options: { sinceMs: number; limit?: number }): WireItem[] {
  const { sinceMs, limit = 10 } = options;
  const seen = new Set<string>();
  const out: WireItem[] = [];
  for (const item of [...items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))) {
    const at = Date.parse(item.publishedAt);
    if (!Number.isFinite(at) || at < sinceMs) continue;
    if (item.tickers.length || item.sourceKind === "press_release" || isForeignLanguage(item.title)) continue;
    if (!item.topics.some((topic) => topic === "macro" || topic === "policy")) continue;
    const key = titleKey(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
