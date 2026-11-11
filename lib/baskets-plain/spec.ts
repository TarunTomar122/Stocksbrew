/**
 * A plain-English basket, once read: the subjects, the screener filters and
 * how the matches are ranked. Pure: no I/O.
 *
 * Every filter is a field the screener snapshot already carries
 * (lib/screener-shared.ts), so a basket can only ask for what we hold. The
 * sentence a person reads back is written here from the spec, never by a
 * model, and the same spec always reads the same way.
 */

import { CALL_PLAIN } from "@/lib/plain-copy";
import type { CallWord, CapTier, Range, Zone } from "@/lib/screener-shared";

import { TOPIC_BY_ID, TOPIC_IDS, type TopicId } from "./topics";

/** Screener fields a basket may filter on. */
export const FILTER_FIELDS = [
  "market_cap",
  "price",
  "pe",
  "fwd_pe",
  "peg",
  "ps",
  "rev_growth",
  "rev_cagr_3y",
  "eps_growth",
  "net_margin",
  "op_margin",
  "roic",
  "roe",
  "debt_equity",
  "net_cash",
  "div_yield",
  "div_growth",
  "div_growth_years",
  "payout",
  "buyback_yield",
  "ret_6m",
  "ret_ytd",
  "ret_1y",
  "vs_200d",
  "from_hi_pct",
  "rsi",
  "vol_90d",
  "beta",
  "short_float",
  "buy_pct",
  "upside",
  "inst_own",
  "earnings_in_days",
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const RANK_FIELDS = ["market_cap", "pe", "div_yield", "rev_cagr_3y", "rev_growth", "eps_growth", "ret_6m", "from_hi_pct", "roic", "upside", "short_float", "vol_90d"] as const;
export type RankField = (typeof RANK_FIELDS)[number];

export const INDEXES = ["S&P 500", "NASDAQ 100"] as const;
export type IndexName = (typeof INDEXES)[number];

export type BasketSpec = {
  v: 1;
  /** Any of these subjects (or). Empty means the whole covered market. */
  topics: TopicId[];
  /** Each of these must hold too (and): "that our research ties to AI demand". */
  ties: TopicId[];
  /** Companies in any of these are left out. */
  exclude: TopicId[];
  caps: CapTier[];
  ranges: Partial<Record<FilterField, Range>>;
  /** A positive P/E below the median P/E of the company's own sector today. */
  cheap: boolean;
  /** Our call. Screening by it is part of Pro; the server drops it below Pro and says so. */
  calls: CallWord[];
  zones: Zone[];
  indexes: IndexName[];
  rank: { field: RankField; dir: "asc" | "desc" };
};

export const EMPTY_SPEC: BasketSpec = {
  v: 1,
  topics: [],
  ties: [],
  exclude: [],
  caps: [],
  ranges: {},
  cheap: false,
  calls: [],
  zones: [],
  indexes: [],
  rank: { field: "market_cap", dir: "desc" },
};

const CAP_ORDER: CapTier[] = ["mega", "large", "mid", "small", "micro"];
const CALL_ORDER: CallWord[] = ["Add", "Hold", "Trim"];
const ZONE_ORDER: Zone[] = ["add", "between", "trim"];

function uniqueIn<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  const set = new Set(values.filter((value): value is T => typeof value === "string" && (allowed as readonly string[]).includes(value)));
  return allowed.filter((value) => set.has(value));
}

/** Known values in the order they were given, without repeats. Subjects keep the person's order for the read-back. */
function keepOrder<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  const out: T[] = [];
  for (const value of values) {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value) && !out.includes(value as T)) out.push(value as T);
  }
  return out;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(value * 1e4) / 1e4;
}

