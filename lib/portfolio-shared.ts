/**
 * The Portfolio page's model: pure functions and types, safe on both sides.
 *
 * Everything here is derived from data the app already stores: the user's
 * tracked list and manual holdings (`users/{uid}`), the materialised watchlist
 * rows, the earnings calendar, and adjusted daily closes. Nothing is written.
 *
 * Rule for missing data: a number that cannot be computed is `null` and the UI
 * shows a dash. A holding with no share count has no value, no weight and no
 * gain; it is never counted as zero.
 */

export type PositionKind = "holding" | "watchlist";

/** The sector label for index funds in a portfolio: they hold every sector, so they are not counted as one. */
export const FUNDS_SECTOR = "Funds";
export type Tone = "bull" | "bear" | "neutral";

export type PortfolioRowInput = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string | null;
  kind: PositionKind;
  price: number | null;
  day_change_pct: number | null;
  stance: string | null;
  zones?: { accumulate_below?: number | null; trim_above?: number | null; breakout_above?: number | null } | null;
  needs_attention?: boolean;
  attention_direction?: "bullish" | "bearish" | "neutral" | null;
  reason?: string | null;
  /** Fallback when the earnings calendar has nothing for the ticker. */
  earnings_date?: string | null;
};

export type HoldingInput = {
  quantity?: number | null;
  market_value?: number | null;
  average_cost?: number | null;
  updated_at?: string | null;
};

export type DailySeries = { dates: string[]; closes: number[] };

export type EarningsDate = { date: string; time: "bmo" | "amc" | "during" | null };

export type SinceSaved = {
  fromDate: string;
  toDate: string;
  pct: number;
  /** S&P 500 (SPY, dividends included) over the same dates. Null when SPY is missing. */
  benchmarkPct: number | null;
};

export type PortfolioPosition = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string | null;
  kind: PositionKind;
  price: number | null;
  dayPct: number | null;
  shares: number | null;
  avgCost: number | null;
  /** shares x price when both exist, else the value the user typed in, else null. */
  value: number | null;
  valueSource: "shares" | "entered" | null;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  dayMove: number | null;
  /** Share of the valued holdings, 0 to 100. */
  weight: number | null;
  stance: string | null;
  zone: { label: string; tone: Tone } | null;
  needsAttention: boolean;
  attentionDirection: "bullish" | "bearish" | "neutral" | null;
  reason: string | null;
  nextEarnings: EarningsDate | null;
  savedAt: string | null;
  beta: number | null;
  /** Annualised volatility of daily returns over the last year, percent. */
  volatility: number | null;
  sinceSaved: SinceSaved | null;
};

export type AllocationSlice = { label: string; weight: number; value: number | null; count: number };

export type PortfolioTotals = {
  holdings: number;
  watching: number;
  /** Holdings that have a value. */
  valued: number;
  value: number | null;
  dayMove: number | null;
  dayPct: number | null;
  /** Holdings that have both a value and a cost basis. */
  withCost: number;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
};

export type PortfolioAnalytics = {
  /** "value" when weights come from position values, "count" when no holding has one (equal weight). */
  basis: "value" | "count" | null;
  bySector: AllocationSlice[];
  byPosition: AllocationSlice[];
  top1: number | null;
  top3: number | null;
  /** 1 / sum(w^2): how many equal-sized positions this spread is worth. */
  effectivePositions: number | null;
  beta: number | null;
  betaCoverage: number;
  volatility: number | null;
  benchmarkVolatility: number | null;
  /** Last close used for beta and volatility. */
  pricesAsOf: string | null;
  statsWindowDays: number | null;
};

export type Portfolio = {
  positions: PortfolioPosition[];
  watching: PortfolioPosition[];
  totals: PortfolioTotals;
  analytics: PortfolioAnalytics;
};

export type PortfolioInputs = {
  rows: PortfolioRowInput[];
  holdings?: Record<string, HoldingInput | undefined> | null;
  earnings?: Map<string, EarningsDate> | null;
  series?: Map<string, DailySeries> | null;
  benchmark?: DailySeries | null;
  /** YYYY-MM-DD in New York. Earnings before this are ignored. */
  today: string;
};

const STATS_WINDOW = 252;
const MIN_STATS_DAYS = 60;

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): number | null {
  return fin(value) && value > 0 ? value : null;
}

