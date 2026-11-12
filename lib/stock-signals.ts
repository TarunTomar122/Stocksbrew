/**
 * Good and watch signals across the stock page's tabs (owner, Nov 12: "I need to know what's positive, what's not,
 * like what is good, what is bad, to help me decide if I should buy").
 *
 * Pure and versioned. Each rule turns one dated input into one verdict: good, watch or neutral. A missing, stale,
 * incomparable or too-thin input is neutral and marked not eligible, never read as zero. The thresholds are the
 * council's (council-verdicts/codex.md, Nov 12) and every boundary is tested in stock-signals.test.ts. These are
 * signals, not advice: cheaper, stronger or rising does not make a stock a good investment, and the page's call is
 * never worked out from them.
 *
 * Periods: annual figures compare consecutive fiscal years. The trailing twelve months are not compared with the last
 * fiscal year (they overlap), and we keep no prior TTM, so the TTM row is not judged.
 *
 * Inputs we do not have yet stay out rather than being guessed: a bank's ROE history and net interest income, sourced
 * structured guidance, and verified company-specific news events. Their contracts are below (`roe`, `nii`, `guidance`,
 * `newsEvents`); with them null or empty no signal is shown or counted.
 */

export const STOCK_SIGNALS_VERSION = "2026-11-12.1";

export type SignalVerdict = "good" | "watch" | "neutral";
export type SignalTab = "financials" | "valuation" | "earnings" | "ownership" | "news" | "technicals" | "peers";

/** Stable ids: the tabs, the page's tally and the tests all refer to these. */
export const SIGNAL_IDS = [
  // Earnings first: the named chip is picked in this order (earnings, financials, valuation, ownership, price, news, rivals).
  "earn.surprise",
  "earn.guidance",
  "earn.reaction",
  "fin.revenue",
  "fin.net_income",
  "fin.eps",
  "fin.net_margin",
  "fin.roe",
  "fin.nii",
  "val.pe_sector",
  "val.pe_history",
  "val.target",
  "val.ratings",
  "own.insiders",
  "own.funds",
  "price.sma50",
  "price.sma200",
  "price.rsi",
  "price.off_high",
  "price.vs_sp500",
  "news.event",
  "peers.revenue_growth",
  "peers.pe",
] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

const TAB_OF: Record<string, SignalTab> = { earn: "earnings", fin: "financials", val: "valuation", own: "ownership", price: "technicals", news: "news", peers: "peers" };

export type StockSignal = {
  id: SignalId;
  tab: SignalTab;
  verdict: SignalVerdict;
  /** False when an input was missing, stale or too thin: the verdict is then neutral and nothing is shown for it. */
  eligible: boolean;
  /** What is judged, in a few words: "Revenue growth". */
  metric: string;
  /** The chip's name when this signal leads the page's tally: "Revenue growth", "High P/E". Null when neutral. */
  name: string | null;
  /** The judged number (percent, points, ratio) and how the page writes it: "+14.1%", "−3.2 pts". */
  value: number | null;
  display: string | null;
  /** The period the number covers: "FY2025 vs FY2024", "last 90 days". */
  period: string | null;
  /** Where the inputs come from, for the figure's hover title. */
  evidence: string[];
  /** Why a not-eligible signal is neutral ("no prior fiscal year"); null otherwise. */
  reason: string | null;
  /** The two figures a comparison is made of, when it is one (the stock's one-year return and the S&P 500's), for a pair of bars. */
  pair?: { value: number; versus: number };
};

export type FiscalRow = {
  period: string;
  revenue?: number | null;
  net_income?: number | null;
  eps_diluted?: number | null;
  profit_margin_pct?: number | null;
};

