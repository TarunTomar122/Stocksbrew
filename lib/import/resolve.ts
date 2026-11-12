/**
 * Checks imported tickers against the stocks we cover (the search index the
 * rest of the app tracks from). Pure: the caller passes the directory in.
 */

import type { MergeMode } from "@/lib/import/merge";
import type { ImportConfidence, ParsedHolding } from "@/lib/import/normalize";

export type DirectoryEntry = {
  instrument_id: string;
  ticker: string;
  name: string;
  /** Last price in the search index, when it has one: a cross-check on what the screenshot said. */
  price?: number | null;
};

/**
 * matched:   the ticker is one we cover.
 * suggested: the ticker was missing or unknown, and we matched the name or a
 *            known alias (GOOG is tracked as GOOGL). The person confirms it.
 * adding:    a US fund (ETF or mutual fund) we do not cover yet. We are adding
 *            it now (lib/funds/on-demand.ts), so it saves like a match.
 * unknown:   we do not cover it yet; the person can ask us to add it.
 */
export type ImportStatus = "matched" | "suggested" | "adding" | "unknown";

/** Says which tickers are US funds (lib/funds/tickers.ts `fundKindOf`); passed in so this file stays pure. */
export type FundKindLookup = (ticker: string) => "etf" | "mutual_fund" | null;

/** One row of the review table, and what the save route accepts back. */
export type ImportRow = {
  /** Stable key for the review table. */
  key: string;
  /** What the input said ("GOOG", or the name when there was no ticker). */
  raw: string;
  status: ImportStatus;
  instrument_id: string | null;
  ticker: string | null;
  name: string | null;
  shares: number | null;
  average_cost: number | null;
  market_value: number | null;
  confidence: ImportConfidence;
  /** Set when the screen showed another currency and its cost and value were left out ("EUR"). */
  currency?: string;
  /** Set in the review table for a stock the person already holds; the save treats a missing one as "keep". */
  merge?: MergeMode;
  /** The stock's last price in the search index, so the review can say what the shares are worth today. Never saved. */
  price?: number | null;
  /** Set on an "adding" row: what kind of fund it is. */
  fund_kind?: "etf" | "mutual_fund";
};

/** The house instrument id for a ticker (BRK.B is US_BRK_B). */
function instrumentIdFor(ticker: string): string {
  return `US_${ticker.trim().toUpperCase().replace(/\./g, "_")}`;
}

/** Symbols we track under another class or a newer ticker. */
const ALIASES: Record<string, string> = {
  GOOG: "GOOGL",
  FB: "META",
  BRKB: "BRK.B",
  BRK: "BRK.B",
  BFB: "BF.B",
};

const NAME_NOISE =
  /\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings?|group|the|class [a-c]|cl [a-c]|common stock|ordinary shares?|shares?|adr|sa|nv|ag|se)\b/g;

/** "NVIDIA Corporation" and "Nvidia Corp." are the same company. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'’()]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Directory = {
  byTicker: Map<string, DirectoryEntry>;
  byName: Map<string, DirectoryEntry>;
};

export function buildDirectory(entries: DirectoryEntry[]): Directory {
  const byTicker = new Map<string, DirectoryEntry>();
  const byName = new Map<string, DirectoryEntry>();
  const ambiguous = new Set<string>();
  for (const entry of entries) {
    const ticker = entry.ticker.toUpperCase();
    if (!ticker || !entry.instrument_id) continue;
    byTicker.set(ticker, entry);
    const key = nameKey(entry.name || "");
    if (!key) continue;
    // Two companies with the same cleaned name: neither is matched by name.
    if (byName.has(key) && byName.get(key)!.ticker !== ticker) ambiguous.add(key);
    else byName.set(key, entry);
  }
  for (const key of ambiguous) byName.delete(key);
  return { byTicker, byName };
}

function lookup(directory: Directory, ticker: string): DirectoryEntry | undefined {
  return directory.byTicker.get(ticker) ?? directory.byTicker.get(ticker.replace(".", "-")) ?? directory.byTicker.get(ticker.replace("-", "."));
}

/**
 * The screen's value per share is far from today's price: one of the numbers
 * was probably misread (a blurry 6 read as an 8). Old screenshots drift a
 * little, so only a gap over 15% counts.
 */