/** A spec from anything (a stored doc, a model's answer): unknown parts are dropped, the order is canonical. */
export function normalizeSpec(raw: unknown): BasketSpec {
  const item = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ranges: BasketSpec["ranges"] = {};
  const rawRanges = item.ranges && typeof item.ranges === "object" ? (item.ranges as Record<string, unknown>) : {};
  for (const field of FILTER_FIELDS) {
    const range = rawRanges[field] as Record<string, unknown> | undefined;
    if (!range || typeof range !== "object") continue;
    let min = cleanNumber(range.min);
    let max = cleanNumber(range.max);
    if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
    if (min === undefined && max === undefined) continue;
    ranges[field] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  }
  const rank = item.rank && typeof item.rank === "object" ? (item.rank as Record<string, unknown>) : {};
  const topics = keepOrder(item.topics, TOPIC_IDS);
  const ties = keepOrder(item.ties, TOPIC_IDS).filter((id) => !topics.includes(id));
  return {
    v: 1,
    topics,
    ties,
    exclude: keepOrder(item.exclude, TOPIC_IDS).filter((id) => !topics.includes(id) && !ties.includes(id)),
    caps: uniqueIn(item.caps, CAP_ORDER),
    ranges,
    cheap: item.cheap === true,
    calls: uniqueIn(item.calls, CALL_ORDER),
    zones: uniqueIn(item.zones, ZONE_ORDER),
    indexes: uniqueIn(item.indexes, INDEXES),
    rank: {
      field: (RANK_FIELDS as readonly string[]).includes(String(rank.field)) ? (rank.field as RankField) : "market_cap",
      dir: rank.dir === "asc" ? "asc" : "desc",
    },
  };
}

export function isEmptySpec(spec: BasketSpec): boolean {
  return (
    spec.topics.length === 0 &&
    spec.ties.length === 0 &&
    spec.caps.length === 0 &&
    Object.keys(spec.ranges).length === 0 &&
    !spec.cheap &&
    spec.calls.length === 0 &&
    spec.zones.length === 0 &&
    spec.indexes.length === 0
  );
}

export function usesCall(spec: BasketSpec): boolean {
  return spec.calls.length > 0 || spec.zones.length > 0;
}

/** The spec without the parts screened by our call, for viewers below Pro. */
export function withoutCall(spec: BasketSpec): BasketSpec {
  return { ...spec, calls: [], zones: [] };
}

/** A 53-bit string hash (cyrb53). Pure JS so the browser and the server agree. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Stable across key order, so the same basket always gets the same id. */
export function specKey(spec: BasketSpec): string {
  const normal = normalizeSpec(spec);
  // The order subjects were typed in changes the wording, not the basket.
  const canonical = { ...normal, topics: [...normal.topics].sort(), ties: [...normal.ties].sort(), exclude: [...normal.exclude].sort() };
  return hash53(JSON.stringify(canonical)).toString(16).padStart(14, "0").slice(-10);
}

/* ── the read-back ──────────────────────────────────────────────────────── */

