export type RebalanceStrategyId =
  | "balanced"
  | "quality"
  | "ai_momentum"
  | "defensive"
  | "diversification";

export type RebalanceTone = "good" | "neutral" | "warn" | "bad";

export type RebalanceStrategy = {
  id: RebalanceStrategyId;
  label: string;
  summary: string;
};

export type RebalanceDiagnostic = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: RebalanceTone;
};

export type RebalanceHoldingRole = "core" | "support" | "trim";

export type RebalanceHoldingView = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  sector_label: string;
  industry_label: string;
  price: number | null;
  day_change_pct: number | null;
  weight_pct: number;
  role: RebalanceHoldingRole;
  reason: string;
  fit_score: number | null;
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

export type RebalanceSectorRegimeView = {
  label: string;
  tone: RebalanceTone;
  narrative: string;
};

export type RebalanceSectorView = {
  sector: string;
  weight_pct: number;
  count: number;
  summary: string;
  regime?: RebalanceSectorRegimeView | null;
  holdings: RebalanceHoldingView[];
};

export type RebalanceFocusBlock = {
  headline: string;
  summary: string;
  holdings: RebalanceHoldingView[];
};

export type RebalanceOpportunityView = {
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
  fit_score: number | null;
  verdict: string | null;
  directive_text: string | null;
  reason: string;
  why_now: string;
  scores: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
};

export type RebalanceOpportunityBlock = {
  headline: string;
  summary: string;
  missing_sectors: string[];
  stocks: RebalanceOpportunityView[];
};

export type PortfolioRebalancePlan = {
  strategy: RebalanceStrategy;
  headline: string;
  summary: string;
  diagnostics: RebalanceDiagnostic[];
  sectors: RebalanceSectorView[];
  core_focus: RebalanceFocusBlock;
  trim_focus: RebalanceFocusBlock;
  opportunities: RebalanceOpportunityBlock;
  source: "rules";
  generated_at: string;
  holdings_fingerprint?: string;
};

export type PortfolioRebalanceBundle = {
  default_strategy: RebalanceStrategyId;
  strategies: Record<RebalanceStrategyId, PortfolioRebalancePlan>;
  generated_at: string;
  holdings_fingerprint?: string;
};
