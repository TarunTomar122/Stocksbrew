import { shortCompanyName } from "@/lib/plain-copy";
import type { ScreenerRow } from "@/lib/screener-shared";
import { companyKey } from "@/lib/share-class";
import { buildXray, type FundDoc } from "@/lib/xray";

import { WASH_DAYS, addDays, daysBetween, holdingTerm, longTermFrom, rateFor } from "./tax";
import type { IdeaHolding, LossIdea, SimilarPick, TaxRates, Term } from "./types";
import { watchDropHref } from "./watch";
import { capWords, fmtPct, signedPct } from "./words";

/**
 * Tax-loss ideas: holdings whose open lots sit below what was paid, by enough
 * to matter (LOSS_PCT and LOSS_MIN), with one to three stocks or funds that
 * keep the exposure while the sold one waits out the wash-sale window. The
 * look-alikes come from our own data: the screener snapshot's industry,
 * sector and size for stocks, the funds' SEC holdings for funds.
 */

export const LOSS_PCT = 5;
export const LOSS_MIN = 100;
/** A look-alike stock in the same industry may be up to this many times bigger or smaller. */
const INDUSTRY_SIZE = 5;
/** Outside the industry it must be closer in size. */
const SECTOR_SIZE = 2;
/** Funds count as look-alikes when this much of the two is in the same companies. */
const FUND_OVERLAP = 40;
/** How far ahead a losing lot's turn to long term is worth a line. */
const TURN_DAYS = 60;

/** Funds that track the same index may be "substantially identical", so they are never offered for each other. */
// Funds that track the same index are too alike to swap for each other without risking the wash-sale rule.
const SAME_INDEX: Record<string, string> = {
  SPY: "S&P 500", VOO: "S&P 500", IVV: "S&P 500", SPLG: "S&P 500",
  QQQ: "Nasdaq 100", QQQM: "Nasdaq 100",
  IWM: "Russell 2000", VTWO: "Russell 2000",
  VTI: "US total market", ITOT: "US total market", SCHB: "US total market",
  VGT: "US technology", XLK: "US technology",
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function sizeRatio(a: number, b: number): number {
  return a > b ? a / b : b / a;
}

function industryWords(industry: string): string {
  return industry.replace(/\s*-\s*/g, ", ");
}

/**
 * Up to `max` covered stocks like `target`: same industry first, closest in
 * size, then the same sector at a closer size. Our Sell some calls are left
 * out, and so are other share classes of the same company.
 */
export function similarStocks(target: IdeaHolding, universe: readonly ScreenerRow[], held: ReadonlySet<string>, max = 3): SimilarPick[] {
  const cap = target.marketCap;
  if (!fin(cap) || cap <= 0) return [];
  const self = companyKey(target.ticker);
  const pool = universe.filter(
    (row) => row.symbol !== target.ticker && companyKey(row.symbol) !== self && fin(row.market_cap) && row.market_cap > 0 && row.call !== "Trim",
  );
  const sameIndustry = target.industry
    ? pool.filter((row) => row.industry === target.industry && sizeRatio(row.market_cap!, cap) <= INDUSTRY_SIZE)
    : [];
  const sameSector = target.sector
    ? pool.filter((row) => row.industry !== target.industry && row.sector === target.sector && sizeRatio(row.market_cap!, cap) <= SECTOR_SIZE)
    : [];
  const bySize = (a: ScreenerRow, b: ScreenerRow) => sizeRatio(a.market_cap!, cap) - sizeRatio(b.market_cap!, cap);
  const picks = [...sameIndustry.sort(bySize), ...sameSector.sort(bySize)].slice(0, max);
  return picks.map((row) => {
    const name = shortCompanyName(row.name) || row.symbol;
    const where = row.industry === target.industry && target.industry ? `Also in ${industryWords(target.industry)}` : `Also in ${target.sector}, in ${row.industry ? industryWords(row.industry) : "another industry"}`;
    const size = `worth ${capWords(row.market_cap!)} against ${capWords(cap)} for ${target.name}`;
    const year =
      fin(row.ret_1y) && fin(target.ret1y)
        ? ` Over the past year it moved ${signedPct(row.ret_1y)}, against ${signedPct(target.ret1y)} for ${target.ticker}.`
        : "";
    return {
      ticker: row.symbol,
      name,
      fund: false,
      why: `${where}, ${size}.${year}`,
      call: row.call ?? null,
      held: held.has(row.symbol),
    };
  });
}

/** Up to `max` funds whose holdings overlap most with `ticker`'s, from their SEC filings. Same-index funds are left out. */
export function similarFunds(ticker: string, funds: Readonly<Record<string, FundDoc | undefined>>, held: ReadonlySet<string>, max = 3): SimilarPick[] {
  const own = funds[ticker];
  if (!own || own.status !== "ok" || own.holdings.length === 0) return [];
  const picks: Array<SimilarPick & { overlap: number }> = [];
  for (const [other, doc] of Object.entries(funds)) {
    if (!doc || other === ticker || doc.status !== "ok" || doc.holdings.length === 0) continue;
    if (SAME_INDEX[ticker] && SAME_INDEX[ticker] === SAME_INDEX[other]) continue;
    const overlap = buildXray(
      [
        { ticker, name: own.fundName, value: 1 },
        { ticker: other, name: doc.fundName, value: 1 },
      ],
      { funds: { [ticker]: own, [other]: doc } },
    ).overlaps[0];
    if (!overlap || overlap.pct < FUND_OVERLAP) continue;
    picks.push({
      ticker: other,
      name: doc.fundName,
      fund: true,
      why: `${fmtPct(overlap.pct)} of the two funds is in the same companies, by weight, across ${overlap.shared} names it shares with ${ticker}.`,
      call: null,
      held: held.has(other),
      overlap: overlap.pct,
    });
  }
  return picks
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, max)
    .map(({ overlap: _overlap, ...pick }) => pick);
}

