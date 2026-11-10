/**
 * Rule-based backtest engine, the TypeScript twin of
 * `backend/agentdata/backtest.py`. Same spec, same data, same numbers: both are
 * checked against `lib/backtest/fixtures/expected.json`. When you change
 * arithmetic here, change it there in the same order.
 *
 * The contract:
 * - Signals at a rebalance use closes up to and including the signal session
 *   (the last session of the week, month or quarter). Nothing later.
 * - Trades fill at the next session's close.
 * - Every trade pays `cost_bps` of the amount traded. On by default.
 * - Empty slots sit in cash at 0%.
 * - The benchmark is bought at the first fill and held.
 *
 * `runWeightsBacktest` is the simpler self-serve mode: a fixed list of tickers
 * and weights, bought at one close and reset to those weights on a schedule.
 *
 * Pure: no I/O, no clock. Loading prices is `lib/backtest/index.ts`.
 */

import caveatCatalog from "./caveats.json";
import type {
  BacktestData,
  BacktestResult,
  Caveat,
  CaveatCatalog,
  CurveStats,
  FilterRule,
  PickedHolding,
  Picks,
  RankRule,
  RebalanceRecord,
  ResolvedUniverse,
  RuleSpec,
  Signal,
  UniverseDoc,
  WeightsInput,
  WeightsResult,
  YearRow,
} from "./types";

const SQRT252 = Math.sqrt(252.0);
const SESSIONS_PER_MONTH = 21;
const MAX_STALE_SESSIONS = 5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SIGNAL_TYPES = [
  "momentum",
  "low_volatility",
  "trend",
  "near_high",
  "size",
  "congress_net_buying",
  "fundamental",
  "pullback",
] as const;
export const FUNDAMENTAL_FIELDS = [
  "fcf_yield",
  "shareholder_yield",
  "roic",
  "market_cap",
  "dividend_yield",
  "dividend_growth_years",
  "dividend_growth",
  "debt_to_equity",
] as const;
const REBALANCE = ["weekly", "monthly", "quarterly"] as const;
const WEIGHTING = ["equal", "rank"] as const;

export const LIMITS = {
  holdings: [1, 50],
  cost_bps: [0, 200],
  months: [1, 36],
  days: [20, 504],
  ma_days: [20, 300],
  window_days: [7, 365],
  top_by_size: [5, 300],
  filters: 6,
  rank: 4,
  symbols: 60,
  weight: [1, 10],
} as const;

/** The rule spec is malformed. The message is safe to show to a person. */
export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}

/** The spec is fine but cannot be run on the data we hold. */
export class BacktestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestError";
  }
}

// -- small shared helpers (mirrored one for one in backtest.py) ---------------

export function r4(value: number): number {
  return Math.floor(value * 10000.0 + 0.5) / 10000.0;
}

export function r6(value: number): number {
  return Math.floor(value * 1000000.0 + 0.5) / 1000000.0;
}

/** Days since 1970-01-01. */
export function dayNumber(iso: string): number {
  return Math.round(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000,
  );
}

