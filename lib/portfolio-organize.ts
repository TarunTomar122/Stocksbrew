import type { PortfolioBookRow } from "@/lib/portfolio-book";
import { REGIME_LABEL, regimeTone, type SectorRegimeDoc } from "@/lib/sector-regimes";
import { decodeTextEntities } from "@/lib/utils";
import type {
  PortfolioRebalancePlan,
  RebalanceDiagnostic,
  RebalanceHoldingRole,
  RebalanceHoldingView,
  RebalanceOpportunityView,
  RebalanceStrategy,
  RebalanceStrategyId,
  RebalanceTone,
} from "@/lib/portfolio-organize-types";

export type RebalanceUniverseCandidate = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  sector_label: string;
  industry_label: string;
  price: number | null;
  day_change_pct: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  verdict: string | null;
  directive_text: string | null;
  scores: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
};

type StrategyDefinition = RebalanceStrategy & {
  weights: {
    overall: number;
    valuation: number;
    growth: number;
    quality: number;
    momentum: number;
  };
  favored_sectors: string[];
  avoided_sectors: string[];
  max_sector_weight_pct: number;
  preferred_sector_count: number;
};

const STRATEGIES: Record<RebalanceStrategyId, StrategyDefinition> = {
  balanced: {
    id: "balanced",
    label: "Balanced fundamentals",
    summary: "Cap concentration and lean on quality, valuation, and broad sector breadth.",
    weights: { overall: 0.18, valuation: 0.22, growth: 0.16, quality: 0.26, momentum: 0.18 },
    favored_sectors: ["Healthcare", "Industrials", "Financials"],
    avoided_sectors: [],
    max_sector_weight_pct: 32,
    preferred_sector_count: 4,
  },
  quality: {
    id: "quality",
    label: "Quality compounders",
    summary: "Favor durable operators with clean quality, solid growth, and less junk exposure.",
    weights: { overall: 0.16, valuation: 0.12, growth: 0.24, quality: 0.34, momentum: 0.14 },
    favored_sectors: ["Software", "Healthcare", "Industrials"],
    avoided_sectors: [],
    max_sector_weight_pct: 35,
    preferred_sector_count: 4,
  },
  ai_momentum: {
    id: "ai_momentum",
    label: "AI momentum",
    summary: "Lean into leadership, tolerate richer setups, and keep growth plus momentum doing the work.",
    weights: { overall: 0.15, valuation: 0.05, growth: 0.34, quality: 0.16, momentum: 0.3 },
    favored_sectors: ["Semiconductors", "Software", "Communication Services", "Computer Hardware"],
    avoided_sectors: ["Utilities", "Consumer Staples"],
    max_sector_weight_pct: 45,
    preferred_sector_count: 3,
  },
  defensive: {
    id: "defensive",
    label: "Defensive balance",
    summary: "Reduce cyclical crowding and favor steadier quality, valuation, and lower-drama sectors.",
    weights: { overall: 0.16, valuation: 0.24, growth: 0.1, quality: 0.34, momentum: 0.16 },
    favored_sectors: ["Healthcare", "Consumer Staples", "Utilities", "Industrials", "Financials"],
    avoided_sectors: ["Semiconductors", "Computer Hardware"],
    max_sector_weight_pct: 28,
    preferred_sector_count: 5,
  },
  diversification: {
    id: "diversification",
    label: "Diversification first",
    summary: "Penalize overlap, fill real gaps, and stop adding more of what already dominates the book.",
    weights: { overall: 0.16, valuation: 0.2, growth: 0.14, quality: 0.28, momentum: 0.22 },
    favored_sectors: [],
    avoided_sectors: [],
    max_sector_weight_pct: 25,
    preferred_sector_count: 5,
  },
};

export const DEFAULT_REBALANCE_STRATEGY: RebalanceStrategyId = "balanced";

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightForRow(row: PortfolioBookRow, useValueWeights: boolean): number {
  if (useValueWeights && row.position_type === "holding") {
    const value = finiteNumber(row.holding?.portfolio_weight_pct);
    if (value != null && value > 0) return value;
  }
  return 1;
}

