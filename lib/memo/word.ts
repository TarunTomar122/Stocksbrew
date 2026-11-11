import { toItem } from "./build";
import type { BuiltMemo } from "./build";
import type { Memo, MemoFact } from "./types";

/**
 * Wording the memo, under a numbers check.
 *
 * The rules have already chosen the facts and written a sentence for each. A
 * model may reword those sentences and the top line, nothing more: it gets
 * each fact's sentence and values, and every sentence it sends back is
 * checked here. A sentence that cites a number that is not in its facts (at
 * the precision written and in the same unit: "2%" may stand for 1.84,
 * "2.1%" or "2 points" may not), says up where they say down, names a
 * ticker, company or weekday that is not in them, or reads like filler is
 * dropped, and the item keeps the rules' sentence. It is a check on figures
 * and names, not on meaning: a real figure pinned on the wrong stock in the
 * same item can still pass. Same idea as
 * backend/call_reason.py `numbers_supported`.
 */

export type ModelWording = { top_line?: unknown; items?: unknown };
export type MemoWordReader = (payload: WordingPayload) => Promise<ModelWording>;

export type WordingPayload = {
  subject: "mine" | "example";
  weekComplete: boolean;
  topLine: string;
  items: Array<{ id: string; section: string; text: string; data: Record<string, string | number | null> }>;
};

/* ── numbers ────────────────────────────────────────────────────────────── */

/** What a figure measures. A percentage must match a percentage, points must match points, dollars dollars. */
type Unit = "pct" | "points" | "money" | "plain";

type Found = { value: number; decimals: number; scale: number; unit: Unit };

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12 };

const NUMBER = /(\$\s?)?(\d[\d,]*(?:\.\d+)?)(\s?(?:trillion|billion|million|thousand|bn|mn)\b|[bmk]\b)?(\s?(?:%|percent\b|percentage points?\b|points?\b))?/gi;

const WORD_NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  twice: 2, double: 2, triple: 3, half: 0.5, quarter: 0.25, third: 1 / 3,
};

/** ISO dates and times, and "Nov 13", whose parts are not figures ("11%" is not supported by "2026-11-10" or "Nov 11"). */
const DATE_LIKE = /\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b/g;

export function numbersIn(text: string): Found[] {
  const out: Found[] = [];
  for (const match of (text ?? "").matchAll(NUMBER)) {
    const [, dollar, digits, scaleWord, unitWord] = match;
    const clean = digits!.replace(/,/g, "");
    const value = Number(clean);
    if (!Number.isFinite(value)) continue;
    const scale = scaleWord ? SCALE[scaleWord.trim().toLowerCase()] ?? 1 : 1;
    const decimals = clean.includes(".") ? clean.split(".")[1]!.length : 0;
    const word = (unitWord ?? "").trim().toLowerCase();
    const unit: Unit = dollar ? "money" : word === "%" || word === "percent" ? "pct" : word ? "points" : scaleWord ? "money" : "plain";
    out.push({ value: value * scale, decimals, scale, unit });
  }
  return out;
}

function wordNumbers(text: string): Found[] {
  const out: Found[] = [];
  const lower = (text ?? "").toLowerCase();
  for (const match of lower.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twice|double|triple|half|quarter|third)\b/g)) {
    // "third-quarter" and "a quarter of the year" are calendar words, not figures: look at what follows the word.
    const after = lower.slice(match.index! + match[0].length, match.index! + match[0].length + 20);
    const before = lower.slice(Math.max(0, match.index! - 12), match.index!);
    if (match[1] === "third" && /^[-\s]*(?:quarter|of the (?:year|fiscal)|fiscal|year)/.test(after)) continue;
    // "third-quarter", "this quarter", "last quarter": a calendar quarter. "a quarter of" is a figure.
    if (match[1] === "quarter" && (/(?:first|second|third|fourth|last|next|this|that|the|each|per|every|fiscal)[-\s]$/.test(before) || /^[-\s]*(?:results|earnings|report)/.test(after))) continue;
    out.push({ value: WORD_NUMBERS[match[1]!]!, decimals: 2, scale: 1, unit: "plain" });
  }
  return out;
}

export type Evidence = {
  /** Every number in the facts, date parts included. */
  all: number[];
  /** Figures by what they measure (dates taken out), from the facts' sentences and their named values. */
  byUnit: Record<Exclude<Unit, "plain">, number[]>;
  /** Tickers the facts are about. */
  tickers: Set<string>;
  /** The facts' own words, for names, weekdays and direction. */
  text: string;
};

/** Which unit a value in `data` is, from its key ("best_pct", "best_points", "sold_usd"). */
function unitOfKey(key: string): Exclude<Unit, "plain"> | null {
  if (/_pct$/.test(key)) return "pct";
  if (/_points$/.test(key)) return "points";
  if (/(_usd|_amount|amount_low|amount_high|per_share|eps_actual|eps_estimate)$/.test(key)) return "money";
  return null;
}

