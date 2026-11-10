import universeCatalog from "@/backend/config/instrument_universe.json";
import { resolveSector } from "@/lib/gics-sector";

export type SeoStockPage = {
  instrumentId: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  description: string;
  updatedAt?: string;
};

type CatalogInstrument = {
  instrument_id?: string;
  ticker?: string;
  name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  description?: string;
  status?: string;
  type?: string;
  support_tier?: string;
  updated_at?: string;
};

type CatalogShape = {
  markets?: {
    US?: {
      instruments?: CatalogInstrument[];
      universes?: Record<string, string[]>;
    };
  };
};

const catalog = universeCatalog as CatalogShape;
const usCatalog = catalog.markets?.US;
// Page completeness and indexability follow the broad company catalogue, not
// the smaller runtime/AI cohort. The runtime cohort controls frequent compute;
// it must never turn a valid long-tail company route into a thin/noindex page.
const coverageIds = new Set(usCatalog?.universes?.us_core_155 ?? []);

export const SEO_STOCK_PAGES: SeoStockPage[] = (usCatalog?.instruments ?? [])
  .filter((row) => {
    const instrumentId = String(row.instrument_id || "").toUpperCase();
    const type = String(row.type || "").toLowerCase();
    const supportTier = String(row.support_tier || "").toLowerCase();
    return Boolean(
      instrumentId &&
        coverageIds.has(instrumentId) &&
        type !== "macro" &&
        supportTier !== "macro" &&
        row.status !== "inactive" &&
        row.ticker &&
        row.name,
    );
  })
  .map((row) => ({
    instrumentId: String(row.instrument_id).toUpperCase(),
    ticker: String(row.ticker).toUpperCase(),
    name: String(row.name).trim(),
    exchange: String(row.exchange || "").trim(),
    // The catalogue's sector field is wrong for some stocks (Amgen as Technology); derive it from the industry.
    sector: resolveSector(row) ?? String(row.sector || "").trim(),
    industry: String(row.industry || "").trim(),
    description: String(row.description || "").trim(),
    updatedAt: row.updated_at,
  }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker));

const STOCK_BY_TICKER = new Map(SEO_STOCK_PAGES.map((row) => [row.ticker, row]));

export function getSeoStockPage(ticker: string): SeoStockPage | null {
  return STOCK_BY_TICKER.get(String(ticker || "").trim().toUpperCase()) ?? null;
}

/** "Apple Inc. (AAPL)", or just "ZETA" when the only name we hold is the ticker. */
function nameAndTicker(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  const name = String(stock.name ?? "").trim();
  return name && name.toUpperCase() !== stock.ticker.toUpperCase() ? `${name} (${stock.ticker})` : stock.ticker;
}

export function stockSeoDescription(stock: Pick<SeoStockPage, "name" | "ticker" | "sector" | "industry">): string {
  const category = stock.industry || stock.sector || "US stock";
  return `${nameAndTicker(stock)} stock on one page: the price, our current call and the reasoning behind it, financials, valuation against its own history, analyst price targets, earnings dates and results, who owns it and recent news. ${category}.`;
}

/** The page title, written from what the stock page shows. */
export function stockSeoTitle(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  return `${nameAndTicker(stock)} Stock: Our Call, Valuation and Earnings`;
}

export const FEATURED_STOCK_TICKERS = [
  "NVDA",
  "MSFT",
  "AAPL",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "AMD",
  "PLTR",
] as const;

const FEATURED_STOCKS = new Set<string>(FEATURED_STOCK_TICKERS);

/**
 * The most viewed stock pages of the last 90 days, then the largest
 * companies by market value, as picked on 2026-11-10 (first-party views from
 * `tm_stock_views`, market values from the screener). This list no longer
 * decides indexing (see `stockHasCurrentRead` below); it ranks names where a
 * page has to choose a few, such as which pairs of rivals get a compare page.
 *
 * This is separate from FEATURED_STOCK_TICKERS on purpose: that list also
 * decides which pages show price levels to everyone (lib/entitlements-server.ts).
 */
export const TOP_STOCK_TICKERS = [
  "NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "PLTR",
  "MU", "COHR", "COIN", "SPCX", "SMCI", "MRVL", "WMT", "TSM", "UBER", "INTC",
  "NOW", "VRT", "RKLB", "APP", "LLY", "INTU", "VST", "AAP", "JPM", "V",
  "XOM", "JNJ", "MA", "ASML", "ABBV", "COST", "CVX", "KO", "PG", "CSCO",
  "MRK", "UNH", "ORCL", "HD", "BAC", "GE", "PM", "MS", "AMAT", "NFLX",
  "TMO", "PANW", "RTX", "CAT", "TXN", "WFC", "LRCX", "GS", "AMGN", "LIN",
  "CRWD", "ANET", "AXP", "DELL", "GILD", "GEV", "DIS", "C", "PEP", "SHOP",
  "BLK", "ABT", "VZ", "ARM", "APH", "NEE", "DE", "KLAC", "QCOM", "ADI",
  "CRM", "TMUS", "PFE", "DHR", "COP", "SCHW", "ISRG", "ACN", "BX", "T",
  "SCCO", "CB", "VRTX", "BA", "SPGI", "NVO", "ETN", "LMT", "MDT", "HDB",
] as const;

/** A stock page is indexable while its written read is at most this many days old... */
export const STOCK_READ_MAX_AGE_DAYS = 60;
/** ...and its last price is at most this many days old. */
export const STOCK_PRICE_MAX_AGE_DAYS = 10;

function dayNumber(stamp: string): number {
  return Date.parse(`${stamp.slice(0, 10)}T00:00:00Z`);
}

/** True when `stamp` is a date at most `maxDays` before `today` (a day ahead is allowed for time zones). */
export function isFresh(stamp: string | null | undefined, today: string, maxDays: number): boolean {
  if (!stamp || !/^\d{4}-\d{2}-\d{2}/.test(stamp)) return false;
  const age = Math.round((dayNumber(today) - dayNumber(stamp)) / 86_400_000);
  return Number.isFinite(age) && age >= -1 && age <= maxDays;
}

/** The fields of a screener row the stock index rule reads. */
export type StockReadFacts = {
  call?: string | null;
  thesis?: string | null;
  call_at?: string | null;
  price?: number | null;
  price_at?: string | null;
};

/**
 * The stock index rule. A stock page is open to search engines when it
 * carries a current written read (our call and the thesis from a brief
 * written in the last STOCK_READ_MAX_AGE_DAYS days) and a price from the last
 * STOCK_PRICE_MAX_AGE_DAYS days. Every other stock page stays noindex.
 *
 * The page metadata (app/(app)/stock/[symbol]/page.tsx) and the stocks
 * sitemap (lib/seo/sitemap.ts) both apply this function to the same screener
 * snapshot row, so the two cannot disagree.
 */
export function stockHasCurrentRead(row: StockReadFacts | null | undefined, today: string): boolean {
  if (!row) return false;
  if (!String(row.call ?? "").trim() || !String(row.thesis ?? "").trim()) return false;
  if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price <= 0) return false;
  return isFresh(row.call_at, today, STOCK_READ_MAX_AGE_DAYS) && isFresh(row.price_at, today, STOCK_PRICE_MAX_AGE_DAYS);
}

export function isFeaturedStockTicker(ticker: string): boolean {
  return FEATURED_STOCKS.has(String(ticker || "").trim().toUpperCase());
}
