/**
 * Serving docs for the stock page: the pure half (no I/O, no clock of its own), so it is unit tested and shared by
 * the reader (lib/serve/stock-serve.ts), the builder (lib/serve/stock-serve-build.ts) and the tests.
 *
 * `tm_serve_stock/{TICKER}` holds, per part, what today's loaders would return (or the raw source fields they
 * transform, in a lossless compact form), so a stock page reads one small doc instead of a dozen source collections.
 * Each part says when it was built and how to prove it is still current; a part that cannot prove it is not used and
 * the page reads that part the old way. See docs/serving-docs.md.
 */

import type { NewsArticle } from "@/lib/news";
import { callWord, type CallRecord } from "@/lib/stock-chart";

export const SERVE_COLLECTION = "tm_serve_stock";
/** Stamps here apply to every stock (a writer that replaced a whole collection and cannot name the stocks). */
export const SERVE_ALL_DOC = "_all";
/** The doc's own layout. A reader that does not know a schema uses nothing in the doc. */
export const SERVE_SCHEMA = 1;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * How each part proves it is current:
 * - "hash": it names the source docs it was built from with their LocalDB hashes; the reader re-reads those hashes
 *   (one small batch read, no document bodies) and uses the part only if every one still matches. Exact.
 * - "dirty": its source is a query (or a field that changes all day), so the writers stamp `dirty_<part>` on the
 *   serve doc before and after they write; the part is used only if it was built at or after the latest stamp.
 *
 * `maxAgeMs` is a safety net on top: a part older than it is not used even if nothing says it changed.
 * Bump `v` whenever a part's stored shape changes AND whenever the transform that made it changes (several parts store
 * a loader's output: news, calls, anomaly, reddit, results). A hash part's source does not change on a deploy, so
 * without the bump the old output would be served until the part's age limit.
 */
export const SERVE_PARTS = {
  /** Multi-year daily closes (`tm_price_history_daily/{T}`), compact and lossless. Replaces two ~60 KB reads. */
  series: { v: 1, check: "hash", maxAgeMs: 4 * DAY },
  /** The rolling window inside `tm_latest_prices/{id}`: per day the capture time, close and P/E. Replaces ~120 KB. */
  snapshot: { v: 1, check: "dirty", maxAgeMs: 4 * DAY },
  /** The days our call changed (`tm_directive_history/{id}/calls`), only the records callChanges keeps. */
  calls: { v: 1, check: "dirty", maxAgeMs: 26 * HOUR },
  /** The on-demand brief job and the steady call's state. */
  bundle: { v: 1, check: "hash", maxAgeMs: 2 * DAY },
  /** Today's unusual-move doc (`tm_daily_anomaly_tickers`). */
  anomaly: { v: 1, check: "hash", maxAgeMs: 2 * DAY },
  /** Results releases from `tm_earnings_history/{T}`. */
  results: { v: 1, check: "hash", maxAgeMs: 4 * DAY },
  /** Reddit context (`reddit_ticker_contexts`). */
  reddit: { v: 1, check: "hash", maxAgeMs: 2 * DAY },
  /** The stock's headlines (pipeline enrichments + the wire) and the model's tone label per headline. */
  news: { v: 1, check: "dirty", maxAgeMs: 6 * HOUR },
} as const satisfies Record<string, { v: number; check: "hash" | "dirty"; maxAgeMs: number }>;

export type ServePartName = keyof typeof SERVE_PARTS;
export const SERVE_PART_NAMES = Object.keys(SERVE_PARTS) as ServePartName[];

/** One stored part. `src` maps each source doc path to its hash at build time (null: the doc did not exist). */
export type ServePart<T> = {
  v: number;
  built_at: string;
  /** When the data itself is from, where the source says (else null). */
  as_of: string | null;
  src?: Record<string, string | null>;
  data: T;
};

/** The compact daily series: dates as a start day plus day gaps, closes as integer steps at a fixed scale. */
export type CompactDaily = {
  start: string;
  /** Days from each date to the next, as one digit each when every gap is 1 to 9, else a list. */
  gaps: string | number[];
  /** 100 (cents) or 10000; the closes are `steps` summed and divided by it. */
  scale: number;
  steps: number[];
};

