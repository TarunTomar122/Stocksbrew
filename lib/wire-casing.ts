/**
 * The news page's headlines as a person would write them (owner rule 8), past what the shared `headlineCase` can
 * know on its own. `headlineCase` keeps any capitalised word it does not recognise, since it may be a name, so a
 * scraped headline like "SpaceX ordered equipment for a 100 GW Solar Manufacturing Line" or "Lisa Su just Delivered
 * Fantastic news" stays as it came. The day's own wire knows better: a word its other headlines write in lower case
 * at least as often as with a capital ("solar", "manufacturing", "delivered") is an ordinary word, while a name
 * ("Nvidia", "Huang", "Starmind") is almost never written in lower case. Pure, no I/O.
 */
import { headlineCase, isBrandWord, isTitleCase, shortCompanyName } from "@/lib/plain-copy";

const WORD = /[A-Za-z](?:[A-Za-z]|['’](?=[A-Za-z]))*/g;

/** A capitalised ordinary-looking word: "Solar", "Driving", "Tech's". Not an acronym (AI) or a brand (iPhone, SpaceX). */
const TITLED = /^[A-Z][a-z]+(?:['’]s)?$/;

/**
 * Ordinary words that wire headlines capitalise mid-sentence ("Dear Nebius stock Fans, Mark your Calendars", "Lisa Su
 * just Delivered Fantastic news", "a $411 billion Anthropic Windfall", "13 Big funds") and that are seldom a name on
 * their own. Lowered like the words the day's wire teaches (`learnLowerWords`), so with the same guards: a word beside
 * a capital the wire never lowers, or beside a word only the day's wire knows, keeps its capital ("Mark Zuckerberg",
 * "Big Lots"), and so does one inside a company name on the page. Not "power", "energy", "tech", "trade", "real",
 * "progress" or "fourth": names and holidays lean on them too often ("The Trade Desk", "Fourth of July").
 */
const WIRE_ORDINARY = new Set(
  (
    "big bigger biggest fan fans mark calendar calendars deliver delivers delivered delivering fantastic upcoming " +
    "flight flights jitters windfall techs profitable unprofitable extremely racks rack cools package " +
    "packages vote votes voting pay stock stocks share shares jump jumps jumped soar soars soared slide slides slid " +
    "slip slips slipped fall falls rise rises climb climbs climbed tumble tumbles plunge plunges surge surges sink " +
    "sinks drop drops gain gains futures investors investor earnings results guidance outlook forecast demand " +
    "growth sales revenue profit rally record report reports market markets rate rates hike hikes cut cuts deal deals " +
    "why what how next move moves higher lower year week today price chip chips maker makers rival rivals boost " +
    "fears fear worries concerns bubble upside downside analyst analysts data center centers " +
    "quarter quarterly backlog outweigh outweighs ousting ignite ignites " +
    // Nov 12: "revokes Re-Entry of alleged spy" (a hyphen run of ordinary words is lowered whole), "Nvidia Turmoil".
    "re entry turmoil " +
    // Nov 12, the News page's cards: "stock Crashes 20% as … plans Rattle investors", "stocks Edge higher as Anthropic
    // Ties deepen", "Cohesity Earns Cisco top Durable growth", "still Implies 126% upside", "worries Linger", "analyst
    // Trims Intel", "Is the selloff Overdone?", "Structural Reality, Prompting Me". Beside a capital the guards below
    // still keep most of them ("Chinese Parts", "Huang Remark"), in case the pair is a name.
    "crash crashes crashed rattle rattles rattled edge edges edged tie ties earn earns earned commit commits committed " +
    "durable implies imply implied parts linger lingers lingering remark remarks trim trims trimmed overdone selloff " +
    "structural reality prompting prompts me weakness strength spending plans plan warns warned rebound rebounds " +
    "upgrade upgrades upgraded downgrade downgrades downgraded alive"
  ).split(" "),
);

/**
 * The ordinary words that, right after a name, are that name's verb rather than more of it: "Google Commits $10
 * billion", "Cohesity Earns Cisco award", "analyst Trims Intel target". Beside a capital they are still lowered, where
 * another ordinary word would keep its capital in case the pair is a name ("Rocket Lab", "General Motors").
 */
const NAME_VERBS = new Set(
  (
    "earns commits ties trims crashes rattles implies lingers warns rebounds upgrades downgrades jumps soars rises " +
    "climbs tumbles plunges surges hikes delivers ignites outweighs"
  ).split(" "),
);

/**
 * Words that are a move after a name ("Rocket Lab Falls 5%", "stocks Edge higher") but a noun inside one ("Sioux Falls
 * plant", "Kitchen Sinks maker", "Galaxy S25 Edge", "Google Slides"): lowered beside a capital only when what follows
 * reads as the move (`MOVE_AFTER`). "Edge" is new to the ordinary words and needs that context everywhere.
 */
const MOVE_NOUNS = new Set("falls sinks slides drops gains cuts edge edges".split(" "));
const CONTEXT_ONLY = new Set(["edge", "edges"]);
const MOVE_AFTER = /^ (?:\$?\d|(?:to|on|after|as|higher|lower|up|down|out|past|amid|over|from|in|below|above|toward|towards|despite|while|ahead|closer)\b)/;

/** Days and months: "in May", "could March higher" are too close to call, so they always keep their capital. */
const DAY_OR_MONTH = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/;

function bare(word: string): string {
  return word.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");
}

type Token = { word: string; offset: number };

function tokens(text: string): Token[] {
  return [...text.matchAll(WORD)].map((match) => ({ word: match[0], offset: match.index ?? 0 }));
}

/** True when the word starts a clause: the headline's first word, or after a colon, full stop, bracket, quote or dash. */
function startsClause(text: string, list: Token[], index: number): boolean {
  // The first word starts the headline, unless a figure comes before it ("13 Big funds sold…").
  if (index === 0) return !/\d[\d,.%]*\s+$/.test(text.slice(0, list[0]!.offset));
  const prev = list[index - 1]!;
  const gap = text.slice(prev.offset + prev.word.length, list[index]!.offset);
  return /[:.!?(“"‘'—–|]\s*$/.test(gap) || /(?:^|\s)-{1,2}\s*$/.test(gap);
}

/**
 * The words the day's writing puts in lower case, mid-sentence, at least `min` times and more often than with a
 * capital away from the start of a clause. Fed the headlines that were not Title Case at source and the stories'
 * excerpts (prose, where a name keeps its capital and an ordinary word does not); a Title Case headline's capitals
 * say nothing about a word, so the caller leaves those out. Headlines are taken as they came: the few strays in
 * them are outnumbered by the same words in lower case elsewhere.
 */
export function learnLowerWords(titles: Iterable<string>, min = 2): Set<string> {
  const lower = new Map<string, number>();
  const upper = new Map<string, number>();
  for (const title of titles) {
    const list = tokens(title);
    list.forEach((token, index) => {
      if (token.word.length < 3 || startsClause(title, list, index)) return;
      const key = bare(token.word);
      if (/^[a-z]/.test(token.word)) lower.set(key, (lower.get(key) ?? 0) + 1);
      else if (TITLED.test(token.word)) upper.set(key, (upper.get(key) ?? 0) + 1);
    });
  }
  const out = new Set<string>();
  // A word seen with a capital mid-sentence must be lowered more often than not ("arm" once and "Arm" once is a tie,
  // and a tie keeps the capital); one never seen with a capital needs only `min` sightings.
  for (const [key, count] of lower) {
    const capped = upper.get(key) ?? 0;
    if (count >= min && (capped === 0 || count > capped)) out.add(key);
  }
  return out;
}

/** One pattern for every company name on the page, longest first, so a span is found in one pass. */
function namePattern(names: readonly string[]): RegExp | null {
  const parts = [...new Set(names.filter((name) => name.length >= 3))].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return parts.length ? new RegExp(`(?<![A-Za-z0-9])(?:${parts.join("|")})(?![A-Za-z0-9])`, "g") : null;
}

/** The spans of `text` that are a company's name ("First Solar", "Advanced Micro Devices"), as written there. */
function nameSpans(text: string, pattern: RegExp | null): Array<[number, number]> {
  if (!pattern) return [];
  return [...text.matchAll(pattern)].map((match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as [number, number]);
}

/** Words that end a company's legal name: the capitalised words just before one are that name ("Global Asset Management Group"). */
const NAME_END = new Set(["inc", "corp", "corporation", "llc", "llp", "ltd", "plc", "group", "holdings", "company", "companies", "co", "trust", "fund", "partners"]);

/**
 * The tokens that are part of a company's name by their shape: the capitalised run right before a ticker in brackets
 * ("ZIM Integrated Shipping Services (ZIM)") or before a legal ending ("Honeywell Aerospace, Inc.").
 */
function namedByShape(text: string, list: Token[]): Set<number> {
  const keep = new Set<number>();
  const walkBack = (from: number) => {
    for (let index = from; index >= 0; index -= 1) {
      const token = list[index]!;
      if (!/^[A-Z]/.test(token.word)) break;
      keep.add(index);
      const gap = index > 0 ? text.slice(list[index - 1]!.offset + list[index - 1]!.word.length, token.offset) : "";
      if (!/^(?:\s|\s?&\s?|,\s)$/.test(gap)) break;
    }
  };
  list.forEach((token, index) => {
    const after = text.slice(token.offset + token.word.length);
    if (/^\s*\((?:NASDAQ:\s*|NYSE:\s*)?[A-Z][A-Z.\-]{0,6}\)/.test(after)) walkBack(index);
    if (NAME_END.has(token.word.toLowerCase()) && /^[A-Z]/.test(token.word) && index > 0) walkBack(index);
  });
  return keep;
}

/**
 * One headline with the capitals `lowerWords` (the day's learned words) or `fixedWords` (WIRE_ORDINARY) mark as
 * ordinary lowered. A word keeps its capital when it starts a clause, is joined to a figure ("Q3") or by a hyphen to a
 * word that is not ordinary ("Coca-Cola"; a run of ordinary words like "Data-Center" is lowered whole), is a day, a
 * month or a brand-like word ("Target"), sits inside a company name on the page or a name shaped like one (before a
 * bracketed ticker or a legal ending like "Inc." or "Group"), stands beside a capitalised word the wire never writes
 * in lower case (that pair may be a name: "General Motors", "Rocket Lab"), or stands beside a capitalised ordinary
 * word only the other list knows ("Big Lots", "Progress Software": a fixed word beside a learned one may be a name).
 */
export function lowerOrdinaryCapitals(
  text: string,
  lowerWords: ReadonlySet<string>,
  names: readonly string[] | RegExp | null = [],
  fixedWords: ReadonlySet<string> = new Set(),
): string {
  if (!text || (lowerWords.size === 0 && fixedWords.size === 0)) return text;
  const list = tokens(text);
  const spans = nameSpans(text, Array.isArray(names) ? namePattern(names) : (names as RegExp | null));
  const shaped = namedByShape(text, list);
  const inName = (token: Token) => spans.some(([from, to]) => token.offset >= from && token.offset + token.word.length <= to);
  const learned = (token: Token) => lowerWords.has(bare(token.word));
  const fixed = (token: Token) => fixedWords.has(bare(token.word));
  const ordinary = (token: Token | undefined) => Boolean(token) && TITLED.test(token!.word) && (learned(token!) || fixed(token!));
  // Two capitalised ordinary words side by side are lowered only when one list knows both ("Flight Jitters", or two
  // learned words), never on the word of one list and the word of the other, which may be a name ("Big Lots").
  const mixedPair = (token: Token, other: Token | undefined, gap: string) =>
    Boolean(other) && /^ $/.test(gap) && ordinary(other) && !((learned(token) && learned(other!)) || (fixed(token) && fixed(other!)));
  // A capitalised neighbour the wire never lowers, joined by a single space: possibly the rest of a name ("Model Y"
  // too). Not an acronym ("100 GW Solar", "AI Firms"): beside one, an ordinary word is still ordinary.
  const nameBeside = (token: Token | undefined, gap: string) =>
    Boolean(token) && /^ $/.test(gap) && /^[A-Z](?:[a-z]|$)/.test(token!.word) && !ordinary(token) && !DAY_OR_MONTH.test(bare(token!.word));
  // Capitalised words joined by hyphens ("Data-Center", "Fourth-Quarter") are lowered together when every part is an
  // ordinary word and the run neither starts a clause nor sits in a name; otherwise the hyphen keeps them ("Coca-Cola").
  const compound = list.map(() => false);
  for (let start = 0; start < list.length; ) {
    let end = start;
    while (end + 1 < list.length && text.slice(list[end]!.offset + list[end]!.word.length, list[end + 1]!.offset) === "-") end += 1;
    if (end > start) {
      const run = list.slice(start, end + 1);
      const lowerRun =
        run.every((token) => ordinary(token) && !isBrandWord(token.word) && !inName(token)) &&
        !startsClause(text, list, start) &&
        !/\d-?$/.test(text.slice(0, run[0]!.offset)) &&
        !shaped.has(start);
      if (lowerRun) for (let index = start; index <= end; index += 1) compound[index] = true;
    }
    start = end + 1;
  }
  const out: string[] = [];
  let cursor = 0;
  list.forEach((token, index) => {
    const prev = list[index - 1];
    const next = list[index + 1];
    const before = prev ? text.slice(prev.offset + prev.word.length, token.offset) : "";
    const after = next ? text.slice(token.offset + token.word.length, next.offset) : "";
    const end = token.offset + token.word.length;
    const lower =
      compound[index] ||
      // "Re" only ever inside a hyphen run of ordinary words ("Re-Entry"); alone it may be a name ("Re/Max", "Everest Re").
      (ordinary(token) &&
      bare(token.word) !== "re" &&
      !startsClause(text, list, index) &&
      !/[\d-]$/.test(text.slice(0, token.offset)) &&
      !/^[\d-]/.test(text.slice(end)) &&
      // A figure after it names a thing: "Phase 1", "Electronica 2026". A share is a move, not a name: "Crashes 20%".
      (!/^ \d/.test(text.slice(end)) || /^ \d[\d,.]*%/.test(text.slice(end))) &&
      !DAY_OR_MONTH.test(bare(token.word)) &&
      !isBrandWord(token.word) &&
      !inName(token) &&
      !shaped.has(index) &&
      // The word after a headline's opening capitals is often the rest of a name: "ODDITY Tech reports", "GFL Environmental falls".
      !(index === 1 && /^[A-Z]{2,}$/.test(list[0]!.word)) &&
      (!CONTEXT_ONLY.has(bare(token.word)) || MOVE_AFTER.test(text.slice(end))) &&
      (NAME_VERBS.has(bare(token.word)) ||
        (MOVE_NOUNS.has(bare(token.word)) && MOVE_AFTER.test(text.slice(end))) ||
        (!nameBeside(prev, before) && !nameBeside(next, after))) &&
      !mixedPair(token, prev, before) &&
      !mixedPair(token, next, after) &&
      // "Bank of Japan", "Department of Energy": a capital before "of" and a name is part of that name.
      !(next && after === " " && next.word === "of" && nameBeside(list[index + 2], list[index + 2] ? text.slice(next.offset + 2, list[index + 2]!.offset) : "")));
    out.push(text.slice(cursor, token.offset), lower ? token.word.toLowerCase() : token.word);
    cursor = end;
  });
  out.push(text.slice(cursor));
  return out.join("");
}

/** The last few vocabularies learned, by the caller's key for the wire they came from, so a reload does not learn one again. */
const learned = new Map<string, Set<string>>();
const LEARNED_KEEP = 8;

/**
 * The wire's headlines in sentence case: `headlineCase` first (Title Case, desk tags, the known strays), then the
 * capitals the day's own writing shows to be ordinary words. `nameOf` gives each ticker's company name; the names of
 * the companies a headline is tagged with, and every name on the page, always keep their capitals. A press release or
 * official filing keeps the shared casing only. Only the items `shown` picks are cased (the rest are returned as they
 * came), since only those reach the page; the vocabulary is learned from every item, and kept for the next call with
 * the same `key` (the wire's newest time and size, say). Returns new items where a title changed.
 */
export function caseWireHeadlines<T extends { title: string; tickers: string[]; excerpt?: string; sourceKind?: string }>(
  items: readonly T[],
  nameOf: Record<string, string | null | undefined> = {},
  options: { shown?: (item: T) => boolean; key?: string } = {},
): T[] {
  const short = (name: string | null | undefined) => shortCompanyName(name ?? "");
  const kept = options.key ? learned.get(options.key) : undefined;
  const lowerWords =
    kept ??
    // Once is enough with a capital never seen away from a clause start: a name is written with its capital every time.
    learnLowerWords([...items.map((item) => item.title).filter((title) => !isTitleCase(title)), ...items.map((item) => item.excerpt ?? "").filter(Boolean)], 1);
  if (options.key && !kept) {
    learned.set(options.key, lowerWords);
    // The oldest goes first (a Map keeps insertion order).
    if (learned.size > LEARNED_KEEP) learned.delete(learned.keys().next().value!);
  }
  const pattern = namePattern(Object.values(nameOf).map(short));
  return items.map((item) => {
    if (options.shown && !options.shown(item)) return item;
    const first = headlineCase(item.title, "", item.tickers.map((ticker) => short(nameOf[ticker])).filter(Boolean));
    // A company's own release is full of its product and program names ("Rocket Alumni Solutions", "Bare Metal"),
    // which no wire vocabulary can tell from ordinary words: it gets the shared casing only.
    const own = item.sourceKind === "press_release" || item.sourceKind === "official";
    // The day's own vocabulary, then the wire's usual ordinary words (WIRE_ORDINARY) as a second list.
    const title = own ? first : lowerOrdinaryCapitals(first, lowerWords, pattern, WIRE_ORDINARY);
    return title === item.title ? item : { ...item, title };
  });
}
