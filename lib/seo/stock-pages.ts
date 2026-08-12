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
  return `${stock.name} (${stock.ticker}) stock analysis with current price, valuation, growth, analyst context, earnings, risks, and recent news. ${category} research, updated with the latest available data.`;
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

export function isFeaturedStockTicker(ticker: string): boolean {
  return FEATURED_STOCKS.has(String(ticker || "").trim().toUpperCase());
}