export function formatDay(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

function periodKey(iso: string, rebalance: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (rebalance === "monthly") return year * 12 + (month - 1);
  if (rebalance === "quarterly") return year * 4 + Math.floor((month - 1) / 3);
  if (rebalance === "yearly") return year;
  // weekly: weeks start on Monday. 1970-01-01 was a Thursday.
  return Math.floor((dayNumber(iso) + 3) / 7);
}

function isRealNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function intIn(value: unknown, name: string, low: number, high: number, fallback?: number): number {
  if (value === null || value === undefined) {
    if (fallback === undefined) throw new SpecError(`${name} is required`);
    return fallback;
  }
  if (!isRealNumber(value)) throw new SpecError(`${name} must be a number`);
  const number = Math.floor(value + 0.5);
  if (!(number >= low && number <= high)) {
    throw new SpecError(`${name} must be between ${low} and ${high}`);
  }
  return number;
}

function bound(value: unknown, name: string): number | null {
  if (value === null || value === undefined) return null;
  if (!isRealNumber(value) || !Number.isFinite(value)) throw new SpecError(`${name} must be a number`);
  return value;
}

function isValidIsoDay(value: string): boolean {
  if (value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function isoOrNull(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !isValidIsoDay(value)) {
    throw new SpecError(`${name} must be a date like 2020-01-31`);
  }
  return value;
}

function normalizeSignal(raw: unknown, where: string): Signal {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError(`${where} must be an object`);
  const item = raw as Record<string, unknown>;
  const kind = item.type;
  if (typeof kind !== "string" || !(SIGNAL_TYPES as readonly string[]).includes(kind)) {
    throw new SpecError(`${where} has an unknown signal type`);
  }
  const out: Signal = { type: kind as Signal["type"] };
  if (kind === "momentum") {
    out.months = intIn(item.months, "months", LIMITS.months[0], LIMITS.months[1], 12);
    out.skip_months = intIn(item.skip_months, "skip_months", 0, 35, 1);
    if (out.skip_months >= out.months) throw new SpecError("skip_months must be smaller than months");
  } else if (kind === "low_volatility") {
    out.days = intIn(item.days, "days", LIMITS.days[0], LIMITS.days[1], 252);
  } else if (kind === "trend") {
    out.ma_days = intIn(item.ma_days, "ma_days", LIMITS.ma_days[0], LIMITS.ma_days[1], 200);
  } else if (kind === "near_high") {
    out.days = intIn(item.days, "days", LIMITS.days[0], LIMITS.days[1], 252);
  } else if (kind === "congress_net_buying") {
    out.window_days = intIn(item.window_days, "window_days", LIMITS.window_days[0], LIMITS.window_days[1], 90);
  } else if (kind === "pullback") {
    out.days = intIn(item.days, "days", LIMITS.days[0], LIMITS.days[1], 21);
  } else if (kind === "fundamental") {
    if (typeof item.field !== "string" || !(FUNDAMENTAL_FIELDS as readonly string[]).includes(item.field)) {
      throw new SpecError(`${where} has an unknown fundamental field`);
    }
    out.field = item.field as Signal["field"];
  }
  return out;
}

export function signalKey(signal: Signal): string {
  switch (signal.type) {
    case "momentum":
      return `momentum_${signal.months}_${signal.skip_months}`;
    case "low_volatility":
      return `low_volatility_${signal.days}`;
    case "trend":
      return `trend_${signal.ma_days}`;
    case "near_high":
      return `near_high_${signal.days}`;
    case "congress_net_buying":
      return `congress_net_buying_${signal.window_days}`;
    case "fundamental":
      return `fundamental_${signal.field}`;
    case "pullback":
      return `pullback_${signal.days}`;
    default:
      return "size";
  }
}

function lowerIsBetter(signal: Signal): boolean {
  if (signal.type === "fundamental") return signal.field === "debt_to_equity";
  return signal.type === "low_volatility";
}

/** Validate, clamp and fill defaults. Throws SpecError with a readable message. */
export function normalizeSpec(raw: unknown): RuleSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError("spec must be an object");
  const input = raw as Record<string, unknown>;

  const rawUniverse = input.universe;
  if (!rawUniverse || typeof rawUniverse !== "object" || Array.isArray(rawUniverse)) {
    throw new SpecError("universe is required");
  }
  const universeInput = rawUniverse as Record<string, unknown>;
  const universe: RuleSpec["universe"] = { id: null, symbols: null, top_by_size: null };
  const symbols = universeInput.symbols;
  if (symbols !== null && symbols !== undefined) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new SpecError("universe.symbols must be a list of tickers");
    }
    const cleaned: string[] = [];
    for (const item of symbols) {
      if (typeof item !== "string") throw new SpecError("universe.symbols must be a list of tickers");
      const ticker = item.trim().toUpperCase();
      if (!ticker || ticker.length > 12) throw new SpecError("universe.symbols has an invalid ticker");
      if (!cleaned.includes(ticker)) cleaned.push(ticker);
    }
    if (cleaned.length > LIMITS.symbols) {
      throw new SpecError(`universe.symbols can list at most ${LIMITS.symbols} tickers`);
    }
    cleaned.sort(compareText);
    universe.symbols = cleaned;
  } else {
    const universeId = universeInput.id;
    if (typeof universeId !== "string" || !universeId || universeId.length > 40) {
      throw new SpecError("universe.id is required");
    }
    universe.id = universeId;
  }
  if (universeInput.top_by_size !== null && universeInput.top_by_size !== undefined) {
    universe.top_by_size = intIn(
      universeInput.top_by_size,
      "top_by_size",
      LIMITS.top_by_size[0],
      LIMITS.top_by_size[1],
    );
  }

  const rawFilters = input.filters ?? [];
  if (!Array.isArray(rawFilters) || rawFilters.length > LIMITS.filters) {
    throw new SpecError(`filters can hold at most ${LIMITS.filters} rules`);
  }
  const filters: FilterRule[] = rawFilters.map((item, index) => {
    const signal = normalizeSignal(item, `filters[${index}]`);
    const record = item as Record<string, unknown>;
    const min = bound(record.min, "min");
    const max = bound(record.max, "max");
    if (min === null && max === null) throw new SpecError(`filters[${index}] needs a min or a max`);
    return { ...signal, min, max };
  });

  const rawRank = input.rank;
  if (!Array.isArray(rawRank) || rawRank.length === 0 || rawRank.length > LIMITS.rank) {
    throw new SpecError(`rank needs between 1 and ${LIMITS.rank} signals`);
  }
  const rank: RankRule[] = rawRank.map((item, index) => {
    const signal = normalizeSignal(item, `rank[${index}]`);
    const record = item as Record<string, unknown>;
    return { ...signal, weight: intIn(record.weight, "weight", LIMITS.weight[0], LIMITS.weight[1], 1) };
  });

  let marketFilter: RuleSpec["market_filter"] = null;
  const rawMarket = input.market_filter;
  if (rawMarket !== null && rawMarket !== undefined) {
    if (typeof rawMarket !== "object" || Array.isArray(rawMarket)) {
      throw new SpecError("market_filter must be an object");
    }
    const market = rawMarket as Record<string, unknown>;
    const symbol = market.symbol ?? "SPY";
    if (typeof symbol !== "string" || !symbol.trim() || symbol.length > 12) {
      throw new SpecError("market_filter.symbol is invalid");
    }
    marketFilter = {
      symbol: symbol.trim().toUpperCase(),
      ma_days: intIn(market.ma_days, "ma_days", LIMITS.ma_days[0], LIMITS.ma_days[1], 200),
    };
  }

  const weighting = input.weighting ?? "equal";
  if (typeof weighting !== "string" || !(WEIGHTING as readonly string[]).includes(weighting)) {
    throw new SpecError("weighting must be equal or rank");
  }
  const rebalance = input.rebalance ?? "monthly";
  if (typeof rebalance !== "string" || !(REBALANCE as readonly string[]).includes(rebalance)) {
    throw new SpecError("rebalance must be weekly, monthly or quarterly");
  }
  const benchmark = input.benchmark ?? "SPY";
  if (typeof benchmark !== "string" || !benchmark.trim() || benchmark.length > 12) {
    throw new SpecError("benchmark is invalid");
  }

  const start = isoOrNull(input.start, "start");
  const end = isoOrNull(input.end, "end");
  if (start && end && start >= end) throw new SpecError("start must be before end");

  return {
    version: 1,
    universe,
    filters,
    rank,
    market_filter: marketFilter,
    holdings: intIn(input.holdings, "holdings", LIMITS.holdings[0], LIMITS.holdings[1], 20),
    weighting: weighting as RuleSpec["weighting"],
    rebalance: rebalance as RuleSpec["rebalance"],
    cost_bps: intIn(input.cost_bps, "cost_bps", LIMITS.cost_bps[0], LIMITS.cost_bps[1], 10),
    benchmark: benchmark.trim().toUpperCase(),
    start,
    end,
  };
}

/** Every distinct signal the spec reads, filters first, in spec order. */
export function specSignals(spec: RuleSpec): Signal[] {
  const seen: string[] = [];
  const out: Signal[] = [];
  for (const signal of [...spec.filters, ...spec.rank]) {
    const key = signalKey(signal);
    if (!seen.includes(key)) {
      seen.push(key);
      out.push(signal);
    }
  }
  return out;
}