/** "Add below $180" / "Trim above $240", from the call's own price zones. */
export function zoneFor(row: Pick<PortfolioRowInput, "stance" | "zones" | "price">): PortfolioPosition["zone"] {
  const zones = row.zones;
  if (!zones) return null;
  const stance = (row.stance ?? "").toLowerCase();
  const add = positive(zones.accumulate_below);
  const trim = positive(zones.trim_above);
  const breakout = positive(zones.breakout_above);
  const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
  if ((stance === "trim" || stance === "avoid") && trim) return { label: `Trim above ${money(trim)}`, tone: "bear" };
  if (add) return { label: `Add below ${money(add)}`, tone: "bull" };
  if (trim) return { label: `Trim above ${money(trim)}`, tone: "bear" };
  if (breakout) return { label: `Breakout above ${money(breakout)}`, tone: "neutral" };
  return null;
}

/** Daily simple returns keyed by date, last `window` trading days. */
export function dailyReturns(series: DailySeries | null | undefined, window = STATS_WINDOW): Map<string, number> {
  const out = new Map<string, number>();
  if (!series) return out;
  const n = Math.min(series.dates.length, series.closes.length);
  const start = Math.max(1, n - window);
  for (let i = start; i < n; i++) {
    const prev = series.closes[i - 1];
    const cur = series.closes[i];
    const date = series.dates[i];
    if (fin(prev) && fin(cur) && prev > 0 && cur > 0 && typeof date === "string") out.set(date, cur / prev - 1);
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Annualised volatility in percent, or null with too little history. */
export function annualisedVolatility(returns: number[]): number | null {
  if (returns.length < MIN_STATS_DAYS) return null;
  const avg = mean(returns);
  const variance = returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Beta of `asset` against `benchmark` on the dates both traded. */
export function betaAgainst(asset: Map<string, number>, benchmark: Map<string, number>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, value] of asset) {
    const bench = benchmark.get(date);
    if (bench !== undefined) {
      xs.push(bench);
      ys.push(value);
    }
  }
  if (xs.length < MIN_STATS_DAYS) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    varx += (xs[i]! - mx) ** 2;
  }
  return varx > 0 ? cov / varx : null;
}

function closeOnOrAfter(series: DailySeries, day: string): { date: string; close: number } | null {
  for (let i = 0; i < Math.min(series.dates.length, series.closes.length); i++) {
    const date = series.dates[i]!;
    const close = series.closes[i];
    if (date >= day && fin(close) && close > 0) return { date, close };
  }
  return null;
}

function lastClose(series: DailySeries): { date: string; close: number } | null {
  for (let i = Math.min(series.dates.length, series.closes.length) - 1; i >= 0; i--) {
    const close = series.closes[i];
    if (fin(close) && close > 0) return { date: series.dates[i]!, close };
  }
  return null;
}

/** Return from the first close on or after `savedAt` to the last close, with the benchmark over the same dates. */
export function performanceSince(
  savedAt: string | null | undefined,
  series: DailySeries | null | undefined,
  benchmark: DailySeries | null | undefined,
): SinceSaved | null {
  const day = typeof savedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(savedAt) ? savedAt.slice(0, 10) : null;
  if (!day || !series) return null;
  const from = closeOnOrAfter(series, day);
  const to = lastClose(series);
  if (!from || !to || to.date <= from.date) return null;
  let benchmarkPct: number | null = null;
  if (benchmark) {
    const benchFrom = closeOnOrAfter(benchmark, from.date);
    const benchTo = closeOnOrAfter(benchmark, to.date);
    if (benchFrom && benchTo && benchFrom.date === from.date && benchTo.date === to.date) {
      benchmarkPct = (benchTo.close / benchFrom.close - 1) * 100;
    }
  }
  return { fromDate: from.date, toDate: to.date, pct: (to.close / from.close - 1) * 100, benchmarkPct };
}

