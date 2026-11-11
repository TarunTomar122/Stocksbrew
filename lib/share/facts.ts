import type { Viewer } from "@/lib/entitlements-server";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { normalizeSectorName } from "@/lib/gics-sector";
import { getSnapshotFacts } from "@/lib/insight-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { loadUserMemo } from "@/lib/memo/server";
import { mondayOfKey } from "@/lib/memo/week";
import { holdingSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { FUNDS_SECTOR, loadPortfolio, newYorkToday } from "@/lib/portfolio-data";
import type { PortfolioRowInput } from "@/lib/portfolio-shared";
import { shortCompanyName } from "@/lib/plain-copy";
import { getScreenerRows } from "@/lib/screener";
import { coveredPct, type StressResult } from "@/lib/stress-test";
import { loadUserStress } from "@/lib/stress-test-data";
import type { UserDoc } from "@/lib/watchlist";
import { loadFunds, loadUserXray } from "@/lib/xray-data";

import type { DividendFacts, MemoFacts, PortfolioFacts, ShareFacts, StressFacts, XrayFacts } from "./cards";
import type { ShareKind } from "./types";

/**
 * The facts a share card is worded from, pulled out of the same loaders the
 * signed-in pages use, for the person's own holdings only. Null when the page
 * would show the example instead (no holdings, no funds, no prices): there is
 * nothing of theirs to share then. Read-only, except that the memo loader
 * writes this week's memo when it is due, exactly as opening the memo page does.
 */

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".");
}

export async function xrayFacts(userDoc: UserDoc): Promise<XrayFacts | null> {
  const view = await loadUserXray(userDoc);
  // The page shows the example unless the person holds a fund and something can be valued.
  if (!view || view.xray.total <= 0 || view.xray.funds.length === 0) return null;
  const { xray } = view;
  if (!xray.funds.some((fund) => fund.status === "ok")) return null;
  const overlap = xray.overlaps[0];
  return {
    companies: xray.companies.slice(0, 5).map((row) => ({
      name: row.name,
      ticker: row.ticker,
      sector: row.sector,
      pct: row.pct,
      directPct: row.directPct,
      fundPct: row.fundPct,
      funds: row.via.map((slice) => slice.fund),
    })),
    maxDirectPct: xray.maxDirectPct,
    sectors: xray.sectors.slice(0, 4).map((row) => ({ sector: row.sector, pct: row.pct, benchmarkPct: row.benchmarkPct })),
    overlap: overlap ? { a: overlap.a, b: overlap.b, pct: overlap.pct, shared: overlap.shared } : null,
    closedPct: (xray.closedFundValue / xray.total) * 100,
    filingDates: xray.asOfDates,
  };
}

/** The episode facts the page's read works from (lib/stress-test.ts `buildStressRead`). */
export function stressFactsOf(result: StressResult): StressFacts {
  return {
    episodes: result.episodes
      .filter((item) => item.portfolio !== null && item.market !== null)
      .map((item) => {
        const missing = item.moves.filter((move) => move.status !== "ok");
        const lead = item.driver?.fund && item.stockDriver ? item.stockDriver : item.driver;
        return {
          id: item.episode.id,
          name: item.episode.name,
          start: item.episode.start,
          end: item.episode.end,
          kind: item.episode.kind,
          portfolio: item.portfolio!,
          market: item.market!,
          ratio: item.ratio,
          coveredPct: coveredPct(item),
          missing: missing.length === 0 ? null : missing.every((move) => move.status === "not-yet") ? "not-yet" : "no-prices",
          lead: lead && lead.pct !== null ? { name: lead.name, pct: lead.pct, fund: lead.fund } : null,
        };
      }),
  };
}

export async function stressFacts(userDoc: UserDoc): Promise<StressFacts | null> {
  const view = await loadUserStress(userDoc);
  if (!view) return null;
  const facts = stressFactsOf(view.result);
  return facts.episodes.length > 0 ? facts : null;
}

export async function dividendFacts(userDoc: UserDoc): Promise<DividendFacts | null> {
  const seeds = holdingSeeds(userDoc);
  if (seeds.length === 0) return null;
  const { plan } = await loadDividendPlan(seeds);
  if (plan.stocks.length === 0) return null;
  const nameOf = new Map(plan.stocks.map((stock) => [stock.ticker, stock.name || stock.ticker]));
  const payers = plan.stocks.filter((stock) => stock.perShare > 0);
  if (payers.length === 0) return null;
  // The page's own "at today's prices" yield (lib/dividend-plan.ts `buildDividendRead`).
  const yieldOnPrice =
    plan.incomeOnCost != null && plan.incomeOnCost > 0 && plan.marketValue ? (plan.incomeOnCost / plan.marketValue) * 100 : null;
  return {
    total: plan.total,
    confirmed: plan.confirmed,
    months: plan.months.map((month) => ({ month: month.month, total: month.total, names: month.tickers.map((ticker) => nameOf.get(ticker) ?? ticker) })),
    payers: payers.length,
    stocks: plan.stocks.length,
    yieldOnPrice,
    raises: payers
      // 100% and up is a tiny or first payment a year ago; the page says those as amounts, so the card leaves them out.
      .filter((stock) => stock.changePct != null && stock.changePct >= 3 && stock.changePct < 100)
      .sort((a, b) => b.changePct! - a.changePct!)
      .map((stock) => ({ name: stock.name || stock.ticker, changePct: stock.changePct! })),
    comparable: payers.filter((stock) => stock.changePct != null).length,
    asOf: plan.asOf,
  };
}

