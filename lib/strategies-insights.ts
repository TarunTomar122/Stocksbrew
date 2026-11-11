/**
 * The read for /strategies and /strategies/[slug]: which rules are working
 * this year, why (what the basket leans on), and how the long test compares.
 * Pure. Every return here is backtested and the text says so. Holdings are
 * named only when the caller says the viewer may see them (Pro).
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { Strategy, StrategySummary } from "@/lib/strategies";

const MINUS = "−";

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pts(value: number): string {
  return `${Math.abs(value * 100).toFixed(1)} pts`;
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

export function buildStrategiesRead(
  items: StrategySummary[],
  options: { seesHoldings: boolean; ytd?: YtdMap; year?: number },
): TheRead {
  const ytd = options.ytd ?? {};
  const year = options.year ?? new Date().getUTCFullYear();
  const ranked: Ranked[] = [];
  for (const item of items) {
    const row = item.backtest?.latest_year;
    if (!row || row.year !== year || row.sessions < 20) continue;
    ranked.push({ item, mine: row.strategy, bench: row.benchmark, year: row.year, through: item.backtest?.period.end ?? "" });
  }
  ranked.sort((a, b) => b.mine - a.mine);

  const insights: Array<Insight | null> = [];
  let headline = "";
  if (ranked.length >= 2) {
    const lead = ranked[0];
    const last = ranked[ranked.length - 1];
    const beat = ranked.filter((row) => row.mine > row.bench).length;
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
      text: `Worst this year: ${last.item.name}, ${signedPct(last.mine)}, ${pts(last.mine - last.bench)} ${last.mine >= last.bench ? "ahead of" : "behind"} the S&P 500.`,
      soWhat: drag?.text,
      tickers: drag?.tickers,
      action: { label: `Open ${last.item.name}`, href: `/strategies/${last.item.slug}` },
    });
    const long = items.filter((item) => item.backtest && item.backtest.period.years >= 3);
    const longBeat = long.filter(
      (item) => (item.backtest?.strategy.annualized_return ?? -Infinity) > (item.backtest?.benchmark.annualized_return ?? Infinity),
    );
    if (long.length > 0) {
      insights.push({
        id: "long-run",
        tone: longBeat.length * 2 >= long.length ? "up" : "down",
        text: `Over their full tests, ${longBeat.length} of ${long.length} beat the S&P 500${
          longBeat.length > 0 ? `: ${listWords(longBeat.slice(0, 3).map((item) => item.name))}` : ""
        }.`,
      });
    }
    headline =
      beat === 0
        ? `None of ${ranked.length} rules beat the S&P 500 this year; the closest, ${lead.item.name}, trails by ${pts(lead.mine - lead.bench)}.`
        : beat * 2 < ranked.length
        ? `Only ${beat} of ${ranked.length} rules beat the S&P 500 this year; the best, ${lead.item.name}, is ${pts(lead.mine - lead.bench)} ahead.`
        : `${beat} of ${ranked.length} rules beat the S&P 500 this year; the best, ${lead.item.name}, is ${pts(lead.mine - lead.bench)} ahead.`;
  }
  return {
    headline,
    insights: pickInsights(insights),
    source: ranked[0] ? `Backtested, not traded · prices through ${shortDay(ranked[0].through)}` : undefined,
  };
}

export function buildStrategyRead(strategy: Strategy, options: { seesHoldings: boolean; ytd?: YtdMap; year?: number }): TheRead {
  const ytd = options.ytd ?? {};
  const test = strategy.backtest;
  const sectors = (() => {
    const out = new Map<string, number>();
    for (const holding of strategy.basket.holdings) if (holding.sector) out.set(holding.sector, (out.get(holding.sector) ?? 0) + holding.weight);
    return [...out.entries()].map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight);
  })();
  const holdings = [...strategy.basket.holdings].sort((a, b) => b.weight - a.weight).map((holding) => ({ symbol: holding.symbol, weight: holding.weight }));
  const insights: Array<Insight | null> = [];
  let headline = "";

  if (test) {
    const latest = test.years[test.years.length - 1] ?? null;
    const year = options.year ?? new Date().getUTCFullYear();
    if (latest && latest.year === year && latest.sessions >= 20) {
      const gap = latest.strategy - latest.benchmark;
      const lean = leanText(sectors, holdings, options.seesHoldings, ytd, gap >= 0 ? "up" : "down");
      insights.push({
        id: "this-year",
        tone: toneOfChange(gap, 0.005),
        text: `This year it is ${signedPct(latest.strategy)} against ${signedPct(latest.benchmark)} for the S&P 500, ${pts(gap)} ${gap >= 0 ? "ahead" : "behind"}.`,
        soWhat: lean?.text,
        tickers: lean?.tickers,
        action: options.seesHoldings ? { label: "What it holds", href: "#basket" } : undefined,
      });
    }
    const mine = test.strategy.annualized_return;
    const bench = test.benchmark.annualized_return;
    if (mine != null && bench != null) {
      const gap = mine - bench;
      insights.push({
        id: "long-run",
        tone: toneOfChange(gap, 0.005),
        text: `Over ${Math.round(test.period.years)} years it ${gap >= 0 ? "beat" : "trailed"} the S&P 500 by ${pts(gap)} a year, with a worst drop of ${signedPct(test.strategy.max_drawdown, 0)} against ${signedPct(test.benchmark.max_drawdown, 0)}.`,
        soWhat: `It beat the S&P in ${test.hit_rate.beat} of ${test.hit_rate.years} years.`,
      });
      headline = `${gap >= 0 ? "Beat" : "Trailed"} the S&P 500 by ${pts(gap)} a year over ${Math.round(test.period.years)} years, backtested.`;
    }
    // Where the gain came from: the years with the biggest lead over the S&P.
    const complete = test.years.filter((row) => row.complete);
    if (complete.length >= 4) {
      const best = [...complete].sort((a, b) => b.strategy - b.benchmark - (a.strategy - a.benchmark)).slice(0, 2);
      const worst = [...complete].sort((a, b) => a.strategy - a.benchmark - (b.strategy - b.benchmark))[0];
      if (best[0] && best[0].strategy - best[0].benchmark > 0.02) {
        insights.push({
          id: "years",
          tone: "flat",
          text: `Its best years against the S&P 500 were ${listWords(best.map((row) => `${row.year} (${signedPct(row.strategy, 0)} vs ${signedPct(row.benchmark, 0)})`))}.`,
          soWhat:
            worst && worst.strategy - worst.benchmark < -0.02
              ? `Its worst year against the S&P was ${worst.year}: ${signedPct(worst.strategy, 0)} vs ${signedPct(worst.benchmark, 0)}.`
              : undefined,
          action: { label: "Year by year", href: "#years" },
        });
      }
    }
  } else if (sectors[0]) {
    insights.push({
      id: "lean",
      tone: "flat",
      text: `Today's basket leans on ${sectorWord(sectors[0].sector)}: ${pct(sectors[0].weight)} of it${sectors[1] ? `, then ${sectorWord(sectors[1].sector)} at ${pct(sectors[1].weight)}` : ""}.`,
      soWhat: "No backtest: these rules need past company financials we do not hold.",
    });
  }
  if (!headline && !test && sectors[0]) headline = `No backtest yet; today's basket leans on ${sectorWord(sectors[0].sector)}.`;
  if (!headline && insights[0]) headline = insights[0].text;
  return {
    headline,
    insights: pickInsights(insights),
    source: test ? `Backtested, not traded · ${shortDay(test.period.start)} ${test.period.start.slice(0, 4)} to ${shortDay(test.period.end)} ${test.period.end.slice(0, 4)}` : undefined,
  };
}