function slices(entries: Array<{ label: string; weight: number; value: number | null }>): AllocationSlice[] {
  const merged = new Map<string, AllocationSlice>();
  for (const entry of entries) {
    const current = merged.get(entry.label);
    if (current) {
      current.weight += entry.weight;
      current.count += 1;
      current.value = current.value === null || entry.value === null ? null : current.value + entry.value;
    } else {
      merged.set(entry.label, { label: entry.label, weight: entry.weight, value: entry.value, count: 1 });
    }
  }
  return [...merged.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

export function buildPortfolio(inputs: PortfolioInputs): Portfolio {
  const holdings = inputs.holdings ?? {};
  const benchReturns = dailyReturns(inputs.benchmark);
  const returnsByTicker = new Map<string, Map<string, number>>();

  const all: PortfolioPosition[] = inputs.rows.map((row) => {
    const holding = row.kind === "holding" ? holdings[row.instrument_id] : undefined;
    const shares = positive(holding?.quantity);
    const avgCost = positive(holding?.average_cost);
    const entered = positive(holding?.market_value);
    const price = positive(row.price);
    const dayPct = fin(row.day_change_pct) ? row.day_change_pct : null;

    let value: number | null = null;
    let valueSource: PortfolioPosition["valueSource"] = null;
    if (row.kind === "holding") {
      if (shares !== null && price !== null) {
        value = shares * price;
        valueSource = "shares";
      } else if (entered !== null) {
        value = entered;
        valueSource = "entered";
      }
    }
    const cost = shares !== null && avgCost !== null ? shares * avgCost : null;
    const gain = valueSource === "shares" && value !== null && cost !== null ? value - cost : null;
    const gainPct = gain !== null && cost ? (gain / cost) * 100 : null;
    // Yesterday's value is value / (1 + day%); the day's move is the difference.
    const dayMove =
      valueSource === "shares" && value !== null && dayPct !== null && dayPct > -100
        ? value - value / (1 + dayPct / 100)
        : null;

    const series = inputs.series?.get(row.ticker) ?? null;
    const returns = dailyReturns(series);
    returnsByTicker.set(row.ticker, returns);
    const calendar = inputs.earnings?.get(row.ticker) ?? null;
    const fallback =
      row.earnings_date && row.earnings_date >= inputs.today ? { date: row.earnings_date, time: null } : null;

    return {
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: row.name,
      sector: row.sector && row.sector.trim() ? row.sector.trim() : null,
      kind: row.kind,
      price,
      dayPct,
      shares,
      avgCost,
      value,
      valueSource,
      cost,
      gain,
      gainPct,
      dayMove,
      weight: null,
      stance: row.stance,
      zone: zoneFor(row),
      needsAttention: Boolean(row.needs_attention),
      attentionDirection: row.attention_direction ?? null,
      reason: row.reason && row.reason.trim() ? row.reason.trim() : null,
      nextEarnings: calendar && calendar.date >= inputs.today ? calendar : fallback,
      savedAt: row.kind === "holding" && typeof holding?.updated_at === "string" ? holding.updated_at : null,
      beta: betaAgainst(returns, benchReturns),
      volatility: annualisedVolatility([...returns.values()]),
      sinceSaved:
        row.kind === "holding" ? performanceSince(holding?.updated_at, series, inputs.benchmark) : null,
    };
  });

  const positions = all.filter((position) => position.kind === "holding");
  const watching = all.filter((position) => position.kind === "watchlist");

  const valued = positions.filter((position) => position.value !== null);
  const totalValue = valued.reduce((sum, position) => sum + position.value!, 0);
  for (const position of valued) position.weight = totalValue > 0 ? (position.value! / totalValue) * 100 : null;

  const moved = valued.filter((position) => position.dayMove !== null);
  const dayMove = moved.length > 0 ? moved.reduce((sum, position) => sum + position.dayMove!, 0) : null;
  const movedValue = moved.reduce((sum, position) => sum + position.value!, 0);
  const dayPct = dayMove !== null && movedValue - dayMove > 0 ? (dayMove / (movedValue - dayMove)) * 100 : null;

  const withCost = positions.filter((position) => position.gain !== null && position.cost !== null);
  const cost = withCost.length > 0 ? withCost.reduce((sum, position) => sum + position.cost!, 0) : null;
  const gain = withCost.length > 0 ? withCost.reduce((sum, position) => sum + position.gain!, 0) : null;

  const totals: PortfolioTotals = {
    holdings: positions.length,
    watching: watching.length,
    valued: valued.length,
    value: valued.length > 0 ? totalValue : null,
    dayMove,
    dayPct,
    withCost: withCost.length,
    cost,
    gain,
    gainPct: gain !== null && cost ? (gain / cost) * 100 : null,
  };

  // Weights for the analytics: by value when any holding has one, else equal weight by count.
  const basis: PortfolioAnalytics["basis"] = positions.length === 0 ? null : valued.length > 0 ? "value" : "count";
  const weighted =
    basis === "value"
      ? valued.map((position) => ({ position, weight: position.weight ?? 0 }))
      : positions.map((position) => ({ position, weight: 100 / positions.length }));

  const byPosition = slices(
    weighted.map(({ position, weight }) => ({ label: position.ticker, weight, value: basis === "value" ? position.value : null })),
  );
  const bySector = slices(
    weighted.map(({ position, weight }) => ({
      label: position.sector ?? "Unclassified",
      weight,
      value: basis === "value" ? position.value : null,
    })),
  );
  const fractions = byPosition.map((slice) => slice.weight / 100);
  const hhi = fractions.reduce((sum, value) => sum + value * value, 0);

  // Beta: weighted average of the holdings that have one, weights rescaled to that set.
  const withBeta = weighted.filter(({ position }) => position.beta !== null);
  const betaWeight = withBeta.reduce((sum, { weight }) => sum + weight, 0);
  const beta =
    betaWeight > 0 ? withBeta.reduce((sum, { position, weight }) => sum + position.beta! * weight, 0) / betaWeight : null;

  // Volatility of the whole book at today's weights, on days every covered holding traded.
  let volatility: number | null = null;
  let statsDays: number | null = null;
  const covered = weighted.filter(({ position }) => (returnsByTicker.get(position.ticker)?.size ?? 0) >= MIN_STATS_DAYS);
  const coveredWeight = covered.reduce((sum, { weight }) => sum + weight, 0);
  if (covered.length > 0 && coveredWeight > 0) {
    const first = returnsByTicker.get(covered[0]!.position.ticker)!;
    const book: number[] = [];
    for (const date of first.keys()) {
      let total = 0;
      let complete = true;
      for (const { position, weight } of covered) {
        const value = returnsByTicker.get(position.ticker)!.get(date);
        if (value === undefined) {
          complete = false;
          break;
        }
        total += value * (weight / coveredWeight);
      }
      if (complete) book.push(total);
    }
    volatility = annualisedVolatility(book);
    statsDays = volatility !== null ? book.length : null;
  }

  const benchLast = inputs.benchmark ? lastClose(inputs.benchmark) : null;

  return {
    positions,
    watching,
    totals,
    analytics: {
      basis,
      bySector,
      byPosition,
      top1: byPosition[0]?.weight ?? null,
      top3: byPosition.length > 0 ? byPosition.slice(0, 3).reduce((sum, slice) => sum + slice.weight, 0) : null,
      effectivePositions: hhi > 0 ? 1 / hhi : null,
      beta,
      betaCoverage: withBeta.length,
      volatility,
      benchmarkVolatility: annualisedVolatility([...benchReturns.values()]),
      pricesAsOf: benchLast?.date ?? null,
      statsWindowDays: statsDays,
    },
  };
}

/* ── sorting ─────────────────────────────────────────────────────────────── */

export type SortKey =
  | "ticker"
  | "price"
  | "dayPct"
  | "shares"
  | "value"
  | "weight"
  | "gain"
  | "gainPct"
  | "stance"
  | "earnings";

const STANCE_ORDER: Record<string, number> = { accumulate: 0, hold: 1, watch: 2, trim: 3, avoid: 4 };

function sortValue(position: PortfolioPosition, key: SortKey): number | string | null {
  switch (key) {
    case "ticker":
      return position.ticker;
    case "price":
      return position.price;
    case "dayPct":
      return position.dayPct;
    case "shares":
      return position.shares;
    case "value":
      return position.value;
    case "weight":
      return position.weight;
    case "gain":
      return position.gain;
    case "gainPct":
      return position.gainPct;
    case "stance":
      return position.stance ? (STANCE_ORDER[position.stance.toLowerCase()] ?? 9) : null;
    case "earnings":
      return position.nextEarnings?.date ?? null;
  }
}

/** Stable sort. Rows with no value for the key always go last, in either direction. */
export function sortPositions(
  positions: PortfolioPosition[],
  key: SortKey,
  direction: "asc" | "desc",
): PortfolioPosition[] {
  const sign = direction === "asc" ? 1 : -1;
  return positions
    .map((position, index) => ({ position, index, value: sortValue(position, key) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const cmp =
        typeof a.value === "string" || typeof b.value === "string"
          ? String(a.value).localeCompare(String(b.value))
          : a.value - b.value;
      return cmp !== 0 ? cmp * sign : a.index - b.index;
    })
    .map((entry) => entry.position);
}

/* ── formatting shared by the tabs ───────────────────────────────────────── */

export function fmtMoney(value: number, digits = 2): string {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtSignedMoney(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${fmtMoney(value, digits)}`;
}

export function fmtSignedPct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
}

export function fmtShares(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-12" -> "Nov 12". */
export function fmtDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : "";
}

export function daysBetween(fromDay: string, toDay: string): number | null {
  const from = Date.parse(`${fromDay.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toDay.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/* ── tabs ────────────────────────────────────────────────────────────────── */

export const PORTFOLIO_TABS = ["positions", "watching", "analytics", "alerts"] as const;
export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export function parsePortfolioTab(value: string | null | undefined): PortfolioTab {
  return (PORTFOLIO_TABS as readonly string[]).includes(value ?? "") ? (value as PortfolioTab) : "positions";
}