export type StockSignalsInput = {
  /** New York day, YYYY-MM-DD. */
  today: string;
  /** The stock's currency symbol ("$", "₹"), for per-share figures. */
  currency: string;
  price: number | null;
  /** The day of that price (YYYY-MM-DD). An older quote than `RULES.priceMaxAgeDays` judges nothing against it. */
  priceAsOf: string | null;
  /** Banks, insurers and lenders (lib/financial-company.ts): no margin item; ROE and net interest income instead. */
  bank: boolean;
  /** The facts' history rows, any order; only "FY 2025"-style rows are judged. */
  history: ReadonlyArray<FiscalRow>;
  /**
   * Revenue growth over the last twelve months against the twelve before (the source's own, as the Financials lede
   * says it). Newer than the last fiscal year: a fiscal-year verdict it contradicts is not shown.
   */
  ttmRevenueGrowth: number | null;
  /** A bank's return on equity for two consecutive fiscal years. Not stored yet: null. */
  roe: { current: number; prior: number; period: string } | null;
  /** A bank's net interest income for two consecutive fiscal years. Not stored yet: null. */
  nii: { current: number; prior: number; period: string } | null;
  /** Trailing P/E and its sector's average trailing P/E, as the Valuation tab shows them. */
  pe: number | null;
  sectorPe: number | null;
  /** The stock's own daily trailing P/E readings, oldest first. */
  peHistory: { points: ReadonlyArray<{ date: string; value: number }> } | null;
  /** The median analyst target and how many current targets it is drawn from. */
  target: { median: number | null; count: number | null } | null;
  /** Analyst ratings by month ("2026-11"), any order. */
  ratings: ReadonlyArray<{ month: string; buy: number; hold: number; sell: number }>;
  /** The latest report that has happened, from the earnings calendar; a figure it lacks is null, never an older one. */
  lastReport: { date: string; actual: number | null; estimate: number | null } | null;
  /** Sourced, structured guidance for the latest report. Not stored yet: null. */
  guidance: { outcome: "raised" | "maintained" | "cut"; date: string; source: string } | null;
  /** The first full trading day after the latest report: the stock's return and the S&P 500's, same session. */
  reaction: { date: string; reportDate: string; stockPct: number; marketPct: number } | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  high52: number | null;
  /** One-year total return (adjusted closes, dividends in) for the stock and the S&P 500 over the same dates. */
  oneYear: { from: string; to: string; stockPct: number; marketPct: number } | null;
  /** Insider open-market trades as filed. Null when we have no insider feed for the stock. */
  insiders: ReadonlyArray<{ id: string; action: "buy" | "sell"; valueUsd: number | null; planned: boolean; date: string }> | null;
  /** The followed funds' latest 13F rows: what each did with the stock, and the quarter it reports on. */
  funds: ReadonlyArray<{ fund: string; quarter: string; action: "new" | "added" | "trimmed" | "held" | "exited" | null }> | null;
  /** Reviewed, company-specific events with a source and a stated business effect. None are stored yet: empty. */
  newsEvents: ReadonlyArray<{ id: string; date: string; source: string; role: string; effect: "favorable" | "adverse" | "mixed"; verified: boolean; title: string }>;
  /** The stock and its peers on the Rivals tab. */
  self: { revenueGrowth: number | null; pe: number | null };
  peers: ReadonlyArray<{ ticker: string; revenueGrowth: number | null; pe: number | null }>;
};

export type TabTone = { good: number; watch: number; dot: "good" | "watch" | null };

export type StockSignals = {
  version: string;
  /** Every rule's result, eligible or not, in SIGNAL_IDS order. */
  signals: StockSignal[];
  byId: Partial<Record<SignalId, StockSignal>>;
  tabs: Record<SignalTab, TabTone>;
  /**
   * The page's strip by the call; null when no signal is good or watch. Counts are observations, not a vote: related
   * measures (the 50- and 200-day averages) are not independent, so the tally is never set against the call
   * (council, Nov 12).
   */
  tally: {
    good: number;
    watch: number;
    topGood: { id: SignalId; name: string } | null;
    topWatch: { id: SignalId; name: string } | null;
  } | null;
};

// ─── thresholds (council, Nov 12) ────────────────────────────────────────────

export const RULES = {
  revenueGood: 5,
  revenueWatch: -5,
  revenueSlowdown: 5,
  earningsChange: 5,
  marginPoints: 2,
  peSectorGap: 20,
  peHistoryLow: 20,
  peHistoryHigh: 80,
  peHistoryMinDays: 252,
  peHistoryYears: 3,
  targetGap: 15,
  targetMinCount: 5,
  ratingsPoints: 10,
  ratingsMinCount: 5,
  ratingsMonthsBack: 3,
  reactionPoints: 2,
  averageGap: 2,
  rsiHigh: 70,
  rsiLow: 30,
  offHigh: -20,
  vsMarketPoints: 5,
  insiderDays: 90,
  /** How old an input may be before it is stale. */
  reportMaxAgeDays: 120,
  peHistoryMaxAgeDays: 31,
  ratingsMaxAgeMonths: 2,
  oneYearMaxAgeDays: 7,
  priceMaxAgeDays: 7,
  peerMin: 3,
} as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function daysBetween(from: string, to: string): number | null {
  const a = dayMs(from);
  const b = dayMs(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

/** "+14.1%", "−3.2%": one decimal under 100, whole numbers past it. */
export function signedPercent(value: number): string {
  const size = Math.abs(value);
  const text = size >= 100 ? `${Math.round(size)}%` : `${size.toFixed(1)}%`;
  return text === "0.0%" ? "0%" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
}

function signedPoints(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return text === "0.0" ? "0 pts" : `${value > 0 ? "+" : "−"}${text} pts`;
}

function compactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}

function signal(id: SignalId, metric: string, fields: Partial<Omit<StockSignal, "id" | "tab" | "metric">>): StockSignal {
  return {
    id,
    tab: TAB_OF[id.split(".")[0]!]!,
    metric,
    verdict: fields.verdict ?? "neutral",
    eligible: fields.eligible ?? true,
    name: fields.verdict && fields.verdict !== "neutral" ? fields.name ?? metric : null,
    value: fields.value ?? null,
    display: fields.display ?? null,
    period: fields.period ?? null,
    evidence: fields.evidence ?? [],
    reason: fields.reason ?? null,
    ...(fields.pair ? { pair: fields.pair } : {}),
  };
}

function missing(id: SignalId, metric: string, reason: string): StockSignal {
  return signal(id, metric, { eligible: false, reason });
}

// ─── financials ──────────────────────────────────────────────────────────────

type Year = { year: number; row: FiscalRow };

/** Fiscal-year rows, newest first, one per year. */
function fiscalYears(history: ReadonlyArray<FiscalRow>): Year[] {
  const byYear = new Map<number, FiscalRow>();
  for (const row of history) {
    const match = /^FY\s*(\d{4})$/i.exec(String(row.period ?? "").trim());
    if (match) byYear.set(Number(match[1]), row);
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, row]) => ({ year, row }));
}

