/**
 * Shared shapes for the rule-based backtester. The Python twin lives in
 * `backend/agentdata/backtest.py`; both engines read and write these shapes.
 */

export type SignalType =
  | "momentum"
  | "low_volatility"
  | "trend"
  | "near_high"
  | "size"
  | "congress_net_buying"
  | "fundamental"
  | "pullback";

export type FundamentalField =
  | "fcf_yield"
  | "shareholder_yield"
  | "roic"
  | "market_cap"
  | "dividend_yield"
  | "dividend_growth_years"
  | "dividend_growth"
  | "debt_to_equity";

export type Signal = {
  type: SignalType;
  months?: number;
  skip_months?: number;
  days?: number;
  ma_days?: number;
  window_days?: number;
  field?: FundamentalField;
};

export type FilterRule = Signal & { min: number | null; max: number | null };
export type RankRule = Signal & { weight: number };

export type Rebalance = "weekly" | "monthly" | "quarterly";
export type Weighting = "equal" | "rank";

/** A spec after `normalizeSpec`: every field present, every number in range. */
export type RuleSpec = {
  version: 1;
  universe: { id: string | null; symbols: string[] | null; top_by_size: number | null };
  filters: FilterRule[];
  rank: RankRule[];
  market_filter: { symbol: string; ma_days: number } | null;
  holdings: number;
  weighting: Weighting;
  rebalance: Rebalance;
  cost_bps: number;
  benchmark: string;
  start: string | null;
  end: string | null;
};

export type PriceSeries = { dates: string[]; closes: number[] };

export type CongressEvent = { symbol: string; date: string; side: "buy" | "sell" };

export type BacktestData = {
  prices: Record<string, PriceSeries>;
  universe: string[];
  universe_label?: string;
  universe_kind?: "stocks" | "funds";
  universe_partial?: boolean;
  size_factors?: Record<string, number>;
  events?: CongressEvent[];
  fundamentals?: Record<string, Record<string, number | null | undefined>>;
};

export type CurveStats = {
  total_return: number;
  annualized_return: number | null;
  volatility: number | null;
  sharpe: number | null;
  max_drawdown: number;
  max_drawdown_peak: string;
  max_drawdown_trough: string;
  final_value: number;
};

export type YearRow = {
  year: number;
  strategy: number;
  benchmark: number;
  beat: boolean;
  complete: boolean;
  sessions: number;
};

export type RebalanceRecord = {
  signal_date: string;
  trade_date: string;
  holdings: { symbol: string; weight: number; score: number }[];
  added: string[];
  dropped: string[];
  turnover: number;
  cash: number;
  eligible: number;
  candidates: number;
  market_ok: boolean;
};

export type Caveat = { id: string; title: string; text: string };

export type BacktestResult = {
  spec: RuleSpec;
  period: { start: string; end: string; first_signal: string; years: number; sessions: number };
  universe: {
    label: string;
    kind: string;
    symbols: number;
    candidates_first: number;
    candidates_last: number;
    eligible_first: number;
    eligible_last: number;
  };
  summary: { strategy: CurveStats; benchmark: CurveStats };
  years: YearRow[];
  hit_rate: { beat: number; years: number; complete_years_only: boolean };
  worst_year: YearRow | null;
  best_year: YearRow | null;
  turnover: { per_rebalance: number | null; annual: number | null; rebalances: number };
  costs: { bps: number; total_drag: number };
  cash: { average: number; max: number };
  curve: { dates: string[]; strategy: number[]; benchmark: number[] };
  rebalances: RebalanceRecord[];
  caveats: Caveat[];
};

export type PickedHolding = {
  symbol: string;
  weight: number;
  score: number;
  rank: number;
  values: Record<string, number>;
};

export type Picks = {
  signal_date: string;
  candidates: number;
  eligible: number;
  market_ok: boolean;
  holdings: PickedHolding[];
};

export type UniverseGroup = {
  id: string;
  label: string;
  kind: "stocks" | "funds";
  partial?: boolean;
  symbols: string[];
};

/** `tm_backtest_universe/US`, written by `backend/agentdata/backtest_strategies.py`. */
export type UniverseDoc = {
  market: string;
  generated_at: string;
  price_as_of: string;
  groups: UniverseGroup[];
  names?: Record<string, string>;
  size_factors?: Record<string, number>;
  events?: CongressEvent[];
  events_start?: string | null;
};

export type ResolvedUniverse = {
  symbols: string[];
  label: string;
  kind: "stocks" | "funds";
  partial: boolean;
  id: string;
  count: number;
};

export type CaveatCatalog = {
  order: string[];
  items: Record<string, { title: string; text: string }>;
};

// -- fixed weights (the self-serve backtester) --------------------------------

export type WeightsRebalance = "never" | "monthly" | "quarterly" | "yearly";

/** A request after `normalizeWeightsInput`: weights add up to 1. */
export type WeightsInput = {
  version: 1;
  holdings: { symbol: string; weight: number }[];
  rebalance: WeightsRebalance;
  benchmark: string;
  start: string | null;
  end: string | null;
  cost_bps: number;
};

export type WeightsHolding = {
  symbol: string;
  weight: number;
  end_weight: number;
  first_date: string;
  last_price_date: string | null;
  total_return: number;
};

/** Plain JSON: safe to send over the wire or hand to a chat tool. */
export type WeightsResult = {
  input: WeightsInput;
  period: { start: string; end: string; asked_start: string | null; years: number; sessions: number };
  limited_by: { symbol: string; first_date: string } | null;
  summary: { strategy: CurveStats; benchmark: CurveStats };
  years: YearRow[];
  hit_rate: { beat: number; years: number; complete_years_only: boolean };
  worst_year: YearRow | null;
  best_year: YearRow | null;
  turnover: { annual: number | null; rebalances: number };
  costs: { bps: number; total_drag: number };
  holdings: WeightsHolding[];
  curve: { dates: string[]; strategy: number[]; benchmark: number[] };
  caveats: Caveat[];
};
