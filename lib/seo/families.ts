import { pairSlug } from "@/lib/seo/pair-slug";
import { isFresh, stockHasCurrentRead, type StockReadFacts } from "@/lib/seo/stock-pages";

export { isFresh, stockHasCurrentRead, type StockReadFacts };
export { cleanTicker, pairHref, pairSlug, parsePairSlug, type ParsedPair } from "@/lib/seo/pair-slug";

/**
 * The rules behind the programmatic page families: stock against stock
 * (/compare/a-vs-b), why a stock moved (/stock/T/moves/day and /movers/day),
 * sectors (/sectors/slug) and insider trades per stock (/insiders/T).
 *
 * Pure functions only, so the page metadata, the sitemap and the tests all
 * read the same rules. A page that fails its index rule still renders (with
 * noindex) when it exists; a page that does not exist is a 404.
 */

/* ── Index thresholds ─────────────────────────────────────────────────── */

/** A pair page is indexable when both calls are at most this old. */
export const PAIR_CALL_MAX_AGE_DAYS = 14;
/** At most this many pair pages per stock. */
export const PAIRS_PER_STOCK = 5;
/** Pairs are drawn from this many leading names per industry. */
export const PAIR_NAMES_PER_INDUSTRY = 6;
/** Move pages stay live and indexable; the sitemap lists the last this many days. */
export const MOVE_SITEMAP_DAYS = 90;
/** A day of movers is indexable with at least this many explained moves. */
export const MOVERS_DAY_MIN_MOVES = 3;
/** A sector page is indexable with at least this many covered stocks. */
export const SECTOR_MIN_STOCKS = 8;
/** An insider page is indexable with at least this many open-market trades in the window. */
export const INSIDER_MIN_TRADES = 3;
export const INSIDER_WINDOW_DAYS = 365;
/** Three or more insiders buying within this many days is a cluster buy. */
export const CLUSTER_WINDOW_DAYS = 30;
export const CLUSTER_MIN_INSIDERS = 3;