export async function memoFacts(viewer: Viewer, userDoc: UserDoc, week: string | null): Promise<MemoFacts | null> {
  const data = await loadUserMemo(viewer, userDoc, week && mondayOfKey(week) ? week : null);
  if (!data || data.mode !== "mine") return null;
  const { memo } = data;
  const items = [...memo.changed, ...memo.hurt, ...memo.look];
  // Newer memos keep the week's return out of "What changed" (the top line says it) and on `memo.week`.
  const performance = memo.week ?? items.find((item) => item.kind === "performance");
  if (!performance) return null;
  return {
    weekKey: memo.weekKey,
    monday: memo.monday,
    friday: memo.friday,
    complete: memo.complete,
    performance: performance.text,
    drivers: items.find((item) => item.kind === "drivers")?.text ?? null,
  };
}

// "Trust" alone would catch banks and REITs, so only fund words count (as in lib/xray-data.ts).
const FUND_NAME = /\b(ETF|ETN|Fund|SPDR|iShares|ProShares|Direxion)\b/i;

/**
 * The Portfolio page's analytics (lib/portfolio-data `loadPortfolio`) for the
 * person's holdings at the latest quote. The page builds its rows from the
 * watchlist view; here they come straight from the holdings, with the same
 * quotes, names and sectors.
 */
export async function portfolioFacts(userDoc: UserDoc): Promise<PortfolioFacts | null> {
  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks : [];
  const kinds = userDoc.watchlist_positions ?? {};
  const ids = tracked.filter((id) => kinds[id] === "holding");
  if (ids.length === 0) return null;
  const [quotes, labels] = await Promise.all([getLatestPriceQuotes(ids).catch(() => new Map()), getInstrumentLabels(ids).catch(() => new Map())]);
  const tickerOf = (id: string) => (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
  const [screener, snapshot, funds] = await Promise.all([
    getScreenerRows(ids.map(tickerOf)).catch(() => new Map()),
    getSnapshotFacts([]).catch(() => ({ sectorOf: {} as Record<string, string>, spSectorWeights: {} as Record<string, number> })),
    // A fund the x-ray has holdings for is a fund, whatever its name says ("Invesco QQQ Trust").
    loadFunds(ids.map(tickerOf)).catch(() => ({}) as Record<string, unknown>),
  ]);
  const rows: PortfolioRowInput[] = ids.map((id) => {
    const ticker = tickerOf(id);
    const name = labels.get(id)?.name || screener.get(ticker)?.name || ticker;
    const quote = quotes.get(id)?.quote;
    const fund = Boolean(funds[ticker]) || FUND_NAME.test(name);
    const sector = fund ? FUNDS_SECTOR : normalizeSectorName(screener.get(ticker)?.sector);
    return {
      instrument_id: id,
      ticker,
      name,
      sector,
      kind: "holding",
      price: num(quote?.current) ? quote.current : null,
      day_change_pct: null,
      stance: null,
    };
  });
  const portfolio = await loadPortfolio({ rows, holdings: userDoc.watchlist_holdings ?? null });
  const { analytics } = portfolio;
  // Shares of the portfolio only mean something by value; equal weights would just count holdings.
  if (analytics.basis !== "value") return null;
  const byTicker = new Map(portfolio.positions.map((position) => [position.ticker, position]));
  const sp = snapshot.spSectorWeights;
  const sectors = analytics.bySector
    .filter((slice) => slice.label !== FUNDS_SECTOR && num(sp[slice.label]))
    .map((slice) => ({ sector: slice.label, pct: slice.weight, benchmarkPct: sp[slice.label]! }))
    .sort((a, b) => b.pct - b.benchmarkPct - (a.pct - a.benchmarkPct));
  return {
    positions: analytics.byPosition.slice(0, 5).map((slice) => {
      const position = byTicker.get(slice.label);
      return {
        name: shortCompanyName(position?.name) || slice.label,
        sector: position?.sector && position.sector !== FUNDS_SECTOR ? position.sector : position?.sector === FUNDS_SECTOR ? "Fund" : null,
        pct: slice.weight,
      };
    }),
    top3: analytics.top3,
    sectors,
    hasFunds: portfolio.positions.some((position) => position.sector === FUNDS_SECTOR),
    beta: analytics.beta,
    volatility: analytics.volatility,
    benchmarkVolatility: analytics.benchmarkVolatility,
    pricesAsOf: analytics.pricesAsOf,
  };
}

export type LoadedFacts = { facts: ShareFacts; asOf: string } | null;

/** The facts for one page, for the signed-in person whose user doc this is. */
export async function loadShareFacts(kind: ShareKind, input: { viewer: Viewer; userDoc: UserDoc; week?: string | null }): Promise<LoadedFacts> {
  const asOf = newYorkToday();
  switch (kind) {
    case "xray": {
      const facts = await xrayFacts(input.userDoc);
      return facts ? { facts: { kind, facts }, asOf } : null;
    }
    case "stress": {
      const facts = await stressFacts(input.userDoc);
      return facts ? { facts: { kind, facts }, asOf } : null;
    }
    case "dividends": {
      const facts = await dividendFacts(input.userDoc);
      return facts ? { facts: { kind, facts }, asOf } : null;
    }
    case "memo": {
      const facts = await memoFacts(input.viewer, input.userDoc, input.week ?? null);
      return facts ? { facts: { kind, facts }, asOf } : null;
    }
    case "portfolio": {
      const facts = await portfolioFacts(input.userDoc);
      return facts ? { facts: { kind, facts }, asOf } : null;
    }
  }
}
