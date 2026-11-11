/**
 * The facts the reason watcher checks for one stock on one day, and the pure
 * helpers that work them out from stored history. The live loader
 * (lib/thesis-watch/data.ts) and the replay over past data both build facts
 * with these helpers, so a threshold means the same thing in both.
 *
 * Every field is null when the data is missing; a rule never treats a missing
 * value as a zero.
 */

export type CallWord = "Add" | "Hold" | "Trim";

export type DividendPayment = { exDate: string; amount: number; special?: boolean };

export type DividendCut = { day: string; from: number; to: number; pct: number };
export type DividendStop = { lastExDate: string; daysSince: number; usualDays: number };

export type CallState = {
  word: CallWord;
  /** Day the call last changed to `word`. */
  since: string;
  /** The call before it, when there was one. */
  from: CallWord | null;
};

export type StockFacts = {
  ticker: string;
  instrumentId: string;
  /** Short company name, "Nvidia". */
  name: string;
  /** New York day the facts are for. */
  day: string;
  sector: string | null;
  /** Last stored close. */
  close: { value: number; day: string } | null;
  /** The last CONFIRM_CLOSES closes, oldest first, so a price line is only crossed when it holds for a few days. */
  recentCloses: number[] | null;

  /** Revenue growth over the last twelve months against the twelve before, percent. */
  revenueGrowth: number | null;
  /** Revenue growth in the last full fiscal year, percent, and its label ("fiscal 2026"). */
  revenueGrowthPrior: number | null;
  priorLabel: string | null;
  /** Bottom-quarter line of revenue growth across the stock's sector, percent (sectors of eight or more stocks). */
  sectorGrowthP25: number | null;
  sectorGrowthMedian: number | null;
  /** Analysts' expected earnings growth next year, percent. */
  epsNextYearGrowth: number | null;
  /** Earnings per share over the last twelve months against the twelve before, percent. */
  epsGrowth: number | null;
  /** Net income over the last twelve months, dollars. */
  netIncome: number | null;
  pe: number | null;
  /** Where today's P/E sits in its own stored history, 0 to 100. */
  pePercentile: number | null;
  peMedian: number | null;
  /** Share of earnings paid as dividends, percent. */
  payout: number | null;
  divYield: number | null;
  /** Dividend growth against a year earlier, percent. */
  divGrowth: number | null;
  /** Free cash flow over the last twelve months, dollars. */
  fcf: number | null;
  marketCap: number | null;
  /** Latest regular payment, when the stock pays one. */
  lastDividend: { exDate: string; amount: number } | null;
  dividendCut: DividendCut | null;
  dividendStop: DividendStop | null;

  /** Guidance in the latest earnings report within EARNINGS_REPORT_DAYS. */
  guidance: { change: string; day: string; href: string } | null;
  call: CallState | null;
  /** The call moved down to Trim and has stayed there at least CALL_SETTLE_DAYS. */
  callTurnedDown: { from: CallWord; day: string } | null;
  /** Labelled headlines about the company in the last NEWS_DAYS days. */
  news: { labelled: number; negative: number } | null;
  /** An explained fall in the last TROUBLE_DAYS days whose explanation names a recall, lawsuit, probe or regulator. */
  trouble: { day: string; pct: number; headline: string; href: string } | null;
  /** Insider sales outside pre-arranged plans in the last INSIDER_DAYS days. */
  insiderSales: { usd: number; count: number } | null;
  /** A fund we track that halved the position or sold out, in a 13F filed in the last FUND_DAYS days. */
  fundCut: { fund: string; href: string; action: "trimmed" | "sold"; changePct: number | null; day: string } | null;
  /** A fall on one of the last few sessions far bigger than the market's and the stock's usual gap to it, with no explanation stored. */
  bigDrop: { day: string; pct: number; typicalPct: number; marketPct: number } | null;
  /** Next earnings date, when one is on the calendar. */
  nextEarnings: { date: string; days: number } | null;
};

