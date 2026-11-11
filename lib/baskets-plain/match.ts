/**
 * A basket spec applied to the screener snapshot: which companies pass, why
 * each one is in (in words built from its own stored fields), how many each
 * condition removed, and the order they are listed in. Pure: no I/O.
 */

import { isFiniteNumber, type CapTier, type Range, type ScreenerRow } from "@/lib/screener-shared";

import { FILTER_FIELDS, moneyWords, type BasketSpec, type FilterField } from "./spec";
import { TOPIC_BY_ID, matchTopic, type ThemeLine, type TopicFacts, type TopicHit, type TopicId } from "./topics";

export const BASKET_SHOWN = 25;

export type MatchContext = {
  /** Covered stocks from the screener snapshot (benchmarks and extras left out). */
  rows: readonly ScreenerRow[];
  /** Research-theme lines per ticker. */
  themes: ReadonlyMap<string, ThemeLine[]>;
  /** Industry labels from the instrument catalogue, for rows the snapshot has none for. */
  industries?: ReadonlyMap<string, string>;
};

export type BasketMember = {
  row: ScreenerRow;
  /** The subject it matched and how, when the basket has subjects. */
  topic: TopicHit | null;
  ties: TopicHit[];
  /** One or two full sentences: why it is in, from its own numbers. */
  why: string;
};

export type FunnelStep = {
  /** What the condition is, in a few words: "worth less than $50 billion". */
  label: string;
  /** Companies this condition removed from the ones still in. */
  removed: number;
  /** The largest companies it removed, for "the $50B limit left out CEG and VST". */
  examples: string[];
};

export type BasketMatch = {
  /** Companies with the subject (and ties), before any number filter. */
  subjectCount: number;
  members: BasketMember[];
  funnel: FunnelStep[];
  /** The median trailing P/E per sector today, used by "cheap". */
  sectorPe: ReadonlyMap<string, number>;
};

/* ── helpers ────────────────────────────────────────────────────────────── */

function inRange(value: unknown, range: Range): boolean {
  if (!isFiniteNumber(value)) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median of positive trailing P/Es per sector. A sector needs five to have a middle worth comparing with. */
export function sectorMedianPe(rows: readonly ScreenerRow[]): Map<string, number> {
  const bySector = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.sector || !isFiniteNumber(row.pe) || row.pe <= 0) continue;
    const list = bySector.get(row.sector) ?? [];
    list.push(row.pe);
    bySector.set(row.sector, list);
  }
  const out = new Map<string, number>();
  for (const [sector, values] of bySector) {
    const middle = values.length >= 5 ? median(values) : null;
    if (middle !== null) out.set(sector, middle);
  }
  return out;
}

/** An industry label that only repeats the sector ("Industrials") says nothing; the catalogue's may be better. */
function industryOf(row: ScreenerRow, industries?: ReadonlyMap<string, string>): string | null {
  const own = (row.industry ?? "").trim();
  if (own && own !== row.sector && !/^information technology$/i.test(own)) return own;
  const other = industries?.get(row.symbol)?.trim();
  return other || own || null;
}

export function topicFacts(row: ScreenerRow, context: Pick<MatchContext, "themes" | "industries">): TopicFacts {
  return {
    name: row.name ?? null,
    sector: row.sector ?? null,
    industry: industryOf(row, context.industries),
    themes: context.themes.get(row.symbol) ?? [],
    research: [row.thesis, row.call_reason].filter(Boolean).join(" ") || null,
  };
}

function hitFor(id: TopicId, facts: TopicFacts): TopicHit | null {
  const topic = TOPIC_BY_ID.get(id);
  return topic ? matchTopic(topic, facts) : null;
}

/* ── conditions, in the order the funnel reports them ───────────────────── */

type Condition = { label: string; test: (row: ScreenerRow) => boolean };

const CAP_LABEL: Record<CapTier, string> = { mega: "mega", large: "large", mid: "mid-sized", small: "small", micro: "micro" };