function shouldUseValueWeights(holdings: PortfolioBookRow[]): boolean {
  return holdings.length > 0 && holdings.every((row) => {
    const value = finiteNumber(row.holding?.portfolio_weight_pct);
    return value != null && value > 0;
  });
}

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = decodeTextEntities(String(value || "").trim());
  return trimmed || fallback;
}

function directiveText(row: {
  directive_v2?: { title?: string | null } | null;
  ai_directive?: { text?: string | null } | null;
  directive_text?: string | null;
}): string | null {
  const title = String(row.directive_v2?.title || "").trim();
  if (title) return title;
  const ai = String(row.ai_directive?.text || row.directive_text || "").trim();
  return ai || null;
}

function candidateDirectiveText(row: RebalanceUniverseCandidate): string | null {
  return String(row.directive_text || "").trim() || null;
}

function sectorNameFromRow(row: { industry_label?: string | null; sector_label?: string | null }): string {
  const industry = cleanLabel(row.industry_label, "");
  if (industry) return industry;
  return cleanLabel(row.sector_label, "Uncategorized");
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatScore(value: number | null): string {
  return value == null ? "n/a" : String(Math.round(value));
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  const usable = values.filter((item) => item.value != null && item.weight > 0) as Array<{
    value: number;
    weight: number;
  }>;
  if (usable.length === 0) return null;
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return usable.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function weightedScore(
  scores: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  },
  strategy: StrategyDefinition,
): number {
  const parts = [
    { value: scores.overall, weight: strategy.weights.overall },
    { value: scores.valuation, weight: strategy.weights.valuation },
    { value: scores.growth, weight: strategy.weights.growth },
    { value: scores.quality, weight: strategy.weights.quality },
    { value: scores.momentum, weight: strategy.weights.momentum },
  ];
  const avg = weightedAverage(parts);
  return avg == null ? 0 : avg;
}

function sectorBias(sector: string, strategy: StrategyDefinition): number {
  const normalized = sector.toLowerCase();
  const favored = strategy.favored_sectors.some((item) => item.toLowerCase() === normalized);
  if (favored) return 6;
  const avoided = strategy.avoided_sectors.some((item) => item.toLowerCase() === normalized);
  if (avoided) return -6;
  return 0;
}

function regimeBias(regime: SectorRegimeDoc | null | undefined): number {
  switch (regime?.regime) {
    case "expanding":
      return 8;
    case "momentum":
      return 6;
    case "recovering":
      return 2;
    case "topping":
      return -5;
    case "breaking_down":
      return -8;
    default:
      return 0;
  }
}

function buildExposureMap(holdings: PortfolioBookRow[]) {
  const useValueWeights = shouldUseValueWeights(holdings);
  const total = holdings.reduce((sum, row) => sum + weightForRow(row, useValueWeights), 0);
  const bySector = new Map<string, number>();
  for (const row of holdings) {
    const sector = sectorNameFromRow(row);
    const weight = weightForRow(row, useValueWeights);
    bySector.set(sector, (bySector.get(sector) ?? 0) + weight);
  }
  const weights = new Map<string, number>();
  for (const [sector, raw] of bySector.entries()) {
    weights.set(sector, total > 0 ? (raw / total) * 100 : 0);
  }
  return { useValueWeights, total, weights };
}

function topFactorLabel(tilt: {
  overall: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
}) {
  const entries = [
    ["Valuation", tilt.valuation],
    ["Growth", tilt.growth],
    ["Quality", tilt.quality],
    ["Momentum", tilt.momentum],
  ] as const;
  const usable = entries.filter((entry) => entry[1] != null);
  const top = usable.sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))[0];
  return top?.[0] ?? "Mixed";
}

