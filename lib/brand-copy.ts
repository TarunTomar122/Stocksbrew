/**
 * Approved product copy (v0.3). Source of truth: docs/product-voice.md
 */

export const BRAND_NAME = "stocksbrew";

export const TAGLINE = "Analyse and track US stocks with AI.";

export const SITE_TITLE_DEFAULT =
  "AI Stock Analysis & Tracking for US Stocks | stocksbrew";

export const SHORT_DESCRIPTION =
  "Analyse any US stock, then track the ones you care about.";

export const MEDIUM_DESCRIPTION =
  "Search any US stock for financials, news and market context. Track up to three stocks free with Radar.";

export const LONG_DESCRIPTION =
  "stocksbrew helps you analyse and track US stocks. Search a company for its financials, recent news and market context, then add it to Radar if you want ongoing research and alerts. Pro adds deeper calls, targets and unlimited tracking. Research only, not investment advice.";

export const HERO_HEADLINE = "Analyse and track US stocks with AI";
export const HERO_HEADLINE_LEAD = "Analyse and track";
export const HERO_HEADLINE_EMPHASIS = "US stocks with AI";

export const HERO_SUBHEAD =
  "Search any US stock for financials, news and market context.";

/** Homepage block above live movers / Reddit / sectors (Finviz-style labels, not manifesto). */
export const HOME_LIVE_FEED_EYEBROW = "Market today";
export const HOME_LIVE_FEED_HEADLINE = "What's moving";
export const HOME_LIVE_FEED_SUBHEAD =
  "Top gainers, top losers, and trending names. Updated through the day.";

export const ABOUT_PILLARS = [
  {
    title: "Analyse any US stock.",
    body: "Open a company page for financials, recent news, price history and market context.",
  },
  {
    title: "See what changed.",
    body: "We connect the latest company news, earnings, analyst changes and price movement.",
  },
  {
    title: "Track the stocks you care about.",
    body: "Add holdings and watchlist names to Radar so their research stays current.",
  },
  {
    title: "Come back when something changes.",
    body: "Use alerts for earnings, price levels and important changes instead of checking every day.",
  },
] as const;

export function stockMetaDescription(ticker: string): string {
  const upper = ticker.toUpperCase();
  return `Analyse ${upper} with price history, financials, news and market context. Track it on stocksbrew Radar for ongoing research and alerts.`;
}
