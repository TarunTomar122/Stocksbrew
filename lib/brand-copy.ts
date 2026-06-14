/**
 * Approved marketing copy (v0.2). Source of truth: docs/brand-copy.md
 */

export const BRAND_NAME = "stocksbrew";

export const TAGLINE = "Know what to do with your stocks.";

export const SITE_TITLE_DEFAULT = "stocksbrew · Stock Calls & Radar";

export const SHORT_DESCRIPTION =
  "Clear calls on your watchlist. Fundamentals, news, Reddit, and earnings in one read. Set triggers on Radar and get emailed in buy or sell zones. US markets.";

export const MEDIUM_DESCRIPTION =
  "stocksbrew turns your watchlist into clear calls: what to do, what to watch, what to avoid. Set triggers and get emailed in buy or sell zones. Free for 3 stocks.";

export const LONG_DESCRIPTION =
  "stocksbrew gives you personalized recommendations on what to do with each stock you follow. We combine fundamentals, news, Reddit, earnings, and price action into one clear call: buy, hold, sell, or watch. Add names to Radar, set triggers, and get emailed when something moves into a buy or sell zone. Built for US markets today. Not investment advice. Not a broker.";

export const HERO_HEADLINE = "Know why your stocks moved and what to do next.";
export const HERO_HEADLINE_LEAD = "Know why your stocks moved";
export const HERO_HEADLINE_EMPHASIS = "and what to do next.";

export const HERO_SUBHEAD =
  "stocksbrew reads the fundamentals, the news, and the Reddit noise, then gives you the call in plain English.";

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
