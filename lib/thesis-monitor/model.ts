/**
 * A thesis that spans several companies: one statement in the person's words ("AI infrastructure demand keeps
 * growing") and, per company, up to two measurable lines it holds on ("NVDA revenue growth > 40%", "VRT gross margin >
 * 35%"), from the same menu of stored figures as a reason's "Holds if…" lines (lib/thesis-watch/conditions.ts).
 *
 * The design choice: a thesis is not a new kind of agent. It lives on an idea basket (lib/basket-agent) as the
 * additive `thesis` field of `tm_agent_baskets/{uid}__{id}`, so it shares the basket's store, ids, owner checks,
 * pause/remove, the 20-basket cap and the plan's agent limit (one basket, one agent, whether or not it has lines).
 * - An idea basket gets lines with "Add lines": the companies stay the basket's, edited in the basket editor.
 * - A thesis over the person's holdings is a basket whose `source` is `{ kind: "holdings" }`: its companies are the
 *   holdings that carry a line. It skips the idea basket's own add/drop check (that is about finding companies; this
 *   one is about the ones you own) and is checked only by the thesis check.
 *
 * Pure: the types, the limits, reading and cleaning a draft, the status words and the ids. No server imports.
 */

import {
  conditionKey,
  MAX_CONDITIONS,
  readConditionRecords,
  readConditions,
  validateConditions,
  type Condition,
  type ConditionRecord,
} from "@/lib/thesis-watch/conditions";

/** One check's state per thesis: `tm_agent_thesis_checks/{uid}__{basket id}` (rewritten each night, never deleted). */
export const THESIS_CHECKS_COLLECTION = "tm_agent_thesis_checks";
export const THESIS_STATE_VERSION = 1;

export const MAX_STATEMENT = 280;
export const MAX_NAME = 60;
/** At most this many lines on one company (the conditions menu's own limit). */
export const MAX_LINES_PER_COMPANY = MAX_CONDITIONS;
/** A thesis over holdings spans at least this many of them, each with a line. */
export const MIN_HOLDINGS = 2;
/** And at most this many (the basket's own cap). */
export const MAX_COMPANIES = 12;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/* ── the stored thesis ──────────────────────────────────────────────────── */

export type ThesisLine = { ticker: string; conditions: Condition[] };

/** On the basket doc as `thesis`. */
export type ThesisSpec = {
  /** The person's words. */
  statement: string;
  /** Companies with at least one line, in the order the person gave them. */
  lines: ThesisLine[];
  created_at: string;
  updated_at: string;
  /** Up by one with every save: the editor sends the version it opened, so a save never undoes another tab's. */
  version: number;
};

/** The stored `thesis` field, or null when it is missing or has no lines left. Malformed lines are dropped. */
export function readThesisSpec(raw: unknown): ThesisSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const statement = typeof data.statement === "string" ? cleanText(data.statement) : "";
  if (!statement || !Array.isArray(data.lines)) return null;
  const seen = new Set<string>();
  const lines: ThesisLine[] = [];
  for (const entry of data.lines) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const ticker = typeof row.ticker === "string" && TICKER_RE.test(row.ticker) ? row.ticker : null;
    if (!ticker || seen.has(ticker)) continue;
    const conditions = readConditions(row.conditions);
    if (conditions.length === 0) continue;
    seen.add(ticker);
    lines.push({ ticker, conditions });
  }
  if (lines.length === 0) return null;
  return {
    statement,
    lines,
    created_at: typeof data.created_at === "string" ? data.created_at : "",
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
    version: typeof data.version === "number" && Number.isInteger(data.version) ? data.version : 1,
  };
}

/** How many measurable lines a thesis has. */
export function lineCount(spec: Pick<ThesisSpec, "lines">): number {
  return spec.lines.reduce((sum, line) => sum + line.conditions.length, 0);
}

/* ── a draft from the editor ────────────────────────────────────────────── */

export type ThesisDraft = {
  statement: string;
  /** Only for a thesis over holdings: its name (a basket's thesis keeps the basket's). */
  name: string | null;
  lines: ThesisLine[];
};