/* ── Days ─────────────────────────────────────────────────────────────── */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDay(value: string | null | undefined): value is string {
  const match = DAY_RE.exec(value ?? "");
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD or ISO stamps). NaN when either is not a date. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** The day `days` before `day`. */
export function dayMinus(day: string, days: number): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" -> "Nov 10, 2026". */
export function longDay(day: string): string {
  const match = DAY_RE.exec(day.slice(0, 10));
  if (!match) return day;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

/* ── Stock against stock ──────────────────────────────────────────────── */

const GENERIC_INDUSTRIES = new Set([
  "technology",
  "information technology",
  "health care",
  "healthcare",
  "financials",
  "financial",
  "financial services",
  "industrials",
  "consumer discretionary",
  "consumer cyclical",
  "consumer staples",
  "consumer defensive",
  "energy",
  "materials",
  "basic materials",
  "communication services",
  "real estate",
  "utilities",
]);

/** An industry label that names an actual industry, not the sector again. */
export function isSpecificIndustry(industry: string | null | undefined, sector: string | null | undefined): boolean {
  const label = String(industry ?? "").trim().toLowerCase();
  if (!label) return false;
  if (label === String(sector ?? "").trim().toLowerCase()) return false;
  return !GENERIC_INDUSTRIES.has(label);
}

export type PairInputRow = {
  symbol: string;
  sector?: string | null;
  industry?: string | null;
  market_cap?: number | null;
};

export type StockPair = {
  a: string;
  b: string;
  slug: string;
  /** What the two share: the industry, or the sector for a hand-picked pair. */
  group: string;
};

/**
 * The pair pages that exist. Same-industry pairs only: within each specific
 * industry (and sector), the leading names (most viewed first, by the order
 * of `priority`, then the largest by market value) are paired with each
 * other, best-known pairs first, and no stock gets more than PAIRS_PER_STOCK.
 * `hand` adds well-known rivals whose stored industry label is too broad to
 * match; they still have to share a sector.
 */
export function buildPairs(
  rows: readonly PairInputRow[],
  options: { priority?: readonly string[]; hand?: ReadonlyArray<readonly [string, string]> } = {},
): StockPair[] {
  const rank = new Map((options.priority ?? []).map((symbol, index) => [symbol.toUpperCase(), index]));
  const bySymbol = new Map(rows.map((row) => [row.symbol.toUpperCase(), row]));
  const count = new Map<string, number>();
  const out = new Map<string, StockPair>();

  const add = (first: string, second: string, group: string) => {
    const slug = pairSlug(first, second);
    if (out.has(slug)) return;
    if ((count.get(first) ?? 0) >= PAIRS_PER_STOCK || (count.get(second) ?? 0) >= PAIRS_PER_STOCK) return;
    const [a, b] = [first, second].sort();
    out.set(slug, { a: a!, b: b!, slug, group });
    count.set(first, (count.get(first) ?? 0) + 1);
    count.set(second, (count.get(second) ?? 0) + 1);
  };

  for (const [x, y] of options.hand ?? []) {
    const first = bySymbol.get(x.toUpperCase());
    const second = bySymbol.get(y.toUpperCase());
    if (!first || !second || first.symbol === second.symbol) continue;
    if (!first.sector || first.sector !== second.sector) continue;
    const shared = isSpecificIndustry(first.industry, first.sector) && first.industry === second.industry ? first.industry! : first.sector;
    add(first.symbol.toUpperCase(), second.symbol.toUpperCase(), shared);
  }

  const groups = new Map<string, PairInputRow[]>();
  for (const row of rows) {
    if (!isSpecificIndustry(row.industry, row.sector)) continue;
    const key = `${row.sector ?? ""}|${String(row.industry).trim()}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const score = (row: PairInputRow) => rank.get(row.symbol.toUpperCase()) ?? Number.POSITIVE_INFINITY;
  const candidates: Array<{ first: string; second: string; group: string; weight: number; tie: number }> = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const leading = [...members]
      .sort((x, y) => score(x) - score(y) || (y.market_cap ?? 0) - (x.market_cap ?? 0) || x.symbol.localeCompare(y.symbol))
      .slice(0, PAIR_NAMES_PER_INDUSTRY);
    for (let i = 0; i < leading.length; i += 1) {
      for (let j = i + 1; j < leading.length; j += 1) {
        const x = leading[i]!;
        const y = leading[j]!;
        const best = Math.min(score(x), score(y));
        candidates.push({
          first: x.symbol.toUpperCase(),
          second: y.symbol.toUpperCase(),
          group: String(x.industry).trim(),
          // Pairs with a well-known name first, then pairs of large names, then the rest.
          weight: Number.isFinite(best) ? best : 10_000 + i + j,
          tie: -((x.market_cap ?? 0) + (y.market_cap ?? 0)),
        });
      }
    }
  }
  candidates.sort((x, y) => x.weight - y.weight || x.tie - y.tie || pairSlug(x.first, x.second).localeCompare(pairSlug(y.first, y.second)));
  for (const candidate of candidates) add(candidate.first, candidate.second, candidate.group);

  return [...out.values()].sort((x, y) => x.slug.localeCompare(y.slug));
}

export type PairStockFacts = StockReadFacts & { symbol: string };

/** Pair index rule: both stock pages are indexable and both calls are at most PAIR_CALL_MAX_AGE_DAYS old. */
export function pairIsIndexable(first: PairStockFacts | null | undefined, second: PairStockFacts | null | undefined, today: string): boolean {
  if (!first || !second) return false;
  return [first, second].every((row) => stockHasCurrentRead(row, today) && isFresh(row.call_at, today, PAIR_CALL_MAX_AGE_DAYS));
}

/* ── Why a stock moved ────────────────────────────────────────────────── */

export type MoveExplanationLike = {
  cause_type?: string | null;
  headline?: string | null;
  confidence?: string | null;
  external_source?: string | null;
  evidence?: Array<{ title?: string | null; url?: string | null }> | null;
};

export type MoveLike = {
  narrative_status?: string | null;
  move_explanation?: MoveExplanationLike | null;
};

const UNEXPLAINED_CAUSES = new Set(["price_action", "no_verified_catalyst", "unknown", "none"]);

/** The sources behind a move's reason that we can link to. */
export function moveSources(move: MoveLike): Array<{ title: string; url: string }> {
  return (move.move_explanation?.evidence ?? [])
    .map((item) => ({ title: String(item?.title ?? "").trim(), url: String(item?.url ?? "").trim() }))
    .filter((item) => item.title && /^https?:\/\//.test(item.url));
}

/**
 * A move gets a page only with a confirmed reason: research marked it
 * verified, the confidence is medium or high, the cause is an event (not
 * "price action" or "no catalyst found"), and at least one source is cited.
 */
export function isConfirmedMove(move: MoveLike | null | undefined): boolean {
  if (!move || move.narrative_status !== "verified") return false;
  const explanation = move.move_explanation;
  if (!explanation || !String(explanation.headline ?? "").trim()) return false;
  const confidence = String(explanation.confidence ?? "").toLowerCase();
  if (confidence !== "high" && confidence !== "medium") return false;
  const cause = String(explanation.cause_type ?? "").trim().toLowerCase();
  if (!cause || UNEXPLAINED_CAUSES.has(cause)) return false;
  if (String(explanation.external_source ?? "").startsWith("internal_tape")) return false;
  return moveSources(move).length >= 1;
}

export function moveHref(ticker: string, day: string): string {
  return `/stock/${encodeURIComponent(ticker.toUpperCase())}/moves/${day}`;
}

export function moversDayHref(day: string): string {
  return `/movers/${day}`;
}

/** "Lucid Group (LCID)", or just "LCID" when we only hold the ticker. */
export function stockLabel(name: string | null | undefined, ticker: string): string {
  const clean = String(name ?? "").trim();
  return clean && clean.toUpperCase() !== ticker.toUpperCase() ? `${clean} (${ticker})` : ticker;
}

/**
 * The move page title. While the day is still today and no closing price is
 * in, it asks the question people search ("Why Is X Stock Up Today?") with the
 * date; once the day is history it states the move with its size and date.
 */
export function moveTitle(input: { name?: string | null; ticker: string; pct: number; day: string; today: string; closed: boolean }): string {
  const label = stockLabel(input.name, input.ticker);
  const up = input.pct >= 0;
  if (!input.closed && input.day === input.today) {
    return `Why Is ${label} Stock ${up ? "Up" : "Down"} Today? ${longDay(input.day)}`;
  }
  return `Why ${label} Stock ${up ? "Rose" : "Fell"} ${Math.abs(input.pct).toFixed(1)}% on ${longDay(input.day)}`;
}

export function moversDayTitle(day: string): string {
  return `Biggest Stock Movers on ${longDay(day)} and Why They Moved`;
}

/** Plain words for the stored cause type: "earnings_and_guidance" -> "earnings and guidance". */
export function causeWords(cause: string | null | undefined): string {
  return String(cause ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A coarse bucket for counting reasons across a day. */
export function causeBucket(cause: string | null | undefined): string {
  const words = causeWords(cause);
  if (/earning|guidance|results|quarter/.test(words)) return "earnings";
  if (/analyst|rating|price target|upgrade|downgrade/.test(words)) return "analyst calls";
  if (/contract|partnership|deal|acquisition|merger|order/.test(words)) return "deals and contracts";
  if (/clinical|trial|fda|approval|drug/.test(words)) return "drug and trial news";
  if (/financing|offering|capital|debt|buyback/.test(words)) return "financing";
  if (/legal|lawsuit|regulat|investigation/.test(words)) return "legal and regulatory news";
  return "other news";
}

/* ── Sectors ──────────────────────────────────────────────────────────── */

export function sectorHref(slug: string): string {
  return `/sectors/${slug}`;
}

export function sectorIsIndexable(coveredStocks: number): boolean {
  return coveredStocks >= SECTOR_MIN_STOCKS;
}

export function sectorTitle(name: string): string {
  return `${name} Stocks: Performance, Valuation and Biggest Movers`;
}

/* ── Insiders ─────────────────────────────────────────────────────────── */

export type InsiderTradeLike = {
  insider: string;
  insider_id?: string;
  tx_type: "buy" | "sell";
  value: number | null;
  transaction_date: string;
  filing_date?: string;
  filed_at?: string;
};

export function insiderHref(ticker: string): string {
  return `/insiders/${encodeURIComponent(ticker.toUpperCase())}`;
}

/** Trades filed in the INSIDER_WINDOW_DAYS before `today`. */
export function insiderWindow<T extends InsiderTradeLike>(trades: readonly T[], today: string): T[] {
  const since = dayMinus(today, INSIDER_WINDOW_DAYS);
  return trades.filter((trade) => {
    const day = (trade.filing_date || trade.filed_at || trade.transaction_date || "").slice(0, 10);
    return isIsoDay(day) && day >= since && day <= today;
  });
}

export function insiderIsIndexable(tradesInWindow: number): boolean {
  return tradesInWindow >= INSIDER_MIN_TRADES;
}

export function insiderTitle(name: string | null | undefined, ticker: string): string {
  return `${stockLabel(name, ticker)} Insider Trading: Recent Buys and Sells`;
}

export type ClusterBuy = { first: string; last: string; insiders: string[]; value: number };

/**
 * Cluster buys: CLUSTER_MIN_INSIDERS or more different insiders buying on
 * the open market within CLUSTER_WINDOW_DAYS. Windows do not overlap; each
 * one starts at the first buy not already in a cluster.
 */
export function clusterBuys(trades: readonly InsiderTradeLike[]): ClusterBuy[] {
  const buys = trades
    .filter((trade) => trade.tx_type === "buy" && isIsoDay(trade.transaction_date))
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  const out: ClusterBuy[] = [];
  let start = 0;
  while (start < buys.length) {
    const first = buys[start]!.transaction_date;
    const inside = buys.slice(start).filter((trade) => daysBetween(first, trade.transaction_date) <= CLUSTER_WINDOW_DAYS);
    const insiders = [...new Set(inside.map((trade) => trade.insider_id || trade.insider))];
    if (insiders.length >= CLUSTER_MIN_INSIDERS) {
      out.push({
        first,
        last: inside[inside.length - 1]!.transaction_date,
        insiders: [...new Set(inside.map((trade) => trade.insider))],
        value: inside.reduce((sum, trade) => sum + (trade.value ?? 0), 0),
      });
      start += inside.length;
    } else {
      start += 1;
    }
  }
  return out;
}
