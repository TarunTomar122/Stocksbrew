import type { BriefingEvidence, BriefingItem, BriefingKind, BriefingRelation, BriefingSections } from "@/lib/briefing";
import { asSentence, companyFirstMove, firstFullSentence, hasTitleCaseLeftover } from "@/lib/plain-copy";

/**
 * The briefing grouped by stock. The builder makes one item per event, so a
 * busy stock used to fill the list with its own rows: the call changed, it is
 * up 8%, an analyst cut the target, a news story. Here every stock gets one
 * group (a header with the day's move and the call) and its events become
 * short lines under it. Pure: no React, no I/O, so it is tested on its own.
 */

/** Lines a stock that needs a decision shows before folding the rest behind "+N". */
export const GROUP_VISIBLE_LINES = 2;
/** Everywhere else a stock is one row: its most important update. */
export const COMPACT_VISIBLE_LINES = 1;
/** Earnings this close on a holding are a decision, not a calendar entry. */
export const DECISION_EARNINGS_DAYS = 2;
/** The key of the group that holds items not tied to one stock (a standing job). */
export const MARKET_GROUP_KEY = "__market";

export type BriefingLineSource = { source: string; at: string | null; url: string | null };

export type BriefingLine = {
  /** The id of the line's main item. */
  id: string;
  item: BriefingItem;
  /** Short tag for what kind of update this is: "Call", "Move", "News", "Analyst". */
  label: string;
  /** The line's text, without the ticker the group header already names. */
  text: string;
  /** A real decision for the person: the line says what to decide. */
  decision: boolean;
  /**
   * Items folded into this line: the same headline seen twice, or the news
   * story that is the confirmed reason for the move. Acting on the line acts on these too.
   */
  folded: BriefingItem[];
  /** The news item that explains this move, when it is in the same group. */
  explainedBy: BriefingItem | null;
  source: BriefingLineSource | null;
};

export type BriefingGroup = {
  /** The ticker, or MARKET_GROUP_KEY. */
  key: string;
  ticker: string | null;
  name: string;
  relation: BriefingRelation;
  /** The current research call, when the builder knows it. */
  call: string | null;
  day_change_pct: number | null;
  price: number | null;
  /** When the move in the header was measured. */
  as_of: string | null;
  /**
   * A price move with no confirmed reason, shown as the header's move instead of
   * its own line. Null when the move has a reason or is the group's only update.
   */
  headerMove: BriefingItem | null;
  /** In urgency order, after dedupe. */
  lines: BriefingLine[];
  /** Every item in the group, folded ones included: what a group action acts on. */
  items: BriefingItem[];
  needs_you: boolean;
};

const RELATION_RANK: Record<BriefingRelation, number> = { holding: 0, watching: 1, market: 2 };
const SEVERITY_RANK: Record<BriefingItem["severity"], number> = { high: 0, medium: 1, low: 2 };
/** Within one stock, the order lines read in when urgency ties. */
const KIND_RANK: Record<BriefingKind, number> = {
  agent_job: 0,
  alert_triggered: 1,
  call_changed: 2,
  zone_entered: 3,
  earnings_reported: 4,
  price_move: 5,
  filing: 6,
  technical: 7,
  news: 8,
  congress_trade: 9,
  discussion_spike: 10,
  earnings_upcoming: 11,
};

const KIND_TAG: Record<BriefingKind, string> = {
  price_move: "Move",
  call_changed: "Call",
  zone_entered: "Zone",
  earnings_upcoming: "Earnings",
  earnings_reported: "Earnings",
  congress_trade: "Congress",
  news: "News",
  alert_triggered: "Alert",
  discussion_spike: "Social",
  filing: "Filing",
  technical: "Chart",
  agent_job: "Job",
};

const ANALYST_RE = /\b(analysts?|price target|target price|target (?:cut|raised|lowered|to)|upgrade[sd]?|downgrade[sd]?|initiat(?:es|ed) coverage)\b/i;

/**
 * A real decision: our call changed on something you hold, a holding just
 * entered a zone the research named, your own alert fired, or a holding
 * reports earnings within two days. A stock you only watch sitting in its add
 * zone, or one that was already there yesterday, is worth knowing: on a down
 * day that is half the list, and nobody can act on all of it.
 */
