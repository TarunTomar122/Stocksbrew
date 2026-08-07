/**
 * Approved product copy (v0.3). Source of truth: docs/product-voice.md
 */

export const BRAND_NAME = "stocksbrew";

export const TAGLINE = "Track and Analyse US stocks.";

export const SITE_TITLE_DEFAULT =
  "US Stock Analysis & Watchlist | stocksbrew";

export const SHORT_DESCRIPTION =
  "Analyse any US stock, then track the ones you care about.";

export const MEDIUM_DESCRIPTION =
  "Search any US stock for financials, valuation, filings, earnings, analyst targets and news. Track up to three stocks free in your Watchlist.";

export const LONG_DESCRIPTION =
  "Search any US stock for financials, valuation, filings, earnings, analyst targets and news. Add the stocks you care about to your Watchlist and we’ll keep checking new filings, earnings reports and news. Pro adds detailed calls, price zones, targets and unlimited tracking. Research only, not investment advice.";

export const HERO_HEADLINE = "Track and Analyse US stocks";
export const HERO_HEADLINE_LEAD = "Track and Analyse";
export const HERO_HEADLINE_EMPHASIS = "US stocks";

export const HERO_SUBHEAD =
  "Financials, valuation, filings, earnings, analyst targets and news for any US stock.";

/** Homepage block above live movers / Reddit / sectors (Finviz-style labels, not manifesto). */
export const HOME_LIVE_FEED_EYEBROW = "Market today";
export const HOME_LIVE_FEED_HEADLINE = "What's moving";
export const HOME_LIVE_FEED_SUBHEAD =
  "Top gainers, top losers, and trending names. Updated through the day.";

export const ABOUT_PILLARS = [
  {
    title: "Analyse any US stock.",
    body: "Open a company page for financials, valuation, filings, earnings, analyst targets and news.",
  },
  {
    title: "See what changed.",
    body: "We connect the latest company news, earnings, analyst changes and price movement.",
  },
  {
    title: "Track the stocks you care about.",
    body: "Add holdings and watchlist names to your Watchlist. We’ll keep checking them after you leave.",
  },
  {
    title: "Come back when something changes.",
    body: "Use alerts for earnings, price levels and important changes instead of checking every day.",
  },
] as const;

export function stockMetaDescription(ticker: string): string {
  const upper = ticker.toUpperCase();
  return `Analyse ${upper} with financials, valuation, filings, earnings, analyst targets and news. Add it to your stocksbrew Watchlist for ongoing research and alerts.`;
}
