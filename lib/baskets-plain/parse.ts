/**
 * Baskets in plain English: a person types a theme in their own words ("AI
 * power stocks under $50B", "cheap banks") and we turn it into a filter spec
 * over the screener snapshot, read back as one plain sentence.
 *
 * Same pattern as plain-English agents (lib/agents-plain/parse.ts):
 * - fixed rules read the common shapes, which costs nothing;
 * - a model may read what the rules left over (./model.ts), but only by
 *   picking from the same subjects and fields, and a number it returns must
 *   appear in the request. It never names a ticker.
 *
 * A part of the request we cannot filter on comes back as "I can't filter on
 * that yet: ..." with the reason, never dropped and never stretched into
 * something else. Pure: no I/O.
 */

import type { CallWord, CapTier, Range, Zone } from "@/lib/screener-shared";

import { EMPTY_SPEC, FILTER_FIELDS, normalizeSpec, type BasketSpec, type FilterField, type IndexName, type RankField } from "./spec";
import { AI_POWER_TOPICS, AI_POWER_WORDS, TOPICS, TOPIC_IDS, type TopicId } from "./topics";

export const MAX_REQUEST_CHARS = 200;

export const CANNOT_CODES = [
  "esg",
  "people",
  "insiders",
  "congress",
  "ipo",
  "crypto",
  "geography",
  "funds",
  "ev",
  "other_index",
  "news",
  "buzz",
  "options",
  "negation",
  "call_pro",
  "unclear",
] as const;
export type CannotCode = (typeof CANNOT_CODES)[number];

export type BasketCannot = {
  code: CannotCode;
  /** The words from the request this is about. */
  what: string | null;
  /** One full sentence a person reads. */
  line: string;
};

export type BasketParse = {
  input: string;
  via: "rules" | "model";
  spec: BasketSpec;
  /** The rule as one sentence. Written by ./spec.ts from the spec. */
  cannot: BasketCannot[];
  /** Content words the rules did not use. A model may read them; otherwise they come back as "unclear". */
  leftover: string[];
};

/* ── copy ───────────────────────────────────────────────────────────────── */

const REASONS: Record<Exclude<CannotCode, "unclear" | "call_pro">, string> = {
  esg: "we don't hold ESG or sustainability scores.",
  people: "we don't track who runs a company, so founder-led or women-led isn't something the screen knows.",
  insiders: "insider buying isn't in the screen yet. The Follow page lists insider trades company by company.",
  congress: "trades by members of Congress aren't in the screen. They are on the Follow page.",
  ipo: "the screen doesn't keep listing dates, so it can't pick recent IPOs.",
  crypto: "we don't tag companies by how much crypto they hold or mine.",
  geography: "every stock we cover is listed in the US, and we don't store where a company earns its money.",
  funds: "baskets are built from single stocks. ETFs and other funds aren't in the screen.",
  ev: "our industry labels don't separate electric carmakers from the rest. “Carmakers” works.",
  other_index: "the screen knows S&P 500 and Nasdaq 100 membership, not the Dow or the Russell indexes.",
  news: "the screen doesn't read news, upgrades or downgrades.",
  buzz: "the screen doesn't measure what people are saying online.",
  options: "we don't screen on options.",
  negation: "the screen can only look for what a company has, so it can't pick companies that don't pay a dividend.",
};

function quote(text: string): string {
  return `“${text}”`;
}

export function cannotLine(code: CannotCode, what: string | null): string {
  if (code === "unclear") {
    return what ? `I didn't use ${quote(what)}: it doesn't match a field or an industry we hold.` : "I couldn't turn that into a rule.";
  }
  if (code === "call_pro") {
    return "Screening by our call is part of Pro, so I left that part out. The call itself is free on every stock page and shows next to each company below.";
  }
  return `I can't filter on that yet: ${REASONS[code]}`;
}

function cannot(code: CannotCode, what: string | null): BasketCannot {
  return { code, what, line: cannotLine(code, what) };
}

/* ── the rules ──────────────────────────────────────────────────────────── */

type Draft = {
  topics: TopicId[];
  ties: TopicId[];
  exclude: TopicId[];
  caps: CapTier[];
  ranges: Partial<Record<FilterField, Range>>;
  cheap: boolean;
  calls: CallWord[];
  zones: Zone[];
  indexes: IndexName[];
  rank: { field: RankField; dir: "asc" | "desc" } | null;
  cannot: BasketCannot[];
};

const UNITS: Record<string, number> = {
  trillion: 1e12,
  tn: 1e12,
  t: 1e12,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  billions: 1e9,
  million: 1e6,
  mn: 1e6,
  mm: 1e6,
  m: 1e6,
  millions: 1e6,
};
const UNIT = "(trillion|tn|t|billions?|bn|b|millions?|mn|mm|m)";
const LESS = "(?:under|below|less than|smaller than|up to|at most|no more than|lower than|<|<=|max(?:imum)?(?: of)?)";
const MORE = "(?:over|above|more than|bigger than|larger than|at least|greater than|>|>=|min(?:imum)?(?: of)?)";
const NUM = "(\\d+(?:\\.\\d+)?)";
const ANNUAL = "(?:a year|per year|annually|each year|every year|yearly|per annum|a yr|compounded|annual)";

function isLess(word: string): boolean {
  return new RegExp(`^${LESS}$`).test(word.trim());
}

/** Lowercase, plain quotes and spaces, "s&p500" as "s&p 500", "$50b" kept as it is. */
export function normalizeRequest(text: string): string {
  return text
    .slice(0, MAX_REQUEST_CHARS)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\ba\.i\.(?=\s|$)/g, "ai")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\bs\s*&\s*p\s*-?\s*500\b|\bsp ?500\b|\bs and p 500\b/g, "s&p 500")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Walks the request once, taking each phrase it understands out of `rest` so
 * the same words are never read twice and what is left over is easy to see.
 */