export function isDecision(item: BriefingItem): boolean {
  switch (item.kind) {
    case "call_changed":
      return item.relation === "holding";
    case "zone_entered":
      return item.relation === "holding" && item.needs_you;
    case "alert_triggered":
      return item.relation !== "market";
    case "earnings_upcoming":
      return item.relation === "holding" && item.deadline_days != null && item.deadline_days <= DECISION_EARNINGS_DAYS;
    default:
      return false;
  }
}

/** Urgency alone: a decision first, then what needs you, what is owned, deadlines, severity. */
function urgency(a: BriefingItem, b: BriefingItem): number {
  const aDecision = isDecision(a);
  if (aDecision !== isDecision(b)) return aDecision ? -1 : 1;
  if (a.needs_you !== b.needs_you) return a.needs_you ? -1 : 1;
  const relation = RELATION_RANK[a.relation] - RELATION_RANK[b.relation];
  if (relation !== 0) return relation;
  const aDeadline = a.deadline_days != null;
  const bDeadline = b.deadline_days != null;
  if (aDeadline !== bDeadline) return aDeadline ? -1 : 1;
  if (aDeadline && bDeadline && a.deadline_days !== b.deadline_days) {
    return (a.deadline_days as number) - (b.deadline_days as number);
  }
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

function lineOrder(a: BriefingItem, b: BriefingItem): number {
  return urgency(a, b) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id.localeCompare(b.id);
}

/** A move the research could not explain: it says nothing the header's figure does not. */
export function isReasonlessMove(item: BriefingItem): boolean {
  return item.kind === "price_move" && item.reason_status !== "confirmed";
}

export function lineLabel(item: BriefingItem): string {
  if (item.kind === "technical" && (ANALYST_RE.test(item.headline) || item.evidence.some((entry) => ANALYST_RE.test(entry.label)))) {
    return "Analyst";
  }
  return KIND_TAG[item.kind];
}

/**
 * Call words as a reader sees them (owner rule): Buy more, Keep, Sell some. Briefings saved before the builder
 * wrote these still carry the pipeline's Accumulate, Hold, Trim or Avoid, so the words are mapped here too.
 */
const CALL_WORDS: Record<string, string> = { accumulate: "Buy more", buy: "Buy more", add: "Buy more", hold: "Keep", watch: "Keep", trim: "Sell some", avoid: "Sell some", sell: "Sell some", reduce: "Sell some" };

export function plainCallWord(word: string | null | undefined): string {
  const value = (word ?? "").trim();
  return CALL_WORDS[value.toLowerCase()] ?? value;
}

/** "from Trim to Accumulate" -> "from Sell some to Buy more": only the call words themselves. */
function plainCallPhrase(text: string): string {
  return text.replace(/\b(Accumulate|Hold|Trim|Avoid)\b/g, (word) => plainCallWord(word));
}

function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The line's words, with the ticker the header already shows taken out. */
export function lineText(item: BriefingItem): string {
  const ticker = item.ticker;
  const headline = item.headline.trim();
  if (item.kind === "price_move") {
    // No reason found: nothing to write; the row keeps its ticker and move (owner, Nov 11).
    if (item.reason_status !== "confirmed") return "";
    // One complete sentence on the row; the rest of the reason opens with it.
    return asSentence(firstFullSentence(item.why)) || headline;
  }
  if (item.kind === "news" && ticker) {
    const stripped = headline.replace(new RegExp(`^News on ${escapeRe(ticker)}:\\s*`), "");
    if (stripped !== headline) return stripped;
  }
  if (item.kind === "call_changed" && ticker) {
    const match = new RegExp(`^The call on ${escapeRe(ticker)} changed (.+)$`).exec(headline);
    if (match) return `Our call moved ${plainCallPhrase(match[1]!)}.`;
  }
  if (item.kind === "earnings_reported") {
    // "and is up 14.10% today": the header already shows the move.
    return capitalise(stripTicker(item).replace(/,? and is (?:up|down) [\d.]+% \w+$/, ""));
  }
  if (ticker && headline.startsWith(`${ticker} `)) return capitalise(stripTicker(item));
  return headline;
}

/**
 * A confirmed move's row: the reason with the company first ("Acadia rose after revenue that beat expectations.").
 * When that still reads like a headline ("Take-Two rose after GTA VI Preorders"), the reason's next whole sentence
 * says it better, so it is used instead when it is a readable length.
 */
export function moveRowText(item: BriefingItem, company: { name: string; ticker?: string | null }, pct: number | null): string {
  const lead = lineText(item);
  if (item.kind !== "price_move" || item.reason_status !== "confirmed") return lead;
  const turned = companyFirstMove(lead.replace(/[.!]$/, ""), item.day_change_pct ?? pct, { company: { name: company.name, ticker: company.ticker ?? undefined } });
  const text = turned ? `${turned}.` : lead;
  if (!hasTitleCaseLeftover(text, company.name)) return text;
  const why = item.why.trim().replace(/\s+/g, " ");
  const first = firstFullSentence(why);
  const next = asSentence(firstFullSentence(why.slice(first.length).trim()));
  return usableReplacement(next, company) ? next : text;
}

/**
 * A sentence that can stand in for a headline-like reason on its own: a readable length, not a headline itself,
 * naming the company (or its ticker), and not leaning on the sentence before it ("This", "It", "The company").
 */
export function usableReplacement(sentence: string, company: { name: string; ticker?: string | null }): boolean {
  if (!sentence || sentence.length > 240 || hasTitleCaseLeftover(sentence, company.name)) return false;
  if (/^(?:this|that|these|those|it|its|they|their|the company|the stock|shares|also|meanwhile)\b/i.test(sentence)) return false;
  const first = company.name.split(/\s+/)[0]?.replace(/[^A-Za-z0-9&'’-]/g, "") ?? "";
  const names = [first, company.ticker ?? ""].filter((value) => value.length >= 2);
  return names.some((name) => new RegExp(`\\b${escapeRe(name)}`, "i").test(sentence));
}

/** The publisher behind a confirmed reason, to name beside it ("Reuters"). Null without one. */
export function reasonSource(item: BriefingItem): string | null {
  if (item.kind !== "price_move" || item.reason_status !== "confirmed") return null;
  // "News" and "Source" are placeholders for evidence with no link, not a publisher.
  return item.evidence.find((entry) => !isQuote(entry) && entry.source && !/^(?:news|source)$/i.test(entry.source))?.source ?? null;
}

function isQuote(entry: BriefingEvidence): boolean {
  return entry.source === "Market quote";
}

/** A zone headline saved before the plain words: "in its add zone: $20, below $21" -> "below its buy-more price: $20, under $21". */
function plainZone(text: string): string {
  return text
    .replace(/\b(still )?in its add zone: (\S+), below\b/, (_, still = "", price) => `${still}below its buy-more price: ${price}, under`)
    .replace(/\b(still )?in its trim zone: (\S+), above\b/, (_, still = "", price) => `${still}above its sell-some price: ${price}, over`)
    .replace(/\bits add level\b/, "its buy-more level");
}

/** "below its buy-more price: $20.00, under $21" -> "At $20.00, it is under the buy-more price of $21." */
function zoneSentence(text: string): string {
  const match = /^(still )?(below|above) its (buy-more|sell-some) price: (\$[\d,.]+), (?:under|over) (\$[\d,.]+)$/.exec(text);
  if (!match) return `${capitalise(text)}.`;
  const [, still = "", side, which, price, level] = match;
  return `At ${price}, it is ${still}${side === "below" ? "under" : "over"} the ${which} price of ${level}.`;
}

/** The headline as a predicate of the ticker beside it: "CBRS is in its add zone: $20" -> "In its add zone: $20". */
function stripTicker(item: BriefingItem): string {
  const headline = item.headline.trim().replace(/\.$/, "");
  const rest = item.ticker && headline.startsWith(`${item.ticker} `) ? headline.slice(item.ticker.length + 1) : headline;
  return rest.replace(/^is (?=\S)/, "");
}

/**
 * The decision in one plain sentence: what happened and that it is yours. No question at the end (owner, Nov 11):
 * the card says what changed, the opened card says what to check. Null when the item is not a decision.
 */
export function decisionText(item: BriefingItem): string | null {
  if (!isDecision(item)) return null;
  switch (item.kind) {
    case "call_changed": {
      const to = plainCallWord(item.metric);
      return to ? `Our call moved to ${to}, and you hold it.` : "Our call changed, and you hold it.";
    }
    case "zone_entered":
      return zoneSentence(plainZone(stripTicker(item)));
    case "alert_triggered":
      return `${capitalise(stripTicker(item))}. Your alert fired.`;
    case "earnings_upcoming":
      return `${capitalise(stripTicker(item))}, and you hold it.`;
    default:
      return null;
  }
}

/** Who said it and when: the first real source, skipping the price quote when there is a better one. */
export function lineSource(item: BriefingItem): BriefingLineSource | null {
  const entry = item.evidence.find((candidate) => !isQuote(candidate)) ?? item.evidence[0];
  if (!entry) return item.as_of ? { source: "", at: item.as_of, url: null } : null;
  return { source: entry.source, at: entry.at ?? item.as_of, url: entry.url };
}

function normUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[#?].*$/, "")
    .replace(/\/+$/, "");
}

function normText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

/** A confirmed move whose sources include this news story: the story is the reason. */
function explains(move: BriefingItem, news: BriefingItem): boolean {
  if (move.kind !== "price_move" || move.reason_status !== "confirmed" || news.kind !== "news") return false;
  const story = news.evidence[0];
  if (!story) return false;
  const url = normUrl(story.url);
  const title = normText(story.label);
  return move.evidence.some(
    (entry) => !isQuote(entry) && ((url && normUrl(entry.url) === url) || (title.length > 12 && normText(entry.label) === title)),
  );
}

function bestRelation(items: BriefingItem[]): BriefingRelation {
  return items.reduce<BriefingRelation>(
    (best, item) => (RELATION_RANK[item.relation] < RELATION_RANK[best] ? item.relation : best),
    "market",
  );
}

function buildGroup(key: string, items: BriefingItem[]): BriefingGroup {
  const sorted = [...items].sort(lineOrder);
  const isMarket = key === MARKET_GROUP_KEY;

  // The header's move: the price move if there is one, else any item that carries the day's change.
  const move = sorted.find((item) => item.kind === "price_move") ?? null;
  const carrier = move ?? sorted.find((item) => item.day_change_pct != null) ?? null;

  // A reasonless move folds into the header, unless it is all the group has to say.
  const headerMove = !isMarket && move && isReasonlessMove(move) && sorted.length > 1 ? move : null;

  const lines: BriefingLine[] = [];
  const byText = new Map<string, BriefingLine>();
  const byStory = new Map<string, BriefingLine>();
  const news = sorted.filter((item) => item.kind === "news");
  const claimedNews = new Set<string>();

  for (const item of sorted) {
    if (item === headerMove) continue;
    if (claimedNews.has(item.id)) continue;

    const decision = decisionText(item);
    const text = decision ?? lineText(item);
    const textKey = normText(text);
    const storyKey = item.kind === "news" ? normUrl(item.evidence[0]?.url) : "";
    const twin = (textKey && byText.get(textKey)) || (storyKey && byStory.get(storyKey)) || null;
    if (twin) {
      twin.folded.push(item);
      continue;
    }

    const line: BriefingLine = {
      id: item.id,
      item,
      label: lineLabel(item),
      text,
      decision: decision != null,
      folded: [],
      explainedBy: null,
      source: lineSource(item),
    };
    const story = news.find((candidate) => !claimedNews.has(candidate.id) && explains(item, candidate));
    if (story) {
      claimedNews.add(story.id);
      line.explainedBy = story;
      line.folded.push(story);
      // Already shown as its own line (ordering put it first): take that line back out.
      const shown = lines.findIndex((existing) => existing.item.id === story.id);
      if (shown >= 0) {
        const [old] = lines.splice(shown, 1);
        line.folded.push(...old.folded);
        for (const map of [byText, byStory]) {
          for (const [mapKey, value] of map) if (value === old) map.set(mapKey, line);
        }
      }
    }
    lines.push(line);
    if (textKey) byText.set(textKey, line);
    if (storyKey) byStory.set(storyKey, line);
    if (story) {
      const linkedUrl = normUrl(story.evidence[0]?.url);
      if (linkedUrl) byStory.set(linkedUrl, line);
      byText.set(normText(lineText(story)), line);
    }
  }

  const head = sorted[0];
  const named = sorted.find((item) => item.name && item.name !== item.ticker) ?? head;
  return {
    key,
    ticker: isMarket ? null : key,
    // Today the only items with no stock are standing jobs; anything else is market-wide.
    name: isMarket ? (sorted.every((item) => item.kind === "agent_job") ? "Your jobs" : "Market") : named?.name ?? key,
    relation: bestRelation(sorted),
    call: sorted.find((item) => item.call)?.call ?? null,
    day_change_pct: isMarket ? null : carrier?.day_change_pct ?? null,
    price: isMarket ? null : carrier?.price ?? null,
    // The quote's own time: an update that only carries the move (a story, a Reddit post) has its own time in as_of.
    as_of: isMarket ? null : carrier ? (carrier.price_as_of !== undefined ? carrier.price_as_of : carrier.as_of) : null,
    headerMove,
    lines,
    items: sorted,
    needs_you: sorted.some((item) => item.needs_you),
  };
}

function compareGroups(a: BriefingGroup, b: BriefingGroup): number {
  // Items not tied to a stock stay at the top, where they always were.
  if ((a.key === MARKET_GROUP_KEY) !== (b.key === MARKET_GROUP_KEY)) return a.key === MARKET_GROUP_KEY ? -1 : 1;
  const top = urgency(a.items[0], b.items[0]);
  if (top !== 0) return top;
  const size = Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
  if (size !== 0) return size;
  return a.key.localeCompare(b.key);
}

/** One group per stock, most urgent first; items with no ticker share one "Market" group. */
export function groupBriefingItems(items: readonly BriefingItem[]): BriefingGroup[] {
  const buckets = new Map<string, BriefingItem[]>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const key = item.ticker.trim().toUpperCase() || MARKET_GROUP_KEY;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.entries()].map(([key, bucket]) => buildGroup(key, bucket)).sort(compareGroups);
}

/** The lines a group shows: the first few, then the rest behind "N more" until it is opened. */
export function visibleLines<T>(lines: readonly T[], expanded: boolean, limit = GROUP_VISIBLE_LINES): { shown: T[]; hidden: number } {
  if (expanded || lines.length <= limit) return { shown: [...lines], hidden: 0 };
  return { shown: lines.slice(0, limit), hidden: lines.length - limit };
}

export type GroupedSections = {
  needs_you: BriefingGroup[];
  worth_knowing: BriefingGroup[];
  coming_up: BriefingGroup[];
  settled: BriefingGroup[];
};

type SectionInput = Pick<BriefingSections, "needs_you" | "worth_knowing" | "coming_up" | "kept" | "dismissed">;

const tickerOf = (item: BriefingItem) => item.ticker.trim().toUpperCase();

/**
 * Every section grouped by stock.
 *
 * Your own briefing: "Needs you" holds only stocks with a real decision
 * (see `isDecision`), and such a stock takes its other updates with it so it
 * is one group in one place. Everything else is "Worth knowing". Dated events
 * that are not decisions stay under "Coming up", which reads as a calendar.
 *
 * The market view has no decisions; its lead list is the biggest explained moves.
 */
export function groupBriefingSections(sections: SectionInput, mode: "personal" | "market" = "personal"): GroupedSections {
  const settled = groupBriefingItems([...sections.kept, ...sections.dismissed]);
  if (mode === "market") {
    const lead = new Set(sections.needs_you.map(tickerOf).filter(Boolean));
    const follows = (item: BriefingItem) => lead.has(tickerOf(item));
    return {
      needs_you: groupBriefingItems([...sections.needs_you, ...sections.worth_knowing.filter(follows)]),
      worth_knowing: groupBriefingItems(sections.worth_knowing.filter((item) => !follows(item))),
      coming_up: groupBriefingItems(sections.coming_up),
      settled,
    };
  }
  const open = [...sections.needs_you, ...sections.worth_knowing, ...sections.coming_up];
  const deciding = new Set(open.filter(isDecision).map(tickerOf).filter(Boolean));
  const inNeeds = (item: BriefingItem) =>
    deciding.has(tickerOf(item)) && (item.kind !== "earnings_upcoming" || isDecision(item));
  return {
    needs_you: groupBriefingItems(open.filter(inNeeds)),
    worth_knowing: groupBriefingItems([...sections.needs_you, ...sections.worth_knowing].filter((item) => !inNeeds(item))),
    coming_up: groupBriefingItems(sections.coming_up.filter((item) => !inNeeds(item))),
    settled,
  };
}

/** "12 stocks", or "3 updates" when none of them is a stock. */
export function groupCountLabel(groups: readonly BriefingGroup[]): string {
  const stocks = groups.filter((group) => group.key !== MARKET_GROUP_KEY).length;
  if (stocks > 0) return `${stocks} ${stocks === 1 ? "stock" : "stocks"}`;
  const updates = groups.reduce((sum, group) => sum + group.items.length, 0);
  return `${updates} ${updates === 1 ? "update" : "updates"}`;
}
