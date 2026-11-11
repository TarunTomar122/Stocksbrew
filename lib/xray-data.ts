import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getSnapshotFacts } from "@/lib/insight-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { FUNDS_SECTOR, loadDailySeries, loadExamplePortfolio } from "@/lib/portfolio-data";
import { getScreenerRows } from "@/lib/screener";
import type { UserDoc } from "@/lib/watchlist";
import { buildXray, buildXrayRead, type FundDoc, type FundStatus, type Xray, type XrayContext, type XrayPositionInput } from "@/lib/xray";
import type { TheRead } from "@/lib/insights";

/**
 * Server inputs for /portfolio/xray: fund holdings from `tm_etf_holdings`
 * (SEC N-PORT, written by backend/agentdata/etf_holdings.py), the person's
 * holdings priced at the latest quote, and names and sectors from the
 * screener snapshot. Read-only.
 */

/** S&P 500 funds, any of which gives the index's own top-ten share. */
const SP500_FUNDS = ["VOO", "SPY", "IVV"];

// "Trust" alone would catch Northern Trust and every REIT, so only fund words count.
const FUND_NAME = /\b(ETF|ETN|Fund|SPDR|iShares|ProShares|Direxion)\b/i;

type RawHolding = { ticker?: unknown; name?: unknown; weight?: unknown };
type RawFund = {
  ticker?: unknown;
  fund_name?: unknown;
  as_of?: unknown;
  filed_at?: unknown;
  source_url?: unknown;
  status?: unknown;
  note?: unknown;
  holdings?: unknown;
};

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function toFundDoc(ticker: string, raw: RawFund): FundDoc {
  const status: FundStatus = raw.status === "derivatives" || raw.status === "not_stocks" ? raw.status : "ok";
  const holdings = Array.isArray(raw.holdings)
    ? (raw.holdings as RawHolding[])
        // Rows without a ticker cannot be placed in a company; the page counts them as "other" from the weights that are left.
        .filter((row) => typeof row.ticker === "string" && typeof row.weight === "number" && Number.isFinite(row.weight) && row.weight > 0)
        .map((row) => ({ ticker: String(row.ticker).toUpperCase(), name: str(row.name) ?? String(row.ticker), weight: row.weight as number }))
    : [];
  return {
    ticker,
    fundName: str(raw.fund_name) ?? ticker,
    asOf: str(raw.as_of),
    filedAt: str(raw.filed_at),
    sourceUrl: str(raw.source_url),
    status,
    note: str(raw.note),
    holdings,
  };
}

async function loadFundUncached(ticker: string): Promise<FundDoc | null> {
  const snap = await adminFirestore.collection("tm_etf_holdings").doc(ticker).get();
  if (!snap.exists) return null;
  return toFundDoc(ticker, snap.data() as RawFund);
}

// A filing changes once a quarter, but a missing fund is cached as null too, so an hour keeps a newly read fund from waiting long.
const loadFund = unstable_cache(loadFundUncached, ["xray-etf-holdings-v2"], { revalidate: 3600 });

export async function loadFunds(tickers: readonly string[]): Promise<Record<string, FundDoc>> {
  const unique = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const docs = await Promise.all(unique.map((ticker) => loadFund(ticker).catch(() => null)));
  const out: Record<string, FundDoc> = {};
  unique.forEach((ticker, index) => {
    const doc = docs[index];
    if (doc) out[ticker] = doc;
  });
  return out;
}

export type XrayView = {
  xray: Xray;
  read: TheRead | null;
  /** New York day the example's quotes are from, or null for live quotes. */
  pricesAsOf: string | null;
  mode: "live" | "example";
  /** Funds we break down, for the empty state. */
  coveredFunds: string[];
};

/** Every fund the holdings job has read, with whether it could be broken down. */
async function fundListUncached(): Promise<Array<{ ticker: string; ok: boolean }>> {
  const snap = await adminFirestore.collection("tm_etf_meta").doc("latest").get().catch(() => null);
  const funds = snap?.exists ? (snap.data() as { funds?: Record<string, { status?: string }> }).funds : null;
  return funds ? Object.entries(funds).map(([ticker, fund]) => ({ ticker, ok: fund.status === "ok" })).sort((a, b) => a.ticker.localeCompare(b.ticker)) : [];
}

const loadFundList = unstable_cache(fundListUncached, ["xray-etf-meta-v3"], { revalidate: 3600 });