function offPrice(row: ParsedHolding, entry: DirectoryEntry): boolean {
  const price = entry.price;
  if (!row.shares || !row.marketValue || typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;
  return Math.abs(row.marketValue / row.shares / price - 1) > 0.15;
}

/**
 * Each parsed holding against the directory, in the order they came. With
 * `fundKind`, a US fund the directory does not have becomes an "adding" row
 * under its own instrument id instead of being left out.
 */
export function resolveHoldings(rows: ParsedHolding[], directory: Directory, fundKind?: FundKindLookup): ImportRow[] {
  const out: ImportRow[] = [];
  const used = new Set<string>();
  rows.forEach((row, index) => {
    const raw = row.ticker ?? row.name ?? "";
    let entry: DirectoryEntry | undefined;
    let status: ImportStatus = "unknown";
    let kind: "etf" | "mutual_fund" | null = null;
    if (row.ticker) {
      entry = lookup(directory, row.ticker);
      if (entry) status = "matched";
      else if (ALIASES[row.ticker.replace(".", "")]) {
        entry = lookup(directory, ALIASES[row.ticker.replace(".", "")]!);
        if (entry) status = "suggested";
      }
      kind = entry ? null : fundKind?.(row.ticker) ?? null;
      if (kind) {
        const ticker = row.ticker.toUpperCase();
        entry = { instrument_id: instrumentIdFor(ticker), ticker, name: row.name ?? ticker, price: null };
        status = "adding";
      }
    }
    if (!entry && row.name) {
      const key = nameKey(row.name);
      // "Berkshire Hathaway B" is the B share; the directory keeps the plain name.
      entry = directory.byName.get(key) ?? directory.byName.get(key.replace(/ [a-c]$/, ""));
      if (entry) status = "suggested";
    }
    // Two input rows that land on the same stock (GOOG and GOOGL, tracked as one): one holding, shares added and the
    // cost weighted by shares. Adding two lines together is our doing, so the row asks for a look.
    if (entry && used.has(entry.instrument_id)) {
      const first = out.find((item) => item.instrument_id === entry!.instrument_id)!;
      const shares = first.shares !== null && row.shares !== null ? first.shares + row.shares : first.shares ?? row.shares;
      const bothCosts = first.shares !== null && row.shares !== null && first.average_cost !== null && row.averageCost !== null;
      first.average_cost = bothCosts
        ? Math.round(((first.shares! * first.average_cost! + row.shares! * row.averageCost!) / shares!) * 10_000) / 10_000
        : first.shares === null || row.shares === null
          ? // Only one line has shares: its cost goes with them.
            (row.shares !== null ? row.averageCost : first.average_cost) ?? (first.shares === null && row.shares === null ? first.average_cost ?? row.averageCost : null)
          : null;
      first.market_value = first.market_value !== null && row.marketValue !== null ? first.market_value + row.marketValue : first.market_value ?? row.marketValue;
      first.shares = shares;
      if (first.confidence === "high") first.confidence = "medium";
      return;
    }
    if (entry) used.add(entry.instrument_id);
    if (!entry && row.guess) return;
    let confidence: ImportConfidence =
      status === "matched" || status === "adding" ? row.confidence : status === "suggested" ? (row.confidence === "low" ? "low" : "medium") : "low";
    if (entry && offPrice(row, entry)) confidence = confidence === "high" ? "medium" : "low";
    out.push({
      key: `${index}-${raw}`,
      raw,
      status,
      instrument_id: entry?.instrument_id ?? null,
      ticker: entry?.ticker ?? row.ticker,
      name: entry?.name ?? row.name,
      shares: row.shares,
      average_cost: row.averageCost,
      market_value: row.marketValue,
      // A ticker we had to guess is never "high", whatever the reader said.
      confidence,
      ...(row.currency ? { currency: row.currency } : {}),
      price: entry && typeof entry.price === "number" && Number.isFinite(entry.price) && entry.price > 0 ? entry.price : null,
      ...(status === "adding" && kind ? { fund_kind: kind } : {}),
    });
  });
  return out;
}

/** The ticker we track a symbol under, when it is one we keep under another class or name (GOOG is GOOGL). */
export function aliasFor(ticker: string): string | null {
  return ALIASES[ticker.trim().toUpperCase().replace(/^\$/, "").replace(/[.\-/ ]/g, "")] ?? null;
}

/**
 * Re-check a ticker the person typed into the review table. Returns the
 * directory entry, following the same aliases as the import.
 */
export function findTicker(directory: Directory, typed: string): DirectoryEntry | null {
  const ticker = typed.trim().toUpperCase().replace(/^\$/, "");
  if (!ticker) return null;
  return lookup(directory, ticker) ?? (ALIASES[ticker.replace(".", "")] ? lookup(directory, ALIASES[ticker.replace(".", "")]!) ?? null : null);
}

/** The tickers of the "adding" rows: the funds an import should file with the fund worker. */
export function addingTickers(rows: ImportRow[]): string[] {
  return [...new Set(rows.filter((row) => row.status === "adding" && row.ticker).map((row) => row.ticker!.toUpperCase()))];
}

/**
 * Instrument ids the save may accept beyond the directory: "adding" funds,
 * checked again here with the same fund list (never trusting the browser's status).
 */
export function pendingFundIds(instrumentIds: string[], known: Set<string>, fundKind: FundKindLookup): Set<string> {
  const out = new Set<string>();
  for (const id of instrumentIds) {
    if (known.has(id) || !/^US_[A-Z]{1,5}$/.test(id)) continue;
    if (fundKind(id.slice(3))) out.add(id);
  }
  return out;
}