export type ThesisDraftResult = { ok: true; draft: ThesisDraft } | { ok: false; error: string };

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTicker(value: unknown): string | null {
  const ticker = typeof value === "string" ? value.trim().toUpperCase().replace(/^\$/, "") : "";
  return TICKER_RE.test(ticker) ? ticker : null;
}

/**
 * A thesis draft from a request body, cleaned, or why it was refused: a statement, and per company at most two lines
 * (shape and bounds checked here; whether we store each figure for the company needs the store, see
 * `changedLines`). A company sent with no lines is left out. Duplicate tickers keep the first.
 */
export function parseThesisDraft(raw: unknown): ThesisDraftResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Send the thesis: what you believe and its lines." };
  const body = raw as Record<string, unknown>;
  const statement = cleanText(body.statement);
  if (!statement) return { ok: false, error: "Say the thesis in a sentence." };
  if (statement.length > MAX_STATEMENT) return { ok: false, error: `Keep the thesis under ${MAX_STATEMENT} characters.` };
  const name = cleanText(body.name);
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };
  if (!Array.isArray(body.lines)) return { ok: false, error: "Give at least one company a line." };
  if (body.lines.length > MAX_COMPANIES * 2) return { ok: false, error: `A thesis spans up to ${MAX_COMPANIES} companies.` };
  const seen = new Set<string>();
  const lines: ThesisLine[] = [];
  for (const entry of body.lines) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const ticker = cleanTicker(row.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const valid = validateConditions(row.conditions ?? []);
    if (!valid.ok)
      return {
        ok: false,
        error: valid.error === "too_many_conditions" ? `${ticker} can have up to ${MAX_LINES_PER_COMPANY} lines.` : `Check ${ticker}'s lines: each needs a figure, a side and a number in range.`,
      };
    if (valid.conditions.length > 0) lines.push({ ticker, conditions: valid.conditions });
  }
  if (lines.length === 0) return { ok: false, error: "Give at least one company a line." };
  if (lines.length > MAX_COMPANIES) return { ok: false, error: `A thesis spans up to ${MAX_COMPANIES} companies.` };
  return { ok: true, draft: { statement, name: name || null, lines } };
}

/**
 * The lines a save must check against the store (`conditionsFitStock`): new ones, and ones whose number, side or
 * figure changed. A line saved earlier stays as it was, even when its figure has since gone (a dividend that stopped):
 * its check says so, and the save is not blocked on it.
 */
export function changedLines(before: ThesisSpec | null, next: readonly ThesisLine[]): ThesisLine[] {
  const kept = new Map((before?.lines ?? []).map((line) => [line.ticker, new Set(line.conditions.map(conditionKey))]));
  return next
    .map((line) => ({ ticker: line.ticker, conditions: line.conditions.filter((condition) => !kept.get(line.ticker)?.has(conditionKey(condition))) }))
    .filter((line) => line.conditions.length > 0);
}

/* ── status ─────────────────────────────────────────────────────────────── */

/** "waiting": no line has a figure judged yet. */
export type ThesisStatus = "holds" | "strain" | "broken" | "waiting";

export const STATUS_WORDS: Record<ThesisStatus, string> = {
  holds: "Holds",
  strain: "Under strain",
  broken: "Broken",
  waiting: "Waiting for figures",
};

/** Worse is higher: a move up this scale is what makes the agent ask for a review. */
export const STATUS_RANK: Record<ThesisStatus, number> = { waiting: 0, holds: 1, strain: 2, broken: 3 };

export function isThesisStatus(value: unknown): value is ThesisStatus {
  return value === "holds" || value === "strain" || value === "broken" || value === "waiting";
}

/* ── the stored state of the checks ─────────────────────────────────────── */

export type ThesisEventKind = "report" | "line" | "filing" | "status";

