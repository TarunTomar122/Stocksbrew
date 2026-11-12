import type { Insight, TheRead } from "@/lib/insights";

/**
 * The "what if" stress test: replay real market episodes on today's portfolio.
 *
 * For each episode, every holding's return between two closes (adjusted, so
 * dividends count), weighted by today's weights and held through the window,
 * next to the S&P 500 (SPY) over the same closes. Holdings that were not
 * trading yet are listed and the result says what share of the portfolio it
 * covers; nothing is filled in from the index. Pure functions, safe on both
 * sides; the loader is `lib/stress-test-data.ts`.
 */

export type Episode = {
  id: string;
  /** The name after "the" in a sentence: "2022 rate-hike slide". */
  name: string;
  /** First and last close of the window, YYYY-MM-DD, both trading days in the SPY series. */
  start: string;
  end: string;
  /** One sentence on what happened. */
  what: string;
  /** Whether the market fell or rose over the window; the read treats them apart. */
  kind: "fall" | "rise";
};

/**
 * Windows pinned to the S&P 500's (SPY's) own closes in our stored history,
 * (about twelve years, rolling forward; runStressTest drops an episode the
 * S&P 500 series no longer reaches): each start is the close before the slide (or
 * rally) and each end is the low (or the record) that closed it.
 */
export const EPISODES: readonly Episode[] = [
  {
    id: "china-2015",
    name: "2015 China scare",
    start: "2015-08-17",
    end: "2015-08-25",
    what: "China let its currency fall, and fear about its slowing economy set off a sharp sell-off around the world.",
    kind: "fall",
  },
  {
    id: "selloff-2018",
    name: "late-2018 sell-off",
    start: "2018-09-20",
    end: "2018-12-24",
    what: "The Fed kept raising rates while the trade fight with China grew, and stocks slid until Christmas Eve.",
    kind: "fall",
  },
  {
    id: "covid-crash",
    name: "Covid crash",
    start: "2020-02-19",
    end: "2020-03-23",
    what: "Lockdowns shut much of the world economy, and stocks made their fastest fall ever from a record high into a bear market.",
    kind: "fall",
  },
  {
    id: "covid-rebound",
    name: "2020 rebound",
    start: "2020-03-23",
    end: "2020-08-18",
    what: "Emergency support from the Fed and the government set off a rally that took the S&P 500 back to a record by mid-August.",
    kind: "rise",
  },
  {
    id: "rates-2022",
    name: "2022 rate-hike slide",
    start: "2022-01-03",
    end: "2022-10-12",
    what: "Inflation hit a 40-year high and the Fed raised rates faster than it had in decades.",
    kind: "fall",
  },
  {
    id: "banks-2023",
    name: "2023 bank scare",
    start: "2023-03-08",
    end: "2023-03-13",
    what: "Silicon Valley Bank failed after a run on its deposits, and the fear spread to other regional banks.",
    kind: "fall",
  },
  {
    id: "yen-2024",
    name: "2024 yen unwind",
    start: "2024-07-16",
    end: "2024-08-05",
    what: "Money moved out of big tech, a weak US jobs report added to the worry, and a rate rise in Japan forced traders who had borrowed cheaply in yen to sell.",
    kind: "fall",
  },
  {
    id: "tariffs-2025",
    name: "2025 tariff shock",
    start: "2025-04-02",
    end: "2025-04-08",
    what: "The US announced import tariffs on almost every trading partner, and stocks fell hard until a pause on April 9.",
    kind: "fall",
  },
];

/** A close may sit up to this many calendar days before the asked day (a halt, a gap in the feed). */
const MAX_GAP_DAYS = 5;
/** Below this share of the portfolio we do not give a portfolio figure for an episode. */
export const MIN_COVERAGE = 50;
/** A market move smaller than this (in %) is too small to compare against. */
const RATIO_MIN_MARKET = 2;

export type DailyCloses = { dates: string[]; closes: number[] };
export type DatedClose = { date: string; close: number };

