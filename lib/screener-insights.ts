/**
 * The read at the top of /screener: what the current result set says. How
 * many match and what they are mostly made of, how they moved on the last
 * session against everything we cover, how many sit near an add, what reports
 * soon. On the Sectors tab: which sector led, which lagged, and how broad the
 * move was.
 *
 * Pure. Rows arrive zone-stripped for stocks the viewer does not cover, so
 * the zone count only ever counts covered stocks.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { fin, joinNames, median, pct, plural, shortDay, signedPct } from "@/lib/insight-format";
import type { ScreenerRow, SectorStat } from "@/lib/screener-shared";

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
  const base = input.narrowed && allMid !== null ? { label: `all ${universe.length.toLocaleString("en-US")} stocks we cover`, value: allMid } : spy !== null ? { label: "the S&P 500", value: spy } : null;
  const parts: string[] = [];
  parts.push(input.narrowed ? `${matched.length.toLocaleString("en-US")} ${matched.length === 1 ? "stock matches" : "stocks match"}` : `We cover ${matched.length.toLocaleString("en-US")} stocks`);
  if (top && matched.length >= 3 && topShare >= 30 && topShare < 100) parts.push(`${topShare}% are ${top.sector}`);
  if (mid !== null && moves.length >= 3) {
    parts.push(`the median one ${mid >= 0 ? "rose" : "fell"} ${pct(mid)} ${on}${base ? ` against ${signedPct(base.value)} for ${base.label}` : ""}`);
  }
  const headline = `${parts.join("; ")}.`;

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
      text: `${plural(total, "stock")} ${total === 1 ? "is" : "are"} inside or within 3% of our add zone: ${listed}.`,
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

  return { headline, insights: pickInsights([tilt, movers, zones, earnings, value], 3), asOf: input.asOf ?? null };
}

/** The Sectors tab: who led, who lagged, how broad. */
export function buildSectorsRead(input: { stats: readonly SectorStat[]; priceDay: string | null; asOf?: string | null }): TheRead | null {
  const stats = input.stats.filter((stat) => fin(stat.change.day_pct));
  if (stats.length < 2) return null;
  const on = input.priceDay ? `on ${shortDay(input.priceDay)}` : "on the last session";
  const ranked = [...stats].sort((a, b) => b.change.day_pct! - a.change.day_pct!);
  const lead = ranked[0]!;
  const lag = ranked[ranked.length - 1]!;
  const up = stats.filter((stat) => stat.change.day_pct! > 0).length;
  const lagWord = lag.change.day_pct! > 0 ? "rose least" : "lagged";
  const headline = `${lead.name} led ${on} (${signedPct(lead.change.day_pct!)}) and ${lag.name} ${lagWord} (${signedPct(lag.change.day_pct!)}); ${up === stats.length ? `all ${stats.length}` : `${up} of ${stats.length}`} sectors rose.`;

  const breadth = stats.filter((stat) => stat.advancing !== null);
  const broad = [...breadth].sort((a, b) => b.advancing! - a.advancing!)[0];
  const narrow = [...breadth].sort((a, b) => a.advancing! - b.advancing!)[0];
  const breadthInsight: Insight | null =
    broad && narrow && broad !== narrow
      ? {
          id: "breadth",
          tone: "flat",
          text: `${Math.round(broad.advancing!)}% of ${broad.name} stocks rose, the broadest move; in ${narrow.name} only ${Math.round(narrow.advancing!)}% did.`,
          action: { label: `Screen ${broad.name}`, href: `/screener?sector=${broad.slug}` },
        }
      : null;

  const leaders = ranked
    .slice(0, 2)
    .map((stat) => (stat.best ? { ...stat.best, sector: stat.name } : null))
    .filter((best): best is NonNullable<SectorStat["best"]> & { sector: string } => best !== null);
  const leadersInsight: Insight | null = leaders.length
    ? {
        id: "leaders",
        tone: "up",
        text: `The biggest movers in the leading ${leaders.length === 1 ? "sector" : "sectors"}: ${joinNames(leaders.map((best) => `${best.symbol} ${signedPct(best.pct)} (${best.sector})`))}.`,
        tickers: leaders.map((best) => best.symbol),
        action: { label: `Why ${leaders[0]!.symbol} moved`, href: `/stock/${leaders[0]!.symbol}` },
      }
    : null;

  const ytd = stats.filter((stat) => fin(stat.change.ret_ytd)).sort((a, b) => b.change.ret_ytd! - a.change.ret_ytd!);
  const yearInsight: Insight | null =
    ytd.length >= 2
      ? {
          id: "ytd",
          tone: "flat",
          text: `This year ${ytd[0]!.name} leads at ${signedPct(ytd[0]!.change.ret_ytd!)}; ${ytd[ytd.length - 1]!.name} trails at ${signedPct(ytd[ytd.length - 1]!.change.ret_ytd!)}.`,
          action: { label: `Screen ${ytd[0]!.name}`, href: `/screener?sector=${ytd[0]!.slug}` },
        }
      : null;

  return { headline, insights: pickInsights([breadthInsight, leadersInsight, yearInsight], 3), asOf: input.asOf ?? null };
}