/** Something that moved the thesis (or, with `baseline`, what was on file the day it started), dated and sourced. */
export type ThesisEvent = {
  /** Stable: the same report, filing or status change is recorded once. */
  key: string;
  kind: ThesisEventKind;
  /** The New York day it was recorded on. */
  day: string;
  /** When the source itself is dated (the report's day, the filing's day). */
  at: string;
  ticker: string | null;
  /** One sentence, at most 15 words. */
  text: string;
  /** A second line in the company's own words (a new risk heading), or null. */
  detail: string | null;
  /** The line's verdict on that event, for report and line events. */
  verdict: "holds" | "broken" | null;
  source: string;
  href: string | null;
  /** On file before the thesis started: shown as context, never news, never a reason to ask for a review. */
  baseline?: boolean;
  /** A status event: the status it moved to. */
  status?: ThesisStatus;
};

/** A 10-K or 10-Q in the strain window that added risks, on a company in the thesis. */
export type ThesisRisk = {
  ticker: string;
  form: "10-K" | "10-Q";
  filed: string;
  accession: string;
  added: number;
  /** The first new risk, in the company's words when it fits a line. */
  first: string | null;
  url: string;
};

export type ThesisHistoryRow = {
  day: string;
  status: ThesisStatus;
  holds: number;
  broke: number;
  waiting: number;
  /** The figures' sources that day, for the row's hover. */
  sources: string[];
};

export type ThesisCounts = { lines: number; holds: number; broke: number; waiting: number };

/** Where the status stood before the latest check's day. */
export type ThesisBase = { status: ThesisStatus; status_since: string; previous_status: ThesisStatus | null };

export type ThesisState = {
  version: number;
  uid: string;
  basket_id: string;
  /** The New York day of the latest check. */
  day: string;
  checked_at: string;
  /** The thesis this state belongs to (its `created_at`) and the version of its lines when it was checked. */
  spec_created_at: string;
  spec_version: number;
  /** The status before this day's first check (a second check the same day is judged against it); null on the first. */
  base: ThesisBase | null;
  status: ThesisStatus;
  /** The day the status became what it is. */
  status_since: string;
  /** The status before that, when there was one. */
  previous_status: ThesisStatus | null;
  counts: ThesisCounts;
  /** Companies with a broken line or new risks in the window. */
  affected: string[];
  /** Each company's lines as last checked (lib/thesis-watch/conditions.ts records: figure, verdict, source, report). */
  lines: Array<{ ticker: string; records: ConditionRecord[] }>;
  risks: ThesisRisk[];
  /** Filings already looked at, by accession: a filing is recorded once. */
  seen_filings: string[];
  /** Newest first, at most EVENTS_MAX. */
  events: ThesisEvent[];
  /** One row per check day, oldest first, at most HISTORY_MAX. */
  history: ThesisHistoryRow[];
};

export const EVENTS_MAX = 40;
export const HISTORY_MAX = 90;
export const SEEN_MAX = 300;

/* ── ids and links ──────────────────────────────────────────────────────── */

export function thesisStateDocId(uid: string, basketId: string): string {
  return `${uid}__${basketId}`;
}

export function thesisHref(basketId: string): string {
  return `/agents/theses/${encodeURIComponent(basketId)}`;
}

/** The editor: a new thesis over holdings, or lines for an idea basket (`basket`), or an edit of a thesis (`id`). */
export function thesisEditHref(from: { basket: string } | { id: string } | "holdings"): string {
  if (from === "holdings") return "/agents/theses/new";
  if ("basket" in from) return `/agents/theses/new?basket=${encodeURIComponent(from.basket)}`;
  return `/agents/theses/${encodeURIComponent(from.id)}/edit`;
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/* ── reading the stored state back ──────────────────────────────────────── */

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
const EVENT_KINDS = new Set<ThesisEventKind>(["report", "line", "filing", "status"]);

function readBase(raw: unknown): ThesisBase | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!isThesisStatus(data.status) || !str(data.status_since)) return null;
  return { status: data.status, status_since: str(data.status_since), previous_status: isThesisStatus(data.previous_status) ? data.previous_status : null };
}

