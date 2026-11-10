/**
 * The read for a backtest result: how the mix did against its benchmark in
 * plain words, where the gain came from, and which holdings carried it.
 * Pure, so the client workbench can rebuild it after every run. Always
 * labelled as a backtest with its period.
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { CurveStats, WeightsHolding, YearRow } from "@/lib/backtest/types";

const MINUS = "−";

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  const body = Math.abs(rounded) >= 1000 ? Math.round(Math.abs(rounded)).toLocaleString("en-US") : Math.abs(rounded).toFixed(digits);
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${body}%`;
}

function pts(value: number): string {
  return `${Math.abs(value * 100).toFixed(1)} pts`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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

export function buildBacktestRead(run: BacktestReadInput, mixLabel = "this mix"): TheRead {
  const s = run.summary.strategy;
  const b = run.summary.benchmark;
  const perYear = s.annualized_return !== null && b.annualized_return !== null;
  const mine = perYear ? (s.annualized_return as number) : s.total_return;
  const theirs = perYear ? (b.annualized_return as number) : b.total_return;
  const gap = mine - theirs;
  const unit = perYear ? " a year" : "";
  const deeper = s.max_drawdown < b.max_drawdown - 0.02;
  const shallower = s.max_drawdown > b.max_drawdown + 0.02;
  const range = `${run.period.start.slice(0, 4)} to ${run.period.end.slice(0, 4)}`;

  const headline =
    `${gap >= 0 ? "Beat" : "Trailed"} ${run.benchmark} by ${pts(gap)}${unit} from ${range}` +
    (gap >= 0 && deeper
      ? `, but with a deeper worst drop (${signedPct(s.max_drawdown, 0)} vs ${signedPct(b.max_drawdown, 0)}).`
      : gap < 0 && shallower
        ? `, with a shallower worst drop (${signedPct(s.max_drawdown, 0)} vs ${signedPct(b.max_drawdown, 0)}).`
        : ".");

  const result: Insight = {
    id: "result",
    tone: toneOfChange(gap, 0.002),
    text: `${mixLabel.charAt(0).toUpperCase()}${mixLabel.slice(1)} returned ${signedPct(mine)}${perYear ? " a year" : " in total"} against ${signedPct(theirs)} for ${run.benchmark}.`,
    soWhat: `Worst drop ${signedPct(s.max_drawdown, 0)} (${monthYear(s.max_drawdown_peak)} to ${monthYear(s.max_drawdown_trough)}) against ${signedPct(b.max_drawdown, 0)} for ${run.benchmark}.`,
  };

  // Where the lead (or the gap) came from: the complete years furthest from the benchmark.
  let years: Insight | null = null;
  const complete = run.years.filter((row) => row.complete);
  if (complete.length >= 3) {
    const sorted = [...complete].sort((x, y) => (gap >= 0 ? y.strategy - y.benchmark - (x.strategy - x.benchmark) : x.strategy - x.benchmark - (y.strategy - y.benchmark)));
    const picks = sorted.slice(0, 2).filter((row) => Math.abs(row.strategy - row.benchmark) > 0.02 && (gap >= 0 ? row.strategy > row.benchmark : row.strategy < row.benchmark));
    const beat = complete.filter((row) => row.beat).length;
    if (picks.length > 0) {
      years = {
        id: "years",
        tone: gap >= 0 ? "up" : "down",
        text: `${gap >= 0 ? "Most of the lead came in" : "It fell behind most in"} ${listWords(picks.map((row) => `${row.year} (${signedPct(row.strategy, 0)} vs ${signedPct(row.benchmark, 0)})`))}.`,
        soWhat: `It beat ${run.benchmark} in ${beat} of ${complete.length} full years.`,
      };
    }
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
      text: `${best.symbol} did the heavy lifting: ${signedPct(best.total_return, 0)} on its own at a ${Math.round(best.weight * 100)}% weight.`,
      soWhat:
        worst.symbol !== best.symbol && worst.total_return < best.total_return
          ? `${worst.symbol} did the least: ${signedPct(worst.total_return, 0)} at ${Math.round(worst.weight * 100)}%.`
          : undefined,
      tickers: [best.symbol, ...(worst.symbol !== best.symbol ? [worst.symbol] : [])],
    };
  }

  return {
    headline,
    insights: pickInsights([result, years, carry]),
    source: `Backtested, not traded · ${monthYear(run.period.start)} to ${monthYear(run.period.end)}`,
  };
}