/** The latest fiscal year and the ones before it, only while consecutive, and only when the latest is current. */
function consecutiveYears(history: ReadonlyArray<FiscalRow>, today: string): { years: Year[]; stale: boolean } {
  const all = fiscalYears(history);
  const years: Year[] = [];
  for (const item of all) {
    if (years.length && item.year !== years[years.length - 1]!.year - 1) break;
    years.push(item);
  }
  // A fiscal year named two calendar years back (FY2024 read in 2026) has a newer one missing.
  const stale = Boolean(years[0]) && years[0]!.year < Number(today.slice(0, 4)) - 1;
  return { years, stale };
}

/**
 * A computed percent or point gap, rounded to nine decimals so a value on a threshold lands on it: (0.8 / 1 − 1) × 100
 * is −19.999999999999996 in floating point, and must count as the −20% boundary it is.
 */
function tidy(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function growthPct(current: number | null | undefined, prior: number | null | undefined): number | null {
  return fin(current) && fin(prior) && prior > 0 ? tidy((current / prior - 1) * 100) : null;
}

const FILINGS = "Company filings, fiscal years";

function revenueSignal(input: StockSignalsInput): StockSignal {
  const metric = "Revenue growth";
  const { years, stale } = consecutiveYears(input.history, input.today);
  if (stale) return missing("fin.revenue", metric, "latest fiscal year is out of date");
  const [y0, y1, y2] = years;
  const g = growthPct(y0?.row.revenue, y1?.row.revenue);
  if (g === null || !y0 || !y1) return missing("fin.revenue", metric, "no two consecutive fiscal years of revenue");
  const before = y2 ? growthPct(y1.row.revenue, y2.row.revenue) : null;
  const period = `FY${y0.year} vs FY${y1.year}`;
  const base = { value: g, display: signedPercent(g), period, evidence: [FILINGS] };
  const verdict: SignalVerdict =
    g >= RULES.revenueGood && before !== null && g >= before
      ? "good"
      : g <= RULES.revenueWatch || (g > 0 && before !== null && tidy(before - g) >= RULES.revenueSlowdown)
        ? "watch"
        : "neutral";
  // The last twelve months are newer than the fiscal year. When they point the other way by the slowdown margin (JPM:
  // +0.9% in FY25 but +14.1% over the last twelve months), the fiscal-year verdict would mislead about growth now, so
  // it is not shown (council, Nov 12).
  const ttm = input.ttmRevenueGrowth;
  if (verdict !== "neutral" && fin(ttm)) {
    const gap = tidy(ttm - g);
    if ((verdict === "watch" && gap >= RULES.revenueSlowdown) || (verdict === "good" && gap <= -RULES.revenueSlowdown)) {
      return missing("fin.revenue", metric, "the last twelve months point the other way");
    }
  }
  if (verdict === "good") return signal("fin.revenue", metric, { ...base, verdict, name: "Revenue growth" });
  if (verdict === "watch") return signal("fin.revenue", metric, { ...base, verdict, name: g <= RULES.revenueWatch ? "Revenue falling" : "Revenue slowing" });
  return signal("fin.revenue", metric, base);
}

/** Net income and EPS: a 5% change either way, or a loss turning into a profit (good) and the reverse (watch). */
function changeSignal(input: StockSignalsInput, id: "fin.net_income" | "fin.eps", key: "net_income" | "eps_diluted"): StockSignal {
  const metric = id === "fin.eps" ? "EPS growth" : "Net income growth";
  const names = id === "fin.eps" ? { good: "EPS growth", watch: "EPS falling" } : { good: "Profit growth", watch: "Profit falling" };
  const { years, stale } = consecutiveYears(input.history, input.today);
  if (stale) return missing(id, metric, "latest fiscal year is out of date");
  const [y0, y1] = years;
  const current = y0?.row[key];
  const prior = y1?.row[key];
  if (!y0 || !y1 || !fin(current) || !fin(prior)) return missing(id, metric, "no two consecutive fiscal years");
  const period = `FY${y0.year} vs FY${y1.year}`;
  if (prior <= 0) {
    // A change from a loss (or zero) has no meaningful percent: say what happened instead.
    if (current > 0) return signal(id, metric, { verdict: "good", name: id === "fin.eps" ? "EPS turned positive" : "Turned a profit", display: "Loss to profit", period, evidence: [FILINGS] });
    return signal(id, metric, { display: "Still a loss", period, evidence: [FILINGS] });
  }
  if (current <= 0) return signal(id, metric, { verdict: "watch", name: id === "fin.eps" ? "EPS turned negative" : "Turned a loss", display: "Profit to loss", period, evidence: [FILINGS] });
  const change = tidy((current / prior - 1) * 100);
  const base = { value: change, display: signedPercent(change), period, evidence: [FILINGS] };
  if (change >= RULES.earningsChange) return signal(id, metric, { ...base, verdict: "good", name: names.good });
  if (change <= -RULES.earningsChange) return signal(id, metric, { ...base, verdict: "watch", name: names.watch });
  return signal(id, metric, base);
}

function pointsSignal(id: SignalId, metric: string, rawDelta: number, period: string, names: { good: string; watch: string }, evidence: string[]): StockSignal {
  const delta = tidy(rawDelta);
  const base = { value: delta, display: signedPoints(delta), period, evidence };
  if (delta >= RULES.marginPoints) return signal(id, metric, { ...base, verdict: "good", name: names.good });
  if (delta <= -RULES.marginPoints) return signal(id, metric, { ...base, verdict: "watch", name: names.watch });
  return signal(id, metric, base);
}

function netMarginSignal(input: StockSignalsInput): StockSignal | null {
  // A bank's margin is not its business's measure: ROE and net interest income replace it.
  if (input.bank) return null;
  const metric = "Net margin";
  const { years, stale } = consecutiveYears(input.history, input.today);
  if (stale) return missing("fin.net_margin", metric, "latest fiscal year is out of date");
  const [y0, y1] = years;
  const current = y0?.row.profit_margin_pct;
  const prior = y1?.row.profit_margin_pct;
  if (!y0 || !y1 || !fin(current) || !fin(prior)) return missing("fin.net_margin", metric, "no two consecutive fiscal years of margin");
  return pointsSignal("fin.net_margin", metric, current - prior, `FY${y0.year} vs FY${y1.year}`, { good: "Wider margin", watch: "Thinner margin" }, [FILINGS]);
}

function bankSignals(input: StockSignalsInput): StockSignal[] {
  if (!input.bank) return [];
  const out: StockSignal[] = [];
  out.push(
    input.roe && fin(input.roe.current) && fin(input.roe.prior)
      ? pointsSignal("fin.roe", "Return on equity", input.roe.current - input.roe.prior, input.roe.period, { good: "Higher ROE", watch: "Lower ROE" }, [FILINGS])
      : missing("fin.roe", "Return on equity", "no ROE history on file"),
  );
  if (input.nii && fin(input.nii.current) && fin(input.nii.prior) && input.nii.prior > 0) {
    const change = tidy((input.nii.current / input.nii.prior - 1) * 100);
    const base = { value: change, display: signedPercent(change), period: input.nii.period, evidence: [FILINGS] };
    out.push(
      change >= RULES.earningsChange
        ? signal("fin.nii", "Net interest income", { ...base, verdict: "good", name: "Interest income up" })
        : change <= -RULES.earningsChange
          ? signal("fin.nii", "Net interest income", { ...base, verdict: "watch", name: "Interest income down" })
          : signal("fin.nii", "Net interest income", base),
    );
  } else {
    out.push(missing("fin.nii", "Net interest income", "no net interest income on file"));
  }
  return out;
}

// ─── valuation ───────────────────────────────────────────────────────────────

function peSectorSignal(input: StockSignalsInput): StockSignal {
  const metric = "P/E against its sector";
  const { pe, sectorPe } = input;
  if (!fin(pe) || pe <= 0 || !fin(sectorPe) || sectorPe <= 0) return missing("val.pe_sector", metric, "no positive P/E and sector P/E");
  const gap = tidy((pe / sectorPe - 1) * 100);
  const base = { value: gap, display: signedPercent(gap), period: "trailing P/E", evidence: ["Sector average trailing P/E"] };
  if (gap <= -RULES.peSectorGap) return signal("val.pe_sector", metric, { ...base, verdict: "good", name: "Low P/E" });
  if (gap >= RULES.peSectorGap) return signal("val.pe_sector", metric, { ...base, verdict: "watch", name: "High P/E" });
  return signal("val.pe_sector", metric, base);
}

/** Where today's P/E sits among its own daily readings over the past three years, 0 to 100. */
export function pePercentile(points: ReadonlyArray<number>, pe: number): number {
  if (!points.length) return 50;
  let below = 0;
  let equal = 0;
  for (const value of points) {
    if (value < pe) below += 1;
    else if (value === pe) equal += 1;
  }
  return tidy(((below + equal / 2) / points.length) * 100);
}

function peHistorySignal(input: StockSignalsInput): StockSignal {
  const metric = "P/E against its own history";
  const { pe } = input;
  const points = input.peHistory?.points ?? [];
  if (!fin(pe) || pe <= 0) return missing("val.pe_history", metric, "no positive P/E");
  const since = new Date(dayMs(input.today) - RULES.peHistoryYears * 365 * 86_400_000).toISOString().slice(0, 10);
  const window = points.filter((point) => point.date >= since && point.date <= input.today && fin(point.value) && point.value > 0);
  if (window.length < RULES.peHistoryMinDays) return missing("val.pe_history", metric, `under ${RULES.peHistoryMinDays} daily readings`);
  const last = window[window.length - 1]!;
  const age = daysBetween(last.date, input.today);
  if (age === null || age > RULES.peHistoryMaxAgeDays) return missing("val.pe_history", metric, "readings are out of date");
  const pct = pePercentile(window.map((point) => point.value), pe);
  const base = { value: pct, display: `${Math.round(pct)}th percentile`, period: `${window.length} days to ${last.date}`, evidence: ["Daily P/E on file"] };
  if (pct <= RULES.peHistoryLow) return signal("val.pe_history", metric, { ...base, verdict: "good", name: "P/E near its lows" });
  if (pct >= RULES.peHistoryHigh) return signal("val.pe_history", metric, { ...base, verdict: "watch", name: "P/E near its highs" });
  return signal("val.pe_history", metric, base);
}

function targetSignal(input: StockSignalsInput): StockSignal {
  const metric = "Median analyst target";
  const median = input.target?.median;
  const count = input.target?.count;
  if (!fin(input.price) || input.price <= 0 || !fin(median) || median <= 0) return missing("val.target", metric, "no median target");
  if (!fin(count) || count < RULES.targetMinCount) return missing("val.target", metric, `fewer than ${RULES.targetMinCount} targets`);
  const gap = tidy((median / input.price - 1) * 100);
  const base = { value: gap, display: signedPercent(gap), period: `${count} analysts`, evidence: ["Analyst price targets"] };
  if (gap >= RULES.targetGap) return signal("val.target", metric, { ...base, verdict: "good", name: "Room to target" });
  if (gap <= -RULES.targetGap) return signal("val.target", metric, { ...base, verdict: "watch", name: "Above target" });
  return signal("val.target", metric, base);
}

function monthIndex(month: string): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function ratingsSignal(input: StockSignalsInput): StockSignal {
  const metric = "Buy ratings";
  const rows = input.ratings
    .map((row) => ({ ...row, at: monthIndex(row.month), total: row.buy + row.hold + row.sell }))
    .filter((row): row is typeof row & { at: number } => row.at !== null)
    .sort((a, b) => b.at - a.at);
  const latest = rows[0];
  const now = monthIndex(input.today);
  if (!latest || now === null || now - latest.at > RULES.ratingsMaxAgeMonths) return missing("val.ratings", metric, "no current ratings");
  const earlier = rows.find((row) => row.at === latest.at - RULES.ratingsMonthsBack);
  if (!earlier) return missing("val.ratings", metric, "no ratings three months back");
  if (latest.total < RULES.ratingsMinCount || earlier.total < RULES.ratingsMinCount) return missing("val.ratings", metric, `fewer than ${RULES.ratingsMinCount} ratings`);
  const delta = tidy((latest.buy / latest.total - earlier.buy / earlier.total) * 100);
  const base = { value: delta, display: signedPoints(delta), period: `${earlier.month} to ${latest.month}`, evidence: ["Analyst ratings by month"] };
  if (delta >= RULES.ratingsPoints) return signal("val.ratings", metric, { ...base, verdict: "good", name: "More buy ratings" });
  if (delta <= -RULES.ratingsPoints) return signal("val.ratings", metric, { ...base, verdict: "watch", name: "Fewer buy ratings" });
  return signal("val.ratings", metric, base);
}

// ─── earnings ────────────────────────────────────────────────────────────────

function surpriseSignal(input: StockSignalsInput): StockSignal {
  const metric = "EPS against the estimate";
  const report = input.lastReport;
  if (!report || !fin(report.actual) || !fin(report.estimate)) return missing("earn.surprise", metric, "no reported and estimated EPS");
  const age = daysBetween(report.date, input.today);
  if (age === null || age < 0 || age > RULES.reportMaxAgeDays) return missing("earn.surprise", metric, "the last report is out of date");
  const gap = report.actual - report.estimate;
  // In the stock's own currency, each figure with its own sign: "−₹0.12 vs ₹0.20".
  const money = (value: number) => `${value < 0 ? "−" : ""}${input.currency}${Math.abs(value).toFixed(2)}`;
  const text = `${money(report.actual)} vs ${money(report.estimate)}`;
  const base = { value: gap, display: text, period: `report of ${report.date}`, evidence: ["Earnings calendar"] };
  if (gap > 0) return signal("earn.surprise", metric, { ...base, verdict: "good", name: "Earnings beat" });
  if (gap < 0) return signal("earn.surprise", metric, { ...base, verdict: "watch", name: "Earnings miss" });
  return signal("earn.surprise", metric, base);
}

function guidanceSignal(input: StockSignalsInput): StockSignal {
  const metric = "Guidance";
  const guidance = input.guidance;
  if (!guidance || !guidance.source) return missing("earn.guidance", metric, "no sourced guidance on file");
  const base = { display: guidance.outcome === "raised" ? "Raised" : guidance.outcome === "cut" ? "Cut" : "Kept", period: guidance.date, evidence: [guidance.source] };
  if (guidance.outcome === "raised") return signal("earn.guidance", metric, { ...base, verdict: "good", name: "Guidance raised" });
  if (guidance.outcome === "cut") return signal("earn.guidance", metric, { ...base, verdict: "watch", name: "Guidance cut" });
  return signal("earn.guidance", metric, base);
}

function reactionSignal(input: StockSignalsInput): StockSignal {
  const metric = "First day after the report, against the S&P 500";
  const reaction = input.reaction;
  if (!reaction || !fin(reaction.stockPct) || !fin(reaction.marketPct)) return missing("earn.reaction", metric, "no aligned closes around the report");
  const age = daysBetween(reaction.reportDate, input.today);
  if (age === null || age < 0 || age > RULES.reportMaxAgeDays) return missing("earn.reaction", metric, "the last report is out of date");
  const diff = tidy(reaction.stockPct - reaction.marketPct);
  const base = { value: diff, display: signedPoints(diff), period: reaction.date, evidence: ["Daily closes, stock and SPY"] };
  if (diff >= RULES.reactionPoints) return signal("earn.reaction", metric, { ...base, verdict: "good", name: "Strong reaction" });
  if (diff <= -RULES.reactionPoints) return signal("earn.reaction", metric, { ...base, verdict: "watch", name: "Weak reaction" });
  return signal("earn.reaction", metric, base);
}

// ─── price trend ─────────────────────────────────────────────────────────────

function averageSignal(input: StockSignalsInput, id: "price.sma50" | "price.sma200", average: number | null, days: number): StockSignal {
  const metric = `Price against its ${days}-day average`;
  if (!fin(input.price) || input.price <= 0 || !fin(average) || average <= 0) return missing(id, metric, `no ${days}-day average`);
  const gap = tidy((input.price / average - 1) * 100);
  const base = { value: gap, display: signedPercent(gap), period: `${days}-day average`, evidence: ["Daily closes"] };
  if (gap >= RULES.averageGap) return signal(id, metric, { ...base, verdict: "good", name: `Above ${days}-day` });
  if (gap <= -RULES.averageGap) return signal(id, metric, { ...base, verdict: "watch", name: `Below ${days}-day` });
  return signal(id, metric, base);
}

function rsiSignal(input: StockSignalsInput): StockSignal {
  const metric = "RSI (14 days)";
  if (!fin(input.rsi)) return missing("price.rsi", metric, "no RSI");
  const base = { value: input.rsi, display: input.rsi.toFixed(1), period: "14 days", evidence: ["Daily closes"] };
  // Neither extreme predicts the direction; both are worth watching, so neither is ever good.
  if (input.rsi >= RULES.rsiHigh) return signal("price.rsi", metric, { ...base, verdict: "watch", name: "RSI over 70" });
  if (input.rsi <= RULES.rsiLow) return signal("price.rsi", metric, { ...base, verdict: "watch", name: "RSI under 30" });
  return signal("price.rsi", metric, base);
}

function offHighSignal(input: StockSignalsInput): StockSignal {
  const metric = "From the 52-week high";
  if (!fin(input.price) || input.price <= 0 || !fin(input.high52) || input.high52 <= 0) return missing("price.off_high", metric, "no 52-week high");
  const gap = tidy((input.price / input.high52 - 1) * 100);
  const base = { value: gap, display: signedPercent(gap), period: "52 weeks", evidence: ["Daily closes"] };
  if (gap <= RULES.offHigh) return signal("price.off_high", metric, { ...base, verdict: "watch", name: "Far below its high" });
  return signal("price.off_high", metric, base);
}

function vsMarketSignal(input: StockSignalsInput): StockSignal {
  const metric = "One year against the S&P 500";
  const one = input.oneYear;
  if (!one || !fin(one.stockPct) || !fin(one.marketPct)) return missing("price.vs_sp500", metric, "no aligned one-year closes");
  const age = daysBetween(one.to, input.today);
  if (age === null || age > RULES.oneYearMaxAgeDays) return missing("price.vs_sp500", metric, "closes are out of date");
  const diff = tidy(one.stockPct - one.marketPct);
  const base = {
    value: diff,
    display: signedPoints(diff),
    period: `${one.from} to ${one.to}`,
    evidence: ["Adjusted daily closes, stock and SPY"],
    pair: { value: tidy(one.stockPct), versus: tidy(one.marketPct) },
  };
  if (diff >= RULES.vsMarketPoints) return signal("price.vs_sp500", metric, { ...base, verdict: "good", name: "Beat the S&P 500" });
  if (diff <= -RULES.vsMarketPoints) return signal("price.vs_sp500", metric, { ...base, verdict: "watch", name: "Lagged the S&P 500" });
  return signal("price.vs_sp500", metric, base);
}

// ─── ownership ───────────────────────────────────────────────────────────────

function insiderSignal(input: StockSignalsInput): StockSignal {
  const metric = "Insider buying against selling";
  if (!input.insiders) return missing("own.insiders", metric, "no insider feed");
  const since = new Date(dayMs(input.today) - RULES.insiderDays * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  let buys = 0;
  let sells = 0;
  let trades = 0;
  for (const row of input.insiders) {
    // One filing listed twice counts once; planned 10b5-1 trades are scheduled months ahead and say little.
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.planned || row.date < since || row.date > input.today) continue;
    // Every trade in the window needs its dollar value, or the sum would be partial.
    if (!fin(row.valueUsd) || row.valueUsd < 0) return missing("own.insiders", metric, "a trade has no dollar value");
    trades += 1;
    if (row.action === "buy") buys += row.valueUsd;
    else sells += row.valueUsd;
  }
  const period = `last ${RULES.insiderDays} days`;
  if (!trades) return signal("own.insiders", metric, { display: "No trades", period, evidence: ["SEC Form 4"] });
  const display = buys >= sells ? `${compactUsd(buys)} bought` : `${compactUsd(sells)} sold`;
  const base = { value: buys - sells, display, period, evidence: ["SEC Form 4, open-market trades"] };
  if (buys > sells) return signal("own.insiders", metric, { ...base, verdict: "good", name: "Insider buying" });
  if (sells > buys) return signal("own.insiders", metric, { ...base, verdict: "watch", name: "Insider selling" });
  return signal("own.insiders", metric, base);
}

function fundsSignal(input: StockSignalsInput): StockSignal {
  const metric = "Followed funds adding against trimming";
  const rows = input.funds;
  if (!rows || !rows.length) return missing("own.funds", metric, "no followed fund holds it");
  // One comparable quarter: the one most followed funds have filed for (the newest on a tie). A quarter only a few
  // early filers have reported yet is not comparable with the full one before it; older filings are another period.
  const counts = new Map<string, number>();
  for (const row of rows) if (row.quarter) counts.set(row.quarter, (counts.get(row.quarter) ?? 0) + 1);
  const quarter = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  if (!quarter) return missing("own.funds", metric, "no quarter on the filings");
  const latest = rows.filter((row) => row.quarter === quarter);
  const added = latest.filter((row) => row.action === "new" || row.action === "added").length;
  const cut = latest.filter((row) => row.action === "trimmed" || row.action === "exited").length;
  const base = { value: added - cut, display: `${added} added · ${cut} cut`, period: quarter, evidence: ["13F filings of the funds we follow"] };
  if (added > cut) return signal("own.funds", metric, { ...base, verdict: "good", name: "Funds adding" });
  if (cut > added) return signal("own.funds", metric, { ...base, verdict: "watch", name: "Funds trimming" });
  return signal("own.funds", metric, base);
}

// ─── news ────────────────────────────────────────────────────────────────────

function newsSignal(input: StockSignalsInput): StockSignal {
  const metric = "Company news";
  // Only a reviewed, sourced, company-specific event with a stated effect; one event covered twice counts once.
  const seen = new Set<string>();
  const events = input.newsEvents
    .filter((event) => event.verified && event.source && event.date && event.role && event.date <= input.today)
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = events[0];
  if (!latest) return missing("news.event", metric, "no verified company event");
  const base = { display: latest.title, period: latest.date, evidence: [latest.source] };
  if (latest.effect === "favorable") return signal("news.event", metric, { ...base, verdict: "good", name: "Good news" });
  if (latest.effect === "adverse") return signal("news.event", metric, { ...base, verdict: "watch", name: "Bad news" });
  return signal("news.event", metric, base);
}

// ─── rivals ──────────────────────────────────────────────────────────────────

/**
 * Where the stock ranks among itself and its peers on one metric: top third good, bottom third watch. A tie that
 * spans a boundary is neutral. `better` says which way ranks higher.
 */
export function peerRank(own: number, others: ReadonlyArray<number>, better: "higher" | "lower"): { verdict: SignalVerdict; rank: number; of: number } {
  const all = [own, ...others];
  const sorted = [...all].sort((a, b) => (better === "higher" ? b - a : a - b));
  const n = sorted.length;
  const first = sorted.indexOf(own);
  const last = sorted.lastIndexOf(own);
  const third = Math.floor(n / 3);
  const verdict: SignalVerdict = third > 0 && last < third ? "good" : third > 0 && first >= n - third ? "watch" : "neutral";
  return { verdict, rank: first + 1, of: n };
}

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

function peerSignal(input: StockSignalsInput, id: "peers.revenue_growth" | "peers.pe"): StockSignal {
  const growth = id === "peers.revenue_growth";
  const metric = growth ? "Revenue growth against rivals" : "P/E against rivals";
  const pick = (row: { revenueGrowth: number | null; pe: number | null }) => (growth ? row.revenueGrowth : row.pe);
  const ok = (value: number | null): value is number => fin(value) && (growth || value > 0);
  const own = pick(input.self);
  const others = input.peers.map(pick).filter(ok);
  if (!ok(own)) return missing(id, metric, growth ? "no revenue growth" : "no positive P/E");
  if (others.length < RULES.peerMin) return missing(id, metric, `fewer than ${RULES.peerMin} comparable peers`);
  const { verdict, rank, of } = peerRank(own, others, growth ? "higher" : "lower");
  const base = { value: own, display: `${ordinal(rank)} of ${of}`, period: growth ? "revenue growth, 1 year" : "trailing P/E", evidence: ["Sector peers"] };
  if (verdict === "good") return signal(id, metric, { ...base, verdict, name: growth ? "Growing faster than rivals" : "Cheaper than rivals" });
  if (verdict === "watch") return signal(id, metric, { ...base, verdict, name: growth ? "Growing slower than rivals" : "Pricier than rivals" });
  return signal(id, metric, base);
}

// ─── the page ────────────────────────────────────────────────────────────────

const TABS: SignalTab[] = ["financials", "valuation", "earnings", "ownership", "news", "technicals", "peers"];

export function buildStockSignals(raw: StockSignalsInput): StockSignals {
  // A quote from more than a week ago is not today's price: nothing is judged against it (the averages, the high,
  // the target), rather than calling an old price above or below today's figures.
  const priceAge = raw.priceAsOf ? daysBetween(raw.priceAsOf, raw.today) : null;
  const input: StockSignalsInput = priceAge !== null && priceAge >= 0 && priceAge <= RULES.priceMaxAgeDays ? raw : { ...raw, price: null };
  const list = [
    surpriseSignal(input),
    guidanceSignal(input),
    reactionSignal(input),
    revenueSignal(input),
    changeSignal(input, "fin.net_income", "net_income"),
    changeSignal(input, "fin.eps", "eps_diluted"),
    netMarginSignal(input),
    ...bankSignals(input),
    peSectorSignal(input),
    peHistorySignal(input),
    targetSignal(input),
    ratingsSignal(input),
    insiderSignal(input),
    fundsSignal(input),
    averageSignal(input, "price.sma50", input.sma50, 50),
    averageSignal(input, "price.sma200", input.sma200, 200),
    rsiSignal(input),
    offHighSignal(input),
    vsMarketSignal(input),
    newsSignal(input),
    peerSignal(input, "peers.revenue_growth"),
    peerSignal(input, "peers.pe"),
  ].filter((item): item is StockSignal => item !== null);
  // One result per id, in the fixed order (the chip priority).
  const byId: Partial<Record<SignalId, StockSignal>> = {};
  for (const item of list) if (!byId[item.id]) byId[item.id] = item;
  const signals = SIGNAL_IDS.map((id) => byId[id]).filter((item): item is StockSignal => Boolean(item));
  const counted = signals.filter((item) => item.eligible && item.verdict !== "neutral");

  const tabs = Object.fromEntries(
    TABS.map((tab) => {
      const good = counted.filter((item) => item.tab === tab && item.verdict === "good").length;
      const watch = counted.filter((item) => item.tab === tab && item.verdict === "watch").length;
      return [tab, { good, watch, dot: good > watch ? "good" : watch > good ? "watch" : null }];
    }),
  ) as Record<SignalTab, TabTone>;

  const good = counted.filter((item) => item.verdict === "good");
  const watch = counted.filter((item) => item.verdict === "watch");
  const tally = counted.length
    ? {
        good: good.length,
        watch: watch.length,
        topGood: good[0] ? { id: good[0].id, name: good[0].name! } : null,
        topWatch: watch[0] ? { id: watch[0].id, name: watch[0].name! } : null,
      }
    : null;
  return { version: STOCK_SIGNALS_VERSION, signals, byId, tabs, tally };
}

// ─── aligned prices ──────────────────────────────────────────────────────────

export type Close = { date: string; close: number };

/**
 * The stock's and the S&P 500's (SPY's) return over the same dates, from adjusted closes so dividends are in: from
 * the last close both have on or before a year before the stock's last close, to that last close. Null when the two
 * series do not share both ends.
 */
export function alignedOneYear(series: ReadonlyArray<Close> | null, benchmark: ReadonlyArray<Close> | null): StockSignalsInput["oneYear"] {
  if (!series?.length || !benchmark?.length) return null;
  const market = new Map(benchmark.filter((point) => fin(point.close) && point.close > 0).map((point) => [point.date, point.close]));
  const own = series.filter((point) => fin(point.close) && point.close > 0 && market.has(point.date));
  const last = own[own.length - 1];
  if (!last) return null;
  const yearAgo = new Date(dayMs(last.date) - 365 * 86_400_000).toISOString().slice(0, 10);
  const start = [...own].reverse().find((point) => point.date <= yearAgo);
  // A start more than a week before the year mark means a gap in the closes, not a year.
  if (!start || (daysBetween(start.date, yearAgo) ?? 99) > 7) return null;
  return {
    from: start.date,
    to: last.date,
    stockPct: (last.close / start.close - 1) * 100,
    marketPct: (market.get(last.date)! / market.get(start.date)! - 1) * 100,
  };
}

/**
 * The first full trading day after a report, for the stock and SPY: the report day itself when it came before the
 * open, the next session when it came after the close. Null when the timing is unknown or the closes do not line up.
 */
function shiftWeekday(iso: string, step: 1 | -1): string {
  const date = new Date(dayMs(iso));
  do date.setUTCDate(date.getUTCDate() + step);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}
const weekdayBefore = (iso: string) => shiftWeekday(iso, -1);
const weekdayAfter = (iso: string) => shiftWeekday(iso, 1);

export function reportReaction(
  series: ReadonlyArray<Close> | null,
  benchmark: ReadonlyArray<Close> | null,
  report: { date: string; time: "bmo" | "amc" | "during" | null } | null,
): StockSignalsInput["reaction"] {
  if (!report || !series?.length || !benchmark?.length) return null;
  if (report.time !== "bmo" && report.time !== "amc") return null;
  const market = new Map(benchmark.filter((point) => fin(point.close) && point.close > 0).map((point) => [point.date, point.close]));
  const own = series.filter((point) => fin(point.close) && point.close > 0 && market.has(point.date));
  const day = report.date.slice(0, 10);
  // Two consecutive weekday sessions that both series have, no gap between them (council, Nov 12): before the open,
  // the report day against the weekday before it; after the close, the next weekday against the report day. A missing
  // close (or a holiday) would stretch the move over several days, so the reaction is then left out.
  const want = report.time === "bmo" ? { before: weekdayBefore(day), session: day } : { before: day, session: weekdayAfter(day) };
  const index = own.findIndex((point) => point.date === want.session);
  if (index <= 0) return null;
  const session = own[index]!;
  const before = own[index - 1]!;
  if (before.date !== want.before) return null;
  return {
    date: session.date,
    reportDate: day,
    stockPct: (session.close / before.close - 1) * 100,
    marketPct: (market.get(session.date)! / market.get(before.date)! - 1) * 100,
  };
}