/** The raw `tm_price_history_daily` fields the loaders read, with dates and closes compacted when that is lossless. */
export type SeriesPartData = {
  symbol?: string;
  source?: string;
  fetched_at?: string;
  adjusted?: boolean;
  compact?: CompactDaily;
  /** The arrays as stored, when they cannot be compacted without loss. */
  dates?: unknown[];
  closes?: unknown[];
};

/** One `history_window` row: capture time, close, trailing P/E (each as stored, null when missing). */
export type SnapshotRow = [string | null, number | null, number | null];
export type SnapshotPartData = { rows: SnapshotRow[] };

export type CallsPartData = { records: CallRecord[] };
export type BundlePartData = { onDemandJob: Record<string, unknown> | null; callStability: Record<string, unknown> | null };
export type NewsPartData = {
  /** The window and size the page asks for; a page asking for another reads the old way. */
  days: number;
  limit: number;
  /** What getNewsForTicker returned at build time (newest first, already cut to the window then). */
  articles: NewsArticle[];
  /** The model's tone per headline id, as news-tone.ts reads it (fallback tones are worked out at read time). */
  labels: Record<string, string>;
};

export type ServeStockDoc = {
  schema?: number;
  ticker?: string;
  market?: string;
  instrument_id?: string;
} & { [key: `p_${string}`]: ServePart<unknown> | undefined } & { [key: `dirty_${string}`]: string | undefined };

export function partField(name: ServePartName): `p_${ServePartName}` {
  return `p_${name}`;
}

export function dirtyField(name: ServePartName): `dirty_${ServePartName}` {
  return `dirty_${name}`;
}

function ms(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

export type PartVerdict = "fresh" | "missing" | "version" | "expired" | "dirty" | "changed";

/**
 * Whether a stored part may be used now. `hashes` is what the store says today for the part's sources (path → hash,
 * absent: the doc does not exist); only "hash" parts need it.
 */
export function partVerdict(
  doc: ServeStockDoc | null | undefined,
  name: ServePartName,
  nowMs: number,
  hashes: ReadonlyMap<string, string> | null,
  /** The paths the hash read asked for; a source outside them cannot be proven and fails the part. */
  checked?: ReadonlySet<string>,
  /** `tm_serve_stock/_all`: its dirty stamps apply to every stock. */
  all?: Pick<ServeStockDoc, `dirty_${string}`> | null,
): PartVerdict {
  const policy = SERVE_PARTS[name];
  const part = doc?.[partField(name)] as ServePart<unknown> | undefined;
  if (!doc || doc.schema !== SERVE_SCHEMA || !part || typeof part !== "object" || part.data === undefined) return "missing";
  if (part.v !== policy.v) return "version";
  const builtMs = ms(part.built_at);
  // A part from the future (a clock gone wrong) is not trusted either.
  if (!Number.isFinite(builtMs) || nowMs - builtMs > policy.maxAgeMs || builtMs - nowMs > 5 * 60_000) return "expired";
  for (const stamp of [doc[dirtyField(name)], all?.[dirtyField(name)]]) {
    const dirtyMs = ms(stamp);
    if (Number.isFinite(dirtyMs) && dirtyMs > builtMs) return "dirty";
  }
  if (policy.check === "hash") {
    const src = part.src;
    if (!src || !hashes || Object.keys(src).length === 0) return "changed";
    for (const [path, hash] of Object.entries(src)) {
      if (checked && !checked.has(path)) return "changed";
      if ((hashes.get(path) ?? null) !== (hash ?? null)) return "changed";
    }
  }
  return "fresh";
}

/**
 * The source docs of the "hash" parts for one US stock. The builder records each one's hash and the reader asks for
 * the same list, so the hash read can start beside the serve doc read instead of after it.
 */
export function hashSourcePaths(ticker: string, instrumentId: string): Record<"series" | "bundle" | "anomaly" | "results" | "reddit", string[]> {
  const upper = ticker.trim().toUpperCase();
  return {
    series: [`tm_price_history_daily/${upper}`],
    bundle: [`tm_on_demand_news_jobs/${instrumentId}`, `tm_call_stability/${instrumentId}`],
    anomaly: [`tm_daily_anomaly_tickers/US__${upper}`],
    results: [`tm_earnings_history/${upper.replace(/\//g, "-")}`],
    reddit: [`reddit_ticker_contexts/US__${upper}`],
  };
}

// ─── the daily series, compact and lossless ──────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function scaleFor(closes: readonly number[]): number | null {
  for (const scale of [100, 10_000]) {
    if (closes.every((close) => Math.round(close * scale) / scale === close && Math.abs(close * scale) < 2 ** 50)) return scale;
  }
  return null;
}

