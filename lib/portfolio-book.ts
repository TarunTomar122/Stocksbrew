import type { WatchlistRow } from "@/lib/watchlist-view";
import { decodeTextEntities } from "@/lib/utils";

/** Canonical row shape for portfolio view. */
export type PortfolioBookRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  market: "US" | "IN";
  sector_label: string;
  industry_label: string;
  position_type: "holding" | "watchlist";
  price: number | null;
  day_change_pct: number | null;
  scores: WatchlistRow["scores"];
  directive_v2?: WatchlistRow["directive_v2"];
  ai_directive?: WatchlistRow["ai_directive"];
  holding?: WatchlistRow["holding"];
  coverage_status: WatchlistRow["coverage_status"];
  has_intel_pro: boolean;
};

export type PortfolioPositionFilter = "all" | "holding" | "watchlist";

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function cleanLabel(value: string): string {
  return decodeTextEntities(value.trim());
}

export function buildPortfolioBook(rows: WatchlistRow[]): PortfolioBookRow[] {
  return rows.map((row) => ({
    instrument_id: row.instrument_id,
    ticker: row.ticker,
    name: decodeTextEntities(row.instrument_name || row.ticker),
    logo_url: row.logo_url ?? null,
    market: (row.market === "IN" ? "IN" : "US") as "US" | "IN",
    sector_label: cleanLabel(row.sector_label) || "Uncategorized",
    industry_label: cleanLabel(row.industry_label),
    position_type: row.position_type === "holding" ? ("holding" as const) : ("watchlist" as const),
    price: finiteNumber(row.price),
    day_change_pct: finiteNumber(row.day_change_pct),
    scores: row.scores,
    directive_v2: row.directive_v2,
    ai_directive: row.ai_directive,
    holding: row.holding,
    coverage_status: row.coverage_status,
    has_intel_pro: Boolean(row.has_intel_pro),
  }));
}

export function filterPortfolioRows(
  rows: PortfolioBookRow[],
  filter: PortfolioPositionFilter,
): PortfolioBookRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => row.position_type === filter);
}
