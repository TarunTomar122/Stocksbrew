/**
 * The wire, read by company: who is in the news today, how much real coverage
 * they got, how the stock is moving, and the few headlines worth reading.
 * Pure, so the grouping and the noise rules can be tested without a store.
 */

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
    const ordered = [...group.items].sort(better);
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
