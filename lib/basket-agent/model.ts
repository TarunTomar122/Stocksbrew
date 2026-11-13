/**
 * Idea baskets an agent watches ("basket thesis" agents): a person's investment idea in their own words, the
 * companies that carry it, and for each one a reason with a reason kind. The kind decides the check: the reason
 * watcher's rules for that kind (lib/thesis-watch/rules.ts) run on that company's facts.
 *
 * Pure: the types, the limits, reading and cleaning a draft, the ids. No server imports, so the editor, the routes
 * and the tests share them.
 *
 * Stored in `tm_agent_baskets/{uid}__{id}` (the basket and its switch) and `tm_agent_basket_runs/{uid}__{id}__{day}`
 * (one dated decision per market day). Additive only: removing a basket marks it archived, nothing is deleted.
 */

import { isThesisKind, THESIS_KINDS, type ThesisKind } from "@/lib/thesis";
import type { Verdict } from "@/lib/thesis-watch/rules";

export const BASKETS_COLLECTION = "tm_agent_baskets";
/** An Ask basket answer hands its reasons to the editor here (the address carries only the idea and the tickers). */
export const ASK_HANDOFF_KEY = "stocksbrew:basket-draft";
export const BASKET_RUNS_COLLECTION = "tm_agent_basket_runs";

export const MIN_LINES = 2;
export const MAX_LINES = 12;
export const MAX_NAME = 60;
export const MAX_IDEA = 280;
export const MAX_REASON = 200;
/** Saved baskets per person, running or paused (the plan's running limit is separate: lib/entitlements.ts agents). */
export const MAX_BASKETS_PER_USER = 20;
/** A company dropped from the basket is not proposed again for this many days. */
export const READD_COOLDOWN_DAYS = 30;
export const BASKET_ID_RE = /^[a-z0-9]{6,24}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/* ── types ──────────────────────────────────────────────────────────────── */

export type BasketSource =
  | { kind: "theme"; slug: string }
  | { kind: "ask" }
  | { kind: "own" };

export type BasketLineDraft = {
  ticker: string;
  company: string | null;
  kind: ThesisKind;
  /** Why this company carries the idea, in a sentence. */
  reason: string;
};

export type BasketLine = BasketLineDraft & {
  /** When it joined the basket (ISO): the start of a trade's clock, and the close a long-term reason is held against. */
  added_at: string;
};

export type BasketDraft = {
  name: string;
  /** The idea in the person's words. */
  idea: string;
  source: BasketSource;
  lines: BasketLineDraft[];
};

export type ReplaySummary = {
  from: string;
  to: string;
  sessions: number;
  /** The sessions it checked, oldest first. */
  days: string[];
  /** Each change the replay would have proposed, on the first day it would have. */
  proposals: Array<{
    op: BasketChange["op"];
    ticker: string;
    line: string;
    first: string;
    days: number;
  }>;
  counts: Record<BasketDecision, number>;
  notes: string[];
  replayed_at: string;
  /** The companies it was replayed on: after an edit or an accepted proposal the page says it was an earlier basket. */
  tickers?: string[];
};

export type BasketAgent = Omit<BasketDraft, "lines"> & {
  id: string;
  uid: string;
  lines: BasketLine[];
  enabled: boolean;
  archived?: boolean;
  created_at: string;
  updated_at: string;
  /** The last market day a run decided, YYYY-MM-DD. */
  last_checked_day: string | null;
  /** The replay run before it was switched on, kept with it. */
  replay: ReplaySummary | null;
  /** Companies taken out, and the day: not proposed again for READD_COOLDOWN_DAYS. */
  dropped: Array<{ ticker: string; day: string }>;
  /**
   * Goes up by one with every change to the companies (an edit, an accepted proposal). The editor sends the version
   * it opened, so a save never undoes a change made since in another tab.
   */
  version: number;
};

export type StatusVerdict = Verdict | "unknown";

/** One company's reason on one day. */
export type LineStatus = {
  ticker: string;
  kind: ThesisKind;
  verdict: StatusVerdict;
  /** One line, at most 15 words: the fact that decided it, or the figure that backs a reason that holds. */
  line: string;
  /** The rule that fired worst, when one did. */
  signal: { id: string; level: string; text: string; asOf: string } | null;
  /** The figure the basket compares companies on, for this kind of reason. */
  metric: MetricValue | null;
  asOf: string | null;
};

export type MetricValue = {
  label: string;
  value: number;
  text: string;
  better: "higher" | "lower";
};