/** Everything unknown: the starting point for a loader or a replay. */
export function emptyFacts(ticker: string, instrumentId: string, name: string, day: string): StockFacts {
  return {
    ticker,
    instrumentId,
    name,
    day,
    sector: null,
    close: null,
    recentCloses: null,
    revenueGrowth: null,
    revenueGrowthPrior: null,
    priorLabel: null,
    sectorGrowthP25: null,
    sectorGrowthMedian: null,
    epsNextYearGrowth: null,
    epsGrowth: null,
    netIncome: null,
    pe: null,
    pePercentile: null,
    peMedian: null,
    payout: null,
    divYield: null,
    divGrowth: null,
    fcf: null,
    marketCap: null,
    lastDividend: null,
    dividendCut: null,
    dividendStop: null,
    guidance: null,
    call: null,
    callTurnedDown: null,
    news: null,
    trouble: null,
    insiderSales: null,
    fundCut: null,
    bigDrop: null,
    nextEarnings: null,
  };
}

/* ── days ───────────────────────────────────────────────────────────────── */

export function addDays(day: string, days: number): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/* ── dividends ──────────────────────────────────────────────────────────── */

/** A cut counts when the latest regular payment is at least this much below the one before. */
export const DIVIDEND_CUT_PCT = 10;
/** Only a cut this recent is news. */
export const DIVIDEND_CUT_DAYS = 400;
/** A dividend counts as stopped when no ex-date has come for this many times the usual gap. */
export const DIVIDEND_STOP_GAPS = 1.6;

/**
 * The latest regular payment, a recent cut and a stop, from past payments
 * up to `day`. Amounts are already split-adjusted by the source.
 */
export function dividendFacts(
  payments: readonly DividendPayment[],
  perYear: number | null,
  day: string,
): Pick<StockFacts, "lastDividend" | "dividendCut" | "dividendStop"> {
  const regular = payments
    .filter((payment) => !payment.special && fin(payment.amount) && payment.amount > 0 && payment.exDate <= day)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  const last = regular.at(-1) ?? null;
  if (!last) return { lastDividend: null, dividendCut: null, dividendStop: null };
  const before = regular.at(-2) ?? null;
  let cut: DividendCut | null = null;
  if (before && daysBetween(last.exDate, day) <= DIVIDEND_CUT_DAYS) {
    const pct = ((last.amount - before.amount) / before.amount) * 100;
    if (pct <= -DIVIDEND_CUT_PCT) cut = { day: last.exDate, from: before.amount, to: last.amount, pct };
  }
  let stop: DividendStop | null = null;
  if (perYear && perYear > 0 && regular.length >= 3) {
    const usualDays = Math.round(365 / perYear);
    const since = daysBetween(last.exDate, day);
    if (since > usualDays * DIVIDEND_STOP_GAPS) stop = { lastExDate: last.exDate, daysSince: since, usualDays };
  }
  return { lastDividend: { exDate: last.exDate, amount: last.amount }, dividendCut: cut, dividendStop: stop };
}

/* ── our call ───────────────────────────────────────────────────────────── */

/**
 * A move down to Trim counts once it has lasted this long. The replay found
 * the call engine's fresh turns to Trim come about twice a quarter per stock;
 * held for 14 days, about one in six quarters.
 */
export const CALL_SETTLE_DAYS = 14;

export function callWordOf(stance: string | null | undefined): CallWord | null {
  const key = String(stance ?? "").trim().toLowerCase();
  if (key === "accumulate" || key === "buy" || key === "add") return "Add";
  if (key === "hold" || key === "watch") return "Hold";
  if (key === "trim" || key === "avoid" || key === "sell" || key === "reduce") return "Trim";
  return null;
}

