/**
 * Approved marketing copy (v0.2). Source of truth: docs/brand-copy.md
 */

export const BRAND_NAME = "stocksbrew";

export const TAGLINE = "Know what to do with your stocks.";

export const SITE_TITLE_DEFAULT = "stocksbrew · Stock Calls & Radar";

export const SHORT_DESCRIPTION =
  "Detailed stock calls and zones, Stocksbrew target prices, Radar tracking, and automatic or manual alerts. US markets.";

export const MEDIUM_DESCRIPTION =
  "stocksbrew turns your watchlist into detailed calls, target prices, and alerts for earnings, buy zones, trim zones, and the price levels you set. Free for 3 stocks.";

export const LONG_DESCRIPTION =
  "stocksbrew combines fundamentals, news, Reddit, earnings, and price action into a detailed add, hold, or trim call with buy and trim zones, drivers, and risks. Pro adds the Stocksbrew target price, unlimited Radar tracking, automatic earnings and zone alerts, and manual price alerts. Built for US markets today. Not investment advice. Not a broker.";

export const HERO_HEADLINE = "Know what to do with your stocks.";
export const HERO_HEADLINE_LEAD = "Know what to do";
export const HERO_HEADLINE_EMPHASIS = "with your stocks.";

export const HERO_SUBHEAD =
  "stocksbrew reads the fundamentals, news, Reddit, earnings, and price action, then turns them into a call, target, and alerts.";

/** Homepage block above live movers / Reddit / sectors (Finviz-style labels, not manifesto). */
export const HOME_LIVE_FEED_EYEBROW = "Market today";
export const HOME_LIVE_FEED_HEADLINE = "What's moving";
export const HOME_LIVE_FEED_SUBHEAD =
  "Top gainers, top losers, and trending names. Updated through the day.";

export const ABOUT_PILLARS = [
  {
    title: "A clear stance on every name you track.",
    body: "Personalized buy, hold, sell, or watch guidance on your holdings and watchlist. You know what to do and why.",
  },
  {
    title: "We read the messy stuff for you.",
    body: "Fundamentals, news, Reddit, earnings, and price action combined into one readable call.",
  },
  {
    title: "Your stocks in one place.",
    body: "Follow what you own and what you are watching. Context, scores, and calls per ticker on Radar.",
  },
  {
    title: "Triggers when it matters.",
    body: "Set levels or zones. Get emails when a stock moves into a buy or sell zone or your thesis shifts.",
  },
] as const;

export function stockMetaDescription(ticker: string): string {
  const upper = ticker.toUpperCase();
  return `${upper} price, fundamentals, technicals, and a research-backed brief. Catalysts and analyst context. Add to Radar for personalized calls and alerts.`;
}