export type BasketChange = {
  op: "drop" | "add";
  ticker: string;
  company: string | null;
  kind: ThesisKind;
  /** The one fact that decides it, at most 15 words. */
  line: string;
  /** add: the reason saved with it when accepted. */
  reason?: string | null;
  /** drop: the verdict and the rule behind it. */
  verdict?: Verdict | null;
  signal_id?: string | null;
  /**
   * The first day of the unbroken stretch of checks that proposed this change (days that could not check do not break
   * it): one proposal per stretch, however long it lasts.
   */
  since?: string;
  /** The figure that decides an add, and what it is held against (the weakest company). */
  fact?: {
    label: string;
    value: number;
    text: string;
    versus: { ticker: string; value: number; text: string } | null;
  } | null;
};

export type BasketDecision = "propose" | "nothing" | "could_not_check";

export type BasketEvaluation = {
  day: string;
  decision: BasketDecision;
  /** One sentence, at most 15 words. */
  summary: string;
  statuses: LineStatus[];
  changes: BasketChange[];
  /** Companies with no facts that day. */
  missing: string[];
};

export type BasketRun = BasketEvaluation & {
  id: string;
  uid: string;
  basket_id: string;
  basket_name: string;
  ran_at: string;
};

/* ── words ──────────────────────────────────────────────────────────────── */

export const KIND_WORDS: Record<ThesisKind, string> = {
  growth: "Growth",
  dividend: "Dividend",
  value: "Value",
  product: "Product",
  long_term: "Long-term",
  trade: "Short-term trade",
};

export const VERDICT_SHORT: Record<StatusVerdict, string> = {
  holds: "Holds",
  weaker: "Weaker",
  broken: "Broken",
  played_out: "Played out",
  unknown: "Not checked",
};

export const wordCount = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

/* ── cleaning ───────────────────────────────────────────────────────────── */

/** Whitespace collapsed and control characters dropped. Never cut: a text over its limit is refused, not sliced. */
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A reason that fits: whole when it is short enough, else its first sentence when that is, else nothing (the editor
 * then asks for one). Never cut mid-sentence.
 */
export function reasonText(text: string | null | undefined): string {
  const clean = cleanText(text ?? "");
  if (clean.length <= MAX_REASON) return clean;
  const first = clean.split(/(?<=[.!?])\s+/)[0] ?? "";
  return first.length <= MAX_REASON ? first : "";
}

/**
 * A reason a screen wrote "today" is kept with the day it was true: `It passes the "X" screen today:` becomes `It
 * passed the "X" screen on Nov 12:`, so a saved reason does not go on saying "today".
 */