/**
 * Dates and closes as a start day, day gaps and integer steps, or null when that would not give back exactly the
 * same arrays (a date that is not a day, dates out of order, a close that is not a plain number with at most four
 * decimals, arrays of different lengths).
 */
export function compactDaily(dates: readonly unknown[], closes: readonly unknown[]): CompactDaily | null {
  if (dates.length !== closes.length || dates.length === 0) return null;
  if (!dates.every((date): date is string => typeof date === "string" && ISO_DAY.test(date))) return null;
  if (!closes.every((close): close is number => typeof close === "number" && Number.isFinite(close))) return null;
  const days = dates as string[];
  const values = closes as number[];
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((dayMs(days[i]!) - dayMs(days[i - 1]!)) / 86_400_000);
    if (!(gap >= 1)) return null;
    gaps.push(gap);
  }
  const scale = scaleFor(values);
  if (!scale) return null;
  const ints = values.map((close) => Math.round(close * scale));
  const steps = ints.map((value, index) => (index === 0 ? value : value - ints[index - 1]!));
  const compact: CompactDaily = {
    start: days[0]!,
    gaps: gaps.every((gap) => gap <= 9) ? gaps.join("") : gaps,
    scale,
    steps,
  };
  // Never store what does not come back the same.
  const back = expandDaily(compact);
  if (back.dates.length !== days.length || back.dates.some((date, i) => date !== days[i]) || back.closes.some((close, i) => close !== values[i])) {
    return null;
  }
  return compact;
}

