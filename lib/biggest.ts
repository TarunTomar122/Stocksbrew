/**
 * "Biggest things" at the top of /agent and the briefing (owner, Nov 13: "I would have just liked the biggest things,
 * like the post-market increase of Cerebras and some big news about SMCI"): the few biggest real events on the
 * person's stocks since the last trading day, one card each, ranked by impact.
 *
 * Pure: no React, no I/O, no clock. Each page turns what it already read into candidates (lib/thread/server.ts from the
 * inbox and the extended quotes; the briefing from its Overnight, Why it moved and Since you last looked modules), and
 * this ranks them the same way on both.
 *
 * The ranking, deterministic:
 *   score = size × kind weight × normal-day factor × holding weight
 * - size: the move that is the story, in percent (an after-hours or pre-market move when that is the story). An
 *   insider buy has no move of its own: $1M or more counts as a 6% move, $250K or more as 4%. A filing that adds risks
 *   counts as 4%. A report with no reaction yet counts as 3%.
 * - kind weight: results 1.5, a move with a confirmed news reason or an analyst's rating 1.4, a filing or an insider
 *   buy 1.0, a move with no confirmed reason 0.7 (an upgrade behind a 6% move outranks a 6% move nobody explained).
 * - normal-day factor (moves only, when the stock's normal day is known): half the move's multiple of a normal day,
 *   held between 0.6 and 1.5, so a 6% move on a stock that moves 5% a day ranks under a 5% move on one that moves 2%.
 * - holding weight: 1.25 for a stock the person owns, 1 for one they watch.
 * - Not big enough to list: a move without a reason under 5% or under 1.5 times the stock's normal day, a news or
 *   analyst move under 3%, an insider buy under $250K. Ties go to the stock owned, then the bigger move, then the ticker.
 * One card per stock (its biggest event), at most BIGGEST_MAX.
 */

export type BigKind = "results" | "news" | "analyst" | "move" | "insider" | "filing";

export type BigCandidate = {
  ticker: string;
  /** The company's name, for the card ("Super Micro"); the ticker when unknown. */
  name: string;
  kind: BigKind;
  /** The move that is the story, percent (signed); for an insider buy or a filing, the stock's day move beside it (or null). */
  pct: number | null;
  /** The move is an after-hours or pre-market print, not a session's. */
  session: "post" | "pre" | null;
  /** The price beside the move: the print's own price for a session move, else the latest price. */
  price: number | null;
  /** The stock's normal day (its average absolute daily move), percent, when known. */
  normalPct?: number | null;
  holding: boolean;
  /** What happened, one sentence of at most 15 words that does not repeat the move's figure; null when only the move says it. */
  line: string | null;
  /** The New York day of the event, YYYY-MM-DD. */
  day: string | null;
  /** Who reported it, for the card's hover ("Reuters", "SEC Form 4"). */
  source: string | null;
  href: string;
  /** An insider buy's size in dollars. */
  amount?: number | null;
  /** The records it came from (inbox item ids on /agent), so the record below does not tell it again. */
  ids?: string[];
};

export type BigThing = BigCandidate & { score: number };

/** At most this many cards. */
export const BIGGEST_MAX = 4;
/** A move without a confirmed reason is listed from this size (the size of the agent's own "big move"). */
export const MOVE_MIN_PCT = 5;
/** A move without a reason under this multiple of the stock's normal day is an ordinary day for it, never listed. */
export const ORDINARY_RATIO = 1.5;
/** A move with a confirmed news reason or a rating change is listed from this size. */
export const NEWS_MIN_PCT = 3;
/** An insider buy is listed from this size, in dollars. */
export const INSIDER_MIN_USD = 250_000;
/** The most words a card's line may have (owner rule 8). */
export const LINE_MAX_WORDS = 15;

const KIND_WEIGHT: Record<BigKind, number> = { results: 1.5, news: 1.4, analyst: 1.4, filing: 1, insider: 1, move: 0.7 };
const HOLDING_WEIGHT = 1.25;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The event's size before weights (see the module comment); null when it is not big enough to list. */
export function bigSize(candidate: Pick<BigCandidate, "kind" | "pct" | "amount" | "normalPct">): number | null {
  const move = fin(candidate.pct) ? Math.abs(candidate.pct) : null;
  switch (candidate.kind) {
    case "results":
      return move ?? 3;
    case "news":
    case "analyst":
      return move !== null && move >= NEWS_MIN_PCT ? move : null;
    case "move":
      // A move about the size of the stock's normal day is not news, however big it is in percent.
      if (fin(candidate.normalPct) && candidate.normalPct > 0 && move !== null && move / candidate.normalPct < ORDINARY_RATIO) return null;
      return move !== null && move >= MOVE_MIN_PCT ? move : null;
    case "insider": {
      const amount = fin(candidate.amount) ? candidate.amount : 0;
      if (amount < INSIDER_MIN_USD) return null;
      return amount >= 1_000_000 ? 6 : 4;
    }
    case "filing":
      return 4;
    default:
      return null;
  }
}

