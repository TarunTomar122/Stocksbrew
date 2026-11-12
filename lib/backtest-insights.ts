/**
 * The read for a backtest result: how the mix did against its benchmark in
 * plain words, where the gain came from, and which holdings carried it.
 * Pure, so the client workbench can rebuild it after every run. Always
 * labelled as a backtest with its period.
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { CurveStats, WeightsHolding, YearRow } from "@/lib/backtest/types";
import { countWord } from "@/lib/plain-copy";

const MINUS = "−";

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  const body = Math.abs(rounded) >= 1000 ? Math.round(Math.abs(rounded)).toLocaleString("en-US") : Math.abs(rounded).toFixed(digits);
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${body}%`;
}

function pts(value: number): string {
  return `${Math.abs(value * 100).toFixed(1)} pts`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : iso;
}

export type BacktestReadInput = {
  benchmark: string;
  period: { start: string; end: string; years: number };
  summary: { strategy: CurveStats; benchmark: CurveStats };
  years: YearRow[];
  holdings: WeightsHolding[];
};

/** The comparison funds by what people call them; anything else keeps its ticker. */
const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "the S&P 500",
  QQQ: "the Nasdaq 100",
  IWM: "small US companies (IWM)",
  RSP: "the equal-weight S&P 500",
  AGG: "US bonds (AGG)",
};

export function benchmarkName(ticker: string): string {
  return BENCHMARK_NAMES[ticker] ?? ticker;
}

/** The sum the read imagines putting in on the first day. */
export const START_MONEY = 10_000;

/** What START_MONEY became after a total return, to the nearest $10: "$12,030". */
export function grownTo(totalReturn: number, start = START_MONEY): string {
  const value = Math.max(0, Math.round((start * (1 + totalReturn)) / 10) * 10);
  return `$${value.toLocaleString("en-US")}`;
}

