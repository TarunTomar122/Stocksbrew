import type { StockIntelPillar, StockIntelPro } from "@/lib/types";

export const MIN_FUNDAMENTALS_COVERAGE = 0.5;

export function pillarCoverage(pillar: StockIntelPillar): number {
  if (typeof pillar.coverage === "number" && Number.isFinite(pillar.coverage)) {
    return Math.max(0, Math.min(1, pillar.coverage));
  }
  const metrics = pillar.metrics ?? [];
  if (!metrics.length) return 0;
  const totalWeight = metrics.reduce((sum, metric) => sum + (metric.weight ?? 1), 0);
  const availableWeight = metrics.reduce(
    (sum, metric) => sum + (metric.score != null ? (metric.weight ?? 1) : 0),
    0,
  );
  return totalWeight > 0 ? availableWeight / totalWeight : 0;
}

export function hasSufficientPillarData(pillar: StockIntelPillar): boolean {
  return pillarCoverage(pillar) >= MIN_FUNDAMENTALS_COVERAGE;
}

export function overallCoverage(intel: StockIntelPro): number | null {
  const coverage = intel.overall?.coverage;
  if (typeof coverage === "number" && Number.isFinite(coverage)) {
    return Math.max(0, Math.min(1, coverage));
  }
  return null;
}

export function hasSufficientOverallData(intel: StockIntelPro): boolean {
  const coverage = overallCoverage(intel);
  return coverage == null || coverage >= MIN_FUNDAMENTALS_COVERAGE;
}