function readEvent(raw: unknown): ThesisEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!str(data.key) || !EVENT_KINDS.has(data.kind as ThesisEventKind) || !str(data.day) || !str(data.text)) return null;
  return {
    key: str(data.key),
    kind: data.kind as ThesisEventKind,
    day: str(data.day),
    at: str(data.at) || str(data.day),
    ticker: str(data.ticker) || null,
    text: str(data.text),
    detail: str(data.detail) || null,
    verdict: data.verdict === "holds" || data.verdict === "broken" ? data.verdict : null,
    source: str(data.source),
    href: str(data.href) || null,
    ...(data.baseline === true ? { baseline: true } : {}),
    ...(isThesisStatus(data.status) ? { status: data.status } : {}),
  };
}

/** A stored state, or null when it is missing, malformed or not this person's. */
export function readThesisState(raw: unknown, uid: string): ThesisState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== THESIS_STATE_VERSION || data.uid !== uid || !str(data.basket_id) || !str(data.day) || !isThesisStatus(data.status)) return null;
  const counts = (data.counts && typeof data.counts === "object" ? data.counts : {}) as Record<string, unknown>;
  return {
    version: THESIS_STATE_VERSION,
    uid,
    basket_id: str(data.basket_id),
    day: str(data.day),
    checked_at: str(data.checked_at),
    spec_created_at: str(data.spec_created_at),
    spec_version: num(data.spec_version),
    base: readBase(data.base),
    status: data.status,
    status_since: str(data.status_since) || str(data.day),
    previous_status: isThesisStatus(data.previous_status) ? data.previous_status : null,
    counts: { lines: num(counts.lines), holds: num(counts.holds), broke: num(counts.broke), waiting: num(counts.waiting) },
    affected: strings(data.affected),
    lines: Array.isArray(data.lines)
      ? data.lines.flatMap((entry) => {
          const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          return row && str(row.ticker) ? [{ ticker: str(row.ticker), records: readConditionRecords(row.records) }] : [];
        })
      : [],
    risks: Array.isArray(data.risks)
      ? data.risks.flatMap((entry) => {
          const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!row || !str(row.ticker) || (row.form !== "10-K" && row.form !== "10-Q") || !str(row.filed) || !/^https:\/\/www\.sec\.gov\//.test(str(row.url))) return [];
          return [{ ticker: str(row.ticker), form: row.form, filed: str(row.filed), accession: str(row.accession), added: num(row.added), first: str(row.first) || null, url: str(row.url) } as ThesisRisk];
        })
      : [],
    seen_filings: strings(data.seen_filings).slice(-SEEN_MAX),
    events: Array.isArray(data.events) ? data.events.map(readEvent).filter((event): event is ThesisEvent => event !== null).slice(0, EVENTS_MAX) : [],
    history: Array.isArray(data.history)
      ? data.history.flatMap((entry) => {
          const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!row || !str(row.day) || !isThesisStatus(row.status)) return [];
          return [{ day: str(row.day), status: row.status, holds: num(row.holds), broke: num(row.broke), waiting: num(row.waiting), sources: strings(row.sources).slice(0, 6) }];
        })
      : [],
  };
}

/* ── holdings ───────────────────────────────────────────────────────────── */

/**
 * The person's US holdings, by ticker, in the order they track them: a stock marked as held, or one with shares and no
 * mark (the same reading as lib/proposals-server.ts proposalStocks). Pure.
 */
export function holdingsOf(doc: { tracked_stocks?: unknown; watchlist_positions?: unknown; watchlist_holdings?: unknown } | null | undefined): string[] {
  const tracked = Array.isArray(doc?.tracked_stocks) ? doc!.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const positions = (doc?.watchlist_positions && typeof doc.watchlist_positions === "object" ? doc.watchlist_positions : {}) as Record<string, unknown>;
  const holdings = (doc?.watchlist_holdings && typeof doc.watchlist_holdings === "object" ? doc.watchlist_holdings : {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const id of tracked) {
    if (!id.startsWith("US_")) continue;
    const held = positions[id] === "holding" || (positions[id] === undefined && Boolean(holdings[id]));
    const ticker = id.slice(3).replace(/_/g, ".").toUpperCase();
    if (held && TICKER_RE.test(ticker) && !out.includes(ticker)) out.push(ticker);
  }
  return out;
}
