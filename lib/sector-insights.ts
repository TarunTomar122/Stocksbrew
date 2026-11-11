import { fin, median, movedWord, shortDay, signedPct, upDown } from "@/lib/insight-format";
import { pickInsights, sharePct, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * The read at the top of a sector page (/sectors/[slug]), built with plain
 * rules from the screener snapshot: how the sector moved against the S&P 500
 * today, over a month and this year, who led and lagged, and how our calls
 * split against every stock we cover. An insight
 * the numbers cannot back is left out.
 */

export type SectorReadInput = {
  name: string;
  rows: readonly ScreenerRow[];
  /** Every covered stock, for the "median stock" baselines. */
  all: readonly ScreenerRow[];
  spy: ScreenerRow | null;
  /** The close the snapshot is from, YYYY-MM-DD. */
  priceDay: string | null;
  /** Explained moves of the day, by ticker, to link a leader or laggard to its reason. */
  moveHrefs?: ReadonlyMap<string, string>;
  asOf?: string | null;
};

type Period = "day_pct" | "ret_1m" | "ret_ytd";

/** Market-value weighted change over a period, among members that have both numbers. */
export function weightedChange(rows: readonly ScreenerRow[], period: Period): number | null {
  let weight = 0;
  let sum = 0;
  for (const row of rows) {
    const value = row[period];
    if (!fin(value) || !fin(row.market_cap) || row.market_cap <= 0) continue;
    weight += row.market_cap;
    sum += value * row.market_cap;
  }
  return weight > 0 ? sum / weight : null;
}

/** The members with a number for the period, best first. */
export function ranked(rows: readonly ScreenerRow[], period: Period): ScreenerRow[] {
  return rows.filter((row) => fin(row[period])).sort((a, b) => (b[period] as number) - (a[period] as number));
}

function against(value: number, spy: number | null | undefined): string {
  if (!fin(spy)) return "";
  const gap = value - spy;
  if (Math.abs(gap) < 0.1) return `, in line with the S&P 500 (${signedPct(spy)})`;
  return `, ${gap > 0 ? "ahead of" : "behind"} the S&P 500 (${signedPct(spy)})`;
}

function list(rows: readonly ScreenerRow[], period: Period): string {
  return rows.map((row) => `${row.symbol} ${signedPct(row[period] as number)}`).join(", ");
}

export function callCounts(rows: readonly ScreenerRow[]): { Add: number; Hold: number; Trim: number; total: number } {
  const counts = { Add: 0, Hold: 0, Trim: 0, total: 0 };
  for (const row of rows) {
    if (row.call === "Add" || row.call === "Hold" || row.call === "Trim") {
      counts[row.call] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

export function buildSectorRead(input: SectorReadInput): TheRead | null {
  const { name, rows, spy } = input;
  if (rows.length === 0) return null;
  const day = weightedChange(rows, "day_pct");
  const withDay = rows.filter((row) => fin(row.day_pct));
  const up = withDay.filter((row) => (row.day_pct as number) > 0).length;
  const breadth = sharePct(up, withDay.length);

  let headline = "";
  if (day !== null) {
    const moved = Math.abs(day) < 0.05 ? "were flat" : `${day > 0 ? "rose" : "fell"} ${Math.abs(day).toFixed(1)}%`;
    // The day by its date: "in the latest trading day" left readers guessing which day the S&P figure was from.
    const when = input.priceDay ? `on ${shortDay(input.priceDay)}` : "in the latest trading day";
    headline = `${name} stocks ${moved} ${when}${against(day, spy?.day_pct)}.`;
  }
  // How many of them rose is the first line under the headline, so the headline keeps one number and its comparison.
  const breadthText = breadth !== null ? `${breadth}% of the ${withDay.length} ${name} stocks rose.` : null;

  // Leaders and laggards today, with the reason when we hold one.
  const today = ranked(rows, "day_pct");
  let movers: Insight | null = null;
  if (today.length >= 4) {
    const leaders = today.slice(0, 2);
    const laggards = today.slice(-2).reverse();
    const explained = [...leaders, ...laggards].find((row) => input.moveHrefs?.has(row.symbol));
    movers = {
      id: "movers",
      tone: toneOfChange(day, 0.05),
      text: `${breadthText ? `${breadthText} ` : ""}${list(leaders, "day_pct")} rose the most, while ${list(laggards, "day_pct")} fell the most.`,
      tickers: [...leaders, ...laggards].map((row) => row.symbol),
      action: explained ? { label: `Why ${explained.symbol} moved`, href: input.moveHrefs!.get(explained.symbol)! } : undefined,
    };
  }

  // A month and this year, against the index.
  const month = weightedChange(rows, "ret_1m");
  const year = weightedChange(rows, "ret_ytd");
  let trend: Insight | null = null;
  if (month !== null && year !== null) {
    const spyYear = spy?.ret_ytd;
    const yearLead = ranked(rows, "ret_ytd")[0];
    trend = {
      id: "trend",
      tone: fin(spyYear) ? toneOfChange(year - spyYear, 0.5) : toneOfChange(year, 0.5),
      text: `Over the past month these stocks ${movedWord(month)}${fin(spy?.ret_1m) ? ` (S&P 500 ${signedPct(spy!.ret_1m!)})` : ""}. This year the group ${upDown(year)}${fin(spyYear) ? `, against ${signedPct(spyYear)} for the S&P 500` : ""}.`,
      soWhat: yearLead ? `${yearLead.symbol} has done best this year, ${signedPct(yearLead.ret_ytd!)}.` : undefined,
      tickers: yearLead ? [yearLead.symbol] : undefined,
    };
  }

  // How our calls split, against all covered stocks.
  const calls = callCounts(rows);
  const allCalls = callCounts(input.all);
  let callsInsight: Insight | null = null;
  if (calls.total >= 5 && allCalls.total > 0) {
    const addShare = sharePct(calls.Add, calls.total)!;
    const allAdd = sharePct(allCalls.Add, allCalls.total)!;
    callsInsight = {
      id: "calls",
      tone: addShare > allAdd + 5 ? "up" : addShare < allAdd - 5 ? "down" : "flat",
      text: `Of the ${calls.total} we have a call on, we'd buy more of ${calls.Add}, keep ${calls.Hold} and sell some of ${calls.Trim}.`,
      soWhat: `That is ${addShare}% worth buying more, against ${allAdd}% across every stock we follow.`,
    };
  }

  const breadthPoint: Insight | null = !movers && breadthText && headline ? { id: "breadth", tone: toneOfChange(day, 0.05), text: breadthText } : null;
  const insights = pickInsights([movers ?? breadthPoint, trend, callsInsight], 3);
  if (!headline && insights.length === 0) return null;
  return { headline: headline || `${rows.length} ${name} stocks we cover.`, insights, asOf: input.asOf ?? null };
}

/** The median trailing P/E of a group (positive earnings only), with how many stocks it is drawn from. */
export function medianPe(rows: readonly ScreenerRow[]): { value: number; count: number } | null {
  const values = rows.map((row) => row.pe).filter((value): value is number => fin(value) && value > 0);
  const value = median(values);
  return value === null ? null : { value, count: values.length };
}