export function buildLosses(input: {
  holdings: readonly IdeaHolding[];
  universe: readonly ScreenerRow[];
  funds: Readonly<Record<string, FundDoc | undefined>>;
  rates: TaxRates;
  today: string;
}): LossIdea[] {
  const { rates, today } = input;
  const held = new Set(input.holdings.map((holding) => holding.ticker));
  const out: LossIdea[] = [];
  for (const holding of input.holdings) {
    const price = holding.price;
    if (!fin(price) || price <= 0 || holding.lots.length === 0) continue;
    const losing = holding.lots.filter((lot) => lot.shares > 0 && lot.costPerShare > price);
    if (losing.length === 0) continue;
    const byTerm: Record<Term, number> = { short: 0, long: 0, unknown: 0 };
    let shares = 0;
    let cost = 0;
    let longTermOn: string | null = null;
    for (const lot of losing) {
      const term = holdingTerm(lot.acquired, today);
      byTerm[term] += lot.shares * (price - lot.costPerShare);
      shares += lot.shares;
      cost += lot.shares * lot.costPerShare;
      if (term === "short" && lot.acquired) {
        const from = longTermFrom(lot.acquired);
        const gap = daysBetween(today, from);
        if (gap > 0 && gap <= TURN_DAYS && (!longTermOn || from < longTermOn)) longTermOn = from;
      }
    }
    const loss = byTerm.short + byTerm.long + byTerm.unknown;
    const lossPct = cost > 0 ? (loss / cost) * 100 : 0;
    if (loss > -LOSS_MIN || lossPct > -LOSS_PCT) continue;
    // No sale next to a Keep or Buy more call, not even for the tax (owner, Nov 11: "hold it and sell it at the same time").
    if (holding.call === "Add" || holding.call === "Hold") continue;
    // The term carrying most of the loss names the row; the split is kept for the tax.
    const term = (["short", "long", "unknown"] as Term[]).reduce((best, next) => (byTerm[next] < byTerm[best] ? next : best), "short" as Term);
    const taxSaved = -(byTerm.short * rateFor("short", rates) + byTerm.unknown * rateFor("unknown", rates) + byTerm.long * rateFor("long", rates)) / 100;
    const recentFrom = addDays(today, -WASH_DAYS);
    const recent = holding.recentBuys.filter((day) => day >= recentFrom && day <= today).sort();
    const watch = watchDropHref(holding.ticker, price, 5);
    out.push({
      id: `loss-${holding.ticker}`,
      ticker: holding.ticker,
      name: holding.name,
      fund: holding.fund,
      shares,
      value: shares * price,
      cost,
      loss,
      lossPct,
      term,
      taxSaved,
      short: byTerm.short,
      long: byTerm.long,
      unknown: byTerm.unknown,
      longTermOn,
      recentBuy: recent[recent.length - 1] ?? null,
      recentIsSave: holding.basis === "saved",
      buyBackFrom: addDays(today, WASH_DAYS + 1),
      call: holding.call,
      callReason: holding.callReason,
      similar: holding.fund ? similarFunds(holding.ticker, input.funds, held) : similarStocks(holding, input.universe, held),
      watch: watch ? { label: `Tell me if ${holding.name} falls another 5%`, href: watch } : null,
    });
  }
  return out.sort((a, b) => a.loss - b.loss);
}