/** Names and sectors for every company the funds touch, plus the S&P 500 baselines. */
async function buildContext(positions: XrayPositionInput[], funds: Record<string, FundDoc>): Promise<XrayContext> {
  const tickers = new Set(positions.map((position) => position.ticker));
  for (const fund of Object.values(funds)) for (const holding of fund.holdings) if (holding.ticker) tickers.add(holding.ticker);
  const benchmarkTicker = SP500_FUNDS.find((ticker) => funds[ticker]);
  const [rows, facts, benchmarkDocs] = await Promise.all([
    getScreenerRows([...tickers]).catch(() => new Map()),
    getSnapshotFacts([]).catch(() => ({ sectorOf: {}, spSectorWeights: {} as Record<string, number>, priceDay: null })),
    benchmarkTicker ? Promise.resolve(null) : loadFunds(SP500_FUNDS.slice(0, 1)),
  ]);
  const sectorOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  for (const [symbol, row] of rows) {
    if (row.sector) sectorOf[symbol] = row.sector;
    if (row.name) nameOf[symbol] = row.name;
  }
  // Our own record of a stock someone holds names it better than a filing.
  for (const position of positions) if (position.name && !nameOf[position.ticker]) nameOf[position.ticker] = position.name;
  return {
    funds,
    sectorOf,
    nameOf,
    benchmarkSectors: facts.spSectorWeights,
    benchmark: benchmarkTicker ? funds[benchmarkTicker] : benchmarkDocs?.[SP500_FUNDS[0]!] ?? null,
  };
}

async function finish(positions: XrayPositionInput[], mode: "live" | "example", pricesAsOf: string | null): Promise<XrayView> {
  const [funds, fundList] = await Promise.all([
    loadFunds(positions.map((position) => position.ticker)),
    loadFundList().catch(() => [] as Array<{ ticker: string; ok: boolean }>),
  ]);
  // A fund the job knows about stays a fund when its document cannot be read
  // ("Invesco QQQ Trust, Series 1" has no fund word the name check catches).
  const known = new Set(fundList.map((fund) => fund.ticker));
  const marked = positions.map((position) => (known.has(position.ticker) ? { ...position, looksLikeFund: true } : position));
  const coveredFunds = fundList.filter((fund) => fund.ok).map((fund) => fund.ticker);
  const context = await buildContext(marked, funds);
  const xray = buildXray(marked, context);
  return { xray, read: buildXrayRead(xray, { benchmark: context.benchmark, example: mode === "example" }), pricesAsOf, mode, coveredFunds };
}

/** The example portfolio from the Portfolio page (it holds VOO and QQQ), priced on the same quotes. */
export async function loadExampleXray(): Promise<XrayView | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const positions: XrayPositionInput[] = example.portfolio.positions
    .filter((position) => position.kind === "holding")
    .map((position) => ({
      ticker: position.ticker,
      name: position.name,
      value: position.value,
      ...(position.sector === FUNDS_SECTOR ? { looksLikeFund: true } : {}),
    }));
  return finish(positions, "example", example.pricesAsOf);
}

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".");
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** A signed-in person's holdings (not the watching list), valued at the latest quote, else the last stored close. */
export async function loadUserXray(userDoc: UserDoc | null): Promise<XrayView | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const holdingsMap = userDoc?.watchlist_holdings ?? {};
  const ids = tracked.filter((id) => kinds[id] === "holding" && id.startsWith("US_"));
  if (ids.length === 0) return null;
  const [quotes, labels] = await Promise.all([
    getLatestPriceQuotes(ids).catch(() => new Map()),
    getInstrumentLabels(ids).catch(() => new Map()),
  ]);
  const needClose = ids.filter((id) => num(quotes.get(id)?.quote?.current) === null).map((id) => labels.get(id)?.ticker || tickerFromId(id));
  const closes = needClose.length > 0 ? await loadDailySeries(needClose).catch(() => new Map()) : new Map();
  const positions: XrayPositionInput[] = ids.map((id) => {
    const label = labels.get(id);
    const ticker = (label?.ticker || tickerFromId(id)).toUpperCase();
    const holding = holdingsMap[id];
    const series = closes.get(ticker);
    const price = num(quotes.get(id)?.quote?.current) ?? (series ? series.closes[series.closes.length - 1] ?? null : null);
    const quantity = num(holding?.quantity);
    const entered = num(holding?.market_value);
    const value = quantity !== null && quantity > 0 && price !== null ? quantity * price : entered !== null && entered > 0 ? entered : null;
    const name = label?.name || ticker;
    return { ticker, name, value, looksLikeFund: name !== ticker && FUND_NAME.test(name) };
  });
  return finish(positions, "live", null);
}
