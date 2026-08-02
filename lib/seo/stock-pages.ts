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
// SEO coverage is intentionally independent from the smaller runtime/AI core.
// The legacy us_core_100 namespace now contains the 60-stock runtime cohort,
// while these established pages remain indexable.
const indexableIds = new Set(usCatalog?.universes?.us_seo_100 ?? []);

export const SEO_STOCK_PAGES: SeoStockPage[] = (usCatalog?.instruments ?? [])
  .filter((row) => {
    const instrumentId = String(row.instrument_id || "").toUpperCase();
    return Boolean(
      instrumentId &&
        indexableIds.has(instrumentId) &&
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
  "GOOGL",
  "AAPL",
  "AMZN",
  "META",
  "TSLA",
  "AMD",
] as const;
