/**
 * Which strategies are working this year, why (what the basket leans on), and
 * how the long test compares: the tally and gaps /strategies shows, and the
 * read on its share card.
 * Pure. Every return here is backtested and the text says so. Holdings are
 * named only when the caller says the viewer may see them (Pro).
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { StrategySummary } from "@/lib/strategies";

const MINUS = "−";

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * The gap between two returns in points, worked out from the same one-decimal figures the sentence shows, so
 * "+33.8% against +10.8%" reads "23.0 pts" and never "22.9 pts".
 */
function pts(mine: number, bench: number): string {
  const shown = (value: number) => Number((value * 100).toFixed(1));
  return `${Math.abs(shown(mine) - shown(bench)).toFixed(1)} pts`;
}

function sectorWord(sector: string): string {
  return sector.toLowerCase() === "technology" ? "tech" : sector.toLowerCase();
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : "";
}

/** ticker -> this year's return in percent (screener units, 12.3 = +12.3%). */
export type YtdMap = Record<string, number | undefined>;

/** "it is 48% tech today", or the top holdings that did the most this year when the viewer may see them. */
function leanText(
  sectors: { sector: string; weight: number }[],
  holdings: { symbol: string; weight: number }[],
  seesHoldings: boolean,
  ytd: YtdMap,
  direction: "up" | "down",
): { text: string; tickers: string[] } | null {
  const parts: string[] = [];
  const top = sectors[0];
  if (top && top.weight >= 0.3) parts.push(`today's basket is ${pct(top.weight)} ${sectorWord(top.sector)}`);
  let tickers: string[] = [];
  if (seesHoldings) {
    const priced = holdings
      .map((holding) => ({ symbol: holding.symbol, ret: ytd[holding.symbol] }))
      .filter((row): row is { symbol: string; ret: number } => typeof row.ret === "number" && Number.isFinite(row.ret));
    priced.sort((a, b) => (direction === "up" ? b.ret - a.ret : a.ret - b.ret));
    const movers = priced.slice(0, 2).filter((row) => (direction === "up" ? row.ret > 0 : row.ret < 0));
    if (movers.length > 0) {
      tickers = movers.map((row) => row.symbol);
      parts.push(
        `${direction === "up" ? "led by" : "dragged by"} ${listWords(movers.map((row) => `${row.symbol} (${row.ret > 0 ? "+" : row.ret < 0 ? MINUS : ""}${Math.abs(Math.round(row.ret))}% this year)`))}`,
      );
    }
  }
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return { text: `${text.charAt(0).toUpperCase()}${text.slice(1)}.`, tickers };
}

type Ranked = { item: StrategySummary; mine: number; bench: number; year: number; through: string };

/**
 * A strategy's return minus the S&P 500 fund's over its whole backtest, as a fraction: per year when the test is
 * long enough to annualise, in total when it is not (the table's "vs S&P 500" column). Null without a backtest.
 */
export function backtestGap(item: Pick<StrategySummary, "backtest">): number | null {
  const test = item.backtest;
  if (!test) return null;
  // Both sides on the same basis: per year when both are annualised, else both in total.
  const yearly = test.strategy.annualized_return != null && test.benchmark.annualized_return != null;
  const mine = yearly ? test.strategy.annualized_return : test.strategy.total_return;
  const theirs = yearly ? test.benchmark.annualized_return : test.benchmark.total_return;
  if (mine == null || theirs == null || !Number.isFinite(mine) || !Number.isFinite(theirs)) return null;
  return mine - theirs;
}

/**
 * Every count the strategies page states, from one list. `tested` is the strategies with a backtest (the table rows
 * with figures); both "beat the S&P 500" counts are out of it, so the read, its cards and the table head agree.
 * `thisYear` is only smaller than `tested` when a backtest has no row for the current year yet.
 */
export type StrategiesTally = {
  total: number;
  tested: StrategySummary[];
  untested: StrategySummary[];
  /** The tested strategies with at least 20 sessions this year, best first. */
  thisYear: Ranked[];
  /** Of `thisYear`, the ones ahead of the S&P 500 this year. */
  thisYearBeat: Ranked[];
  /** Of `tested`, the ones ahead of the S&P 500 over their whole backtest, in list order. */
  wholeTestBeat: StrategySummary[];
};