export function expandDaily(compact: CompactDaily): { dates: string[]; closes: number[] } {
  const gaps = typeof compact.gaps === "string" ? [...compact.gaps].map(Number) : compact.gaps;
  const dates: string[] = [compact.start];
  let at = dayMs(compact.start);
  for (const gap of gaps) {
    at += gap * 86_400_000;
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  const closes: number[] = [];
  let running = 0;
  for (const step of compact.steps) {
    running += step;
    closes.push(running / compact.scale);
  }
  return { dates, closes };
}

/** The series part from a raw `tm_price_history_daily` doc: only the fields the loaders read. */
export function seriesPartFromRaw(raw: Record<string, unknown>): SeriesPartData {
  const out: SeriesPartData = {};
  if (typeof raw.symbol === "string") out.symbol = raw.symbol;
  if (typeof raw.source === "string") out.source = raw.source;
  if (typeof raw.fetched_at === "string") out.fetched_at = raw.fetched_at;
  if (typeof raw.adjusted === "boolean") out.adjusted = raw.adjusted;
  const dates = Array.isArray(raw.dates) ? raw.dates : undefined;
  const closes = Array.isArray(raw.closes) ? raw.closes : undefined;
  const compact = dates && closes ? compactDaily(dates, closes) : null;
  if (compact) out.compact = compact;
  else {
    if (dates) out.dates = dates;
    if (closes) out.closes = closes;
  }
  return out;
}

/** The raw doc back, as the loaders read it (`dates`, `closes`, `source`, `fetched_at`, `adjusted`, `symbol`). */
export function rawFromSeriesPart(part: SeriesPartData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  if (part.symbol !== undefined) raw.symbol = part.symbol;
  if (part.source !== undefined) raw.source = part.source;
  if (part.fetched_at !== undefined) raw.fetched_at = part.fetched_at;
  if (part.adjusted !== undefined) raw.adjusted = part.adjusted;
  if (part.compact) {
    const { dates, closes } = expandDaily(part.compact);
    raw.dates = dates;
    raw.closes = closes;
  } else {
    if (part.dates) raw.dates = part.dates;
    if (part.closes) raw.closes = part.closes;
  }
  return raw;
}

// ─── the snapshot window ──────────────────────────────────────────────────────

type HistoryRow = { captured_at?: unknown; quote?: { current?: unknown } | null; fundamentals?: { pe_ttm?: unknown } | null };

const numOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

/** Each `history_window` row as [captured_at, close, P/E], the only fields the page reads from it. */
export function snapshotRows(window: unknown): SnapshotRow[] {
  if (!Array.isArray(window)) return [];
  return window.map((row): SnapshotRow => {
    const item = (row && typeof row === "object" ? row : {}) as HistoryRow;
    return [
      typeof item.captured_at === "string" ? item.captured_at : null,
      numOrNull(item.quote?.current),
      numOrNull(item.fundamentals?.pe_ttm),
    ];
  });
}

/** The rows back as `history_window` entries, for buildPriceHistorySeries and buildMultipleHistory. */
export function historyWindowFromRows(rows: readonly SnapshotRow[]): Array<{ captured_at?: string; quote: { current?: number }; fundamentals: { pe_ttm?: number | null } }> {
  return rows.map(([capturedAt, close, pe]) => ({
    ...(capturedAt === null ? {} : { captured_at: capturedAt }),
    quote: close === null ? {} : { current: close },
    fundamentals: { pe_ttm: pe },
  }));
}

// ─── calls ────────────────────────────────────────────────────────────────────

/**
 * Only the records lib/stock-chart.ts `callChanges` turns into changes: the first of each run of the same call, in
 * date order. callChanges(kept) equals callChanges(all), which is the only thing the page reads from the history.
 */
export function changeRecords(records: readonly CallRecord[]): CallRecord[] {
  const sorted = records
    .filter((record) => typeof record.date === "string" && ISO_DAY.test(record.date) && callWord(record.stance))
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: CallRecord[] = [];
  let prev: string | null = null;
  for (const record of sorted) {
    const word = callWord(record.stance);
    if (word !== prev) {
      out.push(record);
      prev = word;
    }
  }
  return out;
}

// ─── news ─────────────────────────────────────────────────────────────────────

/**
 * The stored headlines as getNewsForTicker would return them now: the same list with the ones that have since aged
 * out of the window dropped. The stored list is the newest-first cut of everything in the window at build time, so
 * with no new rows (a new row marks the part dirty) dropping the aged tail gives exactly today's answer.
 */
export function newsInWindow(articles: readonly NewsArticle[], days: number, nowMs: number): NewsArticle[] {
  const cutoffMs = nowMs - days * 86_400_000;
  return articles.filter((article) => {
    const publishedMs = new Date(article.published_at).getTime();
    return Number.isFinite(publishedMs) && publishedMs >= cutoffMs;
  });
}

/** How the page asks for headlines (components/stock-page-stream.tsx); the news part stores exactly that. */
export const NEWS_DAYS = 14;
export const NEWS_LIMIT = 14;

/**
 * The serve doc's id for a US instrument: its id without `US_` (BRK.B is `US_BRK_B`, so `BRK_B`), the same rule the
 * Python writers use (backend/serve_docs.py `us_ticker`). Null for any other market.
 */
export function serveDocIdFor(instrumentId: string): string | null {
  const upper = instrumentId.trim().toUpperCase();
  return upper.startsWith("US_") ? serveDocId(upper.slice(3)) : null;
}

/** The house instrument id for a US ticker (lib/import/resolve.ts: BRK.B is US_BRK_B). */
export function usInstrumentIdFor(ticker: string): string {
  return `US_${ticker.trim().toUpperCase().replace(/\./g, "_")}`;
}

/** A doc id: upper case, and never a path. */
export function serveDocId(ticker: string): string | null {
  const id = ticker.trim().toUpperCase();
  return id && !id.includes("/") && id.length <= 24 && id !== SERVE_ALL_DOC.toUpperCase() ? id : null;
}
