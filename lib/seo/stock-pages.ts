import universeCatalog from "@/backend/config/instrument_universe.json";

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
    sector: String(row.sector || "").trim(),
    industry: String(row.industry || "").trim(),
    description: String(row.description || "").trim(),
    updatedAt: row.updated_at,
  }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker));

const STOCK_BY_TICKER = new Map(SEO_STOCK_PAGES.map((row) => [row.ticker, row]));

export function getSeoStockPage(ticker: string): SeoStockPage | null {
  return STOCK_BY_TICKER.get(String(ticker || "").trim().toUpperCase()) ?? null;
}

export function stockSeoDescription(stock: Pick<SeoStockPage, "name" | "ticker" | "sector" | "industry">): string {
  const category = stock.industry || stock.sector || "US stock";
  return `${stock.name} (${stock.ticker}) stock on one page: the price, our current call and the reasoning behind it, financials, valuation against its own history, analyst price targets, earnings dates and results, who owns it and recent news. ${category}.`;
}

/** The page title, written from what the stock page shows. */
export function stockSeoTitle(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  return `${stock.name} (${stock.ticker}) Stock: Our Call, Valuation and Earnings`;
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
 * The stock pages search engines may index, and the ones the sitemap lists.
 * Picked on 2026-11-10: the ten flagship pages, then the most viewed pages of
 * the last 90 days, then the largest companies by market value. Every one is
 * in the catalogue above and had a written read in the store on that day. The
 * rest of the catalogue stays noindex until the owner widens this list.
 *
 * This is separate from FEATURED_STOCK_TICKERS on purpose: that list also
 * decides which pages show price levels to everyone (lib/entitlements-server.ts).
 */
export const INDEXED_STOCK_TICKERS = [
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

const INDEXED_STOCKS = new Set<string>(INDEXED_STOCK_TICKERS);

export function isIndexedStockTicker(ticker: string): boolean {
  return INDEXED_STOCKS.has(String(ticker || "").trim().toUpperCase());
}

export function isFeaturedStockTicker(ticker: string): boolean {
  return FEATURED_STOCKS.has(String(ticker || "").trim().toUpperCase());
}