export function usesSignal(spec: RuleSpec, kind: Signal["type"]): boolean {
  return specSignals(spec).some((signal) => signal.type === kind);
}

export function isBacktestable(spec: RuleSpec): boolean {
  return !usesSignal(spec, "fundamental");
}

export function lookbackSessions(spec: RuleSpec): number {
  let need = 0;
  for (const signal of specSignals(spec)) {
    if (signal.type === "momentum") need = Math.max(need, SESSIONS_PER_MONTH * (signal.months as number));
    else if (signal.type === "low_volatility") need = Math.max(need, signal.days as number);
    else if (signal.type === "trend") need = Math.max(need, (signal.ma_days as number) - 1);
    else if (signal.type === "near_high") need = Math.max(need, (signal.days as number) - 1);
    else if (signal.type === "pullback") need = Math.max(need, signal.days as number);
  }
  if (spec.market_filter !== null) need = Math.max(need, spec.market_filter.ma_days - 1);
  return need;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Turn `spec.universe` into the candidate list, from `tm_backtest_universe/US`. */
export function resolveUniverse(spec: RuleSpec, universeDoc: UniverseDoc): ResolvedUniverse {
  const universe = spec.universe;
  if (universe.symbols !== null) {
    return {
      symbols: [...universe.symbols],
      label: "tickers you listed",
      kind: "stocks",
      partial: false,
      id: "custom",
      count: universe.symbols.length,
    };
  }
  for (const group of universeDoc.groups ?? []) {
    if (group.id === universe.id) {
      const symbols = [...(group.symbols ?? [])].sort(compareText);
      return {
        symbols,
        label: group.label || (universe.id as string),
        kind: group.kind || "stocks",
        partial: Boolean(group.partial),
        id: universe.id as string,
        count: symbols.length,
      };
    }
  }
  throw new SpecError("unknown universe");
}

// -- price panel --------------------------------------------------------------

type PanelSpec = Pick<RuleSpec, "benchmark" | "end" | "market_filter">;

/** Prices aligned to the benchmark's calendar, forward filled after the first print. */
export class Panel {
  calendar: string[];
  days: number[];
  size: number;
  universe: string[];
  px: Map<string, Float64Array> = new Map();
  obs: Map<string, Int32Array> = new Map();
  sizeFactors: Record<string, number>;
  fundamentals: Record<string, Record<string, number | null | undefined>>;
  events: Map<string, { day: number; side: string }[]> = new Map();
  eventsStart: string | null = null;

  constructor(spec: PanelSpec, data: BacktestData) {
    const prices = data.prices ?? {};
    const benchmark = prices[spec.benchmark];
    if (!benchmark || !benchmark.dates || benchmark.dates.length === 0) {
      throw new BacktestError("no price history for the benchmark");
    }
    let calendar = benchmark.dates;
    if (spec.end !== null) {
      const end = spec.end;
      calendar = calendar.filter((day) => day <= end);
    }
    if (calendar.length < 2) throw new BacktestError("not enough price history");
    this.calendar = calendar;
    this.days = calendar.map(dayNumber);
    this.size = calendar.length;

    const universe = [...new Set(data.universe ?? [])].sort(compareText);
    const wanted = [...universe, spec.benchmark];
    if (spec.market_filter !== null) wanted.push(spec.market_filter.symbol);
    for (const symbol of wanted) {
      if (this.px.has(symbol)) continue;
      const series = prices[symbol];
      if (!series) continue;
      this.align(symbol, series);
    }
    this.universe = universe.filter((symbol) => this.px.has(symbol));

    this.sizeFactors = data.size_factors ?? {};
    this.fundamentals = data.fundamentals ?? {};
    for (const event of data.events ?? []) {
      if (!event || !event.symbol || !event.date || (event.side !== "buy" && event.side !== "sell")) continue;
      const list = this.events.get(event.symbol);
      const entry = { day: dayNumber(event.date), side: event.side };
      if (list) list.push(entry);
      else this.events.set(event.symbol, [entry]);
      if (this.eventsStart === null || event.date < this.eventsStart) this.eventsStart = event.date;
    }
  }

  private align(symbol: string, series: { dates: string[]; closes: number[] }): void {
    const dates = series.dates ?? [];
    const closes = series.closes ?? [];
    const count = Math.min(dates.length, closes.length);
    const px = new Float64Array(this.size);
    const obs = new Int32Array(this.size);
    let cursor = 0;
    let last = Number.NaN;
    let lastObs = -1;
    for (let index = 0; index < this.size; index += 1) {
      const day = this.calendar[index];
      while (cursor < count && dates[cursor] <= day) {
        const close = closes[cursor];
        if (typeof close === "number" && close > 0) {
          last = close;
          if (dates[cursor] === day) lastObs = index;
        }
        cursor += 1;
      }
      px[index] = last;
      obs[index] = lastObs;
    }
    this.px.set(symbol, px);
    this.obs.set(symbol, obs);
  }
}

/** Buy and sell filings dated in the `windowDays` ending on the signal day. */
function congressCounts(symbol: string, index: number, windowDays: number, panel: Panel): [number, number] {
  const today = panel.days[index];
  const oldest = today - windowDays;
  let buys = 0;
  let sells = 0;
  for (const event of panel.events.get(symbol) ?? []) {
    if (oldest < event.day && event.day <= today) {
      if (event.side === "buy") buys += 1;
      else sells += 1;
    }
  }
  return [buys, sells];
}

export function signalValue(signal: Signal, symbol: string, index: number, panel: Panel): number {
  const px = panel.px.get(symbol) as Float64Array;
  if (signal.type === "momentum") {
    const recent = index - SESSIONS_PER_MONTH * (signal.skip_months as number);
    const base = index - SESSIONS_PER_MONTH * (signal.months as number);
    if (base < 0) return Number.NaN;
    const endPrice = px[recent];
    const startPrice = px[base];
    if (Number.isNaN(endPrice) || Number.isNaN(startPrice) || startPrice <= 0) return Number.NaN;
    return endPrice / startPrice - 1.0;
  }
  if (signal.type === "low_volatility") {
    const days = signal.days as number;
    const start = index - days;
    if (start < 0 || Number.isNaN(px[start])) return Number.NaN;
    let total = 0.0;
    for (let k = start + 1; k <= index; k += 1) total += px[k] / px[k - 1] - 1.0;
    const mean = total / days;
    let squares = 0.0;
    for (let k = start + 1; k <= index; k += 1) {
      const gap = px[k] / px[k - 1] - 1.0 - mean;
      squares += gap * gap;
    }
    return Math.sqrt(squares / (days - 1)) * SQRT252;
  }
  if (signal.type === "trend") {
    const days = signal.ma_days as number;
    const start = index - days + 1;
    if (start < 0 || Number.isNaN(px[start])) return Number.NaN;
    let total = 0.0;
    for (let k = start; k <= index; k += 1) total += px[k];
    return px[index] / (total / days) - 1.0;
  }
  if (signal.type === "near_high") {
    const days = signal.days as number;
    const start = index - days + 1;
    if (start < 0 || Number.isNaN(px[start])) return Number.NaN;
    let high = px[start];
    for (let k = start + 1; k <= index; k += 1) {
      if (px[k] > high) high = px[k];
    }
    return px[index] / high - 1.0;
  }
  if (signal.type === "pullback") {
    // How far the price has fallen over the window: 0.08 means down 8%.
    const base = index - (signal.days as number);
    if (base < 0 || Number.isNaN(px[base]) || px[base] <= 0) return Number.NaN;
    return -(px[index] / px[base] - 1.0);
  }
  if (signal.type === "size") {
    const factor = panel.sizeFactors[symbol];
    if (typeof factor !== "number" || !(factor > 0)) return Number.NaN;
    return factor * px[index];
  }
  if (signal.type === "congress_net_buying") {
    const [buys, sells] = congressCounts(symbol, index, signal.window_days as number, panel);
    return buys - sells;
  }
  if (signal.type === "fundamental") {
    const value = (panel.fundamentals[symbol] ?? {})[signal.field as string];
    if (typeof value !== "number" || Number.isNaN(value)) return Number.NaN;
    return value;
  }
  return Number.NaN;
}

type Row = { symbol: string; values: Record<string, number> };

/** What the rules hold given closes up to and including `index`. */
export function select(spec: RuleSpec, panel: Panel, index: number): Picks {
  let pool: string[] = [];
  for (const symbol of panel.universe) {
    const price = (panel.px.get(symbol) as Float64Array)[index];
    if (Number.isNaN(price) || price <= 0) continue;
    const seen = (panel.obs.get(symbol) as Int32Array)[index];
    if (seen < 0 || index - seen > MAX_STALE_SESSIONS) continue;
    pool.push(symbol);
  }
  const candidates = pool.length;

  const sizes = new Map<string, number>();
  const top = spec.universe.top_by_size;
  if (top !== null) {
    const sized: { symbol: string; value: number }[] = [];
    for (const symbol of pool) {
      const value = signalValue({ type: "size" }, symbol, index, panel);
      if (!Number.isNaN(value)) sized.push({ symbol, value });
    }
    sized.sort((a, b) => (a.value !== b.value ? (a.value > b.value ? -1 : 1) : compareText(a.symbol, b.symbol)));
    for (const item of sized.slice(0, top)) sizes.set(item.symbol, item.value);
    pool = [...sizes.keys()].sort(compareText);
  }

  const signals = specSignals(spec);
  const keys = signals.map(signalKey);
  const rows: Row[] = [];
  for (const symbol of pool) {
    const values: Record<string, number> = {};
    let usable = true;
    for (let position = 0; position < signals.length; position += 1) {
      const value = signalValue(signals[position], symbol, index, panel);
      if (Number.isNaN(value)) {
        usable = false;
        break;
      }
      values[keys[position]] = value;
    }
    if (!usable) continue;
    let passed = true;
    for (const rule of spec.filters) {
      const value = values[signalKey(rule)];
      if (rule.min !== null && value < rule.min) passed = false;
      if (rule.max !== null && value > rule.max) passed = false;
    }
    if (!passed) continue;
    if (sizes.has(symbol) && !("size" in values)) values.size = sizes.get(symbol) as number;
    for (const signal of signals) {
      if (signal.type === "congress_net_buying") {
        const [buys, sells] = congressCounts(symbol, index, signal.window_days as number, panel);
        values.congress_buys = buys;
        values.congress_sells = sells;
      }
    }
    rows.push({ symbol, values });
  }
  const eligible = rows.length;

  let marketOk = true;
  if (spec.market_filter !== null && panel.px.has(spec.market_filter.symbol)) {
    const gauge = signalValue(
      { type: "trend", ma_days: spec.market_filter.ma_days },
      spec.market_filter.symbol,
      index,
      panel,
    );
    if (!Number.isNaN(gauge) && gauge < 0) marketOk = false;
  }

  const holdings: PickedHolding[] = [];
  if (marketOk && eligible > 0) {
    const composite = new Array<number>(eligible).fill(0.0);
    let totalWeight = 0;
    const indices = rows.map((_, i) => i);
    for (const rule of spec.rank) {
      const key = signalKey(rule);
      const sign = lowerIsBetter(rule) ? 1.0 : -1.0;
      const order = [...indices].sort((a, b) => {
        const va = sign * rows[a].values[key];
        const vb = sign * rows[b].values[key];
        if (va !== vb) return va < vb ? -1 : 1;
        return compareText(rows[a].symbol, rows[b].symbol);
      });
      for (let place = 0; place < order.length; place += 1) {
        const share = eligible === 1 ? 1.0 : 1.0 - place / (eligible - 1);
        composite[order[place]] += rule.weight * share;
      }
      totalWeight += rule.weight;
    }
    for (let i = 0; i < eligible; i += 1) composite[i] = composite[i] / totalWeight;
    const final = [...indices].sort((a, b) => {
      if (composite[a] !== composite[b]) return composite[a] > composite[b] ? -1 : 1;
      return compareText(rows[a].symbol, rows[b].symbol);
    });
    const slots = spec.holdings;
    const chosen = final.slice(0, slots);
    const denominator = (slots * (slots + 1)) / 2.0;
    for (let place = 0; place < chosen.length; place += 1) {
      const row = rows[chosen[place]];
      holdings.push({
        symbol: row.symbol,
        weight: spec.weighting === "rank" ? (slots - place) / denominator : 1.0 / slots,
        score: composite[chosen[place]],
        rank: place + 1,
        values: row.values,
      });
    }
  }

  return { signal_date: panel.calendar[index], candidates, eligible, market_ok: marketOk, holdings };
}

// -- statistics ---------------------------------------------------------------

/** Return, risk and drawdown for a curve that started at 100 before its first point. */
export function curveStats(dates: string[], curve: number[]): CurveStats {
  const count = curve.length;
  const last = curve[count - 1];
  const totalReturn = last / 100.0 - 1.0;
  const years = (dayNumber(dates[count - 1]) - dayNumber(dates[0])) / 365.25;

  let annualized: number | null = null;
  if (years >= 1.0 && last > 0) annualized = Math.pow(last / 100.0, 1.0 / years) - 1.0;

  const returns: number[] = [];
  for (let i = 1; i < count; i += 1) returns.push(curve[i] / curve[i - 1] - 1.0);
  let volatility: number | null = null;
  let sharpe: number | null = null;
  if (returns.length >= 20) {
    let total = 0.0;
    for (const value of returns) total += value;
    const mean = total / returns.length;
    let squares = 0.0;
    for (const value of returns) {
      const gap = value - mean;
      squares += gap * gap;
    }
    const deviation = Math.sqrt(squares / (returns.length - 1));
    volatility = deviation * SQRT252;
    if (returns.length >= 60 && deviation > 0) sharpe = (mean / deviation) * SQRT252;
  }

  let peak = 100.0;
  let peakDate = dates[0];
  let worst = 0.0;
  let worstPeak = dates[0];
  let worstTrough = dates[0];
  for (let i = 0; i < count; i += 1) {
    if (curve[i] > peak) {
      peak = curve[i];
      peakDate = dates[i];
    }
    const drop = curve[i] / peak - 1.0;
    if (drop < worst) {
      worst = drop;
      worstPeak = peakDate;
      worstTrough = dates[i];
    }
  }

  return {
    total_return: r6(totalReturn),
    annualized_return: annualized === null ? null : r6(annualized),
    volatility: volatility === null ? null : r6(volatility),
    sharpe: sharpe === null ? null : r6(sharpe),
    max_drawdown: r6(worst),
    max_drawdown_peak: worstPeak,
    max_drawdown_trough: worstTrough,
    final_value: r4(last),
  };
}

function yearRow(year: string, sessions: number, s0: number, s1: number, b0: number, b1: number): YearRow {
  const strategyReturn = s1 / s0 - 1.0;
  const benchmarkReturn = b1 / b0 - 1.0;
  return {
    year: Number(year),
    strategy: r6(strategyReturn),
    benchmark: r6(benchmarkReturn),
    beat: strategyReturn > benchmarkReturn,
    complete: sessions >= 240,
    sessions,
  };
}

export function yearlyTable(dates: string[], strategy: number[], benchmark: number[]): YearRow[] {
  const rows: YearRow[] = [];
  let startStrategy = 100.0;
  let startBenchmark = 100.0;
  let year = dates[0].slice(0, 4);
  let sessions = 0;
  for (let i = 0; i < dates.length; i += 1) {
    const thisYear = dates[i].slice(0, 4);
    if (thisYear !== year) {
      rows.push(yearRow(year, sessions, startStrategy, strategy[i - 1], startBenchmark, benchmark[i - 1]));
      startStrategy = strategy[i - 1];
      startBenchmark = benchmark[i - 1];
      year = thisYear;
      sessions = 0;
    }
    sessions += 1;
  }
  const last = dates.length - 1;
  rows.push(yearRow(year, sessions, startStrategy, strategy[last], startBenchmark, benchmark[last]));
  return rows;
}

// -- caveats ------------------------------------------------------------------

function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) out = out.split(`{${key}}`).join(value);
  return out;
}

