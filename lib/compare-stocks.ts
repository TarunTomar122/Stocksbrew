import { getStockSummary, getStockIntelPro, getStockFacts } from "@/lib/stock";
import { currentPe } from "@/lib/stock-header-facts";
import { getLatestTechnicals } from "@/lib/technicals";

export type CompareStock = {
  ticker: string;
  name: string;
  instrument_id: string;
  market: "US" | "IN";
  sector: string;
  industry: string;
  logo_url: string | null;
  price: number | null;
  day_change_pct: number | null;
  day_change_abs: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  dividend_yield: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  fifty_day_average: number | null;
  two_hundred_day_average: number | null;
  beta: number | null;
  analyst_target_price: number | null;
  analyst_label: string | null;
  analyst_count: number | null;
  scores: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  verdict: string | null;
  rsi: number | null;
  one_month_return: number | null;
  three_month_return: number | null;
  six_month_return: number | null;
  one_year_return: number | null;
};

export type CompareStocksResult = {
  stocks: CompareStock[];
  missing_tickers: string[];
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export const MAX_COMPARE_TICKERS = 5;

/**
 * Fetch the per-stock data needed for the side-by-side comparison view.
 * Reuses the same data sources as the portfolio analyzer but returns a
 * tighter, comparison-focused shape (no aggregates, no risk flags).
 */
export async function compareStocks(
  tickers: string[],
): Promise<CompareStocksResult> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_COMPARE_TICKERS);
  const stocks: CompareStock[] = [];
  const missing: string[] = [];

  for (const ticker of unique) {
    const summary = await getStockSummary(ticker, "US").catch(() => null);
    const market: "US" | "IN" = summary ? "US" : "IN";
    const finalSummary = summary || (await getStockSummary(ticker, "IN").catch(() => null));

    if (!finalSummary) {
      missing.push(ticker);
      continue;
    }

    const [intel, technicals, facts] = await Promise.all([
      getStockIntelPro(finalSummary.instrument_id, market).catch(() => null),
      getLatestTechnicals(finalSummary.instrument_id).catch(() => null),
      getStockFacts(finalSummary.instrument_id).catch(() => null),
    ]);

    stocks.push({
      ticker: finalSummary.ticker,
      name: finalSummary.name,
      instrument_id: finalSummary.instrument_id,
      market,
      sector: finalSummary.sector || "Unknown",
      industry: finalSummary.industry || "",
      logo_url: finalSummary.logo_url || null,
      price: toNumber(finalSummary.price),
      day_change_pct: toNumber(finalSummary.day_change_pct),
      day_change_abs: toNumber(finalSummary.day_change_abs),
      // The weekly facts before Yahoo's block, which is written once when a stock is added; a US P/E from today's
      // price (lib/stock-header-facts.ts currentPe), the same one the stock page shows.
      market_cap: toNumber(facts?.quick_stats?.market_cap ?? finalSummary.fundamentals?.market_cap),
      pe_ttm: market === "US" ? currentPe(facts, toNumber(finalSummary.price)) : toNumber(finalSummary.fundamentals?.pe_ttm),
      dividend_yield: toNumber(finalSummary.fundamentals?.dividend_yield),
      week_52_high: toNumber(finalSummary.fundamentals?.week_52_high),
      week_52_low: toNumber(finalSummary.fundamentals?.week_52_low),
      fifty_day_average: toNumber(finalSummary.fundamentals?.fifty_day_average),
      two_hundred_day_average: toNumber(finalSummary.fundamentals?.two_hundred_day_average),
      beta: toNumber(finalSummary.fundamentals?.beta),
      analyst_target_price: toNumber(facts?.analyst?.target_price),
      analyst_label: facts?.analyst?.label ?? null,
      analyst_count: typeof facts?.analyst?.analyst_count === "number" ? facts.analyst.analyst_count : null,
      scores: {
        overall: intel?.overall?.score ?? null,
        valuation: intel?.pillars?.valuation?.score ?? null,
        growth: intel?.pillars?.growth?.score ?? null,
        quality: intel?.pillars?.quality?.score ?? null,
        momentum: intel?.pillars?.momentum?.score ?? null,
      },
      verdict: intel?.overall?.verdict ?? null,
      rsi: toNumber(technicals?.rsi_14?.value),
      one_month_return: toNumber(facts?.returns?.one_month_pct),
      three_month_return: toNumber(facts?.returns?.three_month_pct),
      six_month_return: toNumber(facts?.returns?.six_month_pct),
      one_year_return: toNumber(facts?.returns?.one_year_pct),
    });
  }

  return { stocks, missing_tickers: missing };
}