/** What the page needs from one symbol's history: where it starts and ends, and its closes at each episode's edges. */
export type EpisodeCloses = {
  /** An ETF or mutual fund (from the price feed's instrument type). */
  fund?: boolean;
  first: string | null;
  last: string | null;
  points: Record<string, { start: DatedClose | null; end: DatedClose | null }>;
};

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** The close on `day`, else the last one before it within a few days, else null. Dates are sorted oldest first. */
export function closeOnOrBefore(series: DailyCloses, day: string, maxGapDays = MAX_GAP_DAYS): DatedClose | null {
  const n = Math.min(series.dates.length, series.closes.length);
  let lo = 0;
  let hi = n - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid]! <= day) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const date = series.dates[found]!;
  const close = series.closes[found]!;
  if (!(typeof close === "number" && Number.isFinite(close) && close > 0)) return null;
  if (dayNumber(day) - dayNumber(date) > maxGapDays) return null;
  return { date, close };
}

/** One symbol's history cut down to the closes the episodes use. */
export function episodeCloses(series: DailyCloses, episodes: readonly Episode[] = EPISODES, fund = false): EpisodeCloses {
  const n = Math.min(series.dates.length, series.closes.length);
  const points: EpisodeCloses["points"] = {};
  for (const episode of episodes) {
    points[episode.id] = { start: closeOnOrBefore(series, episode.start), end: closeOnOrBefore(series, episode.end) };
  }
  return { fund, first: n > 0 ? series.dates[0]! : null, last: n > 0 ? series.dates[n - 1]! : null, points };
}

export type StressHolding = {
  ticker: string;
  /** Short company or fund name. */
  name: string;
  /** Today's weight, 0 to 100. */
  weight: number;
};

export type HoldingMoveStatus = "ok" | "not-yet" | "no-history";

export type HoldingMove = {
  ticker: string;
  name: string;
  /** Today's weight in the whole portfolio, 0 to 100. */
  weight: number;
  status: HoldingMoveStatus;
  /** Return over the window in %, null unless status is "ok". */
  pct: number | null;
  /** Percentage points this holding added to the portfolio's result (weight within the covered part x return). */
  contribution: number | null;
  /** First stored close, for "not trading until ..."; null when we hold no prices for it. */
  firstDate: string | null;
  /** A fund: it is left out of "did the most damage" while a stock can take that place, since a broad fund mostly is the market. */
  fund: boolean;
};

export type EpisodeResult = {
  episode: Episode;
  /** S&P 500 (SPY) return over the window in %, null when the benchmark has no closes for it. */
  market: number | null;
  /** The covered holdings' return in %, null when they make up less than MIN_COVERAGE of the portfolio. */
  portfolio: number | null;
  /** Share of today's portfolio (0 to 100) whose return is known for this window. */
  covered: number;
  /** Every holding, best to worst, then the ones that were not around. */
  moves: HoldingMove[];
  /** Lowest and highest return among covered holdings (null when fewer than two were around). */
  worst: HoldingMove | null;
  best: HoldingMove | null;
  /** The holding that took the most off the result (negative contribution), or added the most in a rise. */
  driver: HoldingMove | null;
  /** When the driver is a fund, the single stock that did the most in the same direction, if any. */
  stockDriver: HoldingMove | null;
  /** portfolio / market when both are known and the market moved at least RATIO_MIN_MARKET %. */
  ratio: number | null;
};

export type StressResult = {
  episodes: EpisodeResult[];
  holdings: StressHolding[];
  /** "value" when weights come from position values, "count" when every holding counts the same. */
  basis: "value" | "count";
  /** Holdings left out because they have no value while others do. */
  unvalued: string[];
};

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function windowReturn(points: EpisodeCloses | null | undefined, episode: Episode): number | null {
  const at = points?.points[episode.id];
  if (!at?.start || !at.end) return null;
  // The window's closes must be the episode's own days (give or take a gap), and in order.
  if (at.end.date <= at.start.date) return null;
  return (at.end.close / at.start.close - 1) * 100;
}

/**
 * Why a holding has no return for an episode. "not-yet" only when its prices
 * start after the episode began and well after the S&P 500's do; a series that
 * starts with the index's is just the edge of our stored history.
 */
function missingStatus(points: EpisodeCloses | null | undefined, episode: Episode, historyFirst: string | null): HoldingMoveStatus {
  if (!points || !points.first) return "no-history";
  if (points.first <= episode.start) return "no-history";
  if (historyFirst && dayNumber(points.first) - dayNumber(historyFirst) <= 7) return "no-history";
  return "not-yet";
}

/**
 * Turn holdings with (maybe missing) values into weights. By value when any
 * holding has one, leaving out the ones without; equal weights when none do.
 */