export function evidenceFor(facts: readonly Pick<MemoFact, "text" | "data" | "tickers">[], extra: readonly string[] = []): Evidence {
  const texts: string[] = [...extra];
  const raw: number[] = [];
  const byUnit: Evidence["byUnit"] = { pct: [], points: [], money: [] };
  const tickers = new Set<string>();
  for (const fact of facts) {
    texts.push(fact.text);
    for (const ticker of fact.tickers) tickers.add(ticker.toUpperCase());
    for (const [key, value] of Object.entries(fact.data)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        raw.push(Math.abs(value));
        const unit = unitOfKey(key);
        if (unit) byUnit[unit].push(Math.abs(value));
      } else if (typeof value === "string") {
        texts.push(value);
        if (/^[A-Z][A-Z.]{0,5}$/.test(value)) tickers.add(value);
      }
    }
  }
  const joined = texts.join(" \n ");
  for (const found of numbersIn(joined.replace(DATE_LIKE, " "))) {
    if (found.unit !== "plain") byUnit[found.unit].push(Math.abs(found.value));
  }
  return { all: [...raw, ...numbersIn(joined).map((found) => Math.abs(found.value))], byUnit, tickers, text: joined };
}

/** The number as written could be a rounding of `known`: within half a unit of its last written digit. */
function matches(found: Found, known: number): boolean {
  const unit = found.scale * 10 ** -found.decimals;
  return Math.abs(Math.abs(found.value) - known) <= unit / 2 + 1e-9;
}

/** Why a number in `sentence` is not backed by the evidence, or null when every one is. */
export function unsupportedNumber(sentence: string, evidence: Evidence): string | null {
  for (const found of numbersIn(sentence)) {
    const pool = found.unit === "plain" ? evidence.all : evidence.byUnit[found.unit];
    if (!pool.some((known) => matches(found, known))) return `number not in the facts: ${found.value}${found.unit === "plain" ? "" : ` (${found.unit})`}`;
  }
  for (const found of wordNumbers(sentence)) {
    if (!evidence.all.some((known) => Math.abs(known - found.value) < 0.01)) return `number word not in the facts: ${found.value}`;
  }
  return null;
}

/* ── direction, days and names ──────────────────────────────────────────── */

const UP_WORDS = /\b(?:rose|rise|rises|rising|gained|gains?|climbed|jumped|added|lifted|lift|ahead|beat|beats|outpaced|higher|raised|bought|buying|up)\b/i;
const DOWN_WORDS = /\b(?:fell|falls?|falling|dropped|drops?|slid|sank|lost|loses?|costing|cost|behind|trailed|trailing|missed|lower|cut|sold|selling|damage|down)\b/i;
const WEEKDAYS = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g;

/**
 * A sentence that says something went up when the facts only say it went
 * down (or the other way round), or that names a weekday or one of the
 * portfolio's companies the facts do not, is not the facts' sentence.
 */