export function datedReason(text: string, dayLabel: string): string {
  return text
    .replace(
      /\bIt passes the ("[^"]+") screen today\b/,
      `It passed the $1 screen on ${dayLabel}`,
    )
    // "today's AI data centers" means the ones of our time, not a day: only a bare "today" is dated.
    .replace(/\btoday\b(?!['’]s\b)/gi, `on ${dayLabel}`);
}

export function cleanTicker(value: unknown): string | null {
  const ticker =
    typeof value === "string"
      ? value.trim().toUpperCase().replace(/^\$/, "")
      : "";
  return TICKER_RE.test(ticker) ? ticker : null;
}

export function instrumentIdOf(ticker: string): string {
  return `US_${ticker.replace(/[.\-]/g, "_")}`;
}

// Only words that clearly name the kind: "rising incomes", "trade war winners" or "travel rebound" stay growth ideas.
const DIVIDEND_WORDS =
  /\b(dividends?|dividend income|yields?|payouts?|aristocrats?)\b/i;
const VALUE_WORDS =
  /\b(cheap|undervalued|bargains?|discounted|beaten[- ]down|oversold|value stocks?)\b/i;
const TRADE_WORDS = /\b(short[- ]term|swing trades?|quick trades?)\b/i;
const LONG_WORDS =
  /\b(long[- ]term|forever|decades?|for years|compounders?|buy and hold)\b/i;
const PRODUCT_WORDS = /\b(products?|brands?|believe in)\b/i;

/** The reason kind an idea reads as, for companies added without one. Growth when nothing else fits. */
export function inferKind(idea: string): ThesisKind {
  if (DIVIDEND_WORDS.test(idea)) return "dividend";
  if (VALUE_WORDS.test(idea)) return "value";
  if (TRADE_WORDS.test(idea)) return "trade";
  if (LONG_WORDS.test(idea)) return "long_term";
  if (PRODUCT_WORDS.test(idea)) return "product";
  return "growth";
}

/** The kind most of the basket's reasons have (ties go to the first in THESIS_KINDS order): new companies get it. */
export function mainKind(
  lines: ReadonlyArray<{ kind: ThesisKind }>,
  idea = "",
): ThesisKind {
  if (lines.length === 0) return inferKind(idea);
  const counts = new Map<ThesisKind, number>();
  for (const line of lines)
    counts.set(line.kind, (counts.get(line.kind) ?? 0) + 1);
  return [...THESIS_KINDS].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  )[0]!;
}

/** "AI power demand" from the idea: its first few words, for a basket the person did not name. */
export function nameFromIdea(idea: string): string {
  // A sentence ends at ". " (or the end): "U.S. power grid" keeps its dots.
  const words = cleanText(idea)
    .replace(/[.!?](?:\s+(?=[A-Z0-9"“]).*)?$/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  const name = words.join(" ");
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : "My idea";
}

function readSource(raw: unknown): BasketSource {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (
    source.kind === "theme" &&
    typeof source.slug === "string" &&
    /^[a-z0-9-]{1,60}$/.test(source.slug)
  )
    return { kind: "theme", slug: source.slug };
  if (source.kind === "ask") return { kind: "ask" };
  return { kind: "own" };
}

export type DraftResult =
  | { ok: true; draft: BasketDraft }
  | { ok: false; error: string };

/** A draft from a request body, cleaned, or why it was refused. Duplicate tickers keep the first line. */
export function parseBasketDraft(raw: unknown): DraftResult {
  if (!raw || typeof raw !== "object")
    return {
      ok: false,
      error: "Send a basket: a name, the idea and its companies.",
    };
  const body = raw as Record<string, unknown>;
  const idea = cleanText(body.idea);
  if (!idea) return { ok: false, error: "Say the idea in a sentence." };
  if (idea.length > MAX_IDEA)
    return { ok: false, error: `Keep the idea under ${MAX_IDEA} characters.` };
  const named = cleanText(body.name);
  if (named.length > MAX_NAME)
    return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };
  const name = named || nameFromIdea(idea);
  if (!Array.isArray(body.lines))
    return { ok: false, error: "Add the companies that carry the idea." };
  if (body.lines.length > MAX_LINES * 2)
    return { ok: false, error: `A basket holds up to ${MAX_LINES} companies.` };
  const fallback = inferKind(idea);
  const seen = new Set<string>();
  const lines: BasketLineDraft[] = [];
  for (const entry of body.lines) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const ticker = cleanTicker(row.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const reason = cleanText(row.reason);
    if (!reason)
      return { ok: false, error: `Give ${ticker} a reason in a sentence.` };
    if (reason.length > MAX_REASON)
      return {
        ok: false,
        error: `Keep ${ticker}'s reason under ${MAX_REASON} characters.`,
      };
    const company = cleanText(row.company);
    lines.push({
      ticker,
      company: company && company.length <= 80 ? company : null,
      kind: isThesisKind(row.kind) ? row.kind : fallback,
      reason,
    });
  }
  if (lines.length < MIN_LINES)
    return {
      ok: false,
      error: `A basket needs at least ${MIN_LINES} companies.`,
    };
  if (lines.length > MAX_LINES)
    return { ok: false, error: `A basket holds up to ${MAX_LINES} companies.` };
  return {
    ok: true,
    draft: { name, idea, source: readSource(body.source), lines },
  };
}

/** The stored lines after an edit: a company that stays keeps the day it joined; a new one joins now. */
export function mergeLines(
  before: readonly BasketLine[],
  next: readonly BasketLineDraft[],
  now: Date,
): BasketLine[] {
  const joined = new Map(before.map((line) => [line.ticker, line.added_at]));
  const at = now.toISOString();
  return next.map((line) => ({
    ...line,
    added_at: joined.get(line.ticker) ?? at,
  }));
}

/** Tickers dropped within the cooldown, as of `day`. */
export function recentlyDropped(
  dropped: BasketAgent["dropped"],
  day: string,
): Set<string> {
  const from =
    Date.parse(`${day}T00:00:00Z`) - READD_COOLDOWN_DAYS * 86_400_000;
  return new Set(
    dropped
      .filter((entry) => Date.parse(`${entry.day}T00:00:00Z`) >= from)
      .map((entry) => entry.ticker),
  );
}

/* ── ids ────────────────────────────────────────────────────────────────── */

export function basketDocId(uid: string, id: string): string {
  return `${uid}__${id}`;
}

/** One run per basket per market day, so running the runner twice changes nothing. */
export function basketRunDocId(uid: string, id: string, day: string): string {
  return `${uid}__${id}__${day}`;
}

export function basketHref(id: string): string {
  return `/agents/baskets/${encodeURIComponent(id)}`;
}

/**
 * The basket editor, opened on a theme's book (`?theme=`) or on an idea and its companies (`?idea=&tickers=`, the way
 * an Ask answer hands one over). Nothing is saved until the person saves it there.
 */
export function watchIdeaHref(
  from: { theme: string } | { idea: string; tickers: readonly string[] },
): string {
  if ("theme" in from)
    return `/agents/baskets/new?theme=${encodeURIComponent(from.theme)}`;
  return `/agents/baskets/new?idea=${encodeURIComponent(from.idea)}&tickers=${encodeURIComponent(from.tickers.join(","))}`;
}
