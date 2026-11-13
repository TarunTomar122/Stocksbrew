import { FREE_COVERED_WORD } from "@/lib/paywall-flag";

/**
 * Approved product copy (v0.3). Source of truth: docs/product-voice.md
 */

export const BRAND_NAME = "stocksbrew";

export const TAGLINE = "Track and Analyse US stocks.";

export const SITE_TITLE_DEFAULT =
  "US Stock Analysis & Watchlist | stocksbrew";

export const SHORT_DESCRIPTION =
  "An investing agent that reads for you. It never touches your money.";

export const MEDIUM_DESCRIPTION =
  `Search any US stock for financials, valuation, filings, earnings, analyst targets and news. Follow as many stocks as you like for free, with the full report on ${FREE_COVERED_WORD} you pick.`;

export const LONG_DESCRIPTION =
  "Search any US stock for financials, valuation, filings, earnings, analyst targets and news. Add the stocks you care about to your Watchlist and we’ll keep checking new filings, earnings reports and news. Pro adds detailed calls, price zones, targets and unlimited tracking. Research only, not investment advice.";

// The agent is the product (Nov 13): the old line ("Your stocks, explained every day, with sources.") sold a daily
// read; this one says what the page under it shows, an agent at work, each step with its figures and filings.
export const HERO_HEADLINE = "An agent that watches your stocks and shows its work.";
export const HERO_HEADLINE_LEAD = "An agent that watches your stocks";
export const HERO_HEADLINE_EMPHASIS = "and shows its work.";

export const HERO_SUBHEAD = "Each night it reads filings, reports and your reasons, and says what changed.";

/**
 * How many stocks have our call, in words, for copy that would otherwise promise "every stock". The screener
 * snapshot (tm_screener_snapshot/US, `call` column) had a call on 726 of its 796 stocks on Nov 11, 2026. Keep this
 * below the real count; recheck it when the universe changes.
 */
export const CALL_COVERAGE = "more than 700 US stocks";

/** Under the landing's "Watch these for me", for someone signed out. */
export const HERO_FOOTNOTE = "Free with your Google account. No card, no broker login.";

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
