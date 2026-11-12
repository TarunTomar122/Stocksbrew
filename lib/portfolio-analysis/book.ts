import type { DividendPlan } from "@/lib/dividend-plan";
import { shortCompanyName } from "@/lib/plain-copy";

import { round } from "./stats";
import type { CallLevelRow, CallWordPlain, CallsModule, EarningsDay, EarningsModule, IncomeModule, Weighted } from "./types";

/**
 * The parts of the analysis that are about the person's own lines rather than market history: what reports in the
 * next two weeks, where our calls sit, and what the holdings should pay by month. Pure.
 */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/* ── what reports soon ─────────────────────────────────────────────────── */

export const EARNINGS_WINDOW = 14;
const NEXT_WITHIN = 60;

export type EarningsInput = Weighted & { fund: boolean; nextEarnings: string | null };

/**
 * Share of the money that reports in the next two weeks, day by day. Funds do not report, so a book of only funds
 * has nothing to show. When nothing reports inside the window, the next report within two months stands in.
 */
export function buildEarnings(positions: readonly EarningsInput[], today: string, windowDays = EARNINGS_WINDOW): EarningsModule | null {
  const stocks = positions.filter((position) => !position.fund && position.weight > 0);
  if (stocks.length === 0) return null;
  const end = shiftDay(today, windowDays - 1);
  const days: EarningsDay[] = Array.from({ length: windowDays }, (_, index) => ({ date: shiftDay(today, index), tickers: [], weight: 0 }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  let reportingPct = 0;
  for (const stock of [...stocks].sort((a, b) => b.weight - a.weight)) {
    const date = stock.nextEarnings?.slice(0, 10);
    if (!date || date < today || date > end) continue;
    const day = byDate.get(date)!;
    day.tickers.push({ ticker: stock.ticker, name: stock.name, weight: round(stock.weight, 1) });
    day.weight = round(day.weight + stock.weight, 1);
    reportingPct += stock.weight;
  }
  let next: EarningsModule["next"] = null;
  if (reportingPct === 0) {
    const limit = shiftDay(today, NEXT_WITHIN);
    const upcoming = stocks
      .filter((stock) => stock.nextEarnings && stock.nextEarnings.slice(0, 10) > end && stock.nextEarnings.slice(0, 10) <= limit)
      .sort((a, b) => a.nextEarnings!.localeCompare(b.nextEarnings!) || b.weight - a.weight)[0];
    if (!upcoming) return null;
    next = { ticker: upcoming.ticker, name: upcoming.name, date: upcoming.nextEarnings!.slice(0, 10), weight: round(upcoming.weight, 1) };
  }
  return { windowDays, reportingPct: round(reportingPct, 1), days, next };
}

/* ── our calls ─────────────────────────────────────────────────────────── */

export type CallInput = { call: "Add" | "Hold" | "Trim"; addBelow: number | null; trimAbove: number | null };
export type CallPosition = Weighted & { price: number | null };

const PLAIN: Record<CallInput["call"], CallWordPlain> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };
/** A level more than half the price away says little about today, as on the stock page. */
const NEAR = 0.5;

/**
 * The money split by our call, and how far each priced call is from its level: Buy more shows its buy-more level,
 * Sell some its sell-some level, Keep has none. `withheld` counts holdings whose level this plan does not show.
 */
export function buildCalls(positions: readonly CallPosition[], calls: Readonly<Record<string, CallInput | undefined>>, withheld = 0): CallsModule | null {
  const valued = positions.filter((position) => position.weight > 0);
  if (valued.length === 0 || !valued.some((position) => calls[position.ticker])) return null;
  const split = { buyMore: 0, keep: 0, sellSome: 0, none: 0 };
  const rows: CallLevelRow[] = [];
  for (const position of valued) {
    const call = calls[position.ticker];
    if (!call) {
      split.none += position.weight;
      continue;
    }
    if (call.call === "Add") split.buyMore += position.weight;
    else if (call.call === "Hold") split.keep += position.weight;
    else split.sellSome += position.weight;
    const level = call.call === "Add" ? call.addBelow : call.call === "Trim" ? call.trimAbove : null;
    const price = position.price;
    if (!fin(level) || level <= 0 || !fin(price) || price <= 0 || Math.abs(level - price) / price > NEAR) continue;
    rows.push({
      ticker: position.ticker,
      name: position.name,
      call: PLAIN[call.call],
      weight: round(position.weight, 1),
      level,
      price,
      distancePct: round((level / price - 1) * 100, 1),
    });
  }
  rows.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct) || b.weight - a.weight);
  return {
    split: { buyMore: round(split.buyMore, 1), keep: round(split.keep, 1), sellSome: round(split.sellSome, 1), none: round(split.none, 1) },
    rows,
    withheld,
  };
}

/* ── income by month ───────────────────────────────────────────────────── */

/** The twelve months from lib/dividend-plan.ts, announced and estimated apart, and how much rests on one payer. */
export function buildIncome(plan: DividendPlan | null | undefined): IncomeModule | null {
  if (!plan || !(plan.total > 0)) return null;
  const payers = plan.stocks.filter((stock) => fin(stock.income) && stock.income! > 0).sort((a, b) => b.income! - a.income!);
  const top = payers[0];
  return {
    months: plan.months.map((month) => ({ month: month.month, confirmed: round(month.confirmed, 2), estimated: round(month.estimated, 2) })),
    total: round(plan.total, 2),
    largest: top ? { ticker: top.ticker, name: shortCompanyName(top.name) || top.ticker, share: round((top.income! / plan.total) * 100, 1) } : null,
    missingShares: plan.missingShares,
  };
}
