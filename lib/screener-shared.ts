/**
 * The screener's pure half: the row shape, the field catalogue, the filter
 * engine, the URL format and the saved-screen presets. No server imports, so
 * the filter bar in the browser and the page on the server agree on what a
 * URL means.
 *
 * Rows come from `tm_screener_snapshot` (built by backend/agentdata/screener.py).
 * A missing field means "we do not have it": a range filter on that field
 * drops the row, and the table shows nothing rather than a zero.
 */

export type CallWord = "Add" | "Hold" | "Trim";
export type Zone = "add" | "between" | "trim";
export type CapTier = "mega" | "large" | "mid" | "small" | "micro";

export type ScreenerRow = {
  symbol: string;
  instrument_id?: string;
  name?: string;
  sector?: string;
  industry?: string;
  exchange?: string;
  indexes?: string[];

  price?: number;
  price_at?: string;
  day_pct?: number;
  volume?: number;
  ret_1w?: number;
  ret_1m?: number;
  ret_3m?: number;
  ret_6m?: number;
  ret_ytd?: number;
  ret_1y?: number;
  ret_3y?: number;
  ret_5y?: number;
  price_history_to?: string;
  hi_52w?: number;
  lo_52w?: number;
  from_hi_pct?: number;
  from_lo_pct?: number;
  drawdown_1y?: number;
  vol_90d?: number;
  spark?: number[];

  market_cap?: number;
  cap_tier?: CapTier;
  pe?: number;
  fwd_pe?: number;
  peg?: number;
  ps?: number;
  p_fcf?: number;
  ev_ebitda?: number;
  pe_hist_pctile?: number;
  pe_hist_median?: number;
  pe_hist_days?: number;
  pe_hist_from?: string;
  pe_hist_to?: string;

  rev_growth?: number;
  eps_growth?: number;
  eps_next_y?: number;
  rev_cagr_3y?: number;
  revenue?: number;
  net_income?: number;
  fcf?: number;
  gross_margin?: number;
  op_margin?: number;
  net_margin?: number;
  fcf_margin?: number;

  roe?: number;
  roic?: number;
  debt_equity?: number;
  current_ratio?: number;
  cash?: number;
  debt?: number;
  net_cash?: number;

  div_yield?: number;
  payout?: number;
  div_growth?: number;
  div_growth_years?: number;
  buyback_yield?: number;

  target?: number;
  upside?: number;
  analyst_label?: string;
  analyst_count?: number;
  rec_score?: number;
  buy_pct?: number;
  buys_chg_3m?: number;

  earnings_date?: string;
  earnings_in_days?: number;
  earnings_time?: string;

  rsi?: number;
  vs_50d?: number;
  vs_200d?: number;
  beta?: number;
  short_float?: number;
  inst_own?: number;
  iv_30d?: number;

  score?: number;
  verdict?: string;
  s_value?: number;
  s_growth?: number;
  s_quality?: number;
  s_momentum?: number;

  /** Our read. The call is open to everyone; the zones are stripped on the server unless the viewer covers the stock. */
  call?: CallWord;
  call_reason?: string;
  call_confidence?: string;
  call_at?: string;
  add_below?: number;
  trim_above?: number;
  to_add_pct?: number;
  to_trim_pct?: number;
  zone?: Zone;
  thesis?: string;

  benchmark?: boolean;
  uncovered?: boolean;
};

export type ScreenerMeta = {
  market: string;
  universe_id?: string;
  generated_at: string;
  as_of_day?: string;
  price_history_to?: string | null;
  row_count: number;
  shards: string[];
  extra_shard?: string;
  coverage?: Record<string, number>;
  sources?: Record<string, string>;
  /** First and last day of the daily P/Es we have on file, across all stocks. */
  pe_history?: { from?: string | null; to?: string | null };
};

/* ── Field catalogue ───────────────────────────────────────────────────── */

export type FieldUnit = "pct" | "signed_pct" | "multiple" | "price" | "money" | "number" | "count_change" | "days" | "score";

export type FieldGroup =
  | "Price and returns"
  | "Size"
  | "Valuation"
  | "Growth"
  | "Profitability"
  | "Balance sheet"
  | "Dividends"
  | "Analysts"
  | "Earnings"
  | "Risk and trend"
  | "Our scores"
  | "Our read";

export type NumericField = {
  id: keyof ScreenerRow & string;
  /** Column header, short. */
  short: string;
  /** Filter label and tooltip, plain language. */
  label: string;
  group: FieldGroup;
  unit: FieldUnit;
  digits?: number;
  /** Which end is "better" when comparing names side by side. */
  better?: "high" | "low";
  /** Part of "our call and price zones": Pro to filter or sort on. */
  call?: boolean;
};

