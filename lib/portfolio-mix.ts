import type { PortfolioBookRow } from "@/lib/portfolio-book";

export type MixWeights = Record<string, number>;

export type PortfolioMixSnapshot = {
  week_key: string;
  generated_at: string;
  weights: MixWeights;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function currentMixWeek(date = new Date()): string {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return `${year}-W${String(Math.floor(day / 7) + 1).padStart(2, "0")}`;
}

/** Keep rough user input bounded and limited to the current watchlist. */
export function sanitizeMixWeights(rows: PortfolioBookRow[], input: unknown): MixWeights {
  const tracked = new Set(rows.map((row) => row.instrument_id));
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const next: MixWeights = {};

  for (const [instrumentId, value] of Object.entries(raw)) {
    if (!tracked.has(instrumentId)) continue;
    const number = finite(value);
    if (number === null) continue;
    next[instrumentId] = Math.round(Math.min(100, Math.max(0, number)));
  }

  const total = Object.values(next).reduce((sum, value) => sum + value, 0);
  if (total <= 100) return next;

  const scale = 100 / total;
  const scaled = Object.fromEntries(
    Object.entries(next).map(([instrumentId, value]) => [instrumentId, Math.round(value * scale)]),
  );
  let excess = mixTotal(scaled) - 100;
  for (const [instrumentId, value] of Object.entries(scaled).sort(([, a], [, b]) => b - a)) {
    if (excess <= 0) break;
    const reduction = Math.min(value, excess);
    scaled[instrumentId] -= reduction;
    excess -= reduction;
  }
  return scaled;
}

function signalForRow(row: PortfolioBookRow): number {
  const score = finite(row.scores.overall) ?? 50;
  const stance = row.directive_v2?.stance ?? row.ai_directive?.stance ?? "hold";
  const stanceAdjustment = stance === "accumulate" ? 12 : stance === "trim" || stance === "avoid" ? -14 : 0;
  return Math.max(1, score + stanceAdjustment);
}

function normalizeWeights(weights: MixWeights): MixWeights {
  const total = mixTotal(weights);
  if (total === 0 || total === 100) return weights;
  const largest = Object.entries(weights).sort(([, a], [, b]) => b - a)[0]?.[0];
  if (!largest) return weights;
  return { ...weights, [largest]: Math.max(0, weights[largest] + 100 - total) };
}

/** A weekly, indicative mix derived from the same watchlist signals users already see. */
export function deriveResearchMix(rows: PortfolioBookRow[], date = new Date()): PortfolioMixSnapshot {
  const signals = rows.map((row) => ({ id: row.instrument_id, signal: signalForRow(row) }));
  const total = signals.reduce((sum, item) => sum + item.signal, 0);
  const weights = normalizeWeights(Object.fromEntries(
    signals.map((item) => [item.id, Math.round((item.signal / Math.max(total, 1)) * 100)]),
  ));

  return {
    week_key: currentMixWeek(date),
    generated_at: date.toISOString(),
    weights,
  };
}

export function mixTotal(weights: MixWeights): number {
  return Object.values(weights).reduce((sum, value) => sum + value, 0);
}
