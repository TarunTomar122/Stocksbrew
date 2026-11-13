import { localFirestoreFromEnv } from "@/lib/local-firestore";

/**
 * The last entries of a price history, for pages that only need the last two years or so.
 *
 * `tm_price_history_daily/{SYMBOL}` holds up to 12 years of closes (~60 KB); readers like the portfolio series keep
 * the last 400. Every writer of a history also writes `tm_price_tail/{SYMBOL}` (backend/agentdata/prices.py
 * `tail_doc`): its last 640 entries, cut by index, and the store hash of the history they were cut from. One batch
 * read asks for the tail and, with a field mask the history does not have, the history's hash alone (no body), so
 * the tail is used only when it was cut from the history the store holds right now. Anything else (no tail, an
 * older tail, another layout, a read that fails, the Firebase rollback) is "not proven" and the caller reads the
 * history as before.
 */

export const PRICE_HISTORY_COLLECTION = "tm_price_history_daily";
export const PRICE_TAIL_COLLECTION = "tm_price_tail";
/** Bump with backend/agentdata/prices.py TAIL_VERSION. */
export const PRICE_TAIL_VERSION = 2;
const TAIL_FIELDS = ["pt_v", "pt_src", "pt_n", "pt_from", "pt_ordered", "pt_source", "pt_fetched_at", "pt_instrument_type", "pt_data"];

export type PriceTail = {
  /**
   * Entries `from` to `total - 1` of the history's `dates` and `closes` (both cut to the shorter one), unfiltered:
   * `dates[i]` and `closes[i]` are entry `from + i`.
   */
  dates: unknown[];
  closes: unknown[];
  from: number;
  total: number;
  /** Every date in the whole history is a string later than the one before it. */
  ordered: boolean;
  /** The history's own `source`, `fetched_at` and `instrument_type`, as stored. */
  source: unknown;
  fetchedAt: unknown;
  instrumentType: unknown;
};

