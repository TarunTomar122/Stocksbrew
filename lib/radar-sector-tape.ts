import type { DashboardView } from "@/lib/types";

export type SectorTapeItem = {
  sector: string;
  changePct: number;
  count: number;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Average today's move per GICS sector across the materialized dashboard universe. */
export function buildSectorTape(view: DashboardView | null): SectorTapeItem[] {
  const rows = view?.watchlist_rows;
  if (!rows?.length) return [];

  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const sector = String(row.sector || "").trim();
    const move = num(row.day_change_pct);
    if (!sector || move === null) continue;
    const list = buckets.get(sector) ?? [];
    list.push(move);
    buckets.set(sector, list);
  }

  return [...buckets.entries()]
    .map(([sector, moves]) => ({
      sector,
      changePct: Math.round((moves.reduce((s, m) => s + m, 0) / moves.length) * 100) / 100,
      count: moves.length,
    }))
    .sort((a, b) => b.changePct - a.changePct);
}

export function shortSectorLabel(sector: string): string {
  const map: Record<string, string> = {
    "Information Technology": "Technology",
    "Consumer Discretionary": "Cons. Disc.",
    "Consumer Staples": "Cons. Staples",
    "Consumer Cyclical": "Cons. Cycl.",
    "Consumer Defensive": "Cons. Def.",
    "Communication Services": "Comm. Svcs.",
    "Financial Services": "Financials",
    "Health Care": "Healthcare",
    "Real Estate": "Real Estate",
  };
  return map[sector] ?? sector;
}