function tenths(value: number): string {
  const scaled = Math.floor(Math.abs(value) * 10.0 + 0.5);
  return `${Math.floor(scaled / 10)}.${scaled % 10}`;
}

function bpsAsPct(bps: number): string {
  const whole = Math.floor(bps / 100);
  const cents = bps % 100;
  if (cents === 0) return String(whole);
  if (cents % 10 === 0) return `${whole}.${Math.floor(cents / 10)}`;
  return `${whole}.${Math.floor(cents / 10)}${cents % 10}`;
}

export function periodWords(first: string, last: string): string {
  const days = dayNumber(last) - dayNumber(first);
  const years = days / 365.25;
  if (years < 1.0) {
    const months = Math.floor(days / 30.44 + 0.5);
    if (months < 1) return "less than a month";
    if (months === 1) return "about 1 month";
    return `about ${months} months`;
  }
  return `about ${tenths(years)} years`;
}

export function buildCaveats(
  flags: string[],
  values: Record<string, string>,
  catalog: CaveatCatalog = caveatCatalog as CaveatCatalog,
): Caveat[] {
  const out: Caveat[] = [];
  for (const id of catalog.order) {
    if (!flags.includes(id)) continue;
    const item = catalog.items[id];
    out.push({ id, title: fill(item.title, values), text: fill(item.text, values) });
  }
  return out;
}