export function buildBacktestRead(run: BacktestReadInput, mixLabel = "this mix"): TheRead {
  const s = run.summary.strategy;
  const b = run.summary.benchmark;
  const perYear = s.annualized_return !== null && b.annualized_return !== null;
  const mine = perYear ? (s.annualized_return as number) : s.total_return;
  const theirs = perYear ? (b.annualized_return as number) : b.total_return;
  const gap = mine - theirs;
  const bench = benchmarkName(run.benchmark);
  const mix = `${mixLabel.charAt(0).toUpperCase()}${mixLabel.slice(1)}`;

  // The result as money, the way people think about it: $10,000 in, what came out, against the index, and the worst drop.
  // One idea, one number (owner rule 8); the index and the worst drop are in the result card underneath.
  const headline = `${mix} would have turned $${START_MONEY.toLocaleString("en-US")} into ${grownTo(s.total_return)} since ${monthYear(run.period.start)}.`;

  // Each card leads with one number and one short takeaway, with its context in one line under it (owner rules 3, 8).
  const result: Insight = {
    id: "result",
    tone: toneOfChange(gap, 0.002),
    text:
      Math.abs(gap) < 0.0005
        ? `Level with ${bench}, which made ${signedPct(theirs)}${perYear ? " a year" : ""}.`
        : `${Math.abs(gap * 100).toFixed(1)} points${perYear ? " a year" : ""} ${gap >= 0 ? "ahead of" : "behind"} ${bench}, which made ${signedPct(theirs)}${perYear ? " a year" : ""}.`,
    soWhat: `The same $${START_MONEY.toLocaleString("en-US")} in ${bench} would be ${grownTo(b.total_return)}.`,
    figure: { value: signedPct(mine), label: perYear ? "a year" : "in total" },
  };

  // How often it beat the index, said as a person would ("behind the S&P 500 in all four full years"), led by the
  // complete year furthest from it in the direction of the overall result.
  let years: Insight | null = null;
  const complete = run.years.filter((row) => row.complete);
  if (complete.length >= 3) {
    const beat = complete.filter((row) => row.beat).length;
    const n = complete.length;
    // Counted on the side of the overall result ("behind in three of four"), unless no full year went that way.
    const ahead = gap >= 0 ? beat > 0 : beat === n;
    const k = ahead ? beat : n - beat;
    const sorted = [...complete].sort((x, y) => (ahead ? y.strategy - y.benchmark - (x.strategy - x.benchmark) : x.strategy - x.benchmark - (y.strategy - y.benchmark)));
    const lead = sorted.find((row) => Math.abs(row.strategy - row.benchmark) > 0.02 && (ahead ? row.strategy > row.benchmark : row.strategy < row.benchmark));
    const count = `${ahead ? "Ahead of" : "Behind"} ${bench} in ${k === n ? "all" : `${countWord(k)} of`} ${countWord(n)} full years`;
    const yearGap = lead ? lead.strategy - lead.benchmark : 0;
    years = {
      id: "years",
      tone: ahead ? "up" : "down",
      text: lead ? `${count}, ${k > 1 ? "most " : ""}in ${lead.year}: ${signedPct(lead.strategy, 0)} against ${signedPct(lead.benchmark, 0)}.` : `${count}.`,
      // The widest year as the figure. Without one in the result's direction the card shows none, not "2 of 5".
      figure: lead ? { value: `${yearGap < 0 ? MINUS : "+"}${pts(yearGap)}`, label: `in ${lead.year}` } : null,
    };
  }

  // Which holdings carried it: own return over the period, weight shown so a small line is not oversold.
  let carry: Insight | null = null;
  const holdings = run.holdings.filter((holding) => Number.isFinite(holding.total_return));
  if (holdings.length >= 2) {
    const sorted = [...holdings].sort((x, y) => y.total_return * y.weight - x.total_return * x.weight);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    carry = {
      id: "holdings",
      tone: best.total_return >= 0 ? "up" : "down",
      text: `${best.symbol} did the heavy lifting: ${signedPct(best.total_return, 0)} at a ${Math.round(best.weight * 100)}% weight.`,
      soWhat:
        worst.symbol !== best.symbol && worst.total_return < best.total_return
          ? `${worst.symbol} did the least: ${signedPct(worst.total_return, 0)} at ${Math.round(worst.weight * 100)}%.`
          : undefined,
      tickers: [best.symbol, ...(worst.symbol !== best.symbol ? [worst.symbol] : [])],
    };
  }

  // The takeaway for the mix: what its return against the index bought or cost at its worst moment. The worst fall
  // is drawn under the curve; this says what it means next to the gap.
  let tradeOff: Insight | null = null;
  const mineDrop = s.max_drawdown;
  const theirDrop = b.max_drawdown;
  if (Number.isFinite(mineDrop) && Number.isFinite(theirDrop) && mineDrop < 0 && theirDrop < 0) {
    // Positive when the mix fell less than the index at its worst; within 2 points counts as the same.
    const shallower = mineDrop - theirDrop;
    const same = Math.abs(shallower) < 0.02;
    // The index is named in each sentence already, except the one that says "the extra return".
    const drops = `${signedPct(mineDrop, 0)} against ${signedPct(theirDrop, 0)}`;
    const behind = gap < -0.0005;
    const ahead = gap > 0.0005;
    const text = behind
      ? shallower >= 0.02
        ? `Trailing ${bench} bought a smaller worst fall: ${drops}.`
        : same
          ? `It trailed ${bench} with about the same worst fall: ${drops}.`
          : `It trailed ${bench} and still fell further at its worst: ${drops}.`
      : ahead
        ? shallower >= 0.02
          ? `It beat ${bench} and fell less at its worst: ${drops}.`
          : same
            ? `It beat ${bench} with about the same worst fall: ${drops}.`
            : `The extra return came with a deeper worst fall: ${drops} for ${bench}.`
        : shallower >= 0.02
          ? `Level with ${bench}, with a smaller worst fall: ${drops}.`
          : `Level with ${bench}, and no gentler at its worst: ${drops}.`;
    tradeOff = {
      id: "trade-off",
      tone: shallower >= 0.02 ? "up" : same ? "flat" : "down",
      text,
      figure: { value: signedPct(mineDrop, 0), label: "at its worst" },
    };
  }

  return {
    headline,
    // Three cards (owner rule 7): the result against the index, what it cost at its worst, and which holding carried
    // it. Full years ahead or behind is the fallback, since the figures under the chart already count them.
    insights: pickInsights([result, tradeOff, carry, years], 3),
    source: `Backtested, not traded · ${monthYear(run.period.start)} to ${monthYear(run.period.end)}`,
  };
}
