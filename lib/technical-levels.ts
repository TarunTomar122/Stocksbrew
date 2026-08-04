import type { PriceHistoryPoint } from "@/lib/price-history-chart";

export type TechnicalLevels = {
  support: number | null;
  resistance: number | null;
  sessions: number;
};

const finitePrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Find nearby reversal levels from recent daily closes.
 *
 * This is intentionally descriptive rather than predictive: local closing-price
 * lows become support candidates and local highs become resistance candidates.
 */
export function findNearestTechnicalLevels(
  points: PriceHistoryPoint[] | null | undefined,
  currentPrice: number,
): TechnicalLevels | null {
  if (!finitePrice(currentPrice)) return null;

  const closes = (points ?? [])
    .filter((point) => finitePrice(point.close))
    .slice(-120)
    .map((point) => point.close);

  if (closes.length < 10) return null;

  const pivotRadius = closes.length >= 30 ? 2 : 1;
  const supportCandidates: number[] = [];
  const resistanceCandidates: number[] = [];

  for (let index = pivotRadius; index < closes.length - pivotRadius; index += 1) {
    const price = closes[index];
    const neighbours = [
      ...closes.slice(index - pivotRadius, index),
      ...closes.slice(index + 1, index + pivotRadius + 1),
    ];

    if (neighbours.every((value) => price <= value) && neighbours.some((value) => price < value)) {
      supportCandidates.push(price);
    }
    if (neighbours.every((value) => price >= value) && neighbours.some((value) => price > value)) {
      resistanceCandidates.push(price);
    }
  }

  const minimumGap = currentPrice * 0.003;
  const support = supportCandidates
    .filter((price) => price <= currentPrice - minimumGap)
    .sort((a, b) => b - a)[0] ?? null;
  const resistance = resistanceCandidates
    .filter((price) => price >= currentPrice + minimumGap)
    .sort((a, b) => a - b)[0] ?? null;

  // A trending series may not contain a local pivot on one side. The recent
  // range is an honest fallback and avoids inventing a level outside our data.
  const recent = closes.slice(-20);
  const fallbackSupport = recent
    .filter((price) => price <= currentPrice - minimumGap)
    .sort((a, b) => a - b)[0] ?? null;
  const fallbackResistance = recent
    .filter((price) => price >= currentPrice + minimumGap)
    .sort((a, b) => b - a)[0] ?? null;

  const resolvedSupport = support ?? fallbackSupport;
  const resolvedResistance = resistance ?? fallbackResistance;
  if (resolvedSupport == null && resolvedResistance == null) return null;

  return {
    support: resolvedSupport,
    resistance: resolvedResistance,
    sessions: closes.length,
  };
}