/** The normal-day factor: half the move's multiple of a normal day, between 0.6 and 1.5; 1 when either is unknown. */
export function normalFactor(pct: number | null, normalPct: number | null | undefined): number {
  if (!fin(pct) || !fin(normalPct) || normalPct <= 0) return 1;
  return Math.min(1.5, Math.max(0.6, Math.abs(pct) / normalPct / 2));
}

/** The candidate's score, or null when it is not big enough to list. */
export function bigScore(candidate: BigCandidate): number | null {
  const size = bigSize(candidate);
  if (size === null) return null;
  const moveKind = candidate.kind === "move" || candidate.kind === "news" || candidate.kind === "analyst";
  const factor = moveKind ? normalFactor(candidate.pct, candidate.normalPct) : 1;
  const score = size * KIND_WEIGHT[candidate.kind] * factor * (candidate.holding ? HOLDING_WEIGHT : 1);
  // Rounded, so the order never hangs on floating-point noise.
  return Math.round(score * 1000) / 1000;
}

function rank(a: BigThing, b: BigThing): number {
  return (
    b.score - a.score ||
    Number(b.holding) - Number(a.holding) ||
    Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) ||
    a.ticker.localeCompare(b.ticker)
  );
}

/** The biggest events, one per stock (its biggest), strongest first, at most `max`. */
export function biggestThings(candidates: readonly BigCandidate[], max = BIGGEST_MAX): BigThing[] {
  const best = new Map<string, BigThing>();
  for (const candidate of candidates) {
    const ticker = candidate.ticker.trim().toUpperCase();
    if (!ticker) continue;
    const score = bigScore(candidate);
    if (score === null) continue;
    const thing: BigThing = { ...candidate, ticker, score };
    const held = best.get(ticker);
    // Another event on the same stock stays where it was (the record, its module): only the one shown is told here.
    if (!held || rank(thing, held) < 0) best.set(ticker, thing);
  }
  return [...best.values()].sort(rank).slice(0, Math.max(0, max));
}

/* ── words ──────────────────────────────────────────────────────────────── */

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The first whole sentence, ending in a stop; "" when there is none. */
function sentence(text: string): string {
  const trimmed = text.trim();
  const match = /^(.+?(?<!\b(?:[A-Z]|Inc|Corp|Co|Ltd|Jr|Sr|Dr|Mr|Mrs|Ms|St|vs|No))[.!?])\s+(?=[A-Z0-9"“$])/.exec(trimmed);
  const first = (match ? match[1]! : trimmed).trim();
  if (!first) return "";
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/** The first candidate that is one sentence of at most LINE_MAX_WORDS words, capitalised; null when none fits. */
export function fitLine(candidates: ReadonlyArray<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const line = sentence(raw ?? "");
    if (line && wordCount(line) <= LINE_MAX_WORDS) return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
  }
  return null;
}

/** "$1.2 million", "$1.2M", "$499,880" in a sentence, in dollars; null without one. */
export function dollarsIn(text: string): number | null {
  const match = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand|[MBK])?\b/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]!.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  const scale = unit === "billion" || unit === "b" ? 1e9 : unit === "million" || unit === "m" ? 1e6 : unit === "thousand" || unit === "k" ? 1e3 : 1;
  return value * scale;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A confirmed reason that is an analyst's rating or target: the card's kind is "Analyst". */
export const RATING = /\b(?:upgrade[sd]?|downgrade[sd]?|price target|initiat(?:es|ed) coverage|outperform|underperform|overweight|underweight)\b/i;

/** "CBRS, which you own, reported …" → "reported …", "2 insiders at COHR bought" → "2 insiders bought": the card already names the stock. */
export function withoutTicker(text: string, ticker: string): string {
  const t = escape(ticker);
  return text
    .replace(new RegExp(`^${t}(?:'s)?,\\s+which you (?:own|watch),\\s+`), "")
    .replace(new RegExp(`^${t}'s\\s+`), "Its ")
    .replace(new RegExp(`^${t}\\s+`), "")
    .replace(new RegExp(`,?\\s+(?:at|of)\\s+${t}\\b`, "g"), "")
    .trim();
}