function trimNumber(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** "$50 billion", "$800 million", "$1.5 trillion". */
export function moneyWords(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${trimNumber(abs / 1e12, 2)} trillion`;
  if (abs >= 1e9) return `$${trimNumber(abs / 1e9, 1)} billion`;
  if (abs >= 1e6) return `$${trimNumber(abs / 1e6, 0)} million`;
  return `$${Math.round(abs).toLocaleString("en-US")}`;
}

function pct(value: number): string {
  return `${trimNumber(Math.abs(value), 1)}%`;
}

function times(value: number): string {
  return trimNumber(value, 2);
}

const CAP_WORDS: Record<CapTier, string> = {
  mega: "mega-sized ($200 billion and up)",
  large: "large ($10 billion to $200 billion)",
  mid: "mid-sized ($2 billion to $10 billion)",
  small: "small ($300 million to $2 billion)",
  micro: "micro-sized (under $300 million)",
};

function joinList(items: string[], word: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${word} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/** One predicate per filter, written to follow "that": "are worth less than $50 billion". */
export function rangePredicate(field: FilterField, range: Range): string {
  const { min, max } = range;
  const both = min !== undefined && max !== undefined;
  switch (field) {
    case "market_cap":
      if (both) return `are worth between ${moneyWords(min)} and ${moneyWords(max)}`;
      return max !== undefined ? `are worth less than ${moneyWords(max)}` : `are worth more than ${moneyWords(min!)}`;
    case "price":
      if (both) return `trade between $${trimNumber(min, 2)} and $${trimNumber(max, 2)} a share`;
      return max !== undefined ? `trade under $${trimNumber(max, 2)} a share` : `trade above $${trimNumber(min!, 2)} a share`;
    case "pe":
    case "fwd_pe":
    case "peg": {
      const name = field === "pe" ? "a P/E" : field === "fwd_pe" ? "a forward P/E" : "a PEG ratio";
      // A floor just above zero only keeps out loss-makers, whose P/E means nothing.
      if (both && min <= 0.01) return `have ${name} under ${times(max)}`;
      if (both) return `have ${name} between ${times(min)} and ${times(max)}`;
      return max !== undefined ? `have ${name} under ${times(max)}` : `have ${name} above ${times(min!)}`;
    }
    case "ps":
      if (both) return `trade between ${times(min)} and ${times(max)} times sales`;
      return max !== undefined ? `trade under ${times(max)} times sales` : `trade above ${times(min!)} times sales`;
    case "rev_growth":
      if (max !== undefined && max <= 0 && min === undefined) return "saw sales shrink over the last year";
      if (min !== undefined && min <= 0 && max === undefined) return "grew sales over the last year";
      if (both) return `grew sales between ${pct(min)} and ${pct(max)} over the last year`;
      return min !== undefined ? `grew sales ${pct(min)} or more over the last year` : `grew sales less than ${pct(max!)} over the last year`;
    case "rev_cagr_3y":
      if (min !== undefined && min <= 0 && max === undefined) return "grew sales over the last three years";
      return min !== undefined ? `grew sales ${pct(min)} or more a year over the last three years` : `grew sales less than ${pct(max!)} a year over the last three years`;
    case "eps_growth":
      if (min !== undefined && min <= 0 && max === undefined) return "grew earnings per share over the last year";
      if (max !== undefined && max <= 0 && min === undefined) return "saw earnings per share fall over the last year";
      return min !== undefined ? `grew earnings per share ${pct(min)} or more over the last year` : `grew earnings per share less than ${pct(max!)} over the last year`;
    case "net_margin":
      if (min !== undefined && min <= 0 && max === undefined) return "make a profit";
      if (max !== undefined && max <= 0 && min === undefined) return "lose money";
      return min !== undefined ? `keep ${pct(min)} or more of sales as profit` : `keep less than ${pct(max!)} of sales as profit`;
    case "op_margin":
      return min !== undefined ? `keep ${pct(min)} or more of sales as operating profit` : `keep less than ${pct(max!)} of sales as operating profit`;
    case "roic":
      return min !== undefined ? `earn ${pct(min)} or more a year on the money invested in them` : `earn less than ${pct(max!)} a year on the money invested in them`;
    case "roe":
      return min !== undefined ? `earn ${pct(min)} or more on shareholders' money` : `earn less than ${pct(max!)} on shareholders' money`;
    case "debt_equity":
      if (max !== undefined && min === undefined) return max === 0.5 ? "carry debt below half their equity" : `carry debt below ${times(max)} times their equity`;
      return `carry debt above ${times(min!)} times their equity`;
    case "net_cash":
      return min !== undefined && min >= 0 ? "hold more cash than debt" : "owe more than they hold in cash";
    case "div_yield":
      if (min !== undefined && min <= 0.01 && max === undefined) return "pay a dividend";
      if (both) return `yield between ${pct(min)} and ${pct(max)} in dividends`;
      return min !== undefined ? `yield ${pct(min)} or more in dividends` : `yield less than ${pct(max!)} in dividends`;
    case "div_growth":
      return min !== undefined && min <= 0.1 ? "have been raising their dividend" : `grew their dividend ${pct(min ?? 0)} or more a year`;
    case "div_growth_years":
      return `have raised their dividend at least ${Math.round(min ?? 0)} years in a row`;
    case "payout":
      return max !== undefined ? `pay out less than ${pct(max)} of profit as dividends` : `pay out more than ${pct(min!)} of profit as dividends`;
    case "buyback_yield":
      return `bought back ${pct(min ?? 0)} or more of their shares over the last year`;
    case "ret_6m":
      return min !== undefined ? `are up ${pct(min)} or more over six months` : `are down ${pct(Math.abs(max!))} or more over six months`;
    case "ret_ytd":
      if (min !== undefined && min <= 0 && max === undefined) return "are up this year";
      if (max !== undefined && max <= 0 && min === undefined) return max === 0 ? "are down this year" : `are down ${pct(max)} or more this year`;
      return min !== undefined ? `are up ${pct(min)} or more this year` : `are up less than ${pct(max!)} this year`;
    case "ret_1y":
      if (min !== undefined && max === undefined) return min <= 0 ? "are up over the past year" : `are up ${pct(min)} or more over the past year`;
      return max !== undefined && max <= 0 ? (max === 0 ? "are down over the past year" : `are down ${pct(max)} or more over the past year`) : `are up less than ${pct(max!)} over the past year`;
    case "vs_200d":
      return min !== undefined ? "trade above their 200-day average price" : "trade below their 200-day average price";
    case "from_hi_pct":
      if (min !== undefined && max === undefined) return `trade within ${pct(min)} of their one-year high`;
      return `trade ${pct(max ?? 0)} or more below their one-year high`;
    case "rsi":
      return max !== undefined ? `have a 14-day RSI under ${trimNumber(max, 0)}, a common oversold reading` : `have a 14-day RSI above ${trimNumber(min!, 0)}, a common overbought reading`;
    case "vol_90d":
      return max !== undefined ? `move calmly, with price swings under ${pct(max)} a year` : `swing ${pct(min!)} or more a year`;
    case "beta":
      return max !== undefined ? `move less than the market (beta under ${times(max)})` : `move more than the market (beta above ${times(min!)})`;
    case "short_float":
      return `have ${pct(min ?? 0)} or more of their shares sold short`;
    case "buy_pct":
      return `are rated a buy by ${pct(min ?? 0)} or more of the analysts who cover them`;
    case "upside":
      return `trade ${pct(min ?? 0)} or more below the average analyst price target`;
    case "inst_own":
      return min !== undefined ? `are ${pct(min)} or more owned by funds and other institutions` : `are less than ${pct(max!)} owned by funds and other institutions`;
    case "earnings_in_days":
      return `report earnings in the next ${Math.round(max ?? 7)} days`;
  }
}

const RANK_WORDS: Record<RankField, { desc: string; asc: string }> = {
  market_cap: { desc: "company value, largest first", asc: "company value, smallest first" },
  pe: { asc: "P/E, cheapest first", desc: "P/E, most expensive first" },
  div_yield: { desc: "dividend yield, highest first", asc: "dividend yield, lowest first" },
  rev_cagr_3y: { desc: "sales growth over three years, fastest first", asc: "sales growth over three years, slowest first" },
  rev_growth: { desc: "sales growth over the last year, fastest first", asc: "sales growth over the last year, slowest first" },
  eps_growth: { desc: "earnings growth, fastest first", asc: "earnings growth, slowest first" },
  ret_6m: { desc: "six-month return, strongest first", asc: "six-month return, weakest first" },
  from_hi_pct: { asc: "distance below the one-year high, furthest first", desc: "distance below the one-year high, closest first" },
  roic: { desc: "return on invested capital, highest first", asc: "return on invested capital, lowest first" },
  upside: { desc: "room to the analyst target, most first", asc: "room to the analyst target, least first" },
  short_float: { desc: "share of stock sold short, most first", asc: "share of stock sold short, least first" },
  vol_90d: { asc: "price swings, calmest first", desc: "price swings, wildest first" },
};

export function rankWords(rank: BasketSpec["rank"]): string {
  return `Ranked by ${RANK_WORDS[rank.field][rank.dir]}.`;
}

function topicLabel(id: TopicId): string {
  return TOPIC_BY_ID.get(id)?.label ?? id;
}

/** The subject at the head of the sentence: "Banks", "Companies in power generation, grid equipment or data-center cooling". */
export function subjectWords(spec: BasketSpec): string {
  const indexWords = spec.indexes.length > 0 ? ` in the ${joinList([...spec.indexes].map((name) => (name === "NASDAQ 100" ? "Nasdaq 100" : name)), "or")}` : "";
  if (spec.topics.length === 1) {
    const topic = TOPIC_BY_ID.get(spec.topics[0]!);
    return `${topic?.noun ?? "Companies"}${indexWords}`;
  }
  if (spec.topics.length > 1) return `Companies in ${joinList(spec.topics.map(topicLabel), "or")}${indexWords}`;
  return indexWords || spec.ties.length > 0 ? `Companies${indexWords}` : "Companies we cover";
}

/** The rule as one sentence, the way a person would say it back. */
export function specSentence(spec: BasketSpec): string {
  const predicates: string[] = [];
  if (spec.caps.length > 0) {
    const order = CAP_ORDER.filter((tier) => spec.caps.includes(tier));
    predicates.push(`are ${joinList(order.map((tier) => CAP_WORDS[tier]), "or")}`);
  }
  for (const field of FILTER_FIELDS) {
    const range = spec.ranges[field];
    if (range) predicates.push(rangePredicate(field, range));
  }
  if (spec.cheap) predicates.push("trade on a lower P/E than the middle of their sector");
  if (spec.zones.includes("add")) predicates.push("sit at or below our add price today");
  const tails: string[] = [];
  for (const id of spec.ties) {
    const topic = TOPIC_BY_ID.get(id);
    tails.push(topic?.tie ?? `that are also in ${topicLabel(id)}`);
  }
  if (spec.calls.length > 0) tails.push(`where our call says ${joinList(spec.calls.map((word) => CALL_PLAIN[word].toLowerCase()), "or")}`);

  let sentence = subjectWords(spec);
  if (predicates.length > 0) sentence += ` that ${joinList(predicates, "and")}`;
  if (tails.length > 0) sentence += `${predicates.length > 0 ? "," : ""} ${joinList(tails, "and")}`;
  if (spec.exclude.length > 0) sentence += `, leaving out ${joinList(spec.exclude.map(topicLabel), "and")}`;
  return `${sentence}.`;
}

/** A short name for the basket: the subject plus at most two conditions. Used as the page title. */
const AI_POWER_SET: TopicId[] = ["power", "grid", "cooling"];
const CAP_TITLE: Record<CapTier, string> = { mega: "Mega-cap", large: "Large-cap", mid: "Mid-cap", small: "Small-cap", micro: "Micro-cap" };

export function specTitle(spec: BasketSpec): string {
  const aiPower = AI_POWER_SET.every((id) => spec.topics.includes(id)) && spec.ties.includes("power_demand");
  const rest = aiPower ? spec.topics.filter((id) => !AI_POWER_SET.includes(id)) : spec.topics;
  let subject: string;
  if (aiPower && rest.length === 0) subject = "AI power stocks";
  else if (spec.topics.length === 1) subject = TOPIC_BY_ID.get(spec.topics[0]!)?.noun ?? "Stocks";
  else if (spec.topics.length === 2) subject = `${joinList(spec.topics.map(topicLabel), "and")} stocks`;
  else if (spec.topics.length > 2) subject = `${topicLabel(spec.topics[0]!)}, ${topicLabel(spec.topics[1]!)} and related stocks`;
  else if (spec.ties.includes("ai")) subject = "AI stocks";
  else if (spec.indexes.length > 0) subject = `${spec.indexes[0] === "NASDAQ 100" ? "Nasdaq 100" : spec.indexes[0]} stocks`;
  else subject = "Stocks";
  if (spec.caps.length === 1) subject = `${CAP_TITLE[spec.caps[0]!]} ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;

  const r = spec.ranges;
  const short = (value: number) => moneyWords(value).replace(" billion", "B").replace(" million", "M").replace(" trillion", "T");
  const parts: string[] = [];
  const add = (ok: unknown, text: () => string) => {
    if (ok) parts.push(text());
  };
  add(spec.ties.includes("ai") && !aiPower && spec.topics.length > 0, () => "tied to AI");
  add(r.market_cap?.max !== undefined && r.market_cap.min === undefined, () => `under ${short(r.market_cap!.max!)}`);
  add(r.market_cap?.min !== undefined && r.market_cap.max === undefined, () => `over ${short(r.market_cap!.min!)}`);
  add(r.market_cap?.min !== undefined && r.market_cap.max !== undefined, () => `worth ${short(r.market_cap!.min!)} to ${short(r.market_cap!.max!)}`);
  add(spec.cheap, () => "on a cheap P/E");
  add(r.pe?.max !== undefined, () => `with a P/E under ${trimNumber(r.pe!.max!, 1)}`);
  add(r.div_growth_years?.min !== undefined, () => `raising dividends ${Math.round(r.div_growth_years!.min!)}+ years`);
  add(r.div_yield?.min !== undefined && r.div_yield.min > 0.01, () => `yielding ${pct(r.div_yield!.min!)}+`);
  add(r.div_yield?.min !== undefined && r.div_yield.min <= 0.01 && !r.div_growth_years, () => "paying a dividend");
  add(r.rev_cagr_3y?.min !== undefined, () => `growing sales ${pct(r.rev_cagr_3y!.min!)} a year`);
  add(r.rev_growth?.min !== undefined && r.rev_growth.min > 0, () => `growing sales ${pct(r.rev_growth!.min!)}+`);
  add(r.ret_6m?.min !== undefined, () => "with momentum");
  add(r.from_hi_pct?.min !== undefined, () => "near their highs");
  add(r.from_hi_pct?.max !== undefined, () => "well off their highs");
  add(r.short_float?.min !== undefined, () => "heavily shorted");
  add(r.roic?.min !== undefined, () => "with high returns on capital");
  add(r.net_cash !== undefined, () => "with more cash than debt");
  add(r.price?.max !== undefined, () => `under $${trimNumber(r.price!.max!, 2)} a share`);
  add(r.earnings_in_days !== undefined, () => "reporting soon");
  add(r.buy_pct !== undefined, () => "that analysts rate a buy");
  add(r.vol_90d?.max !== undefined, () => "with calm prices");
  add(r.fwd_pe?.max !== undefined, () => `with a forward P/E under ${trimNumber(r.fwd_pe!.max!, 1)}`);
  add(r.peg?.max !== undefined, () => `with a PEG under ${trimNumber(r.peg!.max!, 2)}`);
  add(r.buyback_yield !== undefined, () => "buying back shares");
  add(r.upside !== undefined, () => "below analyst targets");
  add(r.rsi?.max !== undefined, () => "that look oversold");
  add(r.net_margin?.min !== undefined, () => "that make a profit");
  add(r.net_margin?.max !== undefined && r.net_margin.min === undefined, () => "losing money");
  add(r.debt_equity !== undefined, () => "with low debt");
  add(spec.calls.length > 0, () => `our call says ${joinList(spec.calls.map((word) => CALL_PLAIN[word].toLowerCase()), "or")}`);
  add(spec.indexes.length > 0 && subject !== `${spec.indexes[0] === "NASDAQ 100" ? "Nasdaq 100" : spec.indexes[0]} stocks`, () => `in the ${spec.indexes[0] === "NASDAQ 100" ? "Nasdaq 100" : spec.indexes[0]}`);
  const head = subject.charAt(0).toUpperCase() + subject.slice(1);
  return parts.length > 0 ? `${head} ${joinList(parts.slice(0, 2), "and")}` : head;
}

/** The URL slug: a few readable words from the title plus the spec key, so it is stable and unique. */
export function specSlug(spec: BasketSpec): string {
  const words = specTitle(spec)
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 8)
    .join("-");
  return `${words || "basket"}-${specKey(spec)}`;
}

export const SLUG_PATTERN = /^[a-z0-9-]{1,90}-[0-9a-f]{10}$/;

/**
 * The research theme a basket is the same as, when it is nothing but one
 * whole theme ("defense", "cybersecurity"). Such a basket points search
 * engines at the theme page; every other user-made basket stays out of the
 * index.
 */
export function themeSlugFor(spec: BasketSpec): string | null {
  if (spec.topics.length !== 1 || spec.ties.length > 0 || spec.exclude.length > 0) return null;
  if (spec.caps.length > 0 || Object.keys(spec.ranges).length > 0 || spec.cheap || usesCall(spec) || spec.indexes.length > 0) return null;
  const whole = (TOPIC_BY_ID.get(spec.topics[0]!)?.themes ?? []).filter((rule) => rule.slug !== "*" && !rule.text && !rule.role);
  return whole.length === 1 ? whole[0]!.slug : null;
}
