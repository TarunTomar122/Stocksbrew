import { adminFirestore } from "@/lib/firebase-admin";
import { getStockSummary, getStockIntelPro, getStockFacts } from "@/lib/stock";
import { getLatestTechnicals } from "@/lib/technicals";
import type { StockIntelPro } from "@/lib/types";

export type PortfolioStock = {
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
  scores: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  verdict: string | null;
  rsi: number | null;
  rsi_state: string | null;
  target_upside_pct: number | null;
  one_month_return: number | null;
  three_month_return: number | null;
  six_month_return: number | null;
  one_year_return: number | null;
};

export type RiskFlag = {
  kind: string;
  severity: string;
  ticker?: string;
  headline: string;
  body: string;
};

export type Opportunity = {
  ticker: string;
  kind: string;
  headline: string;
  body: string;
};

export type PortfolioAnalysis = {
  stocks: PortfolioStock[];
  sector_allocation: Array<{ sector: string; count: number; weight_pct: number }>;
  factor_tilt: {
    overall: number | null;
    valuation: number | null;
    growth: number | null;
    quality: number | null;
    momentum: number | null;
  };
  risk_flags: RiskFlag[];
  opportunities: Opportunity[];
  diversification_score: number;
  total_market_cap: number | null;
  summary: string;
  total_stocks: number;
  stocks_with_scores: number;
  missing_tickers: string[];
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function averageScores(stocks: PortfolioStock[], key: keyof PortfolioStock["scores"]): number | null {
  const values = stocks.map((s) => s.scores[key]).filter((v): v is number => v !== null);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function sectorClusters(stocks: PortfolioStock[]): Array<{ sector: string; count: number; weight_pct: number }> {
  const counts = new Map<string, number>();
  for (const s of stocks) {
    const sector = s.sector || "Unknown";
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sector, count]) => ({
      sector,
      count,
      weight_pct: Math.round((count / Math.max(stocks.length, 1)) * 1000) / 10,
    }));
}

function computeDiversification(clusters: Array<{ sector: string; count: number; weight_pct: number }>, total: number): number {
  if (total <= 1) return 0;
  const hhi = clusters.reduce((sum, c) => sum + Math.pow(c.count / total, 2), 0);
  return Math.round((1 - hhi) * 100);
}

function detectRiskFlags(stocks: PortfolioStock[]): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const clusters = sectorClusters(stocks);
  const dominant = clusters[0];

  if (dominant && dominant.weight_pct >= 50) {
    flags.push({
      kind: "sector_concentration",
      severity: dominant.weight_pct >= 70 ? "high" : "medium",
      headline: `${Math.round(dominant.weight_pct)}% clustered in ${dominant.sector}`,
      body: "A single-sector portfolio can look great until one macro factor hits every name together.",
    });
  }

  for (const s of stocks
    .filter((s) => typeof s.scores.overall === "number" && s.scores.overall! < 45)
    .sort((a, b) => (a.scores.overall ?? 0) - (b.scores.overall ?? 0))
    .slice(0, 3)) {
    flags.push({
      kind: "low_score",
      severity: "medium",
      ticker: s.ticker,
      headline: `${s.ticker} is the weakest score in your portfolio`,
      body: `Overall score ${s.scores.overall}. Review if this still fits your thesis.`,
    });
  }

  for (const s of stocks
    .filter((s) => toNumber(s.rsi) !== null && toNumber(s.rsi)! >= 70)
    .slice(0, 3)) {
    flags.push({
      kind: "overbought",
      severity: "medium",
      ticker: s.ticker,
      headline: `${s.ticker} is technically stretched`,
      body: `RSI is ${s.rsi?.toFixed(1)}; consider a watch-for-pullback setup.`,
    });
  }

  return flags;
}

function detectOpportunities(stocks: PortfolioStock[]): Opportunity[] {
  return stocks
    .filter((s) => typeof s.target_upside_pct === "number")
    .sort((a, b) => (b.target_upside_pct ?? -999) - (a.target_upside_pct ?? -999))
    .slice(0, 4)
    .map((s) => ({
      ticker: s.ticker,
      kind: "analyst_runway",
      headline: `${s.ticker} has ${(s.target_upside_pct ?? 0) >= 0 ? "+" : ""}${s.target_upside_pct?.toFixed(1)}% analyst target runway`,
      body: `Score ${s.scores.overall}. Analysts see room to run.`,
    }));
}