export function weightHoldings(input: Array<{ ticker: string; name: string; value: number | null }>): Pick<StressResult, "holdings" | "basis" | "unvalued"> {
  const seen = new Map<string, { ticker: string; name: string; value: number | null }>();
  for (const item of input) {
    const ticker = item.ticker.trim().toUpperCase();
    if (!ticker) continue;
    const value = typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0 ? item.value : null;
    const prior = seen.get(ticker);
    // The same ticker twice (two share classes saved apart, a duplicate row): add the values up.
    if (prior) prior.value = prior.value !== null && value !== null ? prior.value + value : prior.value ?? value;
    else seen.set(ticker, { ticker, name: item.name || ticker, value });
  }
  const all = [...seen.values()];
  const valued = all.filter((item) => item.value !== null);
  if (valued.length > 0) {
    const total = valued.reduce((sum, item) => sum + item.value!, 0);
    return {
      holdings: valued.map((item) => ({ ticker: item.ticker, name: item.name, weight: (item.value! / total) * 100 })),
      basis: "value",
      unvalued: all.filter((item) => item.value === null).map((item) => item.ticker),
    };
  }
  return {
    holdings: all.map((item) => ({ ticker: item.ticker, name: item.name, weight: all.length > 0 ? 100 / all.length : 0 })),
    basis: "count",
    unvalued: [],
  };
}

/**
 * The holding that moved the result most in its direction: the most negative
 * weighted contribution in a fall, the most positive in a rise. Needs at
 * least two holdings with a return, and a move that does not round to zero.
 */
function pickDriver(ok: HoldingMove[], direction: "down" | "up", stocksOnly = false): HoldingMove | null {
  if (ok.length < 2) return null;
  const sign = direction === "down" ? -1 : 1;
  const pool = ok.filter(
    (move) => move.contribution !== null && sign * move.contribution > 0 && Math.abs(move.pct!) >= 0.05 && (!stocksOnly || !move.fund),
  );
  return pool.sort((a, b) => sign * (b.contribution! - a.contribution!))[0] ?? null;
}

export function runEpisode(
  episode: Episode,
  holdings: readonly StressHolding[],
  closes: ReadonlyMap<string, EpisodeCloses>,
  benchmark: EpisodeCloses | null,
): EpisodeResult {
  const known = holdings.map((holding) => ({ holding, pct: windowReturn(closes.get(holding.ticker), episode) }));
  const coveredWeight = known.filter((item) => item.pct !== null).reduce((sum, item) => sum + item.holding.weight, 0);
  const totalWeight = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  const covered = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0;
  const historyFirst = benchmark?.first ?? null;

  const moves: HoldingMove[] = known.map(({ holding, pct }) => ({
    ticker: holding.ticker,
    name: holding.name,
    weight: holding.weight,
    status: pct !== null ? "ok" : missingStatus(closes.get(holding.ticker), episode, historyFirst),
    pct: pct !== null ? round(pct) : null,
    contribution: pct !== null && coveredWeight > 0 ? round((holding.weight / coveredWeight) * pct) : null,
    firstDate: closes.get(holding.ticker)?.first ?? null,
    fund: Boolean(closes.get(holding.ticker)?.fund),
  }));
  moves.sort((a, b) => {
    if (a.pct === null || b.pct === null) return a.pct === null && b.pct === null ? b.weight - a.weight : a.pct === null ? 1 : -1;
    return b.pct - a.pct || b.weight - a.weight;
  });

  const ok = moves.filter((move) => move.pct !== null);
  const portfolioRaw = coveredWeight > 0 ? ok.reduce((sum, move) => sum + move.contribution!, 0) : null;
  const portfolio = portfolioRaw !== null && covered >= MIN_COVERAGE ? round(portfolioRaw) : null;
  const marketRaw = windowReturn(benchmark, episode);
  const market = marketRaw !== null ? round(marketRaw) : null;

  const worst = ok.length >= 2 ? ok[ok.length - 1]! : null;
  const best = ok.length >= 2 ? ok[0]! : null;
  const direction = portfolio !== null && portfolio < 0 ? "down" : "up";
  const driver = portfolio === null || Math.abs(portfolio) < 0.05 ? null : pickDriver(ok, direction);
  const stockDriver = driver?.fund ? pickDriver(ok, direction, true) : null;
  // Kept unrounded so a flat portfolio is not read as a move the other way.
  const ratio = portfolio !== null && market !== null && Math.abs(market) >= RATIO_MIN_MARKET ? portfolio / market : null;

  return { episode, market, portfolio, covered: round(covered, 2), moves, worst, best, driver, stockDriver, ratio };
}

