/**
 * One-line takeaways for the Explore desk's panels: what each preview adds up
 * to, said before its rows. Plain rules over the rows each panel loads.
 */
import type { ActivityItem, FollowActivity } from "@/lib/follow-shared";
import type { Insight, TheRead } from "@/lib/insights";
import { listNames, signedPct } from "@/lib/read-format";

export type ScreenForRead = { title: string; matches: Array<{ ticker: string; changePct: number | null }> };

/** The stock that shows up in the most screens, and the screen whose names did best today. */
export function screensTakeaway(screens: ScreenForRead[]): string | null {
  if (screens.length < 2) return null;
  const counts = new Map<string, number>();
  for (const screen of screens) for (const ticker of new Set(screen.matches.map((row) => row.ticker))) counts.set(ticker, (counts.get(ticker) ?? 0) + 1);
  const [repeat, times] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ["", 0];
  const scored = screens
    .map((screen) => {
      const moves = screen.matches.map((row) => row.changePct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return { screen, average: moves.length >= 3 ? moves.reduce((sum, value) => sum + value, 0) / moves.length : null };
    })
    .filter((row): row is { screen: ScreenForRead; average: number } => row.average !== null)
    .sort((a, b) => b.average - a.average || a.screen.title.localeCompare(b.screen.title));
  const best = scored[0];
  const parts: string[] = [];
  if (times >= 3) parts.push(`${repeat} makes ${times} of ${screens.length} screens`);
  if (best && Math.abs(best.average) >= 0.5) parts.push(`${best.screen.title} had the best day, ${signedPct(best.average)} on average`);
  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}

const BOUGHT = new Set(["new", "added", "buy"]);
const SOLD = new Set(["reduced", "sold", "sell", "exited"]);

/** Buys against sales across the latest filings, and a stock that was both bought and sold. */
export function followTakeaway(activity: FollowActivity[]): string | null {
  const items: ActivityItem[] = activity.flatMap((row) => row.items ?? []);
  const buys = items.filter((item) => BOUGHT.has(item.action) && item.ticker);
  const sells = items.filter((item) => SOLD.has(item.action) && item.ticker);
  if (buys.length + sells.length < 3) return null;
  const bought = new Set(buys.map((item) => item.ticker!));
  const both = [...new Set(sells.map((item) => item.ticker!))].filter((ticker) => bought.has(ticker)).sort();
  const counts = new Map<string, number>();
  for (const item of [...buys, ...sells]) counts.set(item.ticker!, (counts.get(item.ticker!) ?? 0) + 1);
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const lean = buys.length > sells.length * 1.5 ? "Mostly buying" : sells.length > buys.length * 1.5 ? "Mostly selling" : "Buying and selling about even";
  const tail = both.length
    ? `; ${listNames(both, 2)} ${both.length === 1 ? "was" : "were"} bought by one filer and sold by another`
    : busiest && busiest[1] >= 2
      ? `; ${busiest[0]} came up most`
      : "";
  return `${lean}: ${buys.length} buys, ${sells.length} sales in the latest filings${tail}.`;
}

export type StrategyForRead = { name: string; backtest: { strategy: { annualized_return: number | null }; benchmark: { annualized_return: number | null } } | null };

/** How many strategies beat their benchmark in the backtest, and the leader. */
export function strategiesTakeaway(strategies: StrategyForRead[]): string | null {
  const tested = strategies.filter(
    (row) => row.backtest && typeof row.backtest.strategy.annualized_return === "number" && typeof row.backtest.benchmark.annualized_return === "number",
  );
  if (tested.length < 2) return null;
  const gap = (row: StrategyForRead) => row.backtest!.strategy.annualized_return! - row.backtest!.benchmark.annualized_return!;
  const beat = tested.filter((row) => gap(row) > 0);
  const leader = [...tested].sort((a, b) => gap(b) - gap(a) || a.name.localeCompare(b.name))[0]!;
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `${beat.length} of ${tested.length} beat their benchmark in backtests. ${leader.name} leads at ${pct(leader.backtest!.strategy.annualized_return!)} a year against ${pct(leader.backtest!.benchmark.annualized_return!)}.`;
}

/** News lines that are about a stock, in the order the desk prefers them. */
const STOCK_NEWS_IDS = ["leader", "disagree", "theme"] as const;

/**
 * Explore shows one read, not two: the desk's brief (the market's day, the
 * move, the date to watch, the crowd) with the news read folded in, stocks
 * first. The news line taken is the first one about a stock the brief does
 * not already name (the most talked-about stock, then news against price,
 * then the biggest story); the tone balance only fills a spare slot. Lines
 * about stocks come before market-wide ones. When the brief has nothing, the
 * news read stands on its own.
 */
export function mergeDeskRead(brief: TheRead | null | undefined, news: TheRead | null | undefined, max = 3): TheRead | null {
  const briefLines = brief?.insights ?? [];
  const newsLines = news?.insights ?? [];
  if (!brief || (!brief.headline && briefLines.length === 0)) {
    if (!news || (!news.headline && newsLines.length === 0)) return null;
    return { ...news, insights: orderStocksFirst(newsLines).slice(0, max) };
  }
  const named = new Set(briefLines.flatMap((insight) => insight.tickers ?? []));
  const stockLine = STOCK_NEWS_IDS.map((id) => newsLines.find((insight) => insight.id === id)).find(
    (insight): insight is Insight => Boolean(insight && (insight.tickers ?? []).length > 0 && !(insight.tickers ?? []).some((ticker) => named.has(ticker))),
  );
  const balance = newsLines.find((insight) => insight.id === "balance");
  const merged: Insight[] = [...briefLines];
  // The brief's first line is the day's lead; the news stock goes right after it.
  if (stockLine) merged.splice(Math.min(1, merged.length), 0, { ...stockLine, id: `news-${stockLine.id}` });
  const ordered = orderStocksFirst(merged).slice(0, max);
  if (balance && ordered.length < max) ordered.push({ ...balance, id: `news-${balance.id}` });
  return { ...brief, insights: ordered };
}

/**
 * Market today's read, the same on the page and its share card: the desk brief's first three points. Without a
 * brief, the news read's lines that say something about a stock or a story (never its tone lines: "40% of
 * headlines read as good news" says what the coverage felt like, not what to do), under `fallbackHeadline`
 * (the sector takeaway) since the news read's own headline is a tone line too. Null with nothing to say.
 */
export function marketTodayRead(brief: TheRead | null | undefined, news: TheRead | null | undefined, fallbackHeadline: string | null = null): TheRead | null {
  if (brief && (brief.headline || brief.insights.length > 0)) return { ...brief, insights: brief.insights.slice(0, 3) };
  const lines = (news?.insights ?? []).filter((insight) => insight.id !== "balance" && insight.id !== "disagree").slice(0, 3);
  if (fallbackHeadline) return { headline: fallbackHeadline, insights: lines, asOf: news?.asOf ?? null };
  return null;
}

/** Stable: lines that name a stock keep their order and go before the ones that do not. */
function orderStocksFirst(insights: Insight[]): Insight[] {
  const withStock = insights.filter((insight) => (insight.tickers ?? []).length > 0);
  const rest = insights.filter((insight) => (insight.tickers ?? []).length === 0);
  return [...withStock, ...rest];
}

/* ── the biggest companies: the market-level view of single stocks ──────── */

export type GiantForRead = { symbol: string; name: string; day: number; cap: number };

/**
 * Market today's single-stock part: how the biggest companies did, since they
 * carry the most weight in the S&P 500. The day's biggest movers are the
 * list under the read (/explore#moves), so this never lists them.
 * Average weighted by company value; the one that pulled hardest is the
 * largest value-times-move. Null with fewer than five companies, and null
 * when `day` (the day the rows are priced on) is not `session` (the market's
 * current session): a read of yesterday's moves must not sit under today's.
 */
export function buildGiantsRead(
  rows: readonly GiantForRead[],
  dates: { day?: string | null; session?: string | null } = {},
): { line: string; insight: Insight } | null {
  if (dates.day && dates.session && dates.day !== dates.session) return null;
  const usable = rows.filter((row) => Number.isFinite(row.day) && Number.isFinite(row.cap) && row.cap > 0);
  if (usable.length < 5) return null;
  const total = usable.reduce((sum, row) => sum + row.cap, 0);
  const average = usable.reduce((sum, row) => sum + row.cap * row.day, 0) / total;
  const up = usable.filter((row) => row.day > 0).length;
  const puller = [...usable].sort((a, b) => Math.abs(b.cap * b.day) - Math.abs(a.cap * a.day))[0]!;
  const sameWay = Math.sign(puller.day) === Math.sign(average) && Math.abs(average) >= 0.05;
  // A size-weighted average is exactly the change in their combined value: say that, not "weighted".
  const moved = Math.abs(average) < 0.05 ? "were worth about the same together as the day before" : `${average > 0 ? "gained" : "lost"} ${Math.abs(average).toFixed(1)}% of their combined value`;
  const n = usable.length;
  // A size-weighted fall while most of them rose (or the reverse) needs saying, or the two numbers read as a mistake.
  const against = (average <= -0.05 && up > n / 2) || (average >= 0.05 && up < n / 2);
  const line = against
    ? `The ${n} biggest companies ${moved}, even though ${up} of them rose.`
    : `The ${n} biggest companies ${moved}; ${up} of the ${n} rose.`;
  const pull = Math.abs(average) < 0.05
    ? `${puller.name} (${signedPct(puller.day)}) moved the group the most.`
    : sameWay
    ? `${puller.name} (${signedPct(puller.day)}) did the most to ${average > 0 ? "lift" : "pull down"} the group.`
    : `${puller.name} (${signedPct(puller.day)}) moved the other way.`;
  return {
    line,
    insight: {
      id: "giants",
      tone: Math.abs(average) < 0.05 ? "flat" : average > 0 ? "up" : "down",
      text: `${line} ${pull}`,
      figure: Math.abs(average) < 0.05 ? { value: `${up} of ${n}`, label: "rose" } : { value: signedPct(average, 1), label: `the ${n} biggest, together` },
      soWhat: "They carry the most weight in the S&P 500.",
      tickers: [puller.symbol],
      action: { label: `${puller.name}'s report`, href: `/stock/${encodeURIComponent(puller.symbol)}` },
    },
  };
}