/** A short label for one filter in the funnel: "worth less than $50 billion". */
function conditionWords(field: FilterField, range: Range): string {
  const { min, max } = range;
  const value = (v: number) => (Math.abs(v) >= 1e6 ? moneyWords(v) : `${Number(v.toFixed(2))}`);
  const names: Partial<Record<FilterField, string>> = {
    market_cap: "company value",
    price: "share price",
    pe: "P/E",
    fwd_pe: "forward P/E",
    peg: "PEG",
    ps: "price to sales",
    rev_growth: "sales growth",
    rev_cagr_3y: "three-year sales growth",
    eps_growth: "earnings growth",
    net_margin: "profit margin",
    op_margin: "operating margin",
    roic: "return on capital",
    roe: "return on equity",
    debt_equity: "debt to equity",
    net_cash: "net cash",
    div_yield: "dividend yield",
    div_growth: "dividend growth",
    div_growth_years: "years of dividend raises",
    payout: "payout",
    buyback_yield: "buybacks",
    ret_6m: "six-month return",
    ret_ytd: "return this year",
    ret_1y: "one-year return",
    vs_200d: "200-day average",
    from_hi_pct: "distance from the high",
    rsi: "RSI",
    vol_90d: "price swings",
    beta: "beta",
    short_float: "short interest",
    buy_pct: "analyst buy share",
    upside: "room to the analyst target",
    inst_own: "institutional ownership",
    earnings_in_days: "next earnings date",
  };
  if (field === "market_cap") {
    if (min !== undefined && max !== undefined) return `worth ${moneyWords(min)} to ${moneyWords(max)}`;
    return max !== undefined ? `worth less than ${moneyWords(max)}` : `worth more than ${moneyWords(min!)}`;
  }
  if (field === "div_yield" && min !== undefined && min <= 0.01 && max === undefined) return "pays a dividend";
  if (field === "net_margin" && min !== undefined && min <= 0 && max === undefined) return "makes a profit";
  if (field === "net_cash") return "more cash than debt";
  const name = names[field] ?? field;
  const pctField = !["market_cap", "price", "pe", "fwd_pe", "peg", "ps", "debt_equity", "beta", "rsi", "div_growth_years", "earnings_in_days"].includes(field);
  const show = (v: number) => (pctField ? `${Number(v.toFixed(1))}%` : field === "price" ? `$${Number(v.toFixed(2))}` : value(v));
  if (min !== undefined && max !== undefined) return min <= 0.01 && ["pe", "fwd_pe", "peg"].includes(field) ? `${name} under ${show(max)}` : `${name} ${show(min)} to ${show(max)}`;
  return min !== undefined ? `${name} ${show(min)} or more` : `${name} ${show(max!)} or less`;
}

function conditions(spec: BasketSpec, sectorPe: ReadonlyMap<string, number>): Condition[] {
  const out: Condition[] = [];
  if (spec.indexes.length > 0) {
    out.push({ label: `in the ${spec.indexes.join(" or ")}`, test: (row) => spec.indexes.some((name) => (row.indexes ?? []).includes(name)) });
  }
  if (spec.caps.length > 0) {
    out.push({ label: `${spec.caps.map((tier) => CAP_LABEL[tier]).join(" or ")} companies`, test: (row) => Boolean(row.cap_tier && spec.caps.includes(row.cap_tier)) });
  }
  for (const field of FILTER_FIELDS) {
    const range = spec.ranges[field];
    if (!range) continue;
    out.push({ label: conditionWords(field, range), test: (row) => inRange((row as Record<string, unknown>)[field], range) });
  }
  if (spec.cheap) {
    out.push({
      label: "a P/E below its sector's middle",
      test: (row) => {
        const middle = row.sector ? sectorPe.get(row.sector) : undefined;
        return middle !== undefined && isFiniteNumber(row.pe) && row.pe > 0 && row.pe < middle;
      },
    });
  }
  if (spec.calls.length > 0) out.push({ label: `our call is ${spec.calls.join(" or ").toLowerCase()}`, test: (row) => Boolean(row.call && spec.calls.includes(row.call)) });
  if (spec.zones.length > 0) out.push({ label: "at our add price", test: (row) => Boolean(row.zone && spec.zones.includes(row.zone)) });
  return out;
}

/* ── why it's in ────────────────────────────────────────────────────────── */

function pct(value: number, digits = 1): string {
  return `${Number(Math.abs(value).toFixed(digits))}%`;
}

function money(value: number): string {
  return moneyWords(value);
}

