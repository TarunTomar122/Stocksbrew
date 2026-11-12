import type { Xray } from "@/lib/xray";

import { COMPANY_LINE } from "./rebalance";
import { fmtPct } from "./words";
import type { CallWord, IdeaHolding, RebalancePlan, TrimIdea } from "./types";

/**
 * The shapes behind the page's charts: one bar per company held (funds counted, so the 10% line means what the ideas
 * mean by it), the funds held as their own rows, and each sector's share before and after the ideas.
 */

export type WeightRow = {
  ticker: string;
  name: string;
  /** Share of the portfolio with funds counted, percent. */
  pct: number;
  /** The part held directly, and the part through funds. */
  directPct: number;
  fundPct: number;
  call: CallWord | null;
};

export type FundRow = { ticker: string; name: string; pct: number };

export type SectorRow = {
  sector: string;
  pct: number;
  /** The S&P 500's weight, when we have it. */
  benchmark: number | null;
  /** After every trim and add on the page, percent of the same total (unspent money sits in cash). */
  after: number;
};

/** Companies held directly, plus any above the line through funds alone, biggest first. */
export function weightRows(xray: Xray, holdings: readonly Pick<IdeaHolding, "ticker" | "call">[]): WeightRow[] {
  const callOf = new Map(holdings.map((holding) => [holding.ticker, holding.call]));
  return xray.companies
    .filter((company) => company.direct > 0 || company.pct > COMPANY_LINE)
    .map((company) => {
      // The call of whichever class is held directly; a Buy more or Keep on either class wins, as in the rebalance rules.
      const calls = company.classes.map((ticker) => callOf.get(ticker) ?? null).filter((call): call is CallWord => call !== null);
      const call = calls.find((c) => c === "Add") ?? calls.find((c) => c === "Hold") ?? calls[0] ?? null;
      return { ticker: company.ticker, name: company.name, pct: company.pct, directPct: company.directPct, fundPct: company.fundPct, call };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function fundRows(xray: Xray): FundRow[] {
  return xray.funds
    .filter((fund) => fund.pct > 0)
    .map((fund) => ({ ticker: fund.ticker, name: fund.fundName, pct: fund.pct }))
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Every sector with money in it, biggest first, and where the trims and adds would leave it, then the S&P 500's
 * sectors the portfolio has nothing in (at 0%, biggest S&P weight first), so a gap shows as plainly as a tilt. A
 * trimmed or added stock counts in its company's sector (the x-ray's), else the holding's own.
 */
export function sectorMix(
  xray: Xray,
  plan: Pick<RebalancePlan, "trims" | "adds">,
  holdings: readonly Pick<IdeaHolding, "ticker" | "sector">[],
  benchmark: Record<string, number | undefined> = {},
): SectorRow[] {
  const total = xray.total;
  if (!(total > 0)) return [];
  const sectorOf = (ticker: string, fallback: string | null) =>
    xray.companies.find((company) => company.classes.includes(ticker))?.sector ?? fallback ?? holdings.find((holding) => holding.ticker === ticker)?.sector ?? null;
  const shift = new Map<string, number>();
  for (const trim of plan.trims) {
    const sector = sectorOf(trim.ticker, null);
    if (sector) shift.set(sector, (shift.get(sector) ?? 0) - trim.amount);
  }
  for (const add of plan.adds) {
    const sector = sectorOf(add.ticker, add.sector);
    if (sector) shift.set(sector, (shift.get(sector) ?? 0) + add.amount);
  }
  const held: SectorRow[] = xray.sectors
    .filter((row) => row.value > 0)
    .map((row) => ({
      sector: row.sector,
      pct: row.pct,
      benchmark: row.benchmarkPct,
      after: Math.max(0, ((row.value + (shift.get(row.sector) ?? 0)) / total) * 100),
    }))
    .sort((a, b) => b.pct - a.pct);
  const have = new Set(held.map((row) => row.sector));
  const missing: SectorRow[] = Object.entries(benchmark)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0 && !have.has(entry[0]))
    .map(([sector, weight]) => ({ sector, pct: 0, benchmark: weight, after: Math.max(0, ((shift.get(sector) ?? 0) / total) * 100) }))
    .sort((a, b) => (b.benchmark ?? 0) - (a.benchmark ?? 0));
  return [...held, ...missing];
}

export type CompanyOutcome = { subject: string; ticker: string; before: number; after: number; reached: boolean };

/**
 * Where each company trimmed for size would end, every share class's sale together: today's weight less what all its
 * sales take off (each card's "after" is its own sale on today's portfolio), biggest first. `reached` is the rules' own
 * flag on the company's last sale: the plan gets it back to the line, or stops short (half the holding at most).
 */
export function companyOutcomes(trims: ReadonlyArray<Pick<TrimIdea, "kind" | "subject" | "ticker" | "before" | "after" | "reached">>): CompanyOutcome[] {
  const out = new Map<string, CompanyOutcome>();
  for (const trim of trims) {
    if (trim.kind !== "company") continue;
    const row = out.get(trim.subject);
    const cut = Math.max(0, trim.before - trim.after);
    if (!row) out.set(trim.subject, { subject: trim.subject, ticker: trim.ticker, before: trim.before, after: trim.before - cut, reached: trim.reached });
    else {
      row.after = Math.max(0, row.after - cut);
      row.reached = trim.reached;
    }
  }
  return [...out.values()].sort((a, b) => b.before - a.before);
}

type TitlePlan = {
  trims: ReadonlyArray<Pick<TrimIdea, "kind" | "subject" | "ticker" | "before" | "after" | "reached">>;
  companiesOver: RebalancePlan["companiesOver"];
  sectors?: RebalancePlan["sectors"];
};

/**
 * The verdict over the chart, at most ten words, and true to the plan's own end weights (council, Nov 12: "Sell some
 * of 3 stocks to get under 10%" was false when the biggest stopped at 19%). Only a plan that brings every company back
 * to the line says so; otherwise it names the one left furthest over.
 */
export function concentrationTitle(plan: TitlePlan): string {
  // Two share classes of one company trimmed together are one stock here.
  const trimmed = new Set(plan.trims.map((trim) => (trim.kind === "company" ? trim.subject : trim.ticker)));
  const count = trimmed.size;
  if (count > 0) {
    const what = count === 1 ? "one stock" : `${count} stocks`;
    const companies = companyOutcomes(plan.trims);
    if (companies.length > 0) {
      const short = companies.filter((row) => !row.reached).sort((a, b) => b.after - a.after)[0];
      if (!short) return `Sell some of ${what} to get to ${COMPANY_LINE}%`;
      return `Sell some of ${what}; ${short.ticker} still ends at ${fmtPct(short.after)}`;
    }
    const sector = plan.sectors?.[0];
    if (sector) return `Sell some of ${what}; ${sector.sector} goes ${fmtPct(sector.before)} → ${fmtPct(sector.after)}`;
    const lead = [...plan.trims].sort((a, b) => b.before - a.before)[0]!;
    return `Sell some of ${what}; ${lead.ticker} goes ${fmtPct(lead.before)} → ${fmtPct(lead.after)}`;
  }
  // Over the line as the rules count it (with their half-point slack), so the title and the cards agree.
  const over = plan.companiesOver.length;
  if (over === 0) return `Every stock is under ${COMPANY_LINE}%`;
  return over === 1 ? `One stock is over ${COMPANY_LINE}%, nothing to sell` : `${over} stocks are over ${COMPANY_LINE}%, nothing to sell`;
}

/** "Top 5 = 72%": how much of the portfolio the biggest few hold, when there are more than that many. */
export function topShare(rows: readonly WeightRow[], count = 5): { count: number; pct: number } | null {
  if (rows.length <= count) return null;
  return { count, pct: rows.slice(0, count).reduce((sum, row) => sum + row.pct, 0) };
}

/** Columns left in a grid's last row after `cards` cards: the whole row when the cards end level. */
export function tailSpan(cards: number, cols: number): number {
  return cols - (Math.max(0, Math.floor(cards)) % cols);
}

export type TickAlign = "start" | "center" | "end";

/**
 * How each tick's label sits against its tick, by the ticks' positions on the track (percent, ascending), so labels
 * never run off the track or into each other: one tick is centred unless it is near an end; of two, the lower one
 * ends at its tick and the higher one starts at it, each turned inward near the track's ends.
 */
export function tickAligns(positions: readonly number[]): TickAlign[] {
  const edge = (pos: number): TickAlign => (pos < 12 ? "start" : pos > 88 ? "end" : "center");
  if (positions.length === 1) return [edge(positions[0]!)];
  return positions.map((pos, index) => {
    if (index === 0) return pos < 15 ? "start" : "end";
    if (index === positions.length - 1) return pos > 85 ? "end" : "start";
    return "center";
  });
}