export function runStressTest(
  input: Pick<StressResult, "holdings" | "basis" | "unvalued">,
  closes: ReadonlyMap<string, EpisodeCloses>,
  benchmark: EpisodeCloses | null,
  episodes: readonly Episode[] = EPISODES,
): StressResult {
  // An episode older than the stored S&P 500 history (it rolls forward) is left out, not shown as "nobody was trading".
  const reachable = episodes.filter((episode) => !benchmark?.first || benchmark.first <= episode.start);
  return { ...input, episodes: reachable.map((episode) => runEpisode(episode, input.holdings, closes, benchmark)) };
}

/* ── words ─────────────────────────────────────────────────────────────── */

const FLAT = 0.05;

/** "31%" for big moves, "3.4%" under ten, no sign: the sentence carries the direction. */
export function pctWords(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 9.95) return `${Math.round(abs)}%`;
  return `${abs.toFixed(1).replace(/\.0$/, "")}%`;
}

/** "+31%" / "−3.4%" for tables and bars. */
export function signedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const text = pctWords(value);
  if (text === "0%") return "0%";
  return `${value > 0 ? "+" : "−"}${text}`;
}

/** A gap between two returns: "2 points", "1.5 points", "12 points". */
function pointsWords(value: number): string {
  const text = pctWords(value).replace("%", "");
  return `${text} ${text === "1" ? "point" : "points"}`;
}

/** "down 31%", "up 2.1%", "flat". */
function changeWords(value: number): string {
  if (Math.abs(value) < FLAT) return "flat";
  return `${value < 0 ? "down" : "up"} ${pctWords(value)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayParts(iso: string): { y: number; m: string; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: MONTHS[(m ?? 1) - 1]!, d: d! };
}

/** "Feb 19 to Mar 23, 2020", or "Dec 20, 2018 to Jan 4, 2019" across a year end. */
export function windowWords(start: string, end: string): string {
  const a = dayParts(start);
  const b = dayParts(end);
  if (a.y !== b.y) return `${a.m} ${a.d}, ${a.y} to ${b.m} ${b.d}, ${b.y}`;
  if (a.m === b.m) return `${a.m} ${a.d} to ${b.d}, ${b.y}`;
  return `${a.m} ${a.d} to ${b.m} ${b.d}, ${b.y}`;
}

/** Calendar length, which reads better than trading days: "8 days", "3 weeks", "9 months". */
export function lengthWords(start: string, end: string): string {
  const days = dayNumber(end) - dayNumber(start);
  if (days < 14) return `${days} days`;
  if (days < 63) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30.44)} months`;
}