export const NUMERIC_FIELDS: NumericField[] = [
  { id: "price", short: "Price", label: "Share price", group: "Price and returns", unit: "price" },
  { id: "day_pct", short: "Day", label: "Change today", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_1w", short: "1W", label: "Return over 1 week", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_1m", short: "1 month", label: "Return over 1 month", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_3m", short: "3 months", label: "Return over 3 months", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_6m", short: "6M", label: "Return over 6 months", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_ytd", short: "This year", label: "Return this year", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_1y", short: "1Y", label: "Return over 1 year", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_3y", short: "3Y", label: "Return over 3 years", group: "Price and returns", unit: "signed_pct", better: "high" },
  { id: "ret_5y", short: "5Y", label: "Return over 5 years", group: "Price and returns", unit: "signed_pct", better: "high" },

  { id: "market_cap", short: "Value", label: "Market value", group: "Size", unit: "money" },

  { id: "pe", short: "P/E", label: "Price to earnings, last 12 months", group: "Valuation", unit: "multiple", digits: 1, better: "low" },
  { id: "fwd_pe", short: "Fwd P/E", label: "Price to next year's expected earnings", group: "Valuation", unit: "multiple", digits: 1, better: "low" },
  { id: "peg", short: "PEG", label: "P/E divided by expected growth", group: "Valuation", unit: "multiple", digits: 2, better: "low" },
  { id: "ps", short: "P/S", label: "Price to sales", group: "Valuation", unit: "multiple", digits: 1, better: "low" },
  { id: "p_fcf", short: "P/FCF", label: "Price to free cash flow", group: "Valuation", unit: "multiple", digits: 1, better: "low" },
  { id: "ev_ebitda", short: "EV/EBITDA", label: "Enterprise value to EBITDA", group: "Valuation", unit: "multiple", digits: 1, better: "low" },
  { id: "pe_hist_pctile", short: "P/E vs own", label: "Today's P/E against the daily P/Es we have on file for the stock (0 is below all of them, 100 above all)", group: "Valuation", unit: "number", digits: 0, better: "low" },

  { id: "rev_growth", short: "Sales growth", label: "Revenue growth, year over year", group: "Growth", unit: "signed_pct", digits: 1, better: "high" },
  { id: "rev_cagr_3y", short: "Rev 3Y", label: "Revenue growth per year over 3 fiscal years", group: "Growth", unit: "signed_pct", digits: 1, better: "high" },
  { id: "eps_growth", short: "EPS growth", label: "Earnings per share growth, last 12 months", group: "Growth", unit: "signed_pct", digits: 1, better: "high" },
  { id: "eps_next_y", short: "EPS next Y", label: "Expected earnings growth next year", group: "Growth", unit: "signed_pct", digits: 1, better: "high" },

  { id: "gross_margin", short: "Gross mgn", label: "Gross margin", group: "Profitability", unit: "pct", digits: 1, better: "high" },
  { id: "op_margin", short: "Op mgn", label: "Operating margin", group: "Profitability", unit: "pct", digits: 1, better: "high" },
  { id: "net_margin", short: "Net mgn", label: "Net profit margin", group: "Profitability", unit: "pct", digits: 1, better: "high" },
  { id: "fcf_margin", short: "FCF mgn", label: "Free cash flow as a share of revenue", group: "Profitability", unit: "pct", digits: 1, better: "high" },
  { id: "roe", short: "ROE", label: "Return on equity", group: "Profitability", unit: "pct", digits: 1, better: "high" },
  { id: "roic", short: "ROIC", label: "Return on invested capital", group: "Profitability", unit: "pct", digits: 1, better: "high" },

  { id: "debt_equity", short: "Debt/Eq", label: "Debt to equity", group: "Balance sheet", unit: "multiple", digits: 2, better: "low" },
  { id: "current_ratio", short: "Current", label: "Current assets over current liabilities", group: "Balance sheet", unit: "multiple", digits: 2, better: "high" },
  { id: "net_cash", short: "Net cash", label: "Cash minus debt", group: "Balance sheet", unit: "money", better: "high" },

  { id: "div_yield", short: "Yield", label: "Dividend yield", group: "Dividends", unit: "pct", digits: 2, better: "high" },
  { id: "payout", short: "Payout", label: "Share of earnings paid as dividends", group: "Dividends", unit: "pct", digits: 0, better: "low" },
  { id: "div_growth", short: "Div growth", label: "Dividend growth per year", group: "Dividends", unit: "signed_pct", digits: 1, better: "high" },
  { id: "div_growth_years", short: "Div yrs", label: "Years the dividend has grown", group: "Dividends", unit: "number", digits: 0, better: "high" },
  { id: "buyback_yield", short: "Buyback", label: "Net buybacks as a share of market value", group: "Dividends", unit: "pct", digits: 2, better: "high" },

  { id: "upside", short: "To target", label: "Distance to the average analyst target", group: "Analysts", unit: "signed_pct", digits: 1, better: "high" },
  { id: "target", short: "Target", label: "Average analyst price target", group: "Analysts", unit: "price" },
  { id: "buy_pct", short: "Buy rated", label: "Share of analysts rating the stock a buy", group: "Analysts", unit: "pct", digits: 0, better: "high" },
  { id: "buys_chg_3m", short: "Buys 3M", label: "Buy ratings added or lost over 3 months", group: "Analysts", unit: "count_change", better: "high" },
  { id: "analyst_count", short: "Analysts", label: "Analysts covering the stock", group: "Analysts", unit: "number", digits: 0 },

  { id: "earnings_in_days", short: "Earnings in", label: "Days until the next earnings report", group: "Earnings", unit: "days" },

  { id: "vol_90d", short: "Vol 90D", label: "Volatility: how much the price swings, annualised, over 90 sessions", group: "Risk and trend", unit: "pct", digits: 0, better: "low" },
  { id: "beta", short: "Beta", label: "Sensitivity to the market (1 moves with it)", group: "Risk and trend", unit: "multiple", digits: 2 },
  { id: "drawdown_1y", short: "Max DD 1Y", label: "Largest fall from a peak in the last year", group: "Risk and trend", unit: "signed_pct", digits: 1, better: "high" },
  { id: "from_hi_pct", short: "From high", label: "Distance below the 52-week high", group: "Risk and trend", unit: "signed_pct", digits: 1 },
  { id: "from_lo_pct", short: "From low", label: "Distance above the 52-week low", group: "Risk and trend", unit: "signed_pct", digits: 1 },
  { id: "rsi", short: "RSI", label: "RSI (14): under 30 is oversold, over 70 is overbought", group: "Risk and trend", unit: "number", digits: 0 },
  { id: "vs_50d", short: "vs 50D", label: "Price against its 50-day average", group: "Risk and trend", unit: "signed_pct", digits: 1 },
  { id: "vs_200d", short: "vs 200D", label: "Price against its 200-day average", group: "Risk and trend", unit: "signed_pct", digits: 1 },
  { id: "short_float", short: "Short", label: "Share of the float sold short", group: "Risk and trend", unit: "pct", digits: 1, better: "low" },
  { id: "inst_own", short: "Inst own", label: "Share held by institutions", group: "Risk and trend", unit: "pct", digits: 0 },

  { id: "score", short: "Score", label: "Our composite score out of 100", group: "Our scores", unit: "score", better: "high" },
  { id: "s_value", short: "Value", label: "Valuation pillar out of 100", group: "Our scores", unit: "score", better: "high" },
  { id: "s_growth", short: "Growth", label: "Growth pillar out of 100", group: "Our scores", unit: "score", better: "high" },
  { id: "s_quality", short: "Quality", label: "Quality pillar out of 100", group: "Our scores", unit: "score", better: "high" },
  { id: "s_momentum", short: "Momentum", label: "Momentum pillar out of 100", group: "Our scores", unit: "score", better: "high" },

  { id: "to_add_pct", short: "To add zone", label: "Distance above our add zone (0 or less means inside it)", group: "Our read", unit: "signed_pct", digits: 1, call: true },
  { id: "add_below", short: "Add below", label: "Our add zone starts below this price", group: "Our read", unit: "price", call: true },
  { id: "trim_above", short: "Trim above", label: "Our trim zone starts above this price", group: "Our read", unit: "price", call: true },
];

export const FIELD_BY_ID: ReadonlyMap<string, NumericField> = new Map(NUMERIC_FIELDS.map((field) => [field.id, field]));

/** Non-numeric columns the table can show. */
export const TEXT_COLUMNS = [
  { id: "sector", short: "Sector", label: "Sector", group: "Size" as FieldGroup },
  { id: "industry", short: "Industry", label: "Industry", group: "Size" as FieldGroup },
  { id: "spark", short: "3M", label: "Price over the last 3 months", group: "Price and returns" as FieldGroup },
  { id: "earnings_date", short: "Earnings", label: "Next earnings date", group: "Earnings" as FieldGroup },
  { id: "analyst_label", short: "Consensus", label: "Analyst consensus", group: "Analysts" as FieldGroup },
  { id: "call", short: "Our call", label: "Our call: add, hold or trim", group: "Our read" as FieldGroup, call: true },
  { id: "zone", short: "Zone", label: "Where the price sits against our zones", group: "Our read" as FieldGroup, call: true },
] as const;

export type ColumnId = string;

export const ALL_COLUMN_IDS: string[] = [...TEXT_COLUMNS.map((column) => column.id), ...NUMERIC_FIELDS.map((field) => field.id)];

/** Columns that screen "the whole market by our call and price zones": Pro to filter or sort on. */
export const CALL_COLUMN_IDS: ReadonlySet<string> = new Set([
  ...TEXT_COLUMNS.filter((column) => "call" in column && column.call).map((column) => column.id),
  ...NUMERIC_FIELDS.filter((field) => field.call).map((field) => field.id),
]);

/** Columns that show a price zone. Filled only on stocks the viewer covers (every stock on Pro). */
export const ZONE_COLUMN_IDS: ReadonlySet<string> = new Set(["zone", "to_add_pct", "add_below", "trim_above"]);

export const DEFAULT_COLUMNS: string[] = ["spark", "price", "day_pct", "ret_1m", "ret_ytd", "market_cap", "pe", "rev_growth", "call"];
export const MAX_COLUMNS = 14;

export const FIELD_GROUPS: FieldGroup[] = [
  "Price and returns",
  "Size",
  "Valuation",
  "Growth",
  "Profitability",
  "Balance sheet",
  "Dividends",
  "Analysts",
  "Earnings",
  "Risk and trend",
  "Our scores",
  "Our read",
];

export const CAP_TIERS: Array<{ id: CapTier; label: string; hint: string }> = [
  { id: "mega", label: "Mega", hint: "$200B and up" },
  { id: "large", label: "Large", hint: "$10B to $200B" },
  { id: "mid", label: "Mid", hint: "$2B to $10B" },
  { id: "small", label: "Small", hint: "$300M to $2B" },
  { id: "micro", label: "Micro", hint: "under $300M" },
];

export const CALL_WORDS: CallWord[] = ["Add", "Hold", "Trim"];

export const ZONES: Array<{ id: Zone; label: string }> = [
  { id: "add", label: "In the add zone" },
  { id: "between", label: "Between zones" },
  { id: "trim", label: "In the trim zone" },
];

/* ── Filters ───────────────────────────────────────────────────────────── */

export type Range = { min?: number; max?: number };

export type ScreenerFilters = {
  q: string;
  /** Sector slugs ("health-care"). */
  sectors: string[];
  caps: CapTier[];
  calls: CallWord[];
  zones: Zone[];
  ranges: Record<string, Range>;
};

export type SortDir = "asc" | "desc";
export type ScreenerSort = { id: string; dir: SortDir };
export type ScreenerTab = "screen" | "sectors";
export type SectorPeriod = "day_pct" | "ret_1w" | "ret_1m" | "ret_ytd";

export type ScreenerView = {
  tab: ScreenerTab;
  preset: string | null;
  filters: ScreenerFilters;
  sort: ScreenerSort;
  columns: string[];
  period: SectorPeriod;
};

export const EMPTY_FILTERS: ScreenerFilters = { q: "", sectors: [], caps: [], calls: [], zones: [], ranges: {} };
export const DEFAULT_SORT: ScreenerSort = { id: "market_cap", dir: "desc" };
export const SECTOR_PERIODS: Array<{ id: SectorPeriod; label: string }> = [
  { id: "day_pct", label: "Today" },
  { id: "ret_1w", label: "1 week" },
  { id: "ret_1m", label: "1 month" },
  { id: "ret_ytd", label: "This year" },
];

export function sectorSlug(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Old sector URLs used the news pipeline's ids. Map them onto the screener's sectors. */
const LEGACY_SECTOR_SLUGS: Record<string, string> = {
  "big-tech": "technology",
  "information-technology": "technology",
  semiconductors: "technology",
  semis: "technology",
  "ai-infrastructure": "technology",
  healthcare: "health-care",
  "pharma-healthcare": "health-care",
  "financial-services": "financials",
  finance: "financials",
  banking: "financials",
  consumer: "consumer-discretionary",
  "consumer-cyclical": "consumer-discretionary",
  "consumer-defensive": "consumer-staples",
  "basic-materials": "materials",
  metals: "materials",
  "capital-goods": "industrials",
  "communication-services": "communication-services",
  communications: "communication-services",
};

export function canonicalSectorSlug(raw: string): string {
  const slug = sectorSlug(raw);
  return LEGACY_SECTOR_SLUGS[slug] ?? slug;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasCallFilters(filters: ScreenerFilters): boolean {
  if (filters.calls.length > 0 || filters.zones.length > 0) return true;
  return Object.keys(filters.ranges).some((id) => CALL_COLUMN_IDS.has(id));
}

export function countActiveFilters(filters: ScreenerFilters): number {
  return (
    (filters.q ? 1 : 0) +
    (filters.sectors.length ? 1 : 0) +
    (filters.caps.length ? 1 : 0) +
    (filters.calls.length ? 1 : 0) +
    (filters.zones.length ? 1 : 0) +
    Object.keys(filters.ranges).length
  );
}

function inRange(value: unknown, range: Range): boolean {
  if (!isFiniteNumber(value)) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

export function matchesFilters(row: ScreenerRow, filters: ScreenerFilters): boolean {
  if (filters.sectors.length > 0 && !filters.sectors.includes(sectorSlug(row.sector))) return false;
  if (filters.caps.length > 0 && (!row.cap_tier || !filters.caps.includes(row.cap_tier))) return false;
  if (filters.calls.length > 0 && (!row.call || !filters.calls.includes(row.call))) return false;
  if (filters.zones.length > 0 && (!row.zone || !filters.zones.includes(row.zone))) return false;
  for (const [id, range] of Object.entries(filters.ranges)) {
    if (!inRange((row as Record<string, unknown>)[id], range)) return false;
  }
  const q = filters.q.trim().toLowerCase();
  if (q) {
    const symbol = row.symbol.toLowerCase();
    if (symbol === q) return true;
    const haystack = `${symbol} ${row.name ?? ""} ${row.industry ?? ""}`.toLowerCase();
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

export function applyFilters(rows: readonly ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  return rows.filter((row) => matchesFilters(row, filters));
}

const TEXT_SORT_IDS = new Set(["symbol", "name", "sector", "industry", "analyst_label", "earnings_date"]);
const CALL_ORDER: Record<string, number> = { Add: 0, Hold: 1, Trim: 2 };
const ZONE_ORDER: Record<string, number> = { add: 0, between: 1, trim: 2 };

function sortValue(row: ScreenerRow, id: string): number | string | null {
  if (id === "call") return row.call ? CALL_ORDER[row.call] ?? null : null;
  if (id === "zone") return row.zone ? ZONE_ORDER[row.zone] ?? null : null;
  if (id === "spark") return isFiniteNumber(row.ret_3m) ? row.ret_3m : null;
  const value = (row as Record<string, unknown>)[id];
  if (TEXT_SORT_IDS.has(id)) return typeof value === "string" && value ? value : null;
  return isFiniteNumber(value) ? value : null;
}

export function isSortable(id: string): boolean {
  return id === "symbol" || id === "call" || id === "zone" || id === "spark" || TEXT_SORT_IDS.has(id) || FIELD_BY_ID.has(id);
}

/** Stable sort. Rows without a value always go last, whichever way the column is sorted. */
export function sortRows(rows: readonly ScreenerRow[], sort: ScreenerSort): ScreenerRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, sort.id) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const diff =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value));
      return diff !== 0 ? diff * factor : a.index - b.index;
    })
    .map((item) => item.row);
}

