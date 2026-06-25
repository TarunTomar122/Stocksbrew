import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { SnapshotRow } from "@/lib/types";
import { anomalyHeadline } from "@/components/daily-anomalies-shared";

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const LANDING_SECTORS: { label: string; tickers: string[] }[] = [
  { label: "Tech", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "ADBE", "CRM"] },
  { label: "Semis", tickers: ["NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "ARM", "SMCI", "MRVL"] },
  { label: "Industrials", tickers: ["CAT", "GE", "HON", "RTX", "BA", "MMM", "ETN", "DE"] },
  { label: "Finance", tickers: ["JPM", "BAC", "GS", "MS", "WFC", "V", "MA", "AXP"] },
];

export const SECTOR_HREF_BY_LABEL: Record<string, string> = {
  Tech: "/sector/big-tech",
  Semis: "/sector/semiconductors",
  Industrials: "/sector/industrials",
  Finance: "/sector/financials",
};

export const SECTOR_THEME: Record<string, { accent: string; icon: string }> = {
  Tech: { accent: "#10b981", icon: "show_chart" },
  Semis: { accent: "#8b5cf6", icon: "memory" },
  Industrials: { accent: "#3b82f6", icon: "precision_manufacturing" },
  Finance: { accent: "#14b8a6", icon: "attach_money" },
};

export function sectorPctMove(changePct: number) {
  const up = changePct >= 0;
  return {
    up,
    color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
  };
}

export function anomalyTag(a: AnomalyItem): string {
  const tag = (a.catalyst || a.move_explanation?.headline || a.visual_summary?.what_changed || "").trim();
  return tag || anomalyHeadline(a);
}

/** Biggest move today by |day_change_pct| — gainer or loser. */
export function pickBiggestMover(anomalies: AnomalyItem[]): AnomalyItem | null {
  if (anomalies.length === 0) return null;
  return anomalies.reduce((best, row) =>
    Math.abs(row.day_change_pct) > Math.abs(best.day_change_pct) ? row : best,
  );
}

export type SectorHeatCard = {
  label: string;
  avg: number;
  stocks: { ticker: string; instrumentId: string; changePct: number }[];
};

export function buildLandingSectorCards(snapshotRows: SnapshotRow[]): SectorHeatCard[] {
  const bySym = new Map<string, SnapshotRow>();
  for (const r of snapshotRows) if (r.symbol) bySym.set(r.symbol.toUpperCase(), r);

  return LANDING_SECTORS.map(({ label, tickers }) => {
    const stocks = tickers
      .map((t) => bySym.get(t))
      .filter((r): r is SnapshotRow => r != null && n(r.price?.changePct))
      .map((r) => ({
        ticker: r.symbol,
        instrumentId: r.instrumentId || `US_${r.symbol}`,
        changePct: r.price!.changePct!,
      }))
      .sort((a, b) => b.changePct - a.changePct);
    const avg = stocks.length ? stocks.reduce((s, x) => s + x.changePct, 0) / stocks.length : 0;
    return { label, avg, stocks: stocks.slice(0, 8) };
  }).filter((c) => c.stocks.length > 0);
}
