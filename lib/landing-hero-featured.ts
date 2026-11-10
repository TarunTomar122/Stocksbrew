import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { StockSummary } from "@/lib/stock";

/** Homepage live-brew demo pool — one picked at random per render. */
// Only showcase stocks (lib/seo/stock-pages.ts), whose zones are public, so the hero card is always complete.
export const LANDING_HERO_BREW_TICKERS = ["NVDA", "AAPL", "MSFT", "PLTR", "AMZN"] as const;

export type LandingHeroBrewTicker = (typeof LANDING_HERO_BREW_TICKERS)[number];

export function shuffledLandingHeroBrewTickers(): LandingHeroBrewTicker[] {
  const out = [...LANDING_HERO_BREW_TICKERS];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function findLandingHeroAnomaly(anomalies: AnomalyItem[], ticker: string): AnomalyItem | null {
  const sym = ticker.toUpperCase();
  return anomalies.find((row) => row.ticker.toUpperCase() === sym) ?? null;
}

export function stockSummaryToAnomaly(summary: StockSummary): AnomalyItem {
  const dayChangePct = summary.day_change_pct ?? 0;
  return {
    instrument_id: summary.instrument_id,
    ticker: summary.ticker,
    name: summary.name,
    sector: summary.sector ?? null,
    industry: summary.industry ?? null,
    logo_url: summary.logo_url ?? null,
    price: summary.price,
    previous_close: summary.previous_close ?? null,
    day_change_pct: dayChangePct,
    day_change_abs: summary.day_change_abs ?? null,
    volume: null,
    direction: dayChangePct >= 0 ? "up" : "down",
    headline: null,
    thesis: null,
    today_brief: null,
    news_count: 0,
    source_count: 0,
    overall_score: null,
    overall_label: null,
    catalyst: null,
    risk: null,
    key_points: [],
    visual_summary: null,
    overall_verdict: null,
    comparative_context: null,
  };
}

/** Prefer today's anomaly row; patch live quote fields from summary when present. */
export function mergeLandingHeroAnomaly(
  anomaly: AnomalyItem,
  summary: StockSummary | null,
): AnomalyItem {
  if (!summary) return anomaly;
  return {
    ...anomaly,
    instrument_id: summary.instrument_id,
    ticker: summary.ticker,
    name: summary.name,
    sector: anomaly.sector ?? summary.sector ?? null,
    industry: anomaly.industry ?? summary.industry ?? null,
    logo_url: anomaly.logo_url ?? summary.logo_url ?? null,
    price: summary.price,
    previous_close: summary.previous_close ?? anomaly.previous_close,
    day_change_pct: summary.day_change_pct ?? anomaly.day_change_pct,
    day_change_abs: summary.day_change_abs ?? anomaly.day_change_abs,
    direction: (summary.day_change_pct ?? anomaly.day_change_pct) >= 0 ? "up" : "down",
  };
}