const REBALANCE_WORD: Record<string, string> = { weekly: "week", monthly: "month", quarterly: "quarter" };

// -- the backtest -------------------------------------------------------------

type Position = { symbol: string; value: number };

export function runBacktest(rawSpec: unknown, data: BacktestData, catalog?: CaveatCatalog): BacktestResult {
  const spec = normalizeSpec(rawSpec);
  if (!isBacktestable(spec)) {
    throw new BacktestError(
      "rules that use company financials cannot be backtested: we do not hold the figures as they were known on each past date",
    );
  }
  const panel = new Panel(spec, data);
  if (panel.universe.length === 0) throw new BacktestError("no price history for this universe");
  const calendar = panel.calendar;
  const size = panel.size;
  const need = lookbackSessions(spec);

  let lowerBound = spec.start;
  const usesCongress = usesSignal(spec, "congress_net_buying");
  if (usesCongress) {
    if (panel.eventsStart === null) throw new BacktestError("no congressional filings to test against");
    if (lowerBound === null || panel.eventsStart > lowerBound) lowerBound = panel.eventsStart;
  }

  const signalAt = new Map<number, number>();
  let firstTrade = -1;
  for (let i = need; i < size - 1; i += 1) {
    if (lowerBound !== null && calendar[i] < lowerBound) continue;
    if (periodKey(calendar[i], spec.rebalance) !== periodKey(calendar[i + 1], spec.rebalance)) {
      signalAt.set(i + 1, i);
      if (firstTrade < 0) firstTrade = i + 1;
    }
  }
  if (firstTrade < 0) throw new BacktestError("not enough price history for these rules");

  const bench = panel.px.get(spec.benchmark) as Float64Array;
  const benchStart = bench[firstTrade];
  const rate = spec.cost_bps / 10000.0;

  let equity = 100.0;
  let cash = 100.0;
  let positions: Position[] = [];
  const dates: string[] = [];
  const strategyCurve: number[] = [];
  const benchmarkCurve: number[] = [];
  const rebalances: RebalanceRecord[] = [];
  let costDrag = 0.0;
  let turnoverSum = 0.0;
  let turnoverCount = 0;
  let maxCash = 0.0;
  let cashSum = 0.0;
  let firstEligible = 0;
  let lastEligible = 0;
  let firstCandidates = 0;
  let lastCandidates = 0;

  for (let i = firstTrade; i < size; i += 1) {
    if (i > firstTrade) {
      let total = cash;
      for (const position of positions) {
        const px = panel.px.get(position.symbol) as Float64Array;
        position.value = position.value * (px[i] / px[i - 1]);
        total += position.value;
      }
      equity = total;
    }

    const signalIndex = signalAt.get(i);
    if (signalIndex !== undefined) {
      const picked = select(spec, panel, signalIndex);
      const target = picked.holdings;
      const current = new Map<string, number>();
      for (const position of positions) current.set(position.symbol, position.value / equity);
      const targetSymbols = new Set<string>();
      let traded = 0.0;
      for (const holding of target) {
        targetSymbols.add(holding.symbol);
        traded += Math.abs(holding.weight - (current.get(holding.symbol) ?? 0.0));
      }
      for (const position of positions) {
        if (!targetSymbols.has(position.symbol)) traded += current.get(position.symbol) as number;
      }
      const cost = equity * rate * traded;
      costDrag += rate * traded;
      equity = equity - cost;
      let invested = 0.0;
      const nextPositions: Position[] = [];
      let weightSum = 0.0;
      for (const holding of target) {
        const value = holding.weight * equity;
        nextPositions.push({ symbol: holding.symbol, value });
        invested += value;
        weightSum += holding.weight;
      }
      cash = equity - invested;
      let cashWeight = 1.0 - weightSum;
      if (cashWeight < 1e-12) cashWeight = 0.0;
      const added = [...targetSymbols].filter((symbol) => !current.has(symbol)).sort(compareText);
      const dropped = [...current.keys()].filter((symbol) => !targetSymbols.has(symbol)).sort(compareText);
      if (rebalances.length > 0) {
        turnoverSum += traded / 2.0;
        turnoverCount += 1;
      } else {
        firstEligible = picked.eligible;
        firstCandidates = picked.candidates;
      }
      lastEligible = picked.eligible;
      lastCandidates = picked.candidates;
      if (cashWeight > maxCash) maxCash = cashWeight;
      cashSum += cashWeight;
      rebalances.push({
        signal_date: picked.signal_date,
        trade_date: calendar[i],
        holdings: target.map((h) => ({ symbol: h.symbol, weight: r6(h.weight), score: r6(h.score) })),
        added,
        dropped,
        turnover: r6(traded / 2.0),
        cash: r6(cashWeight),
        eligible: picked.eligible,
        candidates: picked.candidates,
        market_ok: picked.market_ok,
      });
      positions = nextPositions;
    }

    dates.push(calendar[i]);
    strategyCurve.push(equity);
    benchmarkCurve.push((100.0 * bench[i]) / benchStart);
  }

  const strategyStats = curveStats(dates, strategyCurve);
  const benchmarkStats = curveStats(dates, benchmarkCurve);
  const yearsTable = yearlyTable(dates, strategyCurve, benchmarkCurve);
  const complete = yearsTable.filter((row) => row.complete);
  const counted = complete.length > 0 ? complete : yearsTable;
  let beat = 0;
  let worstYear: YearRow | null = null;
  let bestYear: YearRow | null = null;
  for (const row of counted) {
    if (row.beat) beat += 1;
    if (worstYear === null || row.strategy < worstYear.strategy) worstYear = row;
    if (bestYear === null || row.strategy > bestYear.strategy) bestYear = row;
  }

  const lastDate = dates[dates.length - 1];
  const spanYears = (dayNumber(lastDate) - dayNumber(dates[0])) / 365.25;
  const annualTurnover = spanYears >= 1.0 ? r6(turnoverSum / spanYears) : null;

  const flags = ["backtest_label", "timing", "benchmark", "definitions"];
  const kind = data.universe_kind || "stocks";
  if (kind === "funds") {
    flags.push("fixed_funds");
    if (panel.universe.includes("XLRE") || panel.universe.includes("XLC")) flags.push("fund_start_dates");
  } else {
    flags.push("survivorship");
    if (data.universe_partial) flags.push("partial_index");
  }
  if (spec.universe.top_by_size !== null || usesSignal(spec, "size")) flags.push("estimated_size");
  if (usesCongress) flags.push("congress_filings");
  if (spanYears < 3.0) flags.push("short_record");
  flags.push(spec.cost_bps > 0 ? "costs" : "no_costs");
  if (maxCash > 1e-9) flags.push("cash");
  const label = String(data.universe_label || "companies");
  const values: Record<string, string> = {
    start: formatDay(dates[0]),
    end: formatDay(lastDate),
    candidates: String(panel.universe.length),
    universe_label: label,
    events_start: panel.eventsStart ? formatDay(panel.eventsStart) : "",
    period_words: periodWords(dates[0], lastDate),
    rebalance_period: REBALANCE_WORD[spec.rebalance],
    cost_bps: String(spec.cost_bps),
    cost_pct: bpsAsPct(spec.cost_bps),
    cost_drag_pct: tenths(costDrag * 100.0),
    holdings: String(spec.holdings),
    benchmark: spec.benchmark,
  };

  return {
    spec,
    period: {
      start: dates[0],
      end: lastDate,
      first_signal: rebalances[0].signal_date,
      years: r6(spanYears),
      sessions: dates.length,
    },
    universe: {
      label,
      kind,
      symbols: panel.universe.length,
      candidates_first: firstCandidates,
      candidates_last: lastCandidates,
      eligible_first: firstEligible,
      eligible_last: lastEligible,
    },
    summary: { strategy: strategyStats, benchmark: benchmarkStats },
    years: yearsTable,
    hit_rate: { beat, years: counted.length, complete_years_only: complete.length > 0 },
    worst_year: worstYear,
    best_year: bestYear,
    turnover: {
      per_rebalance: turnoverCount > 0 ? r6(turnoverSum / turnoverCount) : null,
      annual: annualTurnover,
      rebalances: rebalances.length,
    },
    costs: { bps: spec.cost_bps, total_drag: r6(costDrag) },
    cash: { average: r6(cashSum / rebalances.length), max: r6(maxCash) },
    curve: {
      dates,
      strategy: strategyCurve.map(r4),
      benchmark: benchmarkCurve.map(r4),
    },
    rebalances,
    caveats: buildCaveats(flags, values, catalog),
  };
}