class Reader {
  rest: string;
  constructor(text: string) {
    this.rest = ` ${text} `;
  }
  take(pattern: RegExp, onMatch: (match: RegExpExecArray) => boolean | void): void {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    const spans: Array<[number, number]> = [];
    while ((match = re.exec(this.rest)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (onMatch(match) !== false) spans.push([match.index, match.index + match[0].length]);
    }
    for (const [start, end] of spans.reverse()) {
      this.rest = `${this.rest.slice(0, start)} ${" ".repeat(Math.max(0, end - start - 1))}${this.rest.slice(end)}`;
    }
  }
  has(pattern: RegExp): boolean {
    return pattern.test(this.rest);
  }
}

function setRange(draft: Draft, field: FilterField, range: Range): void {
  const current = draft.ranges[field] ?? {};
  draft.ranges[field] = { ...current, ...range };
}

function rankOnce(draft: Draft, field: RankField, dir: "asc" | "desc"): void {
  draft.rank ??= { field, dir };
}

const CANNOT_RULES: Array<{ code: CannotCode; pattern: RegExp }> = [
  { code: "esg", pattern: /\besg\b|\bsustainab(?:le|ility)\b|\bethical\b|\bsocially responsible\b|\bimpact investing\b|\bhalal\b|\bshariah?\b/ },
  { code: "people", pattern: /\b(?:founder|women|female|family)[- ](?:led|run|owned)\b|\bfemale ceos?\b|\bwomen ceos?\b/ },
  { code: "insiders", pattern: /\binsiders? (?:are )?buying\b|\binsider (?:buying|purchases|buys)\b|\binsiders? bought\b/ },
  { code: "congress", pattern: /\bcongress(?:men|women|ional)?\b|\bpoliticians?\b|\bsenators?\b|\bpelosi\b/ },
  { code: "ipo", pattern: /\bipos?\b|\bnewly listed\b|\brecent(?:ly)? (?:listed|listings|ipo'?d)\b|\bspacs?\b/ },
  { code: "crypto", pattern: /\bcrypto(?:currenc(?:y|ies))?\b|\bbitcoin\b|\bblockchain\b|\bethereum\b/ },
  { code: "geography", pattern: /\bchin(?:a|ese)\b|\beurope(?:an)?\b|\binternational\b|\bforeign\b|\bemerging markets?\b|\badrs?\b|\bjapan(?:ese)?\b|\bindian?\b|\bcanad(?:a|ian)\b|\buk\b|\bbritish\b|\bgerman\b/ },
  { code: "funds", pattern: /\betfs?\b|\bindex funds?\b|\bmutual funds?\b/ },
  { code: "ev", pattern: /\belectric (?:vehicles?|cars?)\b|\bevs?\b(?!\s*\/)/ },
  { code: "other_index", pattern: /\bdow(?: jones)?\b|\bdjia\b|\brussell(?: 1000| 2000| 3000)?\b|\bs&p (?:400|600|midcap|smallcap)\b/ },
  { code: "news", pattern: /\bnews\b|\bupgrades?\b|\bdowngrades?\b|\bheadlines\b/ },
  { code: "buzz", pattern: /\bmeme\b|\breddit\b|\bwallstreetbets\b|\btrending on\b|\bbuzz(?:ing|y)?\b/ },
  { code: "options", pattern: /\boptions?\b|\bcalls and puts\b/ },
  { code: "negation", pattern: /(?:\b(?:no|not|don'?t|doesn'?t|never|without)\s+|\bnon-?\s*)(?:pay(?:ing|s)?\s+)?(?:a\s+|any\s+)?dividends?(?:[- ]pay(?:ing|ers?))?\b/ },
];

/** Words that carry no condition: "stocks", "companies", "show me", "best". */
const STOP = new Set(
  (
    "a an and are as at be best buy by can companies company could find for from get give good great has have i if in into is it its " +
    "like list me my name names of on or our over own play plays please pick picks same should show some stock stocks that the their " +
    "them these they this those to top under up want what which who whose will with would you your shares equities equity us american " +
    "basket baskets theme themes idea ideas exposure exposed related tied linked focused based type types kind sort winners leaders " +
    "beneficiaries benefit benefiting from names any all just only also very really most per year years paying infrastructure plays"
  ).split(" "),
);

function emptyDraft(): Draft {
  return {
    topics: [],
    ties: [],
    exclude: [],
    caps: [],
    ranges: {},
    cheap: false,
    calls: [],
    zones: [],
    indexes: [],
    rank: null,
    cannot: [],
  };
}

function addOnce<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function readCannot(reader: Reader, draft: Draft): void {
  for (const rule of CANNOT_RULES) {
    reader.take(rule.pattern, (match) => {
      if (!draft.cannot.some((item) => item.code === rule.code)) draft.cannot.push(cannot(rule.code, match[0].trim()));
    });
  }
}

function readExclusions(reader: Reader, draft: Draft): void {
  const keyword = /\b(?:excluding|except(?: for)?|but not|other than|not including|without|leaving out|apart from|but no|and no|no)\s+/g;
  const spans: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = keyword.exec(reader.rest)) !== null) {
    // Subjects one after another straight after the keyword: "except banks and insurers".
    let cursor = match.index + match[0].length;
    let end = -1;
    for (;;) {
      const joiner = end >= 0 ? /^\s*(?:,|and|or|&)\s*/.exec(reader.rest.slice(cursor)) : null;
      const from = joiner ? cursor + joiner[0].length : cursor;
      const piece = reader.rest.slice(from);
      let found: RegExpExecArray | null = null;
      const topic = TOPICS.find((item) => (found = new RegExp(`^(?:${item.words.source})`).exec(piece)) !== null);
      if (!topic || !found) break;
      addOnce(draft.exclude, topic.id);
      cursor = from + (found as RegExpExecArray)[0].length;
      end = cursor;
    }
    if (end >= 0) spans.push([match.index, end]);
  }
  for (const [start, stop] of spans.reverse()) {
    reader.rest = `${reader.rest.slice(0, start)}${" ".repeat(stop - start)}${reader.rest.slice(stop)}`;
  }
}

function readSize(reader: Reader, draft: Draft): void {
  const lead = "(?:(?:market (?:cap(?:itali[sz]ation)?|value)|valued?(?: at)?|worth|caps?|size[ds]?)\\s*(?:of\\s*)?)?";
  reader.take(new RegExp(`${lead}between\\s*\\$?\\s*${NUM}\\s*${UNIT}?\\s*(?:and|to|-)\\s*\\$?\\s*${NUM}\\s*${UNIT}\\b`), (match) => {
    const high = Number(match[3]) * (UNITS[match[4]!] ?? 1);
    const low = Number(match[1]) * (UNITS[match[2] ?? match[4]!] ?? 1);
    setRange(draft, "market_cap", { min: Math.min(low, high), max: Math.max(low, high) });
  });
  reader.take(new RegExp(`${lead}(${LESS}|${MORE})\\s*(?:a\\s*)?\\$?\\s*${NUM}\\s*${UNIT}\\b(?:\\s*(?:in )?(?:market (?:cap|value)|valuation))?`), (match) => {
    const value = Number(match[2]) * (UNITS[match[3]!] ?? 1);
    setRange(draft, "market_cap", isLess(match[1]!) ? { max: value } : { min: value });
  });
  reader.take(/\bmega[- ]?caps?\b|\bmega[- ]sized?\b|\bgiants\b|\bbiggest companies\b/, () => addOnce(draft.caps, "mega"));
  reader.take(/\blarge[- ]?caps?\b|\blarge companies\b|\bbig companies\b|\bblue[- ]?chips?\b/, () => {
    addOnce(draft.caps, "mega");
    addOnce(draft.caps, "large");
  });
  reader.take(/\bmid[- ]?caps?\b|\bmid[- ]sized?(?: companies)?\b/, () => addOnce(draft.caps, "mid"));
  reader.take(/\bsmall[- ]?caps?\b|\bsmall companies\b|\bsmaller companies\b/, () => addOnce(draft.caps, "small"));
  reader.take(/\bmicro[- ]?caps?\b|\btiny companies\b/, () => addOnce(draft.caps, "micro"));
}

function readPrice(reader: Reader, draft: Draft): void {
  reader.take(/\bpenny stocks?\b/, () => setRange(draft, "price", { max: 5 }));
  reader.take(new RegExp(`\\bbetween\\s*\\$\\s*${NUM}\\s*(?:and|to|-)\\s*\\$?\\s*${NUM}(?!\\s*${UNIT}\\b)(?:\\s*(?:a|per)\\s*share)?`), (match) => {
    const a = Number(match[1]);
    const b = Number(match[2]);
    setRange(draft, "price", { min: Math.min(a, b), max: Math.max(a, b) });
  });
  reader.take(new RegExp(`(${LESS}|${MORE})\\s*\\$\\s*${NUM}(?!\\s*${UNIT}\\b)(?:\\s*(?:a|per|/)\\s*share)?`), (match) => {
    const value = Number(match[2]);
    setRange(draft, "price", isLess(match[1]!) ? { max: value } : { min: value });
  });
  reader.take(new RegExp(`(${LESS}|${MORE})\\s*${NUM}\\s*(?:dollars|bucks|usd)(?:\\s*(?:a|per)\\s*share)?|(${LESS}|${MORE})\\s*${NUM}\\s*(?:a|per)\\s*share`), (match) => {
    const word = match[1] ?? match[3]!;
    const value = Number(match[2] ?? match[4]);
    setRange(draft, "price", isLess(word) ? { max: value } : { min: value });
  });
}

function readValuation(reader: Reader, draft: Draft): void {
  const pe = "(?:p\\s*/?\\s*e|pe ratio|price[- ]to[- ]earnings(?: ratio)?|earnings multiples?)";
  reader.take(new RegExp(`\\b${pe}\\s*(?:ratio\\s*)?(?:of\\s*)?${NUM}\\s*or\\s*(less|lower|below|under|more|higher|above)`), (match) => {
    const value = Number(match[1]);
    setRange(draft, "pe", /less|lower|below|under/.test(match[2]!) ? { max: value, min: 0.01 } : { min: value });
    rankOnce(draft, "pe", "asc");
  });
  reader.take(new RegExp(`\\b(forward|fwd)\\s*${pe}\\s*(?:ratio\\s*)?(?:of\\s*)?(${LESS}|${MORE})\\s*${NUM}`), (match) => {
    const value = Number(match[3]);
    setRange(draft, "fwd_pe", isLess(match[2]!) ? { max: value } : { min: value });
    rankOnce(draft, "pe", "asc");
  });
  reader.take(new RegExp(`\\b${pe}\\s*(?:ratio\\s*)?(?:of\\s*)?(${LESS}|${MORE})\\s*${NUM}|(${LESS}|${MORE})\\s*${NUM}\\s*(?:times\\s*)?(?:earnings|p\\s*/?\\s*e)\\b`), (match) => {
    const word = match[1] ?? match[3]!;
    const value = Number(match[2] ?? match[4]);
    setRange(draft, "pe", isLess(word) ? { max: value, min: 0.01 } : { min: value });
    rankOnce(draft, "pe", "asc");
  });
  reader.take(new RegExp(`\\bpeg(?: ratio)?\\s*(?:of\\s*)?(${LESS}|${MORE})\\s*${NUM}`), (match) => {
    const value = Number(match[2]);
    setRange(draft, "peg", isLess(match[1]!) ? { max: value, min: 0.01 } : { min: value });
  });
  reader.take(new RegExp(`\\b(?:p\\s*/\\s*s|price[- ]to[- ]sales)(?: ratio)?\\s*(?:of\\s*)?(${LESS}|${MORE})\\s*${NUM}|(${LESS}|${MORE})\\s*${NUM}\\s*times\\s*sales`), (match) => {
    const word = match[1] ?? match[3]!;
    const value = Number(match[2] ?? match[4]);
    setRange(draft, "ps", isLess(word) ? { max: value } : { min: value });
  });
  reader.take(/\bcheap(?:est|er|ly valued| valuations?)?\b|\bundervalued\b|\bvalue (?:stocks?|names|plays?|picks?|investing)\b|\bdeep value\b|\bbargains?\b|\binexpensive\b|\blow p\/?e\b|\blow valuations?\b|\bon sale\b/, () => {
    draft.cheap = true;
    rankOnce(draft, "pe", "asc");
  });
}

function readDividends(reader: Reader, draft: Draft): void {
  reader.take(/\bdividend kings?\b/, () => setRange(draft, "div_growth_years", { min: 50 }));
  reader.take(/\bdividend aristocrats?\b/, () => setRange(draft, "div_growth_years", { min: 25 }));
  reader.take(
    new RegExp(`\\b(?:raised|raising|increased|increasing|grown|grew|hiked)\\s*(?:their |the |its )?dividends?\\s*(?:for\\s*)?(?:at least |over |more than )?(\\d+)\\+?\\s*(?:straight |consecutive |years? in a row|years?)(?:\\s*(?:straight|in a row|running))?|\\b(\\d+)\\+?\\s*(?:straight |consecutive )?years? of (?:dividend )?(?:increases|raises|hikes|dividend growth)`),
    (match) => {
      setRange(draft, "div_growth_years", { min: Number(match[1] ?? match[2]) });
    },
  );
  reader.take(new RegExp(`\\bdividend growth\\s*(?:of\\s*|above\\s*|over\\s*|at least\\s*)*${NUM}\\s*%(?:\\s*(?:a year|per year|annually))?|\\bgrow(?:n|ing)? (?:the |their )?dividends?\\s*(?:by\\s*)?${NUM}\\s*%(?:\\s*(?:a year|per year|annually))?`), (match) => {
    setRange(draft, "div_growth", { min: Number(match[1] ?? match[2]) });
  });
  reader.take(/\bdividend raisers?\b|\bdividend growers?\b|\bdividend growth\b|\b(?:growing|raising|rising|increasing|hiking) (?:their |the |its )?dividends?\b|\bdividends? (?:that )?(?:keep )?(?:growing|rising)\b/, () => {
    setRange(draft, "div_growth", { min: 0.1 });
  });
  reader.take(new RegExp(`\\b(?:dividend\\s*)?yield(?:s|ing)?\\s*(?:of\\s*)?(?:${MORE}\\s*)?${NUM}\\s*%(?:\\s*or more)?|\\b${NUM}\\s*%\\+?\\s*(?:or more\\s*)?(?:dividend\\s*)?yield(?:s|ing)?\\b`), (match) => {
    setRange(draft, "div_yield", { min: Number(match[1] ?? match[2]) });
    rankOnce(draft, "div_yield", "desc");
  });
  reader.take(new RegExp(`\\b(?:dividend\\s*)?yield(?:s|ing)?\\s*(?:of\\s*)?${LESS}\\s*${NUM}\\s*%`), (match) => {
    setRange(draft, "div_yield", { min: 0.01, max: Number(match[1]) });
  });
  reader.take(/\bhigh[- ]yield(?:ing|ers)?\b|\bhigh dividends?\b|\bbig dividends?\b|\bfat dividends?\b|\bjuicy (?:dividends?|yields?)\b|\bhigh[- ]dividend\b/, () => {
    setRange(draft, "div_yield", { min: 4 });
    rankOnce(draft, "div_yield", "desc");
  });
  reader.take(new RegExp(`\\bpayout(?: ratio)?\\s*(${LESS})\\s*${NUM}\\s*%?`), (match) => setRange(draft, "payout", { max: Number(match[2]) }));
  reader.take(/\bsafe dividends?\b|\bsustainable dividends?\b|\bdividends? (?:that are|is) safe\b/, () => setRange(draft, "payout", { min: 0, max: 75 }));
  reader.take(/\bdividend[- ](?:payers?|paying|stocks?|names|companies|income)\b|\bpay(?:s|ing)? (?:a |out )?dividends?\b|\bwith (?:a )?dividends?\b|\bincome (?:stocks?|names)\b|\bdividends?\b/, () => {
    if (!draft.ranges.div_yield) setRange(draft, "div_yield", { min: 0.01 });
  });
}

function readGrowth(reader: Reader, draft: Draft): void {
  const sales = "(?:sales|revenues?|top[- ]line)";
  const earnings = "(?:earnings(?: per share)?|eps|profits?|net income)";
  const verb = "(?:grew|grow(?:s|ing|n)?|growth(?: in| of)?|increas(?:ed|ing)|rais(?:ed|ing)|rising|rose|up|expand(?:ed|ing))";
  const amount = `(?:by\\s*|of\\s*|at\\s*|at least\\s*|over\\s*|more than\\s*|above\\s*|>\\s*)*${NUM}\\s*%\\+?(?:\\s*or more)?(?:\\s*(?:on |over |in )?(?:a |the )?(${ANNUAL}|year over year|yoy|y/y|last year|past year|over the last year|over the past year|a year ago))?`;
  const pick = (kind: "sales" | "earnings") => (match: RegExpExecArray) => {
    const nums = match.slice(1).filter((part) => part !== undefined && /^\d/.test(part));
    const annualWord = match.slice(1).find((part) => part !== undefined && new RegExp(`^${ANNUAL}$`).test(part));
    const value = Number(nums[0]);
    if (!Number.isFinite(value)) return false;
    if (kind === "earnings") {
      setRange(draft, "eps_growth", { min: value });
      rankOnce(draft, "eps_growth", "desc");
    } else if (annualWord) {
      setRange(draft, "rev_cagr_3y", { min: value });
      rankOnce(draft, "rev_cagr_3y", "desc");
    } else {
      setRange(draft, "rev_growth", { min: value });
      rankOnce(draft, "rev_growth", "desc");
    }
  };
  for (const [kind, noun] of [["sales", sales], ["earnings", earnings]] as const) {
    // "grew sales 10% a year", "sales growth of 20%", "revenue up 15% yoy"
    reader.take(new RegExp(`\\b${verb}\\s*(?:their\\s*|its\\s*)?${noun}\\s*(?:growth\\s*)?${amount}`), pick(kind));
    reader.take(new RegExp(`\\b${noun}\\s*${verb}?\\s*(?:growth\\s*)?${amount}`), pick(kind));
    // "10% annual revenue growth", "20%+ sales growth"
    reader.take(new RegExp(`\\b${NUM}\\s*%\\+?\\s*(?:or more\\s*)?(${ANNUAL}|yearly)?\\s*${noun}\\s*growth`), (match) => {
      const value = Number(match[1]);
      if (kind === "earnings") setRange(draft, "eps_growth", { min: value });
      else setRange(draft, match[2] ? "rev_cagr_3y" : "rev_growth", { min: value });
      rankOnce(draft, kind === "earnings" ? "eps_growth" : match[2] ? "rev_cagr_3y" : "rev_growth", "desc");
    });
  }
  reader.take(/\b(?:shrinking|declining|falling) (?:sales|revenues?)\b|\b(?:sales|revenues?) (?:shrinking|declining|falling)\b/, () => setRange(draft, "rev_growth", { max: 0 }));
  reader.take(/\bfast[- ]growing\b|\bhigh[- ]growth\b|\brapid(?:ly)?[- ]growing\b|\bhyper[- ]?growth\b|\bfast growers?\b/, () => {
    setRange(draft, "rev_growth", { min: 20 });
    rankOnce(draft, "rev_growth", "desc");
  });
  reader.take(/\bgrowth (?:stocks?|names|companies)\b|\bgrowers\b/, () => {
    setRange(draft, "rev_growth", { min: 15 });
    rankOnce(draft, "rev_growth", "desc");
  });
  reader.take(/\bgrowing (?:earnings|profits?)\b/, () => setRange(draft, "eps_growth", { min: 0 }));
  reader.take(/\bgrowing(?: (?:sales|revenues?|companies|businesses))?\b|\bstill growing\b/, () => {
    if (!draft.ranges.rev_growth && !draft.ranges.rev_cagr_3y) setRange(draft, "rev_growth", { min: 0 });
  });
}

function readQuality(reader: Reader, draft: Draft): void {
  reader.take(/\bnot growing\b|\bno growth\b/, () => setRange(draft, "rev_growth", { max: 0 }));
  reader.take(/\bnot profitable\b|\bnon-?profitable\b|\bunprofitable\b|\blos(?:e|ing) money\b|\bin the red\b|\bmoney[- ]losing\b/, () => setRange(draft, "net_margin", { max: 0 }));
  reader.take(/\bprofitable\b|\bmak(?:e|es|ing) (?:a )?(?:money|profits?)\b|\bin the black\b|\bpositive earnings\b|\bwith profits?\b/, () => setRange(draft, "net_margin", { min: 0 }));
  reader.take(new RegExp(`\\bnet (?:profit )?margins?\\s*(?:of\\s*)?(?:${MORE})\\s*${NUM}\\s*%`), (match) => setRange(draft, "net_margin", { min: Number(match[1]) }));
  reader.take(new RegExp(`\\b(?:operating |op )?margins?\\s*(?:of\\s*)?(?:${MORE})\\s*${NUM}\\s*%`), (match) => setRange(draft, "op_margin", { min: Number(match[1]) }));
  reader.take(/\bhigh[- ]margins?\b|\bfat margins?\b|\bwide margins?\b/, () => setRange(draft, "op_margin", { min: 25 }));
  reader.take(new RegExp(`\\broic\\s*(?:of\\s*)?(?:${MORE})\\s*${NUM}\\s*%?`), (match) => setRange(draft, "roic", { min: Number(match[1]) }));
  reader.take(new RegExp(`\\broe\\s*(?:of\\s*)?(?:${MORE})\\s*${NUM}\\s*%?`), (match) => setRange(draft, "roe", { min: Number(match[1]) }));
  reader.take(/\bhigh roe\b/, () => setRange(draft, "roe", { min: 20 }));
  reader.take(/\bhigh[- ]quality\b|\bquality (?:stocks?|names|companies|businesses)\b|\bcompounders?\b|\bgreat businesses\b|\bmoats?\b|\bquality\b|\bhigh roic\b/, () => {
    setRange(draft, "roic", { min: 15 });
    rankOnce(draft, "roic", "desc");
  });
  reader.take(/\bno debt\b|\bdebt[- ]free\b|\bnet cash\b|\bmore cash than debt\b|\bcash[- ]rich\b|\bpiles? of cash\b/, () => setRange(draft, "net_cash", { min: 0 }));
  reader.take(/\blow debt\b|\blittle debt\b|\bstrong balance sheets?\b|\bclean balance sheets?\b|\bconservative balance sheets?\b|\blow leverage\b/, () => setRange(draft, "debt_equity", { max: 0.5 }));
}

function readPrices(reader: Reader, draft: Draft): void {
  reader.take(/\bnear (?:their |a |the )?(?:52[- ]week|one[- ]year|1[- ]year|yearly|all[- ]time|record) highs?\b|\bat (?:new |all[- ]time |record |52[- ]week )?highs\b|\bnew highs\b|\bmaking highs\b/, () => setRange(draft, "from_hi_pct", { min: -5 }));
  reader.take(/\bbeaten[- ]down\b|\bfallen angels?\b|\bdown a lot\b|\bcrushed\b|\bbattered\b|\bnear (?:their |a |the )?(?:52[- ]week |one[- ]year |1[- ]year |yearly )?lows?\b|\bat (?:52[- ]week |one[- ]year )?lows\b|\bwell off (?:their )?highs\b|\bdown from (?:their )?highs\b/, () => {
    setRange(draft, "from_hi_pct", { max: -30 });
    rankOnce(draft, "from_hi_pct", "asc");
  });
  reader.take(/\boversold\b/, () => setRange(draft, "rsi", { max: 30 }));
  reader.take(new RegExp(`\\b(?:down|fell|fallen|lost|dropped)\\s*(?:more than |over |at least )?${NUM}\\s*%\\s*(?:or more\\s*)?(?:this year|ytd|year to date)`), (match) => setRange(draft, "ret_ytd", { max: -Number(match[1]) }));
  reader.take(new RegExp(`\\b(?:up|gained|rose|risen|climbed)\\s*(?:more than |over |at least )?${NUM}\\s*%\\s*(?:or more\\s*)?(?:this year|ytd|year to date)`), (match) => setRange(draft, "ret_ytd", { min: Number(match[1]) }));
  reader.take(new RegExp(`\\b(?:up|gained|rose|risen|climbed)\\s*(?:more than |over |at least )?${NUM}\\s*%\\s*(?:or more\\s*)?(?:over|in) the (?:past|last) (?:year|12 months)`), (match) => setRange(draft, "ret_1y", { min: Number(match[1]) }));
  reader.take(/\b(?:up|positive|green|higher) (?:so far )?this year\b|\bup ytd\b/, () => setRange(draft, "ret_ytd", { min: 0 }));
  reader.take(/\b(?:down|negative|red|lower) (?:so far )?this year\b|\bdown ytd\b|\blosers this year\b/, () => setRange(draft, "ret_ytd", { max: 0 }));
  reader.take(/\babove (?:their |the )?200[- ]day(?: (?:moving )?average)?\b/, () => setRange(draft, "vs_200d", { min: 0 }));
  reader.take(/\bbelow (?:their |the )?200[- ]day(?: (?:moving )?average)?\b/, () => setRange(draft, "vs_200d", { max: 0 }));
  reader.take(/\bmomentum\b|\btrending (?:up|higher)\b|\buptrends?\b|\bin an uptrend\b|\bstrong trends?\b|\brising (?:stocks|prices|shares)\b|\bhot stocks?\b|\bon a run\b/, () => {
    setRange(draft, "ret_6m", { min: 15 });
    if (!draft.ranges.vs_200d) setRange(draft, "vs_200d", { min: 0 });
    rankOnce(draft, "ret_6m", "desc");
  });
}

function readRisk(reader: Reader, draft: Draft): void {
  reader.take(/\blow[- ]volatility\b|\blow[- ]vol\b|\bcalm\b|\bsteady\b|\bstable\b|\bdefensive\b|\bboring\b|\bsleep well\b|\bless volatile\b/, () => {
    setRange(draft, "vol_90d", { max: 25 });
    rankOnce(draft, "vol_90d", "asc");
  });
  reader.take(/\blow[- ]beta\b/, () => setRange(draft, "beta", { max: 0.8 }));
  reader.take(/\bhigh[- ]beta\b|\bvolatile\b|\bwild swings?\b/, () => setRange(draft, "beta", { min: 1.5 }));
  reader.take(new RegExp(`\\bshort interest\\s*(?:${MORE})\\s*${NUM}\\s*%`), (match) => {
    setRange(draft, "short_float", { min: Number(match[1]) });
    rankOnce(draft, "short_float", "desc");
  });
  reader.take(/\bheavily shorted\b|\bhigh short interest\b|\bmost shorted\b|\bshort squeezes?\b|\bsqueeze candidates?\b|\bshorted\b/, () => {
    setRange(draft, "short_float", { min: 15 });
    rankOnce(draft, "short_float", "desc");
  });
  reader.take(/\bbuy ?backs?\b|\bbuying back (?:their |its )?(?:own )?(?:shares|stock)\b|\bshare repurchases?\b|\brepurchas(?:es|ing)\b/, () => setRange(draft, "buyback_yield", { min: 1 }));
}

function readAnalysts(reader: Reader, draft: Draft): void {
  reader.take(new RegExp(`\\b${NUM}\\s*%\\s*(?:or more\\s*)?upside\\b`), (match) => {
    setRange(draft, "upside", { min: Number(match[1]) });
    rankOnce(draft, "upside", "desc");
  });
  reader.take(/\bupside to (?:the |their |analyst |price )*targets?\b|\bbelow (?:the |their )?(?:analyst |price )*targets?\b|\banalyst upside\b|\bupside\b/, () => {
    setRange(draft, "upside", { min: 15 });
    rankOnce(draft, "upside", "desc");
  });
  reader.take(/\banalysts? (?:love|like|favou?r|recommend|rate (?:as |a |them )?buy|say buy)\b|\banalyst (?:favou?rites?|darlings?|buys?|picks?)\b|\bstrong buys?\b|\bbuy[- ]rated by analysts\b|\bwall street (?:loves|likes|favou?rites?)\b/, () => setRange(draft, "buy_pct", { min: 70 }));
  reader.take(/\b(?:owned|held) by (?:big )?(?:funds|institutions|hedge funds|big investors)\b|\binstitutional (?:ownership|favou?rites?)\b|\bsmart money\b|\bhedge funds? (?:own|hold|like)\b/, () => setRange(draft, "inst_own", { min: 70 }));
}

function readEarnings(reader: Reader, draft: Draft): void {
  reader.take(new RegExp(`\\breport(?:s|ing)?\\s*(?:earnings\\s*)?(?:in\\s*)?(?:the\\s*)?next\\s*(\\d+)\\s*days\\b|\\bearnings\\s*(?:in\\s*)?(?:the\\s*)?next\\s*(\\d+)\\s*days\\b`), (match) => {
    setRange(draft, "earnings_in_days", { min: 0, max: Math.min(60, Number(match[1] ?? match[2])) });
  });
  reader.take(/\breport(?:s|ing)? (?:earnings )?(?:this|next) week\b|\bearnings (?:this|next) week\b|\bearnings soon\b|\breporting soon\b|\bbefore earnings\b|\babout to report\b/, () => {
    setRange(draft, "earnings_in_days", { min: 0, max: 7 });
  });
}

function readIndexesAndCall(reader: Reader, draft: Draft): void {
  reader.take(/\b(?:in the )?s&p 500\b|\bs&p\b(?!\s*\d)/, () => addOnce(draft.indexes, "S&P 500"));
  reader.take(/\b(?:in the )?nasdaq[- ]?100\b|\bndx\b|\bnasdaq\b/, () => addOnce(draft.indexes, "NASDAQ 100"));
  const call = (word: string): CallWord | null => (/add|buy more/.test(word) ? "Add" : /hold|keep/.test(word) ? "Hold" : /trim|sell some/.test(word) ? "Trim" : null);
  reader.take(/\bin (?:the |your |our )?add zones?\b|\bat (?:your|our|stocksbrew'?s?) (?:add|buy[- ]more) price\b|\bbelow (?:your|our) add price\b/, () => addOnce(draft.zones, "add"));
  reader.take(
    /\b(?:our|your|stocksbrew'?s?) (?:calls?|ratings?|reads?) (?:is |are |says |of )?(add|buy more|hold|keep|trim|sell some)\b|\brated (add|hold|trim)\b|\b(add|hold|trim)[- ]rated\b|\byou(?:'d| would) (add|buy more|trim)\b/,
    (match) => {
      const word = call(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
      if (!word) return false;
      addOnce(draft.calls, word);
    },
  );
}

function readTopics(reader: Reader, draft: Draft): void {
  reader.take(AI_POWER_WORDS, () => {
    for (const id of AI_POWER_TOPICS) addOnce(draft.topics, id);
    addOnce(draft.ties, "power_demand");
  });
  for (const topic of TOPICS) {
    reader.take(topic.words, () => {
      if (!draft.exclude.includes(topic.id)) addOnce(draft.topics, topic.id);
    });
  }
}

/**
 * "AI" next to another subject narrows it ("AI chip stocks" are chipmakers our
 * research ties to AI); on its own it is the subject. Either way it reads as
 * "that our research ties to AI demand", because that is how it is matched.
 */
function settleAi(draft: Draft): void {
  if (!draft.topics.includes("ai")) return;
  draft.topics = draft.topics.filter((id) => id !== "ai");
  addOnce(draft.ties, "ai");
}

/** A whole sector next to a narrower subject inside it says the same thing twice ("tech software"): keep the narrower one. */
function dropRedundantSectors(draft: Draft): void {
  const narrow = draft.topics.filter((id) => !id.startsWith("sector_"));
  if (narrow.length === 0) return;
  const parentOf: Partial<Record<TopicId, TopicId>> = {
    semiconductors: "sector_technology",
    software: "sector_technology",
    cybersecurity: "sector_technology",
    hardware: "sector_technology",
    banks: "sector_financials",
    insurance: "sector_financials",
    payments: "sector_financials",
    asset_managers: "sector_financials",
    exchanges: "sector_financials",
    biotech: "sector_health_care",
    pharma: "sector_health_care",
    medtech: "sector_health_care",
    health_insurers: "sector_health_care",
    obesity: "sector_health_care",
    oil_gas: "sector_energy",
    power: "sector_utilities",
    reits: "sector_real_estate",
    data_centers: "sector_real_estate",
    retail: "sector_discretionary",
    restaurants: "sector_discretionary",
    autos: "sector_discretionary",
    travel: "sector_discretionary",
    food_drink: "sector_staples",
    tobacco: "sector_staples",
    telecom: "sector_communication",
    media: "sector_communication",
    video_games: "sector_communication",
    chemicals: "sector_materials",
    mining: "sector_materials",
    defense: "sector_industrials",
    aerospace: "sector_industrials",
    airlines: "sector_industrials",
    transport: "sector_industrials",
  };
  const parents = new Set(narrow.map((id) => parentOf[id]).filter(Boolean));
  draft.topics = draft.topics.filter((id) => !parents.has(id));
}

const COMPARATORS = new Set(["under", "over", "below", "above", "less", "more", "than", "between", "of", "at", "least", "most"]);

/** Words the rules did not use. A number is never dropped, and the comparator in front of it stays with it. */
function leftoverWords(rest: string): string[] {
  const tokens = rest
    .replace(/[^a-z0-9&$%.'+\-/ ]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9$]+|[^a-z0-9%]+$/g, ""))
    .filter(Boolean);
  const out: string[] = [];
  tokens.forEach((word, index) => {
    const numeric = /\d/.test(word);
    const nextNumeric = COMPARATORS.has(word) && /\d/.test(tokens[index + 1] ?? "");
    if (numeric || nextNumeric || (word.length > 1 && !STOP.has(word) && !COMPARATORS.has(word))) out.push(word);
  });
  return [...new Set(out)];
}

/** The rules' reading of a request. Never throws; an empty spec means nothing was understood. */
export function parseBasketRequest(input: string): BasketParse {
  const text = normalizeRequest(input);
  const draft = emptyDraft();
  const reader = new Reader(text);
  readCannot(reader, draft);
  readExclusions(reader, draft);
  readSize(reader, draft);
  readPrice(reader, draft);
  readDividends(reader, draft);
  readGrowth(reader, draft);
  readValuation(reader, draft);
  readQuality(reader, draft);
  readPrices(reader, draft);
  readRisk(reader, draft);
  readAnalysts(reader, draft);
  readEarnings(reader, draft);
  readIndexesAndCall(reader, draft);
  readTopics(reader, draft);
  settleAi(draft);
  dropRedundantSectors(draft);

  const spec = normalizeSpec({
    ...EMPTY_SPEC,
    topics: draft.topics,
    ties: draft.ties,
    exclude: draft.exclude,
    caps: draft.caps,
    ranges: draft.ranges,
    cheap: draft.cheap,
    calls: draft.calls,
    zones: draft.zones,
    indexes: draft.indexes,
    rank: draft.rank ?? EMPTY_SPEC.rank,
  });
  return { input: input.slice(0, MAX_REQUEST_CHARS).trim(), via: "rules", spec, cannot: draft.cannot, leftover: leftoverWords(reader.rest) };
}

/* ── the model's reading of what the rules left ─────────────────────────── */

export type ModelBasketParse = {
  topics: string[];
  ties: string[];
  exclude: string[];
  filters: Array<{ field: string; min: number | null; max: number | null }>;
  cannot: Array<{ quote: string; reason: string }>;
};

export type BasketModelReader = (text: string, leftover: string[]) => Promise<ModelBasketParse>;

/** Whether `value` is written in the request, so a model cannot bring its own numbers. */
function numberInText(value: number, text: string): boolean {
  const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.includes(value)) return true;
  // "$50B" read as 50,000,000,000 and "1.5 trillion" as 1.5e12.
  return numbers.some((written) => [1e3, 1e6, 1e9, 1e12].some((scale) => Math.abs(written * scale - value) < 1e-6 * Math.max(1, value)));
}

/**
 * Fold the model's reading into the rules' result. The rules win where both
 * read the same field; the model only fills gaps, from the same lists.
 */
export function mergeModelParse(base: BasketParse, model: ModelBasketParse): BasketParse {
  const text = normalizeRequest(base.input);
  const spec = { ...base.spec, ranges: { ...base.spec.ranges } };
  const known = (ids: string[]) => ids.filter((id): id is TopicId => (TOPIC_IDS as string[]).includes(id));
  const topics = [...spec.topics, ...known(model.topics).filter((id) => !spec.topics.includes(id) && !spec.exclude.includes(id))];
  const ties = [...spec.ties, ...known(model.ties).filter((id) => !spec.ties.includes(id))];
  const exclude = [...spec.exclude, ...known(model.exclude).filter((id) => !spec.exclude.includes(id))];
  let added = topics.length + ties.length + exclude.length - spec.topics.length - spec.ties.length - spec.exclude.length;
  for (const filter of model.filters ?? []) {
    if (!(FILTER_FIELDS as readonly string[]).includes(filter.field)) continue;
    const field = filter.field as FilterField;
    // Which side of the high a number sits on is easy to get backwards; the rules read those phrases.
    if (field === "from_hi_pct") continue;
    if (spec.ranges[field]) continue;
    const range: Range = {};
    // A negative number must be written with a minus or a word for down; the model cannot flip a sign.
    const signOk = (value: number) => value >= 0 || /-\s*\d|\b(?:down|below|fell|lost|drop|negative|losing)\b/.test(text);
    if (typeof filter.min === "number" && Number.isFinite(filter.min) && signOk(filter.min) && numberInText(Math.abs(filter.min), text)) range.min = filter.min;
    if (typeof filter.max === "number" && Number.isFinite(filter.max) && signOk(filter.max) && numberInText(Math.abs(filter.max), text)) range.max = filter.max;
    if (range.min === undefined && range.max === undefined) continue;
    spec.ranges[field] = range;
    added += 1;
  }
  const cannotList = [...base.cannot];
  for (const item of model.cannot ?? []) {
    const code = (CANNOT_CODES as readonly string[]).includes(item.reason) ? (item.reason as CannotCode) : "unclear";
    if (code === "call_pro") continue;
    const what = typeof item.quote === "string" && item.quote.trim() && text.includes(item.quote.trim().toLowerCase()) ? item.quote.trim() : null;
    if (cannotList.some((existing) => existing.code === code && (code !== "unclear" || existing.what === what))) continue;
    cannotList.push(cannot(code, what));
  }
  // "ai" from the model narrows like it does in the rules: it is a tie, never a subject on its own.
  const finalTopics = topics.filter((id) => id !== "ai");
  const finalTies = topics.includes("ai") && !ties.includes("ai") ? [...ties, "ai" as TopicId] : ties;
  const next = normalizeSpec({ ...spec, topics: finalTopics, ties: finalTies, exclude });
  return { ...base, via: added > 0 ? "model" : base.via, spec: next, cannot: cannotList, leftover: [] };
}

/** Leftover words the rules did not use become "I didn't use ..." lines. Call when no model read them. */
export function settleLeftover(parse: BasketParse): BasketParse {
  if (parse.leftover.length === 0) return parse;
  return { ...parse, cannot: [...parse.cannot, cannot("unclear", parse.leftover.join(" "))], leftover: [] };
}