/**
 * Remove the price zones from a row. The call itself is open to everyone;
 * the zones are part of covering a stock, so a viewer who does not cover
 * this one gets the row without them.
 */
export function withoutZones(row: ScreenerRow): ScreenerRow {
  const { add_below: _add, trim_above: _trim, to_add_pct: _toAdd, to_trim_pct: _toTrim, zone: _zone, ...rest } = row;
  return rest;
}

/* ── URL format ────────────────────────────────────────────────────────── */

type Query = Record<string, string | string[] | undefined> | URLSearchParams;

function read(query: Query, key: string): string {
  if (query instanceof URLSearchParams) return query.get(key) ?? "";
  const value = query[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function list(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** "10..25", "..15", "20.." or "5" (an exact minimum). Anything else is ignored. */
export function parseRange(raw: string): Range | null {
  const text = raw.trim();
  if (!text) return null;
  const parts = text.includes("..") ? text.split("..") : [text, ""];
  if (parts.length !== 2) return null;
  const range: Range = {};
  for (const [index, part] of parts.entries()) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return null;
    if (index === 0) range.min = value;
    else range.max = value;
  }
  if (range.min === undefined && range.max === undefined) return null;
  if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
    return { min: range.max, max: range.min };
  }
  return range;
}

function numberText(value: number): string {
  return String(Math.round(value * 1e4) / 1e4);
}

export function formatRange(range: Range): string {
  return `${range.min === undefined ? "" : numberText(range.min)}..${range.max === undefined ? "" : numberText(range.max)}`;
}

const TABS: ScreenerTab[] = ["screen", "sectors"];

/** Filter params only. Unknown or malformed parts are dropped, never thrown. */
export function parseFilters(query: Query): ScreenerFilters {
  const ranges: Record<string, Range> = {};
  for (const field of NUMERIC_FIELDS) {
    const range = parseRange(read(query, field.id));
    if (range) ranges[field.id] = range;
  }
  const capIds = new Set<string>(CAP_TIERS.map((tier) => tier.id));
  const zoneIds = new Set<string>(ZONES.map((zone) => zone.id));
  return {
    q: read(query, "q").trim().slice(0, 60),
    sectors: unique(list(read(query, "sector")).map(canonicalSectorSlug).filter(Boolean)).slice(0, 12),
    caps: unique(list(read(query, "cap").toLowerCase()).filter((id) => capIds.has(id))) as CapTier[],
    calls: unique(
      list(read(query, "call"))
        .map((word) => CALL_WORDS.find((known) => known.toLowerCase() === word.toLowerCase()))
        .filter((word): word is CallWord => Boolean(word)),
    ),
    zones: unique(list(read(query, "zone").toLowerCase()).filter((id) => zoneIds.has(id))) as Zone[],
    ranges,
  };
}

export function parseSort(raw: string): ScreenerSort | null {
  const [id, dir] = raw.trim().split(".");
  if (!id || !isSortable(id)) return null;
  return { id, dir: dir === "asc" ? "asc" : "desc" };
}

export function parseColumns(raw: string): string[] | null {
  const known = new Set(ALL_COLUMN_IDS);
  const columns = unique(list(raw).filter((id) => known.has(id))).slice(0, MAX_COLUMNS);
  return columns.length > 0 ? columns : null;
}

/** The whole view from a query string. A `preset` with no filters of its own loads the preset's definition. */
export function parseView(query: Query, presets: readonly ScreenPreset[] = PRESETS): ScreenerView {
  const tabRaw = read(query, "tab");
  const tab = TABS.includes(tabRaw as ScreenerTab) ? (tabRaw as ScreenerTab) : "screen";
  const periodRaw = read(query, "period");
  const period = SECTOR_PERIODS.some((item) => item.id === periodRaw) ? (periodRaw as SectorPeriod) : "day_pct";
  const explicit = parseFilters(query);
  const preset = presets.find((item) => item.slug === read(query, "preset")) ?? null;
  const usePreset = preset !== null && countActiveFilters(explicit) === 0;
  return {
    tab,
    period,
    preset: usePreset ? preset.slug : null,
    filters: usePreset ? { ...EMPTY_FILTERS, ...preset.filters } : explicit,
    sort: parseSort(read(query, "sort")) ?? (usePreset ? preset.sort : null) ?? DEFAULT_SORT,
    columns: parseColumns(read(query, "cols")) ?? (usePreset ? preset.columns : null) ?? DEFAULT_COLUMNS,
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** Query params for a set of filters, in a fixed order so equal screens give equal links. */
export function filtersToParams(filters: ScreenerFilters): Array<[string, string]> {
  const params: Array<[string, string]> = [];
  if (filters.q.trim()) params.push(["q", filters.q.trim()]);
  if (filters.sectors.length) params.push(["sector", filters.sectors.join(",")]);
  if (filters.caps.length) params.push(["cap", filters.caps.join(",")]);
  if (filters.calls.length) params.push(["call", filters.calls.map((word) => word.toLowerCase()).join(",")]);
  if (filters.zones.length) params.push(["zone", filters.zones.join(",")]);
  for (const field of NUMERIC_FIELDS) {
    const range = filters.ranges[field.id];
    if (range && (range.min !== undefined || range.max !== undefined)) params.push([field.id, formatRange(range)]);
  }
  return params;
}

function encode(params: Array<[string, string]>): string {
  // Commas and the range dots stay readable; everything else is escaped.
  return params
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%2C/gi, ",")}`)
    .join("&");
}

/** The query string for a view, without the leading "?". Defaults are left out to keep links short. */
export function viewToQuery(view: ScreenerView, presets: readonly ScreenPreset[] = PRESETS): string {
  const params: Array<[string, string]> = [];
  if (view.tab !== "screen") params.push(["tab", view.tab]);
  if (view.tab === "sectors" && view.period !== "day_pct") params.push(["period", view.period]);
  const preset = view.preset ? presets.find((item) => item.slug === view.preset) ?? null : null;
  if (preset) {
    params.push(["preset", preset.slug]);
    if (view.sort.id !== preset.sort.id || view.sort.dir !== preset.sort.dir) params.push(["sort", `${view.sort.id}.${view.sort.dir}`]);
    if (!sameList(view.columns, preset.columns)) params.push(["cols", view.columns.join(",")]);
    return encode(params);
  }
  params.push(...filtersToParams(view.filters));
  if (view.sort.id !== DEFAULT_SORT.id || view.sort.dir !== DEFAULT_SORT.dir) params.push(["sort", `${view.sort.id}.${view.sort.dir}`]);
  if (!sameList(view.columns, DEFAULT_COLUMNS)) params.push(["cols", view.columns.join(",")]);
  return encode(params);
}

export function viewHref(view: ScreenerView, presets: readonly ScreenPreset[] = PRESETS): string {
  const query = viewToQuery(view, presets);
  return query ? `/screener?${query}` : "/screener";
}

/** A link that toggles the sort on one column, keeping everything else. */
export function sortHref(view: ScreenerView, id: string, numeric: boolean): string {
  const dir: SortDir = view.sort.id === id ? (view.sort.dir === "desc" ? "asc" : "desc") : numeric ? "desc" : "asc";
  return viewHref({ ...view, sort: { id, dir } });
}

/* ── Saved screens (ours) ──────────────────────────────────────────────── */

export type ScreenPreset = {
  slug: string;
  name: string;
  /** What the screen looks for, in a sentence a person would say. */
  description: string;
  filters: Partial<ScreenerFilters>;
  sort: ScreenerSort;
  columns: string[];
  /** Fields that must be populated in the snapshot for this screen to be offered. */
  needs: string[];
  /** Uses our call or zones, so it is part of Pro. */
  pro?: boolean;
  /** Old /screens/:id pages that now land here. */
  replaces?: string[];
};

export const PRESETS: ScreenPreset[] = [
  {
    slug: "cheap-vs-own-history",
    name: "Cheap vs own history and still growing",
    description:
      "Today's P/E is lower than on three quarters of the days we have on file for the stock, revenue is still growing 8% or more, and the company is profitable.",
    filters: { ranges: { pe_hist_pctile: { max: 25 }, rev_growth: { min: 8 }, net_margin: { min: 0 } } },
    sort: { id: "pe_hist_pctile", dir: "asc" },
    columns: ["spark", "price", "day_pct", "pe", "pe_hist_pctile", "fwd_pe", "rev_growth", "net_margin", "ret_1y", "score"],
    needs: ["pe_hist_pctile", "rev_growth"],
    replaces: ["cheap_growth"],
  },
  {
    slug: "add-zone-today",
    name: "In the add zone today",
    description: "The price is at or below the level where our brief says adding makes sense, and our call is add or hold.",
    filters: { zones: ["add"], calls: ["Add", "Hold"] },
    sort: { id: "to_add_pct", dir: "asc" },
    columns: ["spark", "price", "day_pct", "call", "add_below", "to_add_pct", "trim_above", "upside", "score"],
    needs: ["zone", "call"],
    pro: true,
  },
  {
    slug: "near-low-analysts-warming",
    name: "Near 52-week low, analysts warming",
    description:
      "Within 20% of the 52-week low while at least one more analyst rates the stock a buy than three months ago.",
    filters: { ranges: { from_lo_pct: { max: 20 }, buys_chg_3m: { min: 1 } } },
    sort: { id: "from_lo_pct", dir: "asc" },
    columns: ["spark", "price", "day_pct", "from_lo_pct", "from_hi_pct", "buys_chg_3m", "buy_pct", "upside", "rsi", "score"],
    needs: ["from_lo_pct", "buys_chg_3m"],
    replaces: ["oversold_quality"],
  },
  {
    slug: "earnings-next-7-days",
    name: "Earnings in the next 7 days",
    description: "Companies that report within a week, largest first, with how the stock has traded going in.",
    filters: { ranges: { earnings_in_days: { min: 0, max: 7 } } },
    sort: { id: "earnings_in_days", dir: "asc" },
    columns: ["earnings_date", "price", "day_pct", "ret_1m", "market_cap", "pe", "eps_next_y", "upside", "vol_90d", "call"],
    needs: ["earnings_in_days"],
  },
  {
    slug: "low-volatility-dividend-growers",
    name: "Low volatility dividend growers",
    description:
      "Swings under 25% a year, a yield of 1.5% or more, a dividend that has been growing, and a payout under 75% of earnings.",
    filters: {
      ranges: { vol_90d: { max: 25 }, div_yield: { min: 1.5 }, div_growth: { min: 0.1 }, payout: { min: 0, max: 75 } },
    },
    sort: { id: "div_yield", dir: "desc" },
    columns: ["spark", "price", "day_pct", "div_yield", "div_growth", "div_growth_years", "payout", "vol_90d", "beta", "ret_1y"],
    needs: ["vol_90d", "div_yield", "div_growth", "payout"],
  },
  {
    slug: "quality-compounders",
    name: "Quality compounders",
    description: "Return on invested capital above 15%, operating margin above 20%, revenue growing, and debt under control.",
    filters: {
      ranges: { roic: { min: 15 }, op_margin: { min: 20 }, rev_growth: { min: 5 }, debt_equity: { max: 1.5 } },
    },
    sort: { id: "roic", dir: "desc" },
    columns: ["spark", "price", "day_pct", "roic", "op_margin", "rev_growth", "debt_equity", "pe", "ret_1y", "score"],
    needs: ["roic", "op_margin", "rev_growth"],
    replaces: ["quality_compounders", "tikrr_top"],
  },
  {
    slug: "momentum-above-200-day",
    name: "Leaders above the 200-day line",
    description: "Up 15% or more over six months, still above the 200-day average, and not yet overbought.",
    filters: { ranges: { ret_6m: { min: 15 }, vs_200d: { min: 0 }, rsi: { max: 70 } } },
    sort: { id: "ret_6m", dir: "desc" },
    columns: ["spark", "price", "day_pct", "ret_1m", "ret_6m", "ret_1y", "vs_200d", "rsi", "from_hi_pct", "score"],
    needs: ["ret_6m", "vs_200d"],
    replaces: ["momentum_leaders", "near_52w_high"],
  },
  {
    slug: "widely-held-and-rated",
    name: "Widely held and well rated",
    description: "Institutions own 70% or more and our composite score is 60 or higher.",
    filters: { ranges: { inst_own: { min: 70 }, score: { min: 60 } } },
    sort: { id: "score", dir: "desc" },
    columns: ["spark", "price", "day_pct", "inst_own", "score", "s_quality", "s_growth", "pe", "upside", "ret_1y"],
    needs: ["inst_own", "score"],
    replaces: ["smart_money"],
  },
];

/** Presets whose data exists in this snapshot. A field counts when at least 40 rows carry it. */
export function availablePresets(coverage: Record<string, number> | undefined, presets: readonly ScreenPreset[] = PRESETS): ScreenPreset[] {
  if (!coverage) return [];
  return presets.filter((preset) => preset.needs.every((field) => (coverage[field] ?? 0) >= 40));
}

/** Where an old /screens/:id link should go. */
export function presetForLegacyScreen(id: string, presets: readonly ScreenPreset[] = PRESETS): ScreenPreset | null {
  return presets.find((preset) => preset.replaces?.includes(id)) ?? null;
}

/* ── Formatting ────────────────────────────────────────────────────────── */

const MINUS = "−";

function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      return `${sign}$${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}${unit}`;
    }
  }
  return `${sign}$${abs.toFixed(0)}`;
}

/** A field value as text. Returns "" when the value is unknown so callers can leave the cell empty. */
export function formatField(field: NumericField, value: unknown): string {
  if (!isFiniteNumber(value)) return "";
  const digits = field.digits ?? 2;
  switch (field.unit) {
    case "price":
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "money":
      return compactMoney(value);
    case "pct":
      return `${value < 0 ? MINUS : ""}${Math.abs(value).toFixed(digits)}%`;
    case "signed_pct": {
      const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
      return `${sign}${Math.abs(value).toFixed(digits)}%`;
    }
    case "multiple":
      return `${value.toFixed(digits)}×`;
    case "days":
      return value === 0 ? "today" : `${Math.round(value)}d`;
    case "score":
      return value.toFixed(0);
    case "count_change":
      return `${value > 0 ? "+" : value < 0 ? MINUS : ""}${Math.abs(Math.round(value))}`;
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: digits });
  }
}

/** "P/E under 25", "Revenue growth 10% or more", for the chips that describe a screen. */
export function describeRange(field: NumericField, range: Range): string {
  const text = (value: number) => formatField(field, value).replace(/^\+/, "");
  if (range.min !== undefined && range.max !== undefined) return `${field.short} ${text(range.min)} to ${text(range.max)}`;
  if (range.min !== undefined) return `${field.short} ${text(range.min)} or more`;
  if (range.max !== undefined) return `${field.short} ${text(range.max)} or less`;
  return field.short;
}

/* ── Sector aggregates ─────────────────────────────────────────────────── */

export type SectorStat = {
  slug: string;
  name: string;
  count: number;
  marketCap: number;
  /** Market-cap weighted change over each period, among members that have both numbers. */
  change: Partial<Record<SectorPeriod, number>>;
  /** Share of members up today, 0 to 100. */
  advancing: number | null;
  best: { symbol: string; pct: number } | null;
  worst: { symbol: string; pct: number } | null;
};

export function sectorStats(rows: readonly ScreenerRow[], period: SectorPeriod = "day_pct"): SectorStat[] {
  const groups = new Map<string, ScreenerRow[]>();
  for (const row of rows) {
    if (!row.sector) continue;
    const list = groups.get(row.sector) ?? [];
    list.push(row);
    groups.set(row.sector, list);
  }
  const stats: SectorStat[] = [];
  for (const [name, members] of groups) {
    const change: SectorStat["change"] = {};
    for (const { id } of SECTOR_PERIODS) {
      let weight = 0;
      let sum = 0;
      for (const row of members) {
        const value = row[id];
        if (!isFiniteNumber(value) || !isFiniteNumber(row.market_cap) || row.market_cap <= 0) continue;
        weight += row.market_cap;
        sum += value * row.market_cap;
      }
      if (weight > 0) change[id] = sum / weight;
    }
    const moved = members.filter((row) => isFiniteNumber(row[period]));
    const dayKnown = members.filter((row) => isFiniteNumber(row.day_pct));
    const ranked = [...moved].sort((a, b) => (b[period] as number) - (a[period] as number));
    stats.push({
      slug: sectorSlug(name),
      name,
      count: members.length,
      marketCap: members.reduce((sum, row) => sum + (isFiniteNumber(row.market_cap) && row.market_cap > 0 ? row.market_cap : 0), 0),
      change,
      advancing: dayKnown.length ? (dayKnown.filter((row) => (row.day_pct as number) > 0).length / dayKnown.length) * 100 : null,
      best: ranked.length ? { symbol: ranked[0]!.symbol, pct: ranked[0]![period] as number } : null,
      worst: ranked.length > 1 ? { symbol: ranked[ranked.length - 1]!.symbol, pct: ranked[ranked.length - 1]![period] as number } : null,
    });
  }
  return stats.sort((a, b) => b.marketCap - a.marketCap);
}

/* ── Treemap layout ────────────────────────────────────────────────────── */

export type TreemapItem<T> = { value: number; data: T };
export type TreemapRect<T> = { x: number; y: number; w: number; h: number; data: T };

function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  const square = side * side;
  return Math.max((square * max) / (sum * sum), (sum * sum) / (square * min));
}

/**
 * Squarified treemap: rectangles whose areas are proportional to `value`,
 * kept as close to square as the order allows. Items with no positive value
 * are left out. Pure, so it can be tested and run on the server.
 */
export function squarify<T>(items: ReadonlyArray<TreemapItem<T>>, x: number, y: number, w: number, h: number): TreemapRect<T>[] {
  const positive = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (positive.length === 0 || total <= 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const out: TreemapRect<T>[] = [];
  let left = x;
  let top = y;
  let width = w;
  let height = h;
  let index = 0;
  while (index < positive.length) {
    const side = Math.min(width, height);
    const row: Array<{ area: number; data: T }> = [];
    let areas: number[] = [];
    while (index < positive.length) {
      const area = positive[index]!.value * scale;
      const next = [...areas, area];
      if (areas.length > 0 && worstRatio(next, side) > worstRatio(areas, side)) break;
      areas = next;
      row.push({ area, data: positive[index]!.data });
      index += 1;
    }
    const rowArea = areas.reduce((sum, area) => sum + area, 0);
    const thickness = rowArea / side;
    let offset = 0;
    for (const cell of row) {
      const length = cell.area / thickness;
      if (width >= height) {
        out.push({ x: left, y: top + offset, w: thickness, h: length, data: cell.data });
      } else {
        out.push({ x: left + offset, y: top, w: length, h: thickness, data: cell.data });
      }
      offset += length;
    }
    if (width >= height) {
      left += thickness;
      width -= thickness;
    } else {
      top += thickness;
      height -= thickness;
    }
  }
  return out;
}