/** The history's doc id for a symbol (prices.py doc_id): upper case, a slash becomes a dash. */
export function priceDocId(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\//g, "-");
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * The tail from its stored fields, when it was cut from the history whose store hash is `historyHash` now. Pure.
 * Null when it cannot be proven current or is not in the shape the writer makes.
 */
export function tailFromDoc(data: Record<string, unknown> | null | undefined, historyHash: string | null | undefined): PriceTail | null {
  if (!data || !historyHash || data.pt_v !== PRICE_TAIL_VERSION || data.pt_src !== historyHash) return null;
  const inner = data.pt_data as { dates?: unknown; closes?: unknown } | null | undefined;
  const dates = inner?.dates;
  const closes = inner?.closes;
  const from = data.pt_from;
  const total = data.pt_n;
  if (!Array.isArray(dates) || !Array.isArray(closes) || !isCount(from) || !isCount(total)) return null;
  if (dates.length !== closes.length || from + dates.length !== total) return null;
  return { dates, closes, from, total, ordered: data.pt_ordered === true, source: data.pt_source, fetchedAt: data.pt_fetched_at, instrumentType: data.pt_instrument_type };
}

type BatchRow = { path?: string; data?: Record<string, unknown>; hash?: string };

/**
 * Tails for many symbols in one batch read (two paths per symbol). Per upper-case symbol: the tail; null when the
 * history does not exist (the history read would find nothing either); undefined when the tail cannot be used and
 * the history must be read. Never throws: a failed read leaves every symbol undefined.
 */
export async function readPriceTails(symbols: readonly string[]): Promise<Map<string, PriceTail | null | undefined>> {
  const out = new Map<string, PriceTail | null | undefined>();
  const all = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  for (const symbol of all) out.set(symbol, undefined);
  // A slash is not a doc id the callers' own reads would find under the dashed id: those keep their own read.
  const unique = all.filter((symbol) => !symbol.includes("/"));
  const client = localFirestoreFromEnv();
  if (!client || unique.length === 0) return out;
  try {
    const rows: BatchRow[] = [];
    // 400 paths per request, the store's own batch size.
    for (let start = 0; start < unique.length; start += 200) {
      const chunk = unique.slice(start, start + 200);
      const paths = chunk.flatMap((symbol) => [`${PRICE_TAIL_COLLECTION}/${priceDocId(symbol)}`, `${PRICE_HISTORY_COLLECTION}/${priceDocId(symbol)}`]);
      const result = await client.read("/documents:batchGet", { method: "POST", body: { paths, select: TAIL_FIELDS } });
      if (!result.ok) return out;
      const parsed = JSON.parse(result.text) as { documents?: BatchRow[] };
      if (!Array.isArray(parsed.documents)) return out;
      rows.push(...parsed.documents);
    }
    const byPath = new Map(rows.filter((row) => typeof row?.path === "string").map((row) => [row.path!, row]));
    for (const symbol of unique) {
      const history = byPath.get(`${PRICE_HISTORY_COLLECTION}/${priceDocId(symbol)}`);
      if (!history) {
        out.set(symbol, null);
        continue;
      }
      const tail = byPath.get(`${PRICE_TAIL_COLLECTION}/${priceDocId(symbol)}`);
      out.set(symbol, tailFromDoc(tail?.data, history.hash) ?? undefined);
    }
    return out;
  } catch {
    return new Map(all.map((symbol) => [symbol, undefined]));
  }
}

/** One symbol's tail (see readPriceTails). */
export async function readPriceTail(symbol: string): Promise<PriceTail | null | undefined> {
  return (await readPriceTails([symbol])).get(symbol.trim().toUpperCase());
}

/**
 * The last `points` raw entries of the history, as `{dates, closes}` aligned by index, when the tail holds them all
 * (it holds the whole history, or at least `points` entries). Undefined otherwise.
 */
export function lastEntries(tail: PriceTail, points: number): { dates: unknown[]; closes: unknown[] } | undefined {
  if (tail.from > 0 && tail.dates.length < points) return undefined;
  const start = Math.max(0, tail.dates.length - points);
  return { dates: tail.dates.slice(start), closes: tail.closes.slice(start) };
}

/**
 * The `sessions` entries up to the last one dated on or before `end`, found by walking back from the newest entry
 * (lib/agent-jobs-data.ts loadPrices does the same on the history), when the tail reaches far enough back to be
 * sure. Undefined otherwise.
 */
export function entriesBefore(tail: PriceTail, end: string, sessions: number): { dates: unknown[]; closes: unknown[] } | undefined {
  let last = tail.total;
  while (last > tail.from && (tail.dates[last - 1 - tail.from] as string) > end) last -= 1;
  // Walked off the front of a partial tail: the entry before it might be the one.
  if (last === tail.from && tail.from > 0) return undefined;
  const start = Math.max(0, last - sessions);
  if (start < tail.from) return undefined;
  return { dates: tail.dates.slice(start - tail.from, last - tail.from), closes: tail.closes.slice(start - tail.from, last - tail.from) };
}

/**
 * The last `points` entries of a history's arrays (or of a tail holding at least that many), the valid ones only:
 * a string date and a positive close. Null with fewer than two. The portfolio's series (lib/portfolio-data.ts).
 */
export function validSeries(raw: { dates?: unknown; closes?: unknown }, points: number): { dates: string[]; closes: number[] } | null {
  const dates = Array.isArray(raw.dates) ? raw.dates : [];
  const closes = Array.isArray(raw.closes) ? raw.closes : [];
  const n = Math.min(dates.length, closes.length);
  const out: { dates: string[]; closes: number[] } = { dates: [], closes: [] };
  for (let i = Math.max(0, n - points); i < n; i++) {
    const date = dates[i];
    const close = closes[i];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.dates.push(date);
      out.closes.push(close);
    }
  }
  return out.dates.length > 1 ? out : null;
}