/** What the rules hold as of the last session in the data. Works for fundamental specs too. */
export function currentPicks(rawSpec: unknown, data: BacktestData): Picks {
  const spec = normalizeSpec(rawSpec);
  const panel = new Panel(spec, data);
  const picked = select(spec, panel, panel.size - 1);
  return {
    ...picked,
    holdings: picked.holdings.map((h) => ({
      symbol: h.symbol,
      weight: r6(h.weight),
      score: r6(h.score),
      rank: h.rank,
      values: Object.fromEntries(Object.entries(h.values).map(([key, value]) => [key, r6(value)])),
    })),
  };
}

// -- fixed weights (the self-serve backtester) --------------------------------

export const WEIGHTS_REBALANCE = ["never", "monthly", "quarterly", "yearly"] as const;
export const WEIGHTS_MAX_HOLDINGS = 30;
const WEIGHTS_PERIOD_WORD: Record<string, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };

/** We hold no price history for some of the tickers asked for. */
export class MissingHistoryError extends BacktestError {
  symbols: string[];
  constructor(symbols: string[]) {
    super(`no price history for ${symbols.join(", ")}`);
    this.name = "MissingHistoryError";
    this.symbols = symbols;
  }
}

/** Validate a fixed-weights request. Weights are rescaled to add up to 1. */
export function normalizeWeightsInput(raw: unknown): WeightsInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError("input must be an object");
  const item = raw as Record<string, unknown>;
  const rawHoldings = item.holdings;
  if (!Array.isArray(rawHoldings) || rawHoldings.length === 0) throw new SpecError("add at least one ticker");
  if (rawHoldings.length > WEIGHTS_MAX_HOLDINGS) {
    throw new SpecError(`a portfolio can hold at most ${WEIGHTS_MAX_HOLDINGS} tickers`);
  }
  const symbols: string[] = [];
  const weights: number[] = [];
  let total = 0.0;
  for (const entry of rawHoldings) {
    const holding = entry as Record<string, unknown> | null;
    if (!holding || typeof holding !== "object" || typeof holding.symbol !== "string") {
      throw new SpecError("each holding needs a ticker");
    }
    const ticker = holding.symbol.trim().toUpperCase();
    if (!ticker || ticker.length > 12) throw new SpecError("a ticker is invalid");
    if (symbols.includes(ticker)) throw new SpecError(`${ticker} is listed twice`);
    const weight = holding.weight;
    if (!isRealNumber(weight)) throw new SpecError(`${ticker} needs a weight`);
    if (!Number.isFinite(weight) || !(weight > 0)) throw new SpecError(`the weight for ${ticker} must be above zero`);
    symbols.push(ticker);
    weights.push(weight);
    total += weight;
  }
  const rebalance = item.rebalance === undefined ? "monthly" : item.rebalance;
  if (typeof rebalance !== "string" || !(WEIGHTS_REBALANCE as readonly string[]).includes(rebalance)) {
    throw new SpecError("rebalance must be never, monthly, quarterly or yearly");
  }
  const benchmark = item.benchmark === undefined ? "SPY" : item.benchmark;
  if (typeof benchmark !== "string" || !benchmark.trim() || benchmark.length > 12) {
    throw new SpecError("benchmark is invalid");
  }
  const start = isoOrNull(item.start, "start");
  const end = isoOrNull(item.end, "end");
  if (start && end && start >= end) throw new SpecError("start must be before end");
  return {
    version: 1,
    holdings: symbols.map((symbol, index) => ({ symbol, weight: weights[index] / total })),
    rebalance: rebalance as WeightsInput["rebalance"],
    benchmark: benchmark.trim().toUpperCase(),
    start,
    end,
    cost_bps: intIn(item.cost_bps, "cost_bps", LIMITS.cost_bps[0], LIMITS.cost_bps[1], 10),
  };
}