function lowFactorLabel(tilt: {
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
}) {
  const entries = [
    ["valuation", tilt.valuation],
    ["growth", tilt.growth],
    ["quality", tilt.quality],
    ["momentum", tilt.momentum],
  ] as const;
  const usable = entries.filter((entry) => entry[1] != null);
  const low = usable.sort((a, b) => (a[1] ?? 999) - (b[1] ?? 999))[0];
  return low?.[0] ?? "balance";
}

function fitReason(
  label: "holding" | "candidate",
  scores: RebalanceUniverseCandidate["scores"],
  sector: string,
  regime: SectorRegimeDoc | null | undefined,
  strategy: StrategyDefinition,
  sectorWeightPct: number,
): string {
  const ranking = [
    ["quality", scores.quality],
    ["growth", scores.growth],
    ["valuation", scores.valuation],
    ["momentum", scores.momentum],
  ] as const;
  const usable = ranking.filter((entry) => entry[1] != null);
  const strongest = usable.sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))[0];
  const parts: string[] = [];
  if (strongest) {
    parts.push(`${strongest[0]} score ${formatScore(strongest[1])}`);
  }
  if (regime?.regime) {
    parts.push(`${REGIME_LABEL[regime.regime].toLowerCase()} sector tape`);
  } else if (sectorBias(sector, strategy) > 0) {
    parts.push(`fits ${strategy.label.toLowerCase()}`);
  }
  if (label === "candidate" && sectorWeightPct < 8) {
    parts.push(`adds breadth outside ${sector}`);
  }
  return parts.slice(0, 2).join(" · ") || "Fits the current strategy";
}

function whyNow(
  candidate: RebalanceUniverseCandidate,
  regime: SectorRegimeDoc | null | undefined,
): string {
  const directive = candidateDirectiveText(candidate);
  if (directive) return directive;
  if (regime?.narrative) return regime.narrative;
  const move = finiteNumber(candidate.day_change_pct);
  if (move != null) {
    return move >= 0
      ? `Up ${move.toFixed(1)}% today with the setup still intact.`
      : `Down ${Math.abs(move).toFixed(1)}% today, so the entry is cleaner than yesterday.`;
  }
  return "Coverage is ready and the setup still fits this strategy.";
}

function sortHoldingsForSector(a: RebalanceHoldingView, b: RebalanceHoldingView): number {
  if (b.weight_pct !== a.weight_pct) return b.weight_pct - a.weight_pct;
  return (b.fit_score ?? -1) - (a.fit_score ?? -1);
}

export function getRebalanceStrategy(strategyId?: string | null): StrategyDefinition {
  const key = String(strategyId || "").trim() as RebalanceStrategyId;
  return STRATEGIES[key] ?? STRATEGIES[DEFAULT_REBALANCE_STRATEGY];
}