export function unsupportedWords(sentence: string, evidence: Evidence, names: readonly string[] = []): string | null {
  if (UP_WORDS.test(sentence) && !UP_WORDS.test(evidence.text)) return "says up where the facts say down";
  if (DOWN_WORDS.test(sentence) && !DOWN_WORDS.test(evidence.text)) return "says down where the facts say up";
  for (const match of sentence.matchAll(WEEKDAYS)) if (!evidence.text.includes(match[0])) return `weekday not in the facts: ${match[0]}`;
  for (const name of names) {
    if (name.length < 3) continue;
    const pattern = new RegExp(`(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
    if (pattern.test(sentence) && !pattern.test(evidence.text)) return `company not in the facts: ${name}`;
  }
  return null;
}

/* ── the rest of the sentence check ─────────────────────────────────────── */

const ACRONYMS = new Set([
  "AI", "CEO", "CFO", "COO", "CTO", "EPS", "ETF", "ETFS", "SEC", "US", "USA", "FDA", "GDP", "IPO", "ET", "EST", "NYSE", "OK",
  "FY", "YOY", "GAAP", "LLC", "INC", "PLC", "AM", "PM", "QQQ", "VOO", "SPY", "IVV", "UK", "EU", "FED", "ESG", "REIT", "NASDAQ",
]);

const BANNED: RegExp[] = [
  /\bAI-powered\b/i,
  /\bactionable\b/i,
  /\binstitutional-grade\b/i,
  /\bstay ahead\b/i,
  /\bcut through the noise\b/i,
  /\bthe tape\b/i,
  /\bnavigat(?:e|ing)\b/i,
  /\blandscape\b/i,
  /\bdelve\b/i,
  /\bbuckle up\b/i,
  /\bin conclusion\b/i,
  /\bit'?s worth noting\b/i,
  /\bnot just\b.*\bbut\b/i,
  /\bwe (?:predict|guarantee|expect the stock to)\b/i,
  /\b(?:buy|sell) now\b/i,
  /[{}[\]<>]/,
  /—/, // em dash
  /…|\.\.\./,
];

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=["'“(]?[A-Z0-9$])/;

export function sentencesOf(text: string): string[] {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Why one sentence from the model cannot be used, or null when it can. */
export function rejectSentence(sentence: string, evidence: Evidence, names: readonly string[] = []): string | null {
  if (sentence.length < 12) return "too short";
  if (sentence.length > 260) return "too long";
  if (!/[.!?]["')”]?$/.test(sentence)) return "not a full sentence";
  for (const pattern of BANNED) if (pattern.test(sentence)) return `filler or banned: ${pattern.source}`;
  const number = unsupportedNumber(sentence, evidence);
  if (number) return number;
  const words = unsupportedWords(sentence, evidence, names);
  if (words) return words;
  for (const match of sentence.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const token = match[0];
    if (!ACRONYMS.has(token) && !evidence.tickers.has(token)) return `stock not in the facts: ${token}`;
  }
  return null;
}

/** The sentences of `text` that pass, joined; and what was dropped, with why. */
export function keepSupported(
  text: unknown,
  evidence: Evidence,
  maxSentences: number,
  names: readonly string[] = [],
): { text: string; dropped: Array<{ sentence: string; why: string }> } {
  if (typeof text !== "string") return { text: "", dropped: [] };
  const kept: string[] = [];
  const dropped: Array<{ sentence: string; why: string }> = [];
  for (const sentence of sentencesOf(text)) {
    const why = kept.length >= maxSentences ? "too many sentences" : rejectSentence(sentence, evidence, names);
    if (why) dropped.push({ sentence, why });
    else kept.push(sentence);
  }
  return { text: kept.join(" "), dropped };
}

/* ── applying a model's wording ─────────────────────────────────────────── */

export function wordingPayload(built: BuiltMemo): WordingPayload {
  const section = new Map<string, string>();
  for (const item of built.memo.changed) section.set(item.id, "what changed");
  for (const item of built.memo.hurt) section.set(item.id, "what could hurt");
  for (const item of built.memo.look) section.set(item.id, "worth a look");
  return {
    subject: built.memo.subject,
    weekComplete: built.memo.complete,
    topLine: built.memo.topLine,
    items: built.chosen.map((fact) => ({ id: fact.id, section: section.get(fact.id) ?? "", text: fact.text, data: fact.data })),
  };
}

export type WordingResult = { memo: Memo; dropped: Array<{ id: string; sentence: string; why: string }> };

/**
 * The memo with the model's sentences where they pass, the rules' elsewhere.
 * Each item is checked against its own fact only; the top line against all of
 * them. An item or top line that loses any sentence keeps the rules' text
 * whole: half a reworded item can drop the part that mattered, or keep a
 * sentence that only made sense next to the one that went.
 */
export function applyWording(built: BuiltMemo, wording: ModelWording | null | undefined): WordingResult {
  if (!wording || typeof wording !== "object") return { memo: built.memo, dropped: [] };
  const byId = new Map<string, unknown>();
  if (Array.isArray(wording.items)) {
    for (const row of wording.items as Array<{ id?: unknown; text?: unknown }>) {
      if (row && typeof row.id === "string") byId.set(row.id, row.text);
    }
  }
  const dropped: WordingResult["dropped"] = [];
  let used = false;
  const factOf = new Map(built.chosen.map((fact) => [fact.id, fact]));
  const reword = (items: Memo["changed"]) =>
    items.map((item) => {
      const fact = factOf.get(item.id);
      if (!fact || !byId.has(item.id)) return item;
      const result = keepSupported(byId.get(item.id), evidenceFor([fact]), 2, built.names);
      for (const drop of result.dropped) dropped.push({ id: item.id, ...drop });
      if (!result.text || result.dropped.length > 0) return item;
      used = true;
      return toItem(fact, result.text);
    });

  const memo: Memo = { ...built.memo, changed: reword(built.memo.changed), hurt: reword(built.memo.hurt), look: reword(built.memo.look) };
  if (typeof wording.top_line === "string") {
    const top = keepSupported(wording.top_line, evidenceFor(built.chosen, [built.memo.topLine]), sentencesOf(built.memo.topLine).length, built.names);
    for (const drop of top.dropped) dropped.push({ id: "top_line", ...drop });
    // Same number of sentences as the rules' line, and it keeps "Together" and the holding a partial week leaves out.
    const keeps = (built.topLineMustSay ?? []).every((word) => top.text.toLowerCase().includes(word.toLowerCase()));
    if (top.dropped.length === 0 && keeps && sentencesOf(top.text).length === sentencesOf(built.memo.topLine).length) {
      memo.topLine = top.text;
      used = true;
    }
  }
  if (used) memo.wordedBy = "model";
  return { memo, dropped };
}