/** One fact per filter, written from the row's own value. Null when the row has no value (it would not have passed). */
function factFor(field: FilterField, row: ScreenerRow): string | null {
  const v = (row as Record<string, unknown>)[field];
  if (!isFiniteNumber(v)) return null;
  switch (field) {
    case "market_cap":
      return `is worth ${money(v)}`;
    case "price":
      return `trades at $${v.toFixed(2)}`;
    case "pe":
      return `trades on ${v.toFixed(1)} times earnings`;
    case "fwd_pe":
      return `trades on ${v.toFixed(1)} times next year's expected earnings`;
    case "peg":
      return `has a PEG ratio of ${v.toFixed(2)}`;
    case "ps":
      return `trades on ${v.toFixed(1)} times sales`;
    case "rev_growth":
      return v >= 0 ? `grew sales ${pct(v)} on a year ago` : `saw sales fall ${pct(v)} on a year ago`;
    case "rev_cagr_3y":
      return v >= 0 ? `grew sales ${pct(v)} a year over three years` : `saw sales shrink ${pct(v)} a year over three years`;
    case "eps_growth":
      return v >= 0 ? `grew earnings per share ${pct(v)}` : `saw earnings per share fall ${pct(v)}`;
    case "net_margin":
      return v >= 0 ? `keeps ${pct(v)} of sales as profit` : `loses ${pct(v)} of sales`;
    case "op_margin":
      return v >= 0 ? `keeps ${pct(v)} of sales as operating profit` : `loses ${pct(v)} of sales before interest and tax`;
    case "roic":
      return v >= 0 ? `earns ${pct(v)} on the money invested in it` : `loses ${pct(v)} on the money invested in it`;
    case "roe":
      return v >= 0 ? `earns ${pct(v)} on shareholders' money` : `loses ${pct(v)} on shareholders' money`;
    case "debt_equity":
      return `carries debt of ${v.toFixed(2)} times its equity`;
    case "net_cash":
      return v >= 0 ? `holds ${money(v)} more cash than debt` : `owes ${money(Math.abs(v))} more than it holds in cash`;
    case "div_yield":
      return `yields ${pct(v, 2)}`;
    case "div_growth":
      return `has grown its dividend ${pct(v)} a year`;
    case "div_growth_years":
      return `has raised its dividend ${Math.round(v)} years in a row`;
    case "payout":
      return `pays out ${pct(v, 0)} of its profit`;
    case "buyback_yield":
      return `bought back ${pct(v)} of its shares over the last year`;
    case "ret_6m":
      return `is ${v >= 0 ? "up" : "down"} ${pct(v)} over six months`;
    case "ret_ytd":
      return `is ${v >= 0 ? "up" : "down"} ${pct(v)} this year`;
    case "ret_1y":
      return `is ${v >= 0 ? "up" : "down"} ${pct(v)} over the past year`;
    case "vs_200d":
      return `trades ${pct(v)} ${v >= 0 ? "above" : "below"} its 200-day average`;
    case "from_hi_pct":
      return v >= -0.05 ? "trades at its one-year high" : `trades ${pct(v)} below its one-year high`;
    case "rsi":
      return `has a 14-day RSI of ${v.toFixed(0)}`;
    case "vol_90d":
      return `swings about ${pct(v, 0)} a year`;
    case "beta":
      return `has a beta of ${v.toFixed(2)}`;
    case "short_float":
      return `has ${pct(v)} of its shares sold short`;
    case "buy_pct":
      return `is rated a buy by ${pct(v, 0)} of its analysts`;
    case "upside":
      return `trades ${pct(v)} ${v >= 0 ? "below" : "above"} the average analyst target`;
    case "inst_own":
      return `is ${pct(v, 0)} owned by funds and other institutions`;
    case "earnings_in_days":
      return v === 0 ? "reports earnings today" : `reports earnings in ${Math.round(v)} day${Math.round(v) === 1 ? "" : "s"}${row.earnings_date ? `, on ${shortDate(row.earnings_date)}` : ""}`;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-14" as "Nov 14". */
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  return month && day ? `${MONTHS[month - 1]} ${day}` : iso;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const MAX_FACTS = 4;

/** "Our AI capex research lists it for power and cooling. It is worth $42 billion and grew sales 18% a year over three years." */
export function whyLine(member: Omit<BasketMember, "why">, spec: BasketSpec, sectorPe: ReadonlyMap<string, number>): string {
  const sentences: string[] = [];
  // Two research hits with the same role read as one: "our Energy and AI capex research list it for reliable power".
  const hits = [member.topic, ...member.ties].filter((hit): hit is TopicHit => Boolean(hit));
  const byRole = new Map<string, { role: string; names: string[] }>();
  const clauses: string[] = [];
  for (const hit of hits) {
    if (!hit.theme) {
      clauses.push(hit.clause);
      continue;
    }
    const key = hit.theme.role.toLowerCase();
    if (!byRole.has(key)) clauses.push(`\u0000${key}`);
    const group = byRole.get(key) ?? { role: hit.theme.role, names: [] };
    if (!group.names.includes(hit.theme.name)) group.names.push(hit.theme.name);
    byRole.set(key, group);
  }
  const unique = [
    ...new Set(
      clauses.map((clause) => {
        if (!clause.startsWith("\u0000")) return clause;
        const group = byRole.get(clause.slice(1))!;
        // "Power & cooling" reads as a phrase mid-sentence; "U.S. uranium" keeps its capitals.
        const role = /^[A-Z][a-z]/.test(group.role) ? group.role[0]!.toLowerCase() + group.role.slice(1) : group.role;
        return `our ${joinAnd(group.names)} research ${group.names.length > 1 ? "list" : "lists"} it for ${role}`;
      }),
    ),
  ];
  if (unique.length > 0) sentences.push(`${capitalize(joinAnd(unique))}.`);

  const facts: string[] = [];
  const row = member.row;
  for (const field of FILTER_FIELDS) {
    if (!spec.ranges[field] || facts.length >= MAX_FACTS) continue;
    const fact = factFor(field, row);
    if (fact) facts.push(fact);
  }
  if (spec.cheap && facts.length < MAX_FACTS && isFiniteNumber(row.pe) && row.sector) {
    const middle = sectorPe.get(row.sector);
    if (middle !== undefined) facts.push(`trades on ${row.pe.toFixed(1)} times earnings, against ${middle.toFixed(1)} for the middle ${row.sector.toLowerCase()} stock`);
  }
  if (spec.caps.length > 0 && !spec.ranges.market_cap && isFiniteNumber(row.market_cap) && facts.length < MAX_FACTS) facts.unshift(`is worth ${money(row.market_cap)}`);
  if (spec.indexes.length > 0 && facts.length < MAX_FACTS) {
    const inIndex = spec.indexes.filter((name) => (row.indexes ?? []).includes(name));
    if (inIndex.length > 0) facts.push(`is in the ${inIndex[0] === "NASDAQ 100" ? "Nasdaq 100" : inIndex[0]}`);
  }
  if (spec.calls.length > 0 && row.call) facts.push(`our call on it is ${row.call.toLowerCase()}`);
  if (facts.length === 0 && isFiniteNumber(row.market_cap)) facts.push(`is worth ${money(row.market_cap)}`);
  if (facts.length > 0) {
    const [first, ...rest] = facts;
    // "our call on it is add" carries its own subject; everything else follows "It".
    const lead = first!.startsWith("our call") ? capitalize(first!) : `It ${first}`;
    sentences.push(`${joinAnd([lead, ...rest])}.`);
  }
  return sentences.join(" ");
}

/* ── the whole match ────────────────────────────────────────────────────── */

function rankValue(row: ScreenerRow, field: string): number | null {
  const value = (row as Record<string, unknown>)[field];
  return isFiniteNumber(value) ? value : null;
}

export function sortMembers<T extends { row: ScreenerRow }>(members: T[], rank: BasketSpec["rank"]): T[] {
  const factor = rank.dir === "asc" ? 1 : -1;
  return [...members].sort((a, b) => {
    const va = rankValue(a.row, rank.field);
    const vb = rankValue(b.row, rank.field);
    // Cheapest first only means something for a positive P/E.
    const ua = rank.field === "pe" && va !== null && va <= 0 ? null : va;
    const ub = rank.field === "pe" && vb !== null && vb <= 0 ? null : vb;
    if (ua === null && ub === null) return (b.row.market_cap ?? 0) - (a.row.market_cap ?? 0);
    if (ua === null) return 1;
    if (ub === null) return -1;
    return (ua - ub) * factor || (b.row.market_cap ?? 0) - (a.row.market_cap ?? 0);
  });
}

export function matchBasket(spec: BasketSpec, context: MatchContext): BasketMatch {
  const rows = context.rows.filter((row) => !row.benchmark && !row.uncovered);
  const sectorPe = sectorMedianPe(rows);

  // The subject first: any of the topics, every tie, none of the exclusions.
  type Candidate = { row: ScreenerRow; topic: TopicHit | null; ties: TopicHit[] };
  const subject: Candidate[] = [];
  for (const row of rows) {
    const facts = topicFacts(row, context);
    let topic: TopicHit | null = null;
    if (spec.topics.length > 0) {
      for (const id of spec.topics) {
        topic = hitFor(id, facts);
        if (topic) break;
      }
      if (!topic) continue;
    }
    const ties: TopicHit[] = [];
    let tied = true;
    for (const id of spec.ties) {
      const hit = hitFor(id, facts);
      if (!hit) {
        tied = false;
        break;
      }
      ties.push(hit);
    }
    if (!tied) continue;
    if (spec.exclude.some((id) => hitFor(id, facts) !== null)) continue;
    subject.push({ row, topic, ties });
  }

  // Then each condition in turn, counting what it removed.
  let current = subject;
  const funnel: FunnelStep[] = [];
  for (const condition of conditions(spec, sectorPe)) {
    const kept: Candidate[] = [];
    const removed: Candidate[] = [];
    for (const item of current) (condition.test(item.row) ? kept : removed).push(item);
    funnel.push({
      label: condition.label,
      removed: removed.length,
      examples: [...removed]
        .sort((a, b) => (b.row.market_cap ?? 0) - (a.row.market_cap ?? 0))
        .slice(0, 3)
        .map((item) => item.row.symbol),
    });
    current = kept;
  }

  const members = sortMembers(current, spec.rank).map((item) => ({ ...item, why: whyLine(item, spec, sectorPe) }));
  return { subjectCount: subject.length, members, funnel, sectorPe };
}