export function buildRebalancePlanFromData(args: {
  rows: PortfolioBookRow[];
  universeCandidates: RebalanceUniverseCandidate[];
  sectorRegimes: Record<string, SectorRegimeDoc>;
  strategyId?: string | null;
}): PortfolioRebalancePlan {
  const strategy = getRebalanceStrategy(args.strategyId);
  const holdings = args.rows.filter((row) => row.position_type === "holding");
  const trackedIds = new Set(args.rows.map((row) => row.instrument_id));

  if (holdings.length === 0) {
    return {
      strategy,
      headline: "No holdings yet",
      summary: "Mark a few names as holdings on Radar and this view will diagnose concentration and strategy fit.",
      diagnostics: [],
      sectors: [],
      core_focus: {
        headline: "Nothing to score yet",
        summary: "You need holdings before strategy logic means anything.",
        holdings: [],
      },
      trim_focus: {
        headline: "No trim candidates",
        summary: "No holdings means nothing to pressure-test.",
        holdings: [],
      },
      opportunities: {
        headline: "No outside ideas yet",
        summary: "Add holdings first, then Rebalance can suggest better fits from the app universe.",
        missing_sectors: [],
        stocks: [],
      },
      source: "rules",
      generated_at: new Date().toISOString(),
    };
  }

  const exposure = buildExposureMap(holdings);
  const sectorWeights = exposure.weights;
  const factorTilt = {
    overall: weightedAverage(holdings.map((row) => ({
      value: finiteNumber(row.scores.overall),
      weight: weightForRow(row, exposure.useValueWeights),
    }))),
    valuation: weightedAverage(holdings.map((row) => ({
      value: finiteNumber(row.scores.valuation),
      weight: weightForRow(row, exposure.useValueWeights),
    }))),
    growth: weightedAverage(holdings.map((row) => ({
      value: finiteNumber(row.scores.growth),
      weight: weightForRow(row, exposure.useValueWeights),
    }))),
    quality: weightedAverage(holdings.map((row) => ({
      value: finiteNumber(row.scores.quality),
      weight: weightForRow(row, exposure.useValueWeights),
    }))),
    momentum: weightedAverage(holdings.map((row) => ({
      value: finiteNumber(row.scores.momentum),
      weight: weightForRow(row, exposure.useValueWeights),
    }))),
  };

  const exposureList = [...sectorWeights.entries()]
    .map(([sector, weightPct]) => ({ sector, weightPct }))
    .sort((a, b) => b.weightPct - a.weightPct);
  const dominant = exposureList[0];
  const hhi = exposureList.reduce((sum, item) => sum + Math.pow(item.weightPct / 100, 2), 0);
  const diversificationScore = Math.round((1 - hhi) * 100);

  const holdingViews = holdings.map((row) => {
    const sector = sectorNameFromRow(row);
    const regime = args.sectorRegimes[sector.toLowerCase().replace(/[^a-z0-9]+/g, "_")] ?? null;
    const sectorWeightPct = sectorWeights.get(sector) ?? 0;
    const fitScore = clamp(
      weightedScore(row.scores, strategy) +
        sectorBias(sector, strategy) +
        regimeBias(regime) -
        Math.max(0, sectorWeightPct - strategy.max_sector_weight_pct) * 0.35,
      0,
      100,
    );

    return {
      row,
      sector,
      sectorWeightPct,
      regime,
      fitScore,
    };
  });

  const trimIds = new Set(
    holdingViews
      .filter((item) => item.fitScore < 58 || item.sectorWeightPct > strategy.max_sector_weight_pct + 8)
      .sort((a, b) => a.fitScore - b.fitScore || b.sectorWeightPct - a.sectorWeightPct)
      .slice(0, Math.min(4, Math.max(1, Math.floor(holdingViews.length / 3))))
      .map((item) => item.row.instrument_id),
  );

  const sectors = exposureList.map((entry) => {
    const slug = entry.sector.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const regime = args.sectorRegimes[slug] ?? null;
    const members = holdingViews
      .filter((item) => item.sector === entry.sector)
      .map((item, index, list): RebalanceHoldingView => {
        const role: RebalanceHoldingRole =
          trimIds.has(item.row.instrument_id)
            ? "trim"
            : item.fitScore >= 76 || index === 0
              ? "core"
              : "support";
        let reason = fitReason("holding", item.row.scores, item.sector, item.regime, strategy, item.sectorWeightPct);
        if (role === "trim" && item.sectorWeightPct > strategy.max_sector_weight_pct) {
          reason = `Sector is ${formatPercent(item.sectorWeightPct)} of book · weaker fit than peers`;
        } else if (role === "trim") {
          reason = `Lowest fit score in this cluster · ${reason}`;
        } else if (role === "core" && list.length > 1) {
          reason = `Best fit in the cluster · ${reason}`;
        }
        return {
          instrument_id: item.row.instrument_id,
          ticker: item.row.ticker,
          name: item.row.name,
          logo_url: item.row.logo_url,
          sector_label: item.row.sector_label,
          industry_label: item.row.industry_label,
          price: item.row.price,
          day_change_pct: item.row.day_change_pct,
          weight_pct: Math.round(weightForRow(item.row, exposure.useValueWeights) * 10) / 10,
          role,
          reason,
          fit_score: Math.round(item.fitScore),
          verdict: item.row.scores.verdict,
          directive_text: directiveText(item.row),
          scores: {
            overall: finiteNumber(item.row.scores.overall),
            valuation: finiteNumber(item.row.scores.valuation),
            growth: finiteNumber(item.row.scores.growth),
            quality: finiteNumber(item.row.scores.quality),
            momentum: finiteNumber(item.row.scores.momentum),
          },
        };
      })
      .sort(sortHoldingsForSector);

    const trimCount = members.filter((member) => member.role === "trim").length;
    const summary =
      entry.weightPct > strategy.max_sector_weight_pct
        ? `${formatPercent(entry.weightPct)} of the book. This is above the ${formatPercent(strategy.max_sector_weight_pct)} comfort zone for ${strategy.label.toLowerCase()}.`
        : trimCount > 0
          ? `${formatPercent(entry.weightPct)} of the book. Keep the best names and be stricter on the weaker overlap.`
          : `${formatPercent(entry.weightPct)} of the book. This sector already fits the chosen strategy.`;

    return {
      sector: entry.sector,
      weight_pct: Math.round(entry.weightPct * 10) / 10,
      count: members.length,
      summary,
      regime: regime
        ? {
            label: REGIME_LABEL[regime.regime],
            tone: regimeTone(regime.regime) as RebalanceTone,
            narrative: regime.narrative,
          }
        : null,
      holdings: members,
    };
  });

  const missingFavoredSectors = strategy.favored_sectors.filter((sector) => {
    const weight = sectorWeights.get(sector) ?? 0;
    return weight < 8;
  });

  const scoredCandidates = args.universeCandidates
    .filter((candidate) => !trackedIds.has(candidate.instrument_id))
    .map((candidate) => {
      const sector = sectorNameFromRow(candidate);
      const sectorWeightPct = sectorWeights.get(sector) ?? 0;
      const regime = args.sectorRegimes[sector.toLowerCase().replace(/[^a-z0-9]+/g, "_")] ?? null;
      const fitScore = clamp(
        weightedScore(candidate.scores, strategy) +
          sectorBias(sector, strategy) +
          regimeBias(regime) +
          (missingFavoredSectors.includes(sector) ? 7 : 0) -
          Math.max(0, sectorWeightPct - strategy.max_sector_weight_pct) * 0.5,
        0,
        100,
      );

      return {
        candidate,
        sector,
        sectorWeightPct,
        regime,
        fitScore,
      };
    })
    .filter((item) => item.fitScore >= 55 && (item.candidate.scores.overall ?? 0) >= 50)
    .sort((a, b) => b.fitScore - a.fitScore || (b.candidate.scores.overall ?? 0) - (a.candidate.scores.overall ?? 0));

  const opportunityStocks: RebalanceOpportunityView[] = [];
  const perSectorCap = new Map<string, number>();
  for (const item of scoredCandidates) {
    const seen = perSectorCap.get(item.sector) ?? 0;
    if (seen >= 2) continue;
    opportunityStocks.push({
      instrument_id: item.candidate.instrument_id,
      ticker: item.candidate.ticker,
      name: item.candidate.name,
      logo_url: item.candidate.logo_url,
      sector_label: item.candidate.sector_label,
      industry_label: item.candidate.industry_label,
      price: item.candidate.price,
      day_change_pct: item.candidate.day_change_pct,
      market_cap: item.candidate.market_cap,
      pe_ttm: item.candidate.pe_ttm,
      fit_score: Math.round(item.fitScore),
      verdict: item.candidate.verdict,
      directive_text: candidateDirectiveText(item.candidate),
      reason: fitReason("candidate", item.candidate.scores, item.sector, item.regime, strategy, item.sectorWeightPct),
      why_now: whyNow(item.candidate, item.regime),
      scores: item.candidate.scores,
    });
    perSectorCap.set(item.sector, seen + 1);
    if (opportunityStocks.length >= 6) break;
  }

  const coreFocus = sectors
    .flatMap((sector) => sector.holdings)
    .filter((holding) => holding.role === "core")
    .sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1) || b.weight_pct - a.weight_pct)
    .slice(0, 5);
  const trimFocus = sectors
    .flatMap((sector) => sector.holdings)
    .filter((holding) => holding.role === "trim")
    .sort((a, b) => (a.fit_score ?? 999) - (b.fit_score ?? 999) || b.weight_pct - a.weight_pct)
    .slice(0, 5);

  const diagnostics: RebalanceDiagnostic[] = [];
  if (dominant) {
    diagnostics.push({
      id: "largest_cluster",
      label: "Largest cluster",
      value: `${dominant.sector} ${formatPercent(dominant.weightPct)}`,
      detail:
        dominant.weightPct > strategy.max_sector_weight_pct
          ? `This is above the ${formatPercent(strategy.max_sector_weight_pct)} comfort zone for ${strategy.label.toLowerCase()}.`
          : `This is inside the current sector cap for ${strategy.label.toLowerCase()}.`,
      tone: dominant.weightPct > strategy.max_sector_weight_pct ? "warn" : "good",
    });
  }
  diagnostics.push({
    id: "diversification",
    label: "Diversification",
    value: `${diversificationScore}/100`,
    detail:
      exposureList.length >= strategy.preferred_sector_count
        ? `${exposureList.length} sectors are carrying the book.`
        : `Only ${exposureList.length} sectors are carrying the book right now.`,
    tone: diversificationScore >= 65 ? "good" : diversificationScore >= 45 ? "neutral" : "warn",
  });
  diagnostics.push({
    id: "style_tilt",
    label: "Style tilt",
    value: topFactorLabel(factorTilt),
    detail: `Lowest current factor is ${lowFactorLabel(factorTilt)}.`,
    tone: "neutral",
  });
  diagnostics.push({
    id: "strategy_pressure",
    label: "Strategy pressure",
    value: trimFocus.length ? `${trimFocus.length} names under pressure` : "Book is aligned",
    detail: trimFocus.length
      ? "These are the first names to question before you add more capital."
      : "No obvious weak links surfaced under this strategy lens.",
    tone: trimFocus.length ? "warn" : "good",
  });

  const weakestCount = trimFocus.length;
  const headline =
    dominant && dominant.weightPct > strategy.max_sector_weight_pct
      ? `${dominant.sector} is carrying too much of the book for ${strategy.label.toLowerCase()}.`
      : `${strategy.label} says the book is mostly coherent, but breadth can still improve.`;

  const summaryParts = [
    dominant
      ? `${dominant.sector} is ${formatPercent(dominant.weightPct)} of current exposure.`
      : null,
    weakCountText(weakestCount),
    opportunityStocks.length
      ? `${opportunityStocks.length} outside-universe ideas clear the current strategy filter.`
      : "No outside ideas cleared the current strategy filter yet.",
  ].filter(Boolean);

  return {
    strategy,
    headline,
    summary: summaryParts.join(" "),
    diagnostics,
    sectors,
    core_focus: {
      headline: "What already fits",
      summary: "These holdings carry the current strategy well. Add complexity elsewhere before touching them.",
      holdings: coreFocus,
    },
    trim_focus: {
      headline: "What deserves scrutiny",
      summary: trimFocus.length
        ? "These are the weak fits, duplicates, or crowded exposures under the current lens."
        : "Nothing is flashing as an obvious trim candidate right now.",
      holdings: trimFocus,
    },
    opportunities: {
      headline: "Best additions from the app universe",
      summary: missingFavoredSectors.length
        ? `The book is light on ${missingFavoredSectors.join(", ")} for this strategy.`
        : "These names improve the book without depending on what happens to be in your watchlist.",
      missing_sectors: missingFavoredSectors,
      stocks: opportunityStocks,
    },
    source: "rules",
    generated_at: new Date().toISOString(),
  };
}

function weakCountText(count: number): string {
  if (count <= 0) return "No clear weak links surfaced.";
  if (count === 1) return "One holding is materially weaker than the rest.";
  return `${count} holdings need a harder look.`;
}
