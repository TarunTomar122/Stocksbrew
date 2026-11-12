import { unstable_cache } from "next/cache";

import { redactLevels } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getSnapshotFacts } from "@/lib/insight-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import type { TheRead } from "@/lib/insights";
import { shortCompanyName } from "@/lib/plain-copy";
import { BENCHMARK_SYMBOL, FUNDS_SECTOR, loadDailySeries, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { computeInstrument, isIsoDay, readTaxLotsField } from "@/lib/portfolio-tax";
import { getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { matchingCompanyReason } from "@/lib/stock-read";
import type { UserDoc } from "@/lib/watchlist";
import { buildXray, fmtFilingDay, type FundDoc, type XrayPositionInput } from "@/lib/xray";
import { loadFunds } from "@/lib/xray-data";

import { cardFacts, peerMoves, type CardFacts } from "./facts";
import { buildLosses } from "./losses";
import { fundRows, sectorMix, weightRows, type FundRow, type SectorRow, type WeightRow } from "./mix";
import { buildIdeasRead } from "./read";
import { sessionDayMove } from "./quote-move";
import { buildRebalance } from "./rebalance";
import { WASH_DAYS, addDays } from "./tax";
import type { CallWord, IdeaHolding, IdeaLot, IdeasResult, IdeasSubject, TaxRates } from "./types";

/**
 * Server side of /portfolio/ideas. Reads, never writes:
 * - holdings: the example portfolio (lib/portfolio-data.ts) or the person's
 *   own `users/{uid}` doc: `watchlist_holdings` and, when entered on the
 *   Taxes page, `tax_lots` (lib/portfolio-tax.ts);
 * - prices: the latest quote, else the last stored close;
 * - look-through, sectors and S&P 500 weights: the x-ray engine over the
 *   funds' SEC holdings (`tm_etf_holdings`) and the screener snapshot;
 * - our call and its company reason: the screener snapshot row.
 */

export type IdeasView = IdeasResult & {
  read: TheRead | null;
  /** The example's quote day; null for the person's live quotes. */
  pricesAsOf: string | null;
  /** Day the screener snapshot (calls, sectors, sizes) is from. */
  snapshotDay: string | null;
  /** The concentration chart: companies held (funds counted), biggest first, and the funds held. */
  weights: WeightRow[];
  funds: FundRow[];
  /** Sectors before and after the ideas. */
  sectors: SectorRow[];
  /** The figure rows on each idea card, and the stock's price and today's move (one quote), by ticker. */
  /**
   * Past-year moves to set the cards' stocks against: the S&P 500 (SPY's line in the snapshot) and today's holdings
   * weighted by value (what this mix did over the year, not a record of the account). Null when unknown.
   */
  yearMarks: { sp500: number | null; mix: number | null };
  facts: Record<string, CardFacts & { price: number | null; dayPct: number | null; nextReport: string | null; spark: number[] | null; ret3m: number | null; ret1y: number | null }>;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const FUND_NAME = /\b(ETF|ETN|Fund|SPDR|iShares|ProShares|Direxion)\b/i;
const CALLS: readonly string[] = ["Add", "Hold", "Trim"];

/** Every fund the holdings job reads (tm_etf_meta): all of them count as funds, the "ok" ones can be opened for look-alikes. */
async function fundTickersUncached(): Promise<Array<{ ticker: string; ok: boolean }>> {
  const snap = await adminFirestore.collection("tm_etf_meta").doc("latest").get();
  const funds = snap.exists ? (snap.data() as { funds?: Record<string, { status?: string }> }).funds : null;
  return funds ? Object.entries(funds).map(([ticker, fund]) => ({ ticker, ok: fund.status === "ok" })).sort((a, b) => a.ticker.localeCompare(b.ticker)) : [];
}
const loadFundTickers = unstable_cache(fundTickersUncached, ["ideas-fund-tickers-v1"], { revalidate: 3600 });

/** A holding as the rules see it: price, lots, call and the screener's facts. */
type Seed = Omit<IdeaHolding, "call" | "callReason" | "sector" | "industry" | "marketCap" | "ret1y">;

function enrich(seed: Seed, row: ScreenerRow | undefined, today: string): IdeaHolding {
  const call = row?.call && CALLS.includes(row.call) ? (row.call as CallWord) : null;
  // The call's one line is free on every stock, but the engine can write a price level into it; levels follow coverage, so they go (as on the stock page).
  const reason = row?.call_reason ? redactLevels(matchingCompanyReason({ text: row.call_reason, call, source: row.call_reason_source ?? null }, call, today)) : null;
  return {
    ...seed,
    call: seed.fund ? null : call,
    callReason: seed.fund ? null : reason,
    sector: row?.sector ?? null,
    industry: row?.industry ?? null,
    marketCap: fin(row?.market_cap) ? row!.market_cap! : null,
    ret1y: fin(row?.ret_1y) ? row!.ret_1y! : null,
  };
}

async function finish(
  seeds: Seed[],
  subject: IdeasSubject,
  rates: TaxRates,
  today: string,
  pricesAsOf: string | null,
  pricesAt: string | null = null,
): Promise<IdeasView | null> {
  if (seeds.length === 0) return null;
  const tickers = seeds.map((seed) => seed.ticker);
  const [snapshot, facts, heldFunds, fundTickers] = await Promise.all([
    getScreenerSnapshot().catch(() => null),
    getSnapshotFacts([]).catch(() => ({ sectorOf: {}, spSectorWeights: {} as Record<string, number>, priceDay: null })),
    loadFunds(tickers),
    loadFundTickers().catch(() => [] as Array<{ ticker: string; ok: boolean }>),
  ]);
  const rows = new Map<string, ScreenerRow>();
  for (const row of [...(snapshot?.extras ?? []), ...(snapshot?.rows ?? [])]) rows.set(row.symbol, row);
  // A fund the holdings job knows stays a fund even when its document cannot be read (as on /portfolio/xray).
  const knownFunds = new Set(fundTickers.map((fund) => fund.ticker));
  const holdings = seeds.map((seed) =>
    enrich({ ...seed, fund: seed.fund || Boolean(heldFunds[seed.ticker]) || knownFunds.has(seed.ticker) }, rows.get(seed.ticker), today),
  );

  // Look-through with the x-ray's own engine, so the shares here match /portfolio/xray.
  const tickersInFunds = new Set<string>(tickers);
  for (const doc of Object.values(heldFunds)) for (const holding of doc.holdings) if (holding.ticker) tickersInFunds.add(holding.ticker);
  const sectorOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  for (const ticker of tickersInFunds) {
    const row = rows.get(ticker);
    if (row?.sector) sectorOf[ticker] = row.sector;
    if (row?.name) nameOf[ticker] = row.name;
  }
  for (const holding of holdings) if (!nameOf[holding.ticker]) nameOf[holding.ticker] = holding.name;
  const positions: XrayPositionInput[] = holdings.map((holding) => ({ ticker: holding.ticker, name: holding.name, value: holding.value, looksLikeFund: holding.fund }));
  const xray = buildXray(positions, { funds: heldFunds, sectorOf, nameOf, benchmarkSectors: facts.spSectorWeights });

  // Fund look-alikes are needed only when a fund sits at a loss; the docs are cached for an hour.
  const fundAtLoss = holdings.some((holding) => holding.fund && fin(holding.price) && holding.lots.some((lot) => lot.costPerShare > holding.price!));
  const allFunds: Record<string, FundDoc | undefined> = fundAtLoss ? { ...(await loadFunds(fundTickers.filter((fund) => fund.ok).map((fund) => fund.ticker))), ...heldFunds } : heldFunds;

  // Losses first: a stock listed as a loss to sell never gets an add idea (buying it back would be a wash sale).
  const losses = buildLosses({ holdings, universe: snapshot?.rows ?? [], funds: allFunds, rates, today });
  const plan = buildRebalance({ holdings, xray, rates, today, subject, avoidAdds: new Set(losses.map((loss) => loss.ticker)) });
  const bases = new Set(holdings.filter((holding) => fin(holding.value)).map((holding) => holding.basis));
  const basis: IdeasResult["basis"] = bases.size === 0 ? "none" : bases.size === 1 ? [...bases][0]! : "mixed";
  const result: IdeasResult = { subject, today, rates, plan, losses, basis };
  const snapshotDay = snapshot?.meta.price_history_to ?? null;
  const read = buildIdeasRead(result);
  if (read) {
    const prices = pricesAsOf ? `Prices from the ${fmtFilingDay(pricesAsOf)} close` : "Latest prices";
    read.source = snapshotDay ? `${prices}; our calls and company sizes from the ${fmtFilingDay(snapshotDay)} close` : prices;
    read.asOf = pricesAsOf ? null : pricesAt;
  }
  // Figure rows only for the stocks that get a card: trims, adds, the ones over the line we would keep, and losses.
  const carded = new Set<string>([
    ...plan.trims.map((trim) => trim.ticker),
    ...plan.adds.map((add) => add.ticker),
    ...plan.buyMoreOver.map((row) => row.ticker),
    ...losses.map((loss) => loss.ticker),
  ]);
  const peers = peerMoves(snapshot?.rows ?? [], carded);
  const cardFactsBy: IdeasView["facts"] = {};
  for (const ticker of carded) {
    const holding = holdings.find((row) => row.ticker === ticker);
    if (!holding) continue;
    const row = rows.get(ticker);
    // The change sentence counts only while it still stands in the reason shown for today's call.
    const change = row?.call_change?.trim() ?? "";
    const standing = change && holding.callReason?.includes(change) ? change : null;
    cardFactsBy[ticker] = { ...cardFacts(row, peers.get(ticker), holding.call, standing), price: holding.price,
      dayPct: holding.dayPct ?? null,
      // The next results day, only when it is still ahead.
      nextReport: typeof row?.earnings_date === "string" && row.earnings_date.slice(0, 10) >= today ? row.earnings_date.slice(0, 10) : null,
      // The screener snapshot's three-month price line (already loaded, no extra read), for the card's trend.
      spark: Array.isArray(row?.spark) && row!.spark!.length >= 2 ? row!.spark! : null,
      ret3m: fin(row?.ret_3m) ? row!.ret_3m! : null,
      ret1y: holding.ret1y,
    };
  }
  // The mix: each valued holding's past-year move, weighted by its value today; only when most of the money has one.
  let weighted = 0;
  let covered = 0;
  let valued = 0;
  for (const holding of holdings) {
    if (!fin(holding.value) || holding.value <= 0) continue;
    valued += holding.value;
    if (fin(holding.ret1y)) {
      weighted += holding.ret1y * holding.value;
      covered += holding.value;
    }
  }
  const spy = rows.get(BENCHMARK_SYMBOL);
  const yearMarks = {
    sp500: fin(spy?.ret_1y) ? spy!.ret_1y! : null,
    mix: valued > 0 && covered / valued >= 0.8 ? weighted / covered : null,
  };
  return {
    ...result,
    read,
    yearMarks,
    pricesAsOf,
    snapshotDay,
    weights: weightRows(xray, holdings),
    funds: fundRows(xray),
    sectors: sectorMix(xray, plan, holdings, facts.spSectorWeights),
    facts: cardFactsBy,
  };
}

/** The example portfolio the Portfolio page shows visitors: invented shares, saved days and costs at the close on those days. */
export async function loadExampleIdeas(rates: TaxRates): Promise<IdeasView | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const today = newYorkToday();
  const seeds: Seed[] = example.portfolio.positions
    .filter((position) => position.kind === "holding")
    .map((position) => {
      const lots: IdeaLot[] =
        fin(position.shares) && fin(position.avgCost) ? [{ acquired: position.savedAt?.slice(0, 10) ?? null, shares: position.shares, costPerShare: position.avgCost }] : [];
      const saved = position.savedAt?.slice(0, 10) ?? null;
      return {
        ticker: position.ticker,
        name: shortCompanyName(position.name) || position.ticker,
        instrumentId: position.instrument_id,
        fund: position.sector === FUNDS_SECTOR,
        shares: position.shares,
        price: position.price,
        // The example's move only when its quote is from the current or most recent session.
        dayPct: sessionDayMove(position.dayPct, example.quotedAt[position.ticker]),
        value: position.value,
        lots,
        basis: lots.length > 0 ? "saved" : "none",
        recentBuys: saved && saved >= addDays(today, -WASH_DAYS) ? [saved] : [],
      };
    });
  return finish(seeds, "example", rates, today, example.pricesAsOf);
}

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".");
}