export async function analyzePortfolio(tickers: string[]): Promise<PortfolioAnalysis> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const stocks: PortfolioStock[] = [];
  const missing: string[] = [];

  for (const ticker of unique) {
    const summary = await getStockSummary(ticker, "US").catch(() => null);
    const market: "US" | "IN" = summary ? "US" : "IN";
    const finalSummary = summary || (await getStockSummary(ticker, "IN").catch(() => null));

    if (!finalSummary) {
      missing.push(ticker);
      continue;
    }

    const [intel, technicals] = await Promise.all([
      getStockIntelPro(finalSummary.instrument_id, market).catch(() => null),
      getLatestTechnicals(finalSummary.instrument_id).catch(() => null),
    ]);

    const facts = await getStockFacts(finalSummary.instrument_id).catch(() => null);

    const rsiVal = technicals?.rsi_14?.value ?? null;
    const rsiState = technicals?.rsi_14?.state as string | null ?? null;

    stocks.push({
      ticker: finalSummary.ticker,
      name: finalSummary.name,
      instrument_id: finalSummary.instrument_id,
      market,
      sector: finalSummary.sector || "Unknown",
      industry: finalSummary.industry || "",
      logo_url: finalSummary.logo_url || null,
      price: finalSummary.price,
      day_change_pct: finalSummary.day_change_pct ?? null,
      day_change_abs: finalSummary.day_change_abs ?? null,
      market_cap: finalSummary.fundamentals?.market_cap ?? null,
      pe_ttm: finalSummary.fundamentals?.pe_ttm ?? null,
      dividend_yield: finalSummary.fundamentals?.dividend_yield ?? null,
      scores: {
        overall: intel?.overall?.score ?? null,
        valuation: intel?.pillars?.valuation?.score ?? null,
        growth: intel?.pillars?.growth?.score ?? null,
        quality: intel?.pillars?.quality?.score ?? null,
        momentum: intel?.pillars?.momentum?.score ?? null,
      },
      verdict: intel?.overall?.verdict ?? null,
      rsi: rsiVal,
      rsi_state: rsiState,
      target_upside_pct: facts?.analyst?.target_price && finalSummary.price
        ? ((facts.analyst.target_price - finalSummary.price) / finalSummary.price) * 100
        : null,
      one_month_return: facts?.returns?.one_month_pct ?? null,
      three_month_return: facts?.returns?.three_month_pct ?? null,
      six_month_return: facts?.returns?.six_month_pct ?? null,
      one_year_return: facts?.returns?.one_year_pct ?? null,
    });
  }

  const clusters = sectorClusters(stocks);
  const scoresCount = stocks.filter((s) => s.scores.overall !== null).length;
  const totalMc = stocks.reduce((sum, s) => sum + (s.market_cap ?? 0), 0);

  const summaryParts: string[] = [];
  if (clusters[0]) summaryParts.push(`${clusters[0].sector} is the largest cluster at ${Math.round(clusters[0].weight_pct)}%.`);
  const avgOverall = averageScores(stocks, "overall");
  if (avgOverall !== null) {
    const label = avgOverall >= 75 ? "Solid" : avgOverall >= 55 ? "Average" : avgOverall >= 35 ? "Mixed" : "Weak";
    summaryParts.push(`Average tikrr score is ${avgOverall} (${label}).`);
  }
  if (stocks.length === unique.length) summaryParts.push(`All ${stocks.length} stocks resolved.`);

  const flags = detectRiskFlags(stocks);
  const opps = detectOpportunities(stocks);

  return {
    stocks,
    sector_allocation: clusters,
    factor_tilt: {
      overall: averageScores(stocks, "overall"),
      valuation: averageScores(stocks, "valuation"),
      growth: averageScores(stocks, "growth"),
      quality: averageScores(stocks, "quality"),
      momentum: averageScores(stocks, "momentum"),
    },
    risk_flags: flags.slice(0, 6),
    opportunities: opps.slice(0, 6),
    diversification_score: computeDiversification(clusters, stocks.length),
    total_market_cap: totalMc || null,
    summary: summaryParts.join(" ") || "Portfolio analysis is ready.",
    total_stocks: stocks.length,
    stocks_with_scores: scoresCount,
    missing_tickers: missing,
  };
}