/**
 * Buy a fixed set of weights at one close, hold, and reset on a schedule.
 *
 * The portfolio is bought at the close of the first session on or after
 * `start` on which every ticker has a price. Nothing is invented for a ticker
 * that listed later: the test starts later instead, and says so.
 */
export function runWeightsBacktest(
  rawInput: unknown,
  prices: Record<string, { dates: string[]; closes: number[] }>,
  catalog?: CaveatCatalog,
): WeightsResult {
  const spec = normalizeWeightsInput(rawInput);
  const symbols = spec.holdings.map((holding) => holding.symbol);
  const missing: string[] = [];
  for (const symbol of [...symbols, spec.benchmark]) {
    const series = prices[symbol];
    if ((!series || !series.dates || series.dates.length === 0) && !missing.includes(symbol)) missing.push(symbol);
  }
  if (missing.length > 0) throw new MissingHistoryError(missing);

  const panel = new Panel(
    { benchmark: spec.benchmark, end: spec.end, market_filter: null },
    { prices, universe: symbols },
  );
  const calendar = panel.calendar;
  const size = panel.size;

  let asked = 0;
  if (spec.start !== null) {
    asked = size;
    for (let i = 0; i < size; i += 1) {
      if (calendar[i] >= spec.start) {
        asked = i;
        break;
      }
    }
  }
  const firstSeen: number[] = [];
  for (const symbol of symbols) {
    const px = panel.px.get(symbol) as Float64Array;
    let seen = -1;
    for (let i = 0; i < size; i += 1) {
      if (!Number.isNaN(px[i])) {
        seen = i;
        break;
      }
    }
    firstSeen.push(seen);
  }
  let first = asked;
  let limitedBy: string | null = null;
  for (let k = 0; k < symbols.length; k += 1) {
    const seen = firstSeen[k];
    if (seen < 0) throw new MissingHistoryError([symbols[k]]);
    if (seen > first) {
      first = seen;
      limitedBy = symbols[k];
    }
  }
  if (first >= size - 1) {
    throw new BacktestError("these tickers do not share enough price history in that period");
  }

  const bench = panel.px.get(spec.benchmark) as Float64Array;
  const benchStart = bench[first];
  const rate = spec.cost_bps / 10000.0;
  const rebalance = spec.rebalance;
  const series = symbols.map((symbol) => panel.px.get(symbol) as Float64Array);

  let costDrag = rate;
  let equity = 100.0 - 100.0 * rate;
  const values = spec.holdings.map((holding) => holding.weight * equity);
  const dates: string[] = [];
  const strategyCurve: number[] = [];
  const benchmarkCurve: number[] = [];
  let turnoverSum = 0.0;
  let rebalances = 0;
  for (let i = first; i < size; i += 1) {
    if (i > first) {
      let total = 0.0;
      for (let k = 0; k < symbols.length; k += 1) {
        const px = series[k];
        values[k] = values[k] * (px[i] / px[i - 1]);
        total += values[k];
      }
      equity = total;
      if (rebalance !== "never" && periodKey(calendar[i], rebalance) !== periodKey(calendar[i - 1], rebalance)) {
        let traded = 0.0;
        for (let k = 0; k < symbols.length; k += 1) {
          traded += Math.abs(spec.holdings[k].weight - values[k] / equity);
        }
        costDrag += rate * traded;
        equity = equity - equity * rate * traded;
        for (let k = 0; k < symbols.length; k += 1) values[k] = spec.holdings[k].weight * equity;
        turnoverSum += traded / 2.0;
        rebalances += 1;
      }
    }
    dates.push(calendar[i]);
    strategyCurve.push(equity);
    benchmarkCurve.push((100.0 * bench[i]) / benchStart);
  }

  const last = size - 1;
  const strategyStats = curveStats(dates, strategyCurve);
  const benchmarkStats = curveStats(dates, benchmarkCurve);
  const yearsTable = yearlyTable(dates, strategyCurve, benchmarkCurve);
  const complete = yearsTable.filter((row) => row.complete);
  const counted = complete.length > 0 ? complete : yearsTable;
  let beat = 0;
  let worstYear: YearRow | null = null;
  let bestYear: YearRow | null = null;
  for (const row of counted) {
    if (row.beat) beat += 1;
    if (worstYear === null || row.strategy < worstYear.strategy) worstYear = row;
    if (bestYear === null || row.strategy > bestYear.strategy) bestYear = row;
  }
  const lastDate = dates[dates.length - 1];
  const spanYears = (dayNumber(lastDate) - dayNumber(dates[0])) / 365.25;

  const holdingsOut = symbols.map((symbol, k) => {
    const px = series[k];
    const seen = (panel.obs.get(symbol) as Int32Array)[last];
    return {
      symbol,
      weight: r6(spec.holdings[k].weight),
      end_weight: r6(values[k] / equity),
      first_date: calendar[firstSeen[k]],
      last_price_date: seen >= 0 ? calendar[seen] : null,
      total_return: r6(px[last] / px[first] - 1.0),
    };
  });

  const flags = ["backtest_label", "hindsight_picks", "weights_timing", "benchmark", "definitions"];
  if (limitedBy !== null) flags.push("late_start");
  if (spanYears < 3.0) flags.push("short_record");
  flags.push(spec.cost_bps > 0 ? "costs" : "no_costs");
  const rebalanceSentence =
    rebalance === "never"
      ? "It is never rebalanced, so the weights drift with prices."
      : `It is reset to your weights at the close of the first session of each ${WEIGHTS_PERIOD_WORD[rebalance]}.`;
  const fillValues: Record<string, string> = {
    start: formatDay(dates[0]),
    end: formatDay(lastDate),
    start_year: dates[0].slice(0, 4),
    asked_start: asked < size ? formatDay(calendar[asked]) : "",
    limited_symbol: limitedBy ?? "",
    limited_date: formatDay(calendar[first]),
    period_words: periodWords(dates[0], lastDate),
    rebalance_sentence: rebalanceSentence,
    cost_bps: String(spec.cost_bps),
    cost_pct: bpsAsPct(spec.cost_bps),
    cost_drag_pct: tenths(costDrag * 100.0),
    benchmark: spec.benchmark,
  };

  return {
    input: {
      version: 1,
      holdings: spec.holdings.map((h) => ({ symbol: h.symbol, weight: r6(h.weight) })),
      rebalance,
      benchmark: spec.benchmark,
      start: spec.start,
      end: spec.end,
      cost_bps: spec.cost_bps,
    },
    period: {
      start: dates[0],
      end: lastDate,
      asked_start: spec.start,
      years: r6(spanYears),
      sessions: dates.length,
    },
    limited_by: limitedBy === null ? null : { symbol: limitedBy, first_date: calendar[first] },
    summary: { strategy: strategyStats, benchmark: benchmarkStats },
    years: yearsTable,
    hit_rate: { beat, years: counted.length, complete_years_only: complete.length > 0 },
    worst_year: worstYear,
    best_year: bestYear,
    turnover: {
      annual: spanYears >= 1.0 ? r6(turnoverSum / spanYears) : null,
      rebalances,
    },
    costs: { bps: spec.cost_bps, total_drag: r6(costDrag) },
    holdings: holdingsOut,
    curve: {
      dates,
      strategy: strategyCurve.map(r4),
      benchmark: benchmarkCurve.map(r4),
    },
    caveats: buildCaveats(flags, fillValues, catalog),
  };
}
