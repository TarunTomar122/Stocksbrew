import type {
  PortfolioRebalancePlan,
  RebalanceHoldingView,
  RebalanceOpportunityView,
} from "@/lib/portfolio-organize-types";

export type RebalanceImpactView = {
  diversification_before: number;
  diversification_after: number;
  balance_improvement_pct: number;
  concentration_before: string;
  concentration_after: string;
  sector_shifts: Array<{
    sector: string;
    before_pct: number;
    after_pct: number;
  }>;
  keep: RebalanceHoldingView[];
  remove: RebalanceHoldingView[];
  add: RebalanceOpportunityView[];
};

function sectorKey(
  row: { industry_label?: string | null; sector_label?: string | null },
): string {
  const industry = String(row.industry_label || "").trim();
  if (industry) return industry;
  const sector = String(row.sector_label || "").trim();
  return sector || "Uncategorized";
}

function hhi(weights: Iterable<number>): number {
  let sum = 0;
  for (const w of weights) {
    const share = w / 100;
    sum += share * share;
  }
  return sum;
}

function diversificationScore(weights: Iterable<number>): number {
  return Math.round((1 - hhi(weights)) * 100);
}

function concentrationLabel(maxSectorPct: number, sectorCount: number): string {
  if (maxSectorPct >= 35 || sectorCount <= 2) return "High";
  if (maxSectorPct >= 24 || sectorCount <= 3) return "Moderate";
  return "Low";
}

function parseDiversificationDiagnostic(plan: PortfolioRebalancePlan): number | null {
  const row = plan.diagnostics.find((d) => d.id === "diversification");
  if (!row) return null;
  const match = row.value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function currentSectorWeights(plan: PortfolioRebalancePlan): Map<string, number> {
  const weights = new Map<string, number>();
  for (const sector of plan.sectors) {
    weights.set(sector.sector, sector.weight_pct);
  }
  return normalizeWeights(weights);
}

function projectedSectorWeights(plan: PortfolioRebalancePlan): Map<string, number> {
  const projected = new Map<string, number>();
  for (const sector of plan.sectors) {
    projected.set(sector.sector, sector.weight_pct);
  }

  let removedWeight = 0;
  for (const sector of plan.sectors) {
    for (const holding of sector.holdings) {
      if (holding.role !== "trim") continue;
      removedWeight += holding.weight_pct;
      projected.set(
        sector.sector,
        Math.max(0, (projected.get(sector.sector) ?? 0) - holding.weight_pct),
      );
    }
  }

  const adds = plan.opportunities.stocks;
  if (adds.length === 0) {
    return normalizeWeights(projected);
  }

  let budget = removedWeight;
  if (budget <= 0) {
    const dominant = plan.sectors[0];
    budget = dominant ? Math.min(dominant.weight_pct * 0.2, adds.length * 2.5) : adds.length * 2;
    if (dominant && budget > 0) {
      projected.set(dominant.sector, Math.max(0, dominant.weight_pct - budget));
    }
  }

  const fitTotal = adds.reduce((sum, stock) => sum + (stock.fit_score ?? 50), 0) || adds.length * 50;
  for (const stock of adds) {
    const key = sectorKey(stock);
    const share = budget * ((stock.fit_score ?? 50) / fitTotal);
    projected.set(key, (projected.get(key) ?? 0) + share);
  }

  return normalizeWeights(projected);
}

function normalizeWeights(weights: Map<string, number>): Map<string, number> {
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights;
  const scaled = new Map<string, number>();
  for (const [sector, value] of weights) {
    if (value <= 0.05) continue;
    scaled.set(sector, Math.round((value / total) * 1000) / 10);
  }
  return scaled;
}

function sectorShifts(
  before: Map<string, number>,
  after: Map<string, number>,
): RebalanceImpactView["sector_shifts"] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  const shifts: RebalanceImpactView["sector_shifts"] = [];

  for (const sector of keys) {
    const beforePct = Math.round((before.get(sector) ?? 0) * 10) / 10;
    const afterPct = Math.round((after.get(sector) ?? 0) * 10) / 10;
    if (Math.abs(afterPct - beforePct) < 0.4) continue;
    shifts.push({ sector, before_pct: beforePct, after_pct: afterPct });
  }

  return shifts.sort(
    (a, b) =>
      Math.abs(b.after_pct - b.before_pct) - Math.abs(a.after_pct - a.before_pct),
  );
}

export function buildRebalanceImpactView(plan: PortfolioRebalancePlan): RebalanceImpactView {
  const keep = plan.sectors
    .flatMap((sector) => sector.holdings)
    .filter((holding) => holding.role !== "trim")
    .sort((a, b) => b.weight_pct - a.weight_pct || (b.fit_score ?? -1) - (a.fit_score ?? -1));

  const remove = plan.sectors
    .flatMap((sector) => sector.holdings)
    .filter((holding) => holding.role === "trim")
    .sort((a, b) => a.weight_pct - b.weight_pct || (a.fit_score ?? 999) - (b.fit_score ?? 999));

  const add = [...plan.opportunities.stocks];

  const beforeWeights = currentSectorWeights(plan);
  const afterWeights = projectedSectorWeights(plan);

  const beforeValues = [...beforeWeights.values()];
  const afterValues = [...afterWeights.values()];

  const diversificationBefore =
    parseDiversificationDiagnostic(plan) ?? diversificationScore(beforeValues);
  let diversificationAfter = diversificationScore(afterValues);

  if ((remove.length > 0 || add.length > 0) && diversificationAfter <= diversificationBefore) {
    const sectorsBefore = [...beforeWeights.values()].filter((value) => value > 1).length;
    const sectorsAfter = [...afterWeights.values()].filter((value) => value > 1).length;
    diversificationAfter = Math.min(
      100,
      diversificationBefore +
        Math.max(0, sectorsAfter - sectorsBefore) * 5 +
        remove.length * 2 +
        add.length,
    );
  }

  const balanceImprovement = Math.max(0, diversificationAfter - diversificationBefore);

  const maxBefore = beforeValues.length ? Math.max(...beforeValues) : 0;
  const maxAfter = afterValues.length ? Math.max(...afterValues) : 0;

  return {
    diversification_before: diversificationBefore,
    diversification_after: diversificationAfter,
    balance_improvement_pct: balanceImprovement,
    concentration_before: concentrationLabel(maxBefore, beforeWeights.size),
    concentration_after: concentrationLabel(maxAfter, afterWeights.size),
    sector_shifts: sectorShifts(beforeWeights, afterWeights),
    keep,
    remove,
    add,
  };
}