/** The call on `day` and when it last changed, from dated call records (any order). */
export function callFacts(records: ReadonlyArray<{ date: string; stance: string }>, day: string): Pick<StockFacts, "call" | "callTurnedDown"> {
  const sorted = records
    .map((record) => ({ date: record.date.slice(0, 10), word: callWordOf(record.stance) }))
    .filter((record): record is { date: string; word: CallWord } => record.word !== null && record.date <= day)
    .sort((a, b) => a.date.localeCompare(b.date));
  let call = null as CallState | null;
  for (const record of sorted) {
    const current: CallState | null = call;
    if (!current || current.word !== record.word) call = { word: record.word, since: record.date, from: current?.word ?? null };
  }
  const turnedDown = call && call.word === "Trim" && call.from && daysBetween(call.since, day) >= CALL_SETTLE_DAYS ? { from: call.from, day: call.since } : null;
  return { call, callTurnedDown: turnedDown };
}

/* ── unexplained falls ──────────────────────────────────────────────────── */

/**
 * A fall counts when its gap to the market is this many times the stock's
 * median daily gap, and at least BIG_DROP_MIN_PCT. Written down as 3 times and
 * 4%; the replay over two years found that fired 1.5 times a quarter per
 * stock, so it is 5 times and 8% (0.29 a quarter, before explained moves are
 * taken out).
 */
export const BIG_DROP_MULTIPLE = 5;
/** Sessions the median daily move is taken over. */
export const BIG_DROP_LOOKBACK = 90;
/** Only falls on the last few sessions are news. */
export const BIG_DROP_RECENT = 5;
/** And never a gap smaller than this, so a very quiet stock's 3% day is not an alarm. */
export const BIG_DROP_MIN_PCT = 8;

type Series = { dates: readonly string[]; closes: readonly number[] };

const RETURNS = new WeakMap<Series, Map<string, number>>();

/** Daily returns in percent by day, from a series of closes; worked out once per series object. */
function returnsByDay(series: Series): Map<string, number> {
  const known = RETURNS.get(series);
  if (known) return known;
  const out = new Map<string, number>();
  RETURNS.set(series, out);
  for (let i = 1; i < series.dates.length; i++) {
    const prev = series.closes[i - 1]!;
    const close = series.closes[i]!;
    if (prev > 0 && close > 0) out.set(series.dates[i]!, (close / prev - 1) * 100);
  }
  return out;
}

/**
 * The biggest fall among the last BIG_DROP_RECENT sessions up to `day`,
 * measured against the S&P 500 (`market`, SPY closes) so a day the whole
 * market fell is not the company's news. It counts when the stock's move
 * minus the market's is at least BIG_DROP_MULTIPLE times its median absolute
 * gap over the BIG_DROP_LOOKBACK sessions before, and at least
 * BIG_DROP_MIN_PCT; days `explained` says have a stored reason are skipped.
 * `pct` is the stock's own move; `typicalPct` its usual gap to the market.
 */
export function bigDropOf(
  series: Series | null,
  day: string,
  explained: (day: string) => boolean = () => false,
  market: Series | null = null,
  limits: { multiple: number; minPct: number } = { multiple: BIG_DROP_MULTIPLE, minPct: BIG_DROP_MIN_PCT },
): StockFacts["bigDrop"] {
  if (!series) return null;
  let end = series.dates.length - 1;
  while (end >= 0 && series.dates[end]! > day) end -= 1;
  if (end < BIG_DROP_LOOKBACK + BIG_DROP_RECENT) return null;
  const marketMoves = market ? returnsByDay(market) : null;
  const gap = (i: number): { own: number; excess: number } | null => {
    const prev = series.closes[i - 1]!;
    const close = series.closes[i]!;
    if (!(prev > 0 && close > 0)) return null;
    const own = (close / prev - 1) * 100;
    if (!marketMoves) return { own, excess: own };
    const marketMove = marketMoves.get(series.dates[i]!);
    return marketMove === undefined ? null : { own, excess: own - marketMove };
  };
  const usual: number[] = [];
  for (let i = end - BIG_DROP_RECENT - BIG_DROP_LOOKBACK + 1; i <= end - BIG_DROP_RECENT; i++) {
    const move = gap(i);
    if (move) usual.push(Math.abs(move.excess));
  }
  if (usual.length < BIG_DROP_LOOKBACK / 2) return null;
  const sorted = [...usual].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)]!;
  let worst: StockFacts["bigDrop"] = null;
  let worstExcess = 0;
  for (let i = end - BIG_DROP_RECENT + 1; i <= end; i++) {
    const move = gap(i);
    if (!move || move.own >= 0 || move.excess >= 0) continue;
    if (-move.excess < Math.max(limits.minPct, typical * limits.multiple)) continue;
    if (explained(series.dates[i]!)) continue;
    if (!worst || move.excess < worstExcess) {
      worst = { day: series.dates[i]!, pct: move.own, typicalPct: typical, marketPct: move.own - move.excess };
      worstExcess = move.excess;
    }
  }
  return worst;
}

