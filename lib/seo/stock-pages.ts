import universeCatalog from "@/backend/config/instrument_universe.json";
import { resolveSector } from "@/lib/gics-sector";
import { levelFree } from "@/lib/og/format";

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

const LEGAL_SUFFIX =
  /,?\s+(?:Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Holdings?|Ltd\.?|Limited|plc|N\.V\.|S\.A\.|AG|SE|Group|& Co\.?)$/i;

/** "NVIDIA", "Coca-Cola": the name without "The" and its legal suffixes, for titles and snippets that must stay short. */
export function shortStockName(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  const name = String(stock.name ?? "").trim();
  if (!name || name.toUpperCase() === stock.ticker.toUpperCase()) return stock.ticker;
  let short = name.replace(/^The\s+/i, "");
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(short); i += 1) short = short.replace(LEGAL_SUFFIX, "").trim();
  short = short.replace(/,\s*$/, "").trim();
  return short.length >= 2 ? short : name;
}

/** "NVIDIA (NVDA)", or "ZETA" when the only name we hold is the ticker. */
function shortLabel(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  const short = shortStockName(stock);
  return short === stock.ticker ? stock.ticker : `${short} (${stock.ticker})`;
}

/** The facts of a screener row a stock page's snippet reads (lib/screener-shared.ts ScreenerRow). */
export type StockSnippetFacts = StockReadFacts & {
  target?: number | null;
  upside?: number | null;
  earnings_date?: string | null;
};

/** Our call in the words the page uses. */
const CALL_WORDS: Record<string, string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };
/** Google shows about this many characters of a description. */
export const STOCK_DESCRIPTION_MAX = 160;
/** A search snippet quotes our call only while it is at most this many days old. */
export const SNIPPET_CALL_MAX_AGE_DAYS = 60;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A number that is not a percentage or a multiple ("178.60", "under 175",
 * "$182"): in a thesis that is almost always a price level, and levels are not
 * public on every stock, so a snippet sentence holding one is left out.
 */
const BARE_NUMBER = /\d(?![\d.,]*\s?(?:%|x\b|×|percent\b))/i;
const LEVEL_TALK = /\$|\b(?:add|adding|buy|buying|buy more|trim|trimming|sell|selling|sell some)\s+(?:below|above|under|over|near|at|around)\b|\b(?:zones?|levels?|support|resistance|targets?)\b/i;
/** Template lines the pipeline writes when it has nothing to say ("CC coverage is quiet."). */
const FILLER = /\bcoverage is quiet\b|\bnothing new\b|\bno (?:fresh|new) (?:news|read)\b/i;

/** The thesis's first sentence when it fits whole, says something, and names no price level. */
function thesisSentence(text: string | null | undefined, max: number): string | null {
  const clean = levelFree(text);
  if (!clean) return null;
  const first = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)[0]!.trim();
  if (BARE_NUMBER.test(first) || LEVEL_TALK.test(first) || FILLER.test(first)) return null;
  const sentence = /[.!?]$/.test(first) ? first : `${first}.`;
  return sentence.length <= max ? sentence : null;
}

/**
 * The search snippet for a stock page. With today's screener row it gives the
 * price, our call and why, and the analysts' average target, so each page has
 * its own; without a row it says what the page holds. A part that does not fit
 * whole is left out, never cut off mid-sentence.
 */
export function stockSeoDescription(
  stock: Pick<SeoStockPage, "name" | "ticker">,
  row?: StockSnippetFacts | null,
  today?: string,
): string {
  const label = shortLabel(stock);
  if (!row || !finite(row.price) || row.price <= 0) {
    return `${label} stock price, forecast and our buy or sell call, with financials, analyst targets, earnings and news.`;
  }
  // A price more than a few days old (a data job lagging) is not quoted as the price.
  const priceIsCurrent = !today || !row.price_at || isFresh(row.price_at, today, 5);
  const parts: string[] = [priceIsCurrent ? `${label} stock at ${usd(row.price)}.` : `${label} stock price and forecast.`];
  const room = () => STOCK_DESCRIPTION_MAX - parts.join(" ").length - 1;
  const add = (part: string | null) => {
    if (part && part.length <= room()) parts.push(part);
  };
  // The call is quoted only while it is recent; the page itself dates an older one.
  const callIsRecent = !today || isFresh(row.call_at, today, SNIPPET_CALL_MAX_AGE_DAYS);
  const call = callIsRecent ? CALL_WORDS[String(row.call ?? "")] : undefined;
  if (call) {
    add(`Our call: ${call}.`);
    add(thesisSentence(row.thesis, room()));
  }
  if (finite(row.target) && row.target > 0) {
    const upside = finite(row.upside) ? ` (${row.upside >= 0 ? "+" : "−"}${Math.abs(row.upside).toFixed(0)}%)` : "";
    add(`Analysts' average target ${usd(row.target)}${upside}.`);
  }
  const earnings = String(row.earnings_date ?? "").slice(0, 10);
  if (today && /^\d{4}-\d{2}-\d{2}$/.test(earnings) && earnings >= today) {
    add(`Earnings ${MONTHS[Number(earnings.slice(5, 7)) - 1]} ${Number(earnings.slice(8, 10))}.`);
  }
  if (parts.join(" ").length < 110) add("Forecast, financials and news.");
  return parts.join(" ");
}

/** The page title, in the words people search with ("nvda stock price", "nvidia stock forecast"). */
export function stockSeoTitle(stock: Pick<SeoStockPage, "name" | "ticker">): string {
  return `${shortLabel(stock)} Stock Price, Forecast and Our Call`;
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
 * decides indexing (see `stockIsIndexable` below); it ranks names where a
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

/**
 * A stock page is indexable while its last price is at most this many days
 * old. Generous on purpose: a page that flips between index and noindex each
 * time a data job lags loses its place in Google for weeks (the Nov 10-17
 * price outage did that to NVDA, AMZN and META), while a price over a month
 * old means the stock stopped trading or we stopped covering it.
 */
export const STOCK_PRICE_MAX_AGE_DAYS = 30;

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
 * The stock index rule. A stock page is open to search engines while it has a
 * real price from the last STOCK_PRICE_MAX_AGE_DAYS days: the page then holds
 * the price, financials, valuation, analyst targets and news, whatever the age
 * of our written call (the page dates the call itself). Every other stock page
 * stays noindex. Until Nov 22 the rule also wanted a call under 60 days old and
 * a price under 10, which kept ~280 real pages out and flipped the rest.
 *
 * The page metadata (app/(app)/stock/[symbol]/page.tsx) and the stocks
 * sitemap (lib/seo/sitemap.ts) both apply this function to the same screener
 * snapshot row, so the two cannot disagree.
 */
export function stockIsIndexable(row: StockReadFacts | null | undefined, today: string): boolean {
  if (!row) return false;
  if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price <= 0) return false;
  return isFresh(row.price_at, today, STOCK_PRICE_MAX_AGE_DAYS);
}

/** True when the row carries our call and the thesis behind it. */
export function stockHasCall(row: StockReadFacts | null | undefined): boolean {
  return Boolean(row && String(row.call ?? "").trim() && String(row.thesis ?? "").trim());
}

export function isFeaturedStockTicker(ticker: string): boolean {
  return FEATURED_STOCKS.has(String(ticker || "").trim().toUpperCase());
}