/** First letter up, except for names that start lower-case on purpose (iShares, eBay). */
function sentenceCase(text: string): string {
  if (/^[a-z][A-Z]/.test(text)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Title for a row: "The 2022 rate-hike slide", "The Covid crash". */
export function episodeTitle(episode: Episode): string {
  return `The ${episode.name}`;
}

function times(ratio: number): string {
  if (ratio >= 1.95 && ratio < 2.05) return "twice";
  return `${ratio.toFixed(1).replace(/\.0$/, "")} times`;
}

function isFlat(value: number): boolean {
  return Math.abs(value) < FLAT;
}

/**
 * How the portfolio's move compares with the market's, in words: "fell about
 * 1.4 times as much as the S&P 500", "fell about as much", "fell about 60% as
 * much", "rose while the S&P 500 fell". Null when there is nothing fair to say.
 */
export function ratioWords(result: Pick<EpisodeResult, "portfolio" | "market" | "ratio">): string | null {
  const { portfolio, market, ratio } = result;
  if (portfolio === null || market === null || ratio === null) return null;
  const verb = market < 0 ? "fell" : "rose";
  if (isFlat(portfolio)) return `was flat while the S&P 500 ${verb} ${pctWords(market)}`;
  if (ratio <= 0) return market < 0 ? "rose while the S&P 500 fell" : "fell while the S&P 500 rose";
  if (ratio >= 0.9 && ratio < 1.1) return `${verb} about as much as the S&P 500`;
  if (ratio >= 1.1) return `${verb} about ${times(ratio)} as much as the S&P 500`;
  if (ratio < 0.15) return `barely ${verb} while the S&P 500 ${verb} ${pctWords(market)}`;
  if (ratio >= 0.45 && ratio < 0.55) return `${verb} about half as much as the S&P 500`;
  return `${verb} about ${Math.round(ratio * 10) * 10}% as much as the S&P 500`;
}

/** The same comparison for a narrow column: "1.4× the S&P's move", "About the same as the S&P", "Rose, S&P fell". */
export function ratioShort(result: Pick<EpisodeResult, "portfolio" | "market" | "ratio">): string | null {
  const { portfolio, market, ratio } = result;
  if (portfolio === null || market === null || ratio === null) return null;
  if (isFlat(portfolio)) return market < 0 ? "Flat, S&P fell" : "Flat, S&P rose";
  if (ratio <= 0) return market < 0 ? "Rose, S&P fell" : "Fell, S&P rose";
  if (ratio >= 0.9 && ratio < 1.1) return "About the same as the S&P";
  if (ratio < 0.15) return market < 0 ? "Barely fell, S&P fell" : "Barely rose, S&P rose";
  return `${ratio.toFixed(1)}× the S&P's move`;
}

/** "Nvidia, down 50%" / "Exxon Mobil, up 2.1%". */
function moveWords(move: HoldingMove): string {
  if (move.pct === null) return move.name;
  return `${move.name}, ${changeWords(move.pct)}`;
}

function verbFor(value: number, conditional: boolean): string {
  if (isFlat(value)) return conditional ? "would have ended flat" : "ended flat";
  if (value < 0) return conditional ? `would have lost ${pctWords(value)}` : `lost ${pctWords(value)}`;
  return conditional ? `would have gained ${pctWords(value)}` : `gained ${pctWords(value)}`;
}

/** ", against 25% for the S&P 500" after a loss; "while the S&P 500 rose 3%" otherwise. */
function marketAfter(portfolio: number, market: number): string {
  if (isFlat(market)) return " while the S&P 500 was flat";
  if (portfolio < 0 && market < 0) return `, against ${pctWords(market)} for the S&P 500`;
  if (portfolio > 0 && market > 0) return `, against ${pctWords(market)} for the S&P 500`;
  return ` while the S&P 500 ${market < 0 ? "fell" : "rose"} ${pctWords(market)}`;
}

/** "NVIDIA did the most damage, down 62%", or the stock behind a fund: "of the single stocks, Apple did the most damage, down 31%". */
function driverClause(result: EpisodeResult): string | null {
  const lead = result.driver?.fund && result.stockDriver ? result.stockDriver : result.driver;
  if (!lead || lead.pct === null || result.portfolio === null) return null;
  const prefix = lead === result.stockDriver ? "of the single stocks, " : "";
  return result.portfolio < 0
    ? `${prefix}${lead.name} did the most damage, ${changeWords(lead.pct)}`
    : `${prefix}${lead.name} added the most, ${changeWords(lead.pct)}`;
}

/** The holding that did the most damage (or added the most) in an episode, as its own line: "AAPL did the most damage of the single stocks, down 31%." */
function driverPoint(result: EpisodeResult): Insight | null {
  const lead = result.driver?.fund && result.stockDriver ? result.stockDriver : result.driver;
  if (!lead || lead.pct === null || result.portfolio === null) return null;
  const among = lead === result.stockDriver ? " of the single stocks" : "";
  const loss = result.portfolio < 0;
  return {
    id: `driver-${lead.ticker}`,
    tone: lead.pct < 0 ? "down" : "up",
    // Starts with the ticker, which the read shows as the company's logo and name.
    text: `${lead.ticker} ${loss ? "did the most damage" : "added the most"}${among}, ${changeWords(lead.pct)}.`,
    tickers: [lead.ticker],
    leadName: lead.name,
  };
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function missingMoves(result: EpisodeResult): HoldingMove[] {
  return result.moves.filter((move) => move.status !== "ok");
}

/** The covered share as shown: never "100%" while something is missing, and 49.6 stays under half. */
export function coveredPct(result: Pick<EpisodeResult, "covered" | "moves">): number {
  const missing = result.moves.some((move) => move.status !== "ok");
  return missing ? Math.min(99, Math.floor(result.covered)) : Math.round(result.covered);
}

function namesWords(moves: HoldingMove[]): string {
  const names = moves.slice(0, 3).map((move) => move.name);
  if (moves.length > 3) return `${names.join(", ")} and ${moves.length - 3} more`;
  return listWords(names);
}

function coverageClause(result: EpisodeResult): string | null {
  const missing = missingMoves(result);
  if (missing.length === 0) return null;
  const late = missing.filter((move) => move.status === "not-yet");
  const none = missing.filter((move) => move.status !== "not-yet");
  const parts: string[] = [];
  if (late.length > 0) parts.push(`${namesWords(late)} ${late.length === 1 ? "was" : "were"} not trading yet`);
  if (none.length > 0) parts.push(`we have no prices around these dates for ${namesWords(none)}`);
  return `${parts.join(" and ")}, so this covers the other ${coveredPct(result)}% of the portfolio`;
}

/** Why an episode has no portfolio figure. */
function noFigureWords(result: EpisodeResult, subject: string): string {
  if (result.covered <= 0) {
    return result.moves.every((move) => move.status === "not-yet")
      ? "None of these holdings was trading yet."
      : "We have no prices around these dates for these holdings.";
  }
  return `Only ${coveredPct(result)}% of ${subject} had prices for these dates, too little to give a figure for the whole.`;
}

/**
 * The read: the worst episode as the headline, then how it compares with the
 * market across the sell-offs, where it did best against the market, who is
 * missing from the headline's figure, and the rally.
 */
export function buildStressRead(result: StressResult, options: { example: boolean }): TheRead | null {
  const subject = options.example ? "this portfolio" : "your portfolio";
  const usable = result.episodes.filter((item) => item.portfolio !== null && item.market !== null);
  const falls = usable.filter((item) => item.episode.kind === "fall");
  if (usable.length === 0) return null;

  const insights: Insight[] = [];
  const headlineTickers: string[] = [];
  let headline: string;

  const worst = [...falls].sort((a, b) => a.portfolio! - b.portfolio!)[0];
  const lead = worst && worst.portfolio! < 0 ? worst : null;
  if (lead) {
    // Part of the portfolio was not trading yet: the figure is for the part that was, and the headline says so.
    const missing = missingMoves(lead);
    const who =
      missing.length === 0
        ? subject
        : missing.every((move) => move.status === "not-yet")
          ? `the ${coveredPct(lead)}% of ${subject} that was trading then`
          : `the ${coveredPct(lead)}% of ${subject} we have prices for`;
    headline = `In the ${lead.episode.name} ${who} ${verbFor(lead.portfolio!, true)}${marketAfter(lead.portfolio!, lead.market!)}.`;
    // Who did the damage goes one line down, so the headline is one idea.
    const driver = driverPoint(lead);
    if (driver) {
      insights.push(driver);
      // The stock the read leads with, for callers that watch it (the portfolio home's "noticed" card).
      headlineTickers.push(driver.tickers![0]!);
    }
  } else if (falls.length > 0) {
    // It never lost money in a sell-off: say so, and the market's worst one goes one line down.
    const hardest = [...falls].sort((a, b) => a.market! - b.market!)[0]!;
    headline = `${sentenceCase(subject)} did not lose money in ${falls.length === 2 ? "either" : "any"} of the ${count(falls.length)} sell-offs.`;
    insights.push({
      id: `hardest-${hardest.episode.id}`,
      tone: isFlat(hardest.portfolio!) ? "flat" : "up",
      text: `In the ${hardest.episode.name} it ${verbFor(hardest.portfolio!, true)}${marketAfter(hardest.portfolio!, hardest.market!)}.`,
    });
  } else {
    const first = usable[0]!;
    headline = `In the ${first.episode.name} ${subject} ${verbFor(first.portfolio!, true)}${marketAfter(first.portfolio!, first.market!)}.`;
  }

  // How it fell against the market across every sell-off it can be measured in.
  const compared = falls.filter((item) => item.market! <= -RATIO_MIN_MARKET);
  if (compared.length >= 2) {
    const sumP = compared.reduce((sum, item) => sum + item.portfolio!, 0);
    const sumM = compared.reduce((sum, item) => sum + item.market!, 0);
    const worse = compared.filter((item) => item.portfolio! < item.market!).length;
    const together = sumP / sumM;
    const words = ratioWords({ portfolio: sumP, market: sumM, ratio: together });
    const tally =
      worse === compared.length
        ? "and it did worse than the market in every one of them"
        : worse === 0
          ? "and it did better than the market in every one of them"
          : `and it did worse than the market in ${count(worse)} of them`;
    insights.push({
      id: "together",
      tone: together > 1.1 ? "down" : together < 0.9 ? "up" : "flat",
      text: `Across the ${count(compared.length)} sell-offs, ${subject} ${words}, ${tally}.`,
      soWhat:
        together > 1.1
          ? "If that is more swing than you want, open an episode below to see which holdings drive it."
          : together < 0.9
            ? "It has cushioned falls so far, though the next one may hit different stocks."
            : "In a fall it has moved with the index.",
    });
  }

  // The sell-off where it did best against the market.
  const held = [...compared].sort((a, b) => b.portfolio! - b.market! - (a.portfolio! - a.market!))[0];
  if (held && held.portfolio! - held.market! >= 1) {
    const helped = held.best && held.best.pct! >= FLAT ? `, helped by ${moveWords(held.best)}` : "";
    insights.push({
      id: `held-${held.episode.id}`,
      tone: "up",
      text:
        held === lead
          ? `Even so, the ${held.episode.name} was its best showing against the market: ${pointsWords(held.portfolio! - held.market!)} better than the S&P 500.`
          : `It held up best in the ${held.episode.name}: ${changeWords(held.portfolio!)} while the S&P 500 fell ${pctWords(held.market!)}${helped}.`,
      tickers: helped && held !== lead ? [held.best!.ticker] : undefined,
    });
  } else if (lead && compared.length >= 2) {
    // No sell-off where it beat the market by a point: say where it lost least instead.
    const mildest = [...compared].filter((item) => item !== lead).sort((a, b) => b.portfolio! - a.portfolio!)[0];
    if (mildest) {
      insights.push({
        id: `mildest-${mildest.episode.id}`,
        tone: "flat",
        text:
          mildest.portfolio! < -FLAT
            ? `Its smallest loss came in the ${mildest.episode.name}: down ${pctWords(mildest.portfolio!)} against ${pctWords(mildest.market!)} for the S&P 500.`
            : `In the ${mildest.episode.name} it ${verbFor(mildest.portfolio!, true)} while the S&P 500 fell ${pctWords(mildest.market!)}.`,
      });
    }
  }

  // When the headline only covers part of the portfolio, say who is missing. A caveat, so it always keeps its place.
  const clause = lead ? coverageClause(lead) : null;
  const coverage: Insight | null = lead && clause ? { id: "coverage", tone: "flat", text: `In the ${lead.episode.name}, ${clause}.` } : null;

  // The rally, so the page is not only about losses.
  const rise = usable.find((item) => item.episode.kind === "rise");
  if (rise) {
    const leader = rise.driver?.fund && rise.stockDriver ? rise.stockDriver : rise.driver;
    const led = leader && leader.pct! >= FLAT && rise.portfolio! > 0 ? `, led by ${moveWords(leader)}` : "";
    insights.push({
      id: `rise-${rise.episode.id}`,
      tone: rise.portfolio! >= rise.market! ? "up" : "flat",
      text: `In the ${rise.episode.name} it ${verbFor(rise.portfolio!, true)}${marketAfter(rise.portfolio!, rise.market!)}${led}.`,
      tickers: led ? [leader!.ticker] : undefined,
    });
  }

  // The line the headline handed down (who did the damage, or the hardest sell-off) rides on top of the usual
  // three points, and the coverage caveat always keeps its place among them.
  const handed = insights[0]?.id.startsWith("driver-") || insights[0]?.id.startsWith("hardest-") ? insights.shift()! : null;
  const kept = insights.slice(0, coverage ? 2 : 3);
  return { headline, insights: [...(handed ? [handed] : []), ...kept, ...(coverage ? [coverage] : [])], headlineTickers };
}

/** One episode's detail: "Lost 31% while the S&P 500 fell 25%; NVIDIA did the most damage, down 50%." */
export function episodeSentence(result: EpisodeResult, subject = "this portfolio"): string {
  if (result.portfolio === null) return noFigureWords(result, subject);
  const p = result.portfolio;
  let text = sentenceCase(verbFor(p, false));
  if (result.market !== null) {
    text += isFlat(result.market) ? " while the S&P 500 was flat" : ` while the S&P 500 ${result.market < 0 ? "fell" : "rose"} ${pctWords(result.market)}`;
  }
  const driver = driverClause(result);
  if (driver) text += `; ${driver}`;
  text += ".";
  const cover = coverageClause(result);
  if (cover) text += ` ${sentenceCase(cover)}.`;
  return text;
}
