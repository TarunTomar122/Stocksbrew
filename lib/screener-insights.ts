/**
 * What a screener result set says, for the screener's share image: how many
 * match and what they are mostly made of, how they moved on the last session
 * against everything we cover, how many sit near an add, what reports soon.
 *
 * Pure. Rows arrive zone-stripped for stocks the viewer does not cover, so
 * the zone count only ever counts covered stocks.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { fin, joinNames, median, pct, plural, shortDay, signedPct } from "@/lib/insight-format";
import type { ScreenerRow } from "@/lib/screener-shared";

function bySize(rows: readonly ScreenerRow[]): ScreenerRow[] {
  return [...rows].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
}

function sectorCounts(rows: readonly ScreenerRow[]): Array<{ sector: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.sector) counts.set(row.sector, (counts.get(row.sector) ?? 0) + 1);
  return [...counts.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count);
}

export function buildScreenerRead(input: {
  matched: readonly ScreenerRow[];
  universe: readonly ScreenerRow[];
  /** True when a filter or preset narrows the list. */
  narrowed: boolean;
  /** Close day the snapshot's day moves are from. */
  priceDay: string | null;
  spy?: ScreenerRow | null;
  asOf?: string | null;
}): TheRead | null {
  const { matched, universe } = input;
  if (matched.length === 0) return null;
  const on = input.priceDay ? `on ${shortDay(input.priceDay)}` : "on the last session";
  const moves = matched.map((row) => row.day_pct).filter(fin);
  const mid = median(moves);
  const allMid = median(universe.map((row) => row.day_pct).filter(fin));
  const spy = input.spy && fin(input.spy.day_pct) ? input.spy.day_pct : null;

  // Headline: the size of the set, its main sector (unless the screen is that sector), and its median move.
  const sectors = sectorCounts(matched);
  const top = sectors[0];
  const topShare = top ? Math.round((top.count / matched.length) * 100) : 0;
  const base = input.narrowed && allMid !== null ? { label: `the typical stock across all ${universe.length.toLocaleString("en-US")} we cover`, value: allMid } : spy !== null ? { label: "the S&P 500", value: spy } : null;
  // One sentence: the size of the set and its typical move. The comparison and the main sector are the first line under it.
  const count = matched.length.toLocaleString("en-US");
  const typical = mid !== null && moves.length >= 3 ? `the typical one ${mid >= 0 ? "rose" : "fell"} ${pct(mid)} ${on}` : null;
  // Both moves in words ("fell 0.3% ..., while the S&P 500 fell 0.4%"), never a word for one and a sign for the other.
  const baseText = typical && base ? `${base.label.charAt(0).toUpperCase()}${base.label.slice(1)} ${base.value >= 0 ? "rose" : "fell"} ${pct(base.value)} ${on}.` : null;
  const sectorText = top && matched.length >= 3 && topShare >= 30 && topShare < 100 ? `${topShare}% of the ${input.narrowed ? "matches" : "stocks"} are ${top.sector}.` : null;
  // Across everything we follow, the S&P 500 beside the typical move is the point, so it stays in the sentence.
  const headline = input.narrowed
    ? `${count} ${matched.length === 1 ? "stock matches" : "stocks match"}${typical ? `, and ${typical}` : ""}.`
    : `Across the ${count} stocks we follow${typical ? `, ${typical}${base ? `, while ${base.label} ${base.value >= 0 ? "rose" : "fell"} ${pct(base.value)}` : ""}` : ""}.`;

  // Breadth and the outliers.
  let movers: Insight | null = null;
  if (mid !== null && moves.length >= 3) {
    const ranked = [...matched].filter((row) => fin(row.day_pct)).sort((a, b) => b.day_pct! - a.day_pct!);
    const best = ranked.slice(0, 2);
    const worst = ranked[ranked.length - 1];
    const up = moves.filter((value) => value > 0).length;
    const showWorst = worst && !best.includes(worst) && worst.day_pct! < 0;
    movers = {
      id: "movers",
      tone: mid >= 0 ? "up" : "down",
      figure: { value: `${Math.round((up / moves.length) * 100)}%`, label: "of them rose" },
      text: `${Math.round((up / moves.length) * 100)}% of them rose. Biggest: ${joinNames(best.map((row) => `${row.symbol} ${signedPct(row.day_pct!)}`))}${showWorst ? `; worst ${worst.symbol} ${signedPct(worst.day_pct!)}` : ""}.`,
      tickers: [...best.map((row) => row.symbol), ...(showWorst ? [worst.symbol] : [])],
      action: { label: `Why ${best[0]!.symbol} moved`, href: `/stock/${best[0]!.symbol}` },
    };
  }

  // How the set is tilted against the covered universe.
  let tilt: Insight | null = null;
  if (input.narrowed && top && matched.length >= 5 && topShare < 100) {
    const universeShare = (universe.filter((row) => row.sector === top.sector).length / Math.max(1, universe.length)) * 100;
    if (topShare - universeShare >= 10) {
      const names = bySize(matched.filter((row) => row.sector === top.sector)).slice(0, 3).map((row) => row.symbol);
      tilt = {
        id: "tilt",
        tone: "flat",
        text: `${topShare}% of this screen is ${top.sector}, against ${pct(universeShare, 0)} of everything we cover; the largest are ${joinNames(names)}.`,
        tickers: names,
      };
    }
  }

  // Covered stocks inside or close to their add zone.
  let zones: Insight | null = null;
  const inAdd = matched.filter((row) => row.zone === "add");
  const near = matched.filter((row) => row.zone !== "add" && fin(row.to_add_pct) && Math.abs(row.to_add_pct) <= 3);
  if (inAdd.length + near.length > 0) {
    const total = inAdd.length + near.length;
    const names = bySize([...inAdd, ...near]).slice(0, 5).map((row) => row.symbol);
    const listed = total > names.length ? `${names.join(", ")} and ${total - names.length} more` : joinNames(names);
    zones = {
      id: "zones",
      tone: "up",
      text: `${plural(total, "stock")} ${total === 1 ? "is" : "are"} at or within 3% of the price where we'd buy more: ${listed}.`,
      figure: { value: String(total), label: "near our buy-more price" },
      tickers: names,
      action: { label: `See ${names[0]}`, href: `/stock/${names[0]}` },
    };
  }

  // Reports in the next two weeks.
  let earnings: Insight | null = null;
  const reporting = matched.filter((row) => fin(row.earnings_in_days) && row.earnings_in_days >= 0 && row.earnings_in_days <= 14);
  if (reporting.length > 0 && reporting.length < matched.length) {
    const names = bySize(reporting).slice(0, 4);
    earnings = {
      id: "earnings",
      tone: "flat",
      text: `${reporting.length} of them ${reporting.length === 1 ? "reports" : "report"} in the next two weeks, including ${joinNames(names.map((row) => `${row.symbol} ${shortDay(row.earnings_date)}`))}.`,
      figure: { value: String(reporting.length), label: reporting.length === 1 ? "reports in two weeks" : "report in two weeks" },
      tickers: names.map((row) => row.symbol),
      action: { label: "Calendar", href: "/calendar" },
    };
  }

  // Valuation against the universe.
  let value: Insight | null = null;
  const pe = median(matched.map((row) => row.fwd_pe).filter((item): item is number => fin(item) && item > 0));
  const allPe = median(universe.map((row) => row.fwd_pe).filter((item): item is number => fin(item) && item > 0));
  if (input.narrowed && pe !== null && allPe !== null && matched.length >= 5 && Math.abs(pe / allPe - 1) >= 0.2) {
    value = {
      id: "value",
      tone: "flat",
      text: `The median stock here trades at ${pe.toFixed(0)}x next year's earnings, ${pe > allPe ? "pricier than" : "cheaper than"} the ${allPe.toFixed(0)}x for everything we cover.`,
    };
  }

  // What the headline left out: the main sector (when the tilt line does not already say it) and, for a
  // screen, everything we cover beside its typical move. It closes the movers line, the first or second point.
  const aside = [tilt ? null : sectorText, input.narrowed ? baseText : null].filter(Boolean).join(" ");
  if (movers && aside) movers = { ...movers, soWhat: aside };
  const asidePoint: Insight | null = !movers && aside ? { id: "context", tone: "flat", text: aside } : null;
  return { headline, insights: pickInsights([tilt, movers ?? asidePoint, zones, earnings, value], 3), asOf: input.asOf ?? null };
}