/**
 * Closes that must all sit past a price line before it counts as crossed.
 * The replay found single closes flapping across a trade's 15% lines; three
 * in a row cut that sharply.
 */
export const CONFIRM_CLOSES = 3;

/** The last `count` closes on or before `day`, oldest first, or null when there are fewer. */
export function recentClosesOn(series: Series | null, day: string, count = CONFIRM_CLOSES): number[] | null {
  if (!series) return null;
  const out: number[] = [];
  for (let i = series.dates.length - 1; i >= 0 && out.length < count; i--) {
    if (series.dates[i]! <= day && series.closes[i]! > 0) out.unshift(series.closes[i]!);
  }
  return out.length === count ? out : null;
}

/** The last close on or before `day`. */
export function closeOn(series: { dates: readonly string[]; closes: readonly number[] } | null, day: string): { value: number; day: string } | null {
  if (!series) return null;
  for (let i = series.dates.length - 1; i >= 0; i--) {
    if (series.dates[i]! <= day && series.closes[i]! > 0) return { value: series.closes[i]!, day: series.dates[i]! };
  }
  return null;
}

/* ── words in an explained move ─────────────────────────────────────────── */

/** Explanations that name a recall, a lawsuit, a probe or a regulator. Whole words only. */
export const TROUBLE_WORDS = /\b(?:recalls?|recalled|lawsuits?|sued|sues|class action|probes?|investigations?|subpoena|antitrust|FTC|DOJ|SEC charges?|regulators?|regulatory action|FDA (?:rejects?|rejected|warning|declines?|refuses?)|complete response letter|ban(?:s|ned)?|fined|penalty)\b/i;

/** Whether an explanation headline names trouble for the company. */
export function namesTrouble(text: string | null | undefined): boolean {
  return TROUBLE_WORDS.test(String(text ?? ""));
}

/* ── revenue history ────────────────────────────────────────────────────── */

export type YearFigures = { label: string; revenue: number | null; eps: number | null; netIncome: number | null; fcf: number | null };

/**
 * The last full fiscal year's revenue growth from a list of yearly figures,
 * newest first, ignoring a trailing-twelve-month row ("TTM").
 */
export function priorYearGrowth(years: readonly YearFigures[]): { pct: number; label: string } | null {
  const full = years.filter((year) => /^FY\s*\d{4}$/i.test(year.label.trim()));
  // Right after a fiscal year closes, the trailing twelve months are that same year; compare with the year before it instead.
  const ttm = years.find((year) => /^TTM$/i.test(year.label.trim()));
  const sameAsLatest = Boolean(ttm?.revenue && full[0]?.revenue && Math.abs(ttm.revenue / full[0].revenue - 1) < 0.002);
  const [latest, before] = sameAsLatest ? full.slice(1) : full;
  if (!latest || !before || !fin(latest.revenue) || !fin(before.revenue) || before.revenue <= 0) return null;
  const year = latest.label.replace(/\D/g, "");
  return { pct: (latest.revenue / before.revenue - 1) * 100, label: `fiscal ${year}` };
}

/** The value at the given quantile (0 to 1) of the finite numbers, or null. */
export function quantile(values: readonly number[], q: number): number | null {
  const sorted = values.filter(fin).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}