export function strategiesTally(items: StrategySummary[], year: number = new Date().getUTCFullYear()): StrategiesTally {
  const tested = items.filter((item) => backtestGap(item) !== null);
  const untested = items.filter((item) => backtestGap(item) === null);
  const thisYear: Ranked[] = [];
  for (const item of tested) {
    const row = item.backtest?.latest_year;
    if (!row || row.year !== year || row.sessions < 20) continue;
    thisYear.push({ item, mine: row.strategy, bench: row.benchmark, year: row.year, through: item.backtest?.period.end ?? "" });
  }
  thisYear.sort((a, b) => b.mine - a.mine);
  return {
    total: items.length,
    tested,
    untested,
    thisYear,
    thisYearBeat: thisYear.filter((row) => row.mine > row.bench),
    wholeTestBeat: tested.filter((item) => (backtestGap(item) ?? 0) > 0),
  };
}

/**
 * "2 of 10 backtested strategies beat the S&P 500 this year", or, when some backtests have no row for this year yet,
 * "2 of the 9 strategies backtested this year beat the S&P 500", so the denominator names its own list.
 */
function beatThisYear(count: number, tally: StrategiesTally): string {
  const of = tally.thisYear.length;
  return of === tally.tested.length
    ? `${count} of ${of} backtested strategies beat the S&P 500 this year`
    : `${count} of the ${of} strategies backtested this year beat the S&P 500`;
}

export function buildStrategiesRead(
  items: StrategySummary[],
  options: { seesHoldings: boolean; ytd?: YtdMap; year?: number; tally?: StrategiesTally },
): TheRead {
  const ytd = options.ytd ?? {};
  const year = options.year ?? new Date().getUTCFullYear();
  const tally = options.tally ?? strategiesTally(items, year);
  const ranked = tally.thisYear;

  const insights: Array<Insight | null> = [];
  let headline = "";
  if (ranked.length >= 2) {
    const lead = ranked[0];
    const last = ranked[ranked.length - 1];
    const beat = tally.thisYearBeat.length;
    const why = leanText(lead.item.sectors, lead.item.top_holdings, options.seesHoldings, ytd, "up");
    insights.push({
      id: "leader",
      tone: toneOfChange(lead.mine - lead.bench, 0.005),
      text: `Best this year: ${lead.item.name}, ${signedPct(lead.mine)} against ${signedPct(lead.bench)} for the S&P 500 (backtested through ${shortDay(lead.through)}).`,
      soWhat: why?.text,
      tickers: why?.tickers,
      action: { label: `Open ${lead.item.name}`, href: `/strategies/${lead.item.slug}` },
    });
    const drag = leanText(last.item.sectors, last.item.top_holdings, options.seesHoldings, ytd, "down");
    insights.push({
      id: "laggard",
      tone: toneOfChange(last.mine - last.bench, 0.005),
      text: `Worst this year: ${last.item.name}, ${signedPct(last.mine)}, ${pts(last.mine, last.bench)} ${last.mine >= last.bench ? "ahead of" : "behind"} the S&P 500.`,
      soWhat: drag?.text,
      tickers: drag?.tickers,
      action: { label: `Open ${last.item.name}`, href: `/strategies/${last.item.slug}` },
    });
    // The same list as the headline's when every backtest has a row this year, so the two counts share a denominator.
    const longBeat = tally.wholeTestBeat;
    const tested = tally.tested.length;
    const sameGroup = ranked.length === tested;
    insights.push({
      id: "long-run",
      tone: longBeat.length * 2 >= tested ? "up" : "down",
      figure: { value: `${longBeat.length} of ${tested}` },
      text: `Over their whole backtests, ${longBeat.length} of ${sameGroup ? `those ${tested}` : `the ${tested} backtested strategies`} beat the S&P 500${
        longBeat.length > 3
          ? `, including ${listWords(longBeat.slice(0, 3).map((item) => item.name))}`
          : longBeat.length > 0
          ? `: ${listWords(longBeat.map((item) => item.name))}`
          : ""
      }.`,
    });
    const gap = pts(lead.mine, lead.bench);
    headline =
      beat === 0
        ? `${beatThisYear(0, tally).replace(/^0 of/, "None of")}; ${lead.item.name} came closest, ${gap} behind.`
        : `${beat * 2 < ranked.length ? "Only " : ""}${beatThisYear(beat, tally)}; ${lead.item.name} is ${gap} ahead.`;
  }
  return {
    headline,
    insights: pickInsights(insights),
    source: ranked[0] ? `Backtested, not traded · prices through ${shortDay(ranked[0].through)}` : undefined,
  };
}