/**
 * A signed-in person's US holdings. Lots from the Taxes page when entered
 * there (exact dates and costs), else one lot at the average cost from the
 * day the holding was saved. Null when they mark no US holding.
 */
export async function loadUserIdeas(userDoc: UserDoc | null, rates: TaxRates, now = new Date()): Promise<IdeasView | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const entered = userDoc?.watchlist_holdings ?? {};
  const ids = tracked.filter((id) => typeof id === "string" && kinds[id] === "holding" && id.startsWith("US_"));
  if (ids.length === 0) return null;
  const today = newYorkToday(now);
  const taxLots = readTaxLotsField((userDoc as (UserDoc & { tax_lots?: unknown }) | null)?.tax_lots, today);
  const [labels, quotes] = await Promise.all([
    getInstrumentLabels(ids).catch(() => new Map<string, { ticker: string; name: string }>()),
    getLatestPriceQuotes(ids).catch(() => new Map()),
  ]);
  const tickerOf = (id: string) => (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
  const needClose = ids.filter((id) => !fin(quotes.get(id)?.quote?.current)).map(tickerOf);
  const closes = needClose.length > 0 ? await loadDailySeries(needClose).catch(() => new Map()) : new Map();
  const recentFrom = addDays(today, -WASH_DAYS);
  // The oldest quote used, so the time shown never overstates how fresh the prices are.
  let pricesAt: string | null = null;

  const seeds: Seed[] = ids.map((id) => {
    const ticker = tickerOf(id);
    const label = labels.get(id);
    const holding = entered[id];
    const series = closes.get(ticker);
    const quote = quotes.get(id);
    const quoted = quote?.quote?.current;
    const at = typeof quote?.captured_at === "string" ? quote.captured_at : typeof quote?.updated_at === "string" ? quote.updated_at : null;
    if (fin(quoted) && at && (!pricesAt || at < pricesAt)) pricesAt = at;
    const price = fin(quoted) && quoted > 0 ? quoted : series ? series.closes[series.closes.length - 1] ?? null : null;
    // Today's move only from the quote the price came from; a stored close has none.
    const quotedDay = quote?.quote?.day_change_pct;
    // A quote from an older session (a stuck feed, a delisted stock) keeps its price but not its move.
    const dayPct = fin(quoted) && quoted > 0 ? sessionDayMove(quotedDay, at, now) : null;
    const quantity = fin(holding?.quantity) && holding!.quantity! > 0 ? holding!.quantity! : null;
    const typed = fin(holding?.market_value) && holding!.market_value! > 0 ? holding!.market_value! : null;
    const entry = taxLots[id];
    let lots: IdeaLot[] = [];
    let basis: IdeaHolding["basis"] = "none";
    let recentBuys: string[] = [];
    if (entry && (entry.buys.length > 0 || entry.sells.length > 0)) {
      const computed = computeInstrument(id, entry, null);
      lots = computed.open.map((lot) => ({ acquired: lot.acquired, shares: lot.shares, costPerShare: lot.costPerShare }));
      basis = lots.length > 0 ? "lots" : "none";
      recentBuys = entry.buys.map((buy) => buy.date).filter((day) => day >= recentFrom && day <= today);
    } else if (quantity !== null && fin(holding?.average_cost) && holding!.average_cost! > 0) {
      const saved = typeof holding?.updated_at === "string" ? holding.updated_at.slice(0, 10) : null;
      const acquired = saved && isIsoDay(saved) ? saved : null;
      lots = [{ acquired, shares: quantity, costPerShare: holding!.average_cost! }];
      basis = "saved";
      recentBuys = acquired && acquired >= recentFrom ? [acquired] : [];
    }
    const shares = quantity ?? (basis === "lots" ? lots.reduce((sum, lot) => sum + lot.shares, 0) : null);
    const value = shares !== null && fin(price) && price > 0 ? shares * price : typed;
    const name = shortCompanyName(label?.name) || ticker;
    return {
      ticker,
      name,
      instrumentId: id,
      fund: FUND_NAME.test(label?.name ?? ""),
      shares,
      price: fin(price) && price > 0 ? price : null,
      dayPct,
      value,
      lots,
      basis,
      recentBuys,
    };
  });
  return finish(seeds, "mine", rates, today, null, pricesAt);
}
