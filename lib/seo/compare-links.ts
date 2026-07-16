import { isIndexableBlogPost } from "@/lib/blog-data";

export type SeoLink = { href: string; label: string };

/** Related blog posts and compare pages per comparison slug — for internal linking. */
export const COMPARE_RELATED: Record<
  string,
  { blogs: SeoLink[]; compares: SeoLink[] }
> = {
  "stocksbrew-vs-tickertape": {
    blogs: [
      { href: "/blog/free-stock-screeners-indian-investors", label: "Screeners for India" },
      { href: "/blog/how-to-build-stock-watchlist", label: "Build a watchlist" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
      { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
    ],
  },
  "stocksbrew-vs-seeking-alpha": {
    blogs: [
      { href: "/blog/track-stock-news-for-your-portfolio", label: "Track portfolio news" },
      { href: "/blog/stock-market-daily-newsletter-free", label: "Free newsletters" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-motley-fool", label: "vs Motley Fool" },
      { href: "/compare/stocksbrew-vs-tipranks", label: "vs TipRanks" },
    ],
  },
  "stocksbrew-vs-tradingview": {
    blogs: [
      { href: "/blog/how-to-read-stock-charts-beginners", label: "Read stock charts" },
      { href: "/blog/buy-hold-sell-signals-explained", label: "Buy/hold/sell signals" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
      { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
    ],
  },
  "stocksbrew-vs-yahoo-finance": {
    blogs: [
      { href: "/blog/best-stock-portfolio-tracker-free-2026", label: "Free portfolio trackers" },
      { href: "/blog/watchlist-vs-portfolio-tracker", label: "Watchlist vs portfolio" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
      { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
    ],
  },
  "stocksbrew-vs-prospero": {
    blogs: [
      { href: "/blog/finviz-vs-tradingview-vs-stocksbrew", label: "AI tools compared" },
      { href: "/blog/buy-hold-sell-signals-explained", label: "Buy/hold/sell signals" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-danelfin", label: "vs Danelfin" },
      { href: "/compare/stocksbrew-vs-tipranks", label: "vs TipRanks" },
    ],
  },
  "stocksbrew-vs-morningstar": {
    blogs: [
      { href: "/blog/stock-research-checklist-evidence-first", label: "Analyze before buying" },
      { href: "/blog/portfolio-health-check-guide", label: "Portfolio health check" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-seeking-alpha", label: "vs Seeking Alpha" },
      { href: "/compare/stocksbrew-vs-stockanalysis", label: "vs Stock Analysis" },
    ],
  },
  "stocksbrew-vs-finviz": {
    blogs: [
      { href: "/compare/stocksbrew-vs-finviz", label: "Blog: vs Finviz" },
      { href: "/blog/stock-picks-vs-stock-screeners", label: "Picks vs screeners" },
      { href: "/blog/free-stock-market-analysis-tools", label: "Free analysis tools" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
      { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
    ],
  },
  "stocksbrew-vs-zacks": {
    blogs: [
      { href: "/blog/when-to-sell-a-stock", label: "When to sell" },
      { href: "/blog/buy-hold-sell-signals-explained", label: "Buy/hold/sell signals" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-tipranks", label: "vs TipRanks" },
      { href: "/compare/stocksbrew-vs-motley-fool", label: "vs Motley Fool" },
    ],
  },
  "stocksbrew-vs-motley-fool": {
    blogs: [
      { href: "/blog/stock-market-daily-newsletter-free", label: "Free newsletters" },
      { href: "/blog/stock-market-information-overload", label: "Beat info overload" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-seeking-alpha", label: "vs Seeking Alpha" },
      { href: "/compare/stocksbrew-vs-zacks", label: "vs Zacks" },
    ],
  },
  "stocksbrew-vs-tipranks": {
    blogs: [
      { href: "/blog/buy-hold-sell-signals-explained", label: "Buy/hold/sell signals" },
      { href: "/blog/finviz-vs-tradingview-vs-stocksbrew", label: "AI tools compared" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-prospero", label: "vs Prospero" },
      { href: "/compare/stocksbrew-vs-zacks", label: "vs Zacks" },
    ],
  },
  "stocksbrew-vs-stockanalysis": {
    blogs: [
      { href: "/blog/stock-research-checklist-evidence-first", label: "Analyze before buying" },
      { href: "/blog/how-to-build-a-stock-portfolio-from-scratch", label: "Build a portfolio" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-morningstar", label: "vs Morningstar" },
      { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
    ],
  },
  "stocksbrew-vs-danelfin": {
    blogs: [
      { href: "/blog/finviz-vs-tradingview-vs-stocksbrew", label: "AI tools compared" },
      { href: "/blog/ai-stock-sentiment-analysis-tools", label: "Sentiment analysis" },
    ],
    compares: [
      { href: "/compare/stocksbrew-vs-prospero", label: "vs Prospero" },
      { href: "/compare/stocksbrew-vs-tipranks", label: "vs TipRanks" },
    ],
  },
};

const DEFAULT_BLOGS: SeoLink[] = [
  { href: "/blog/buy-hold-sell-signals-explained", label: "Buy/hold/sell signals" },
  { href: "/blog/how-to-build-stock-watchlist", label: "Build a watchlist" },
  { href: "/blog/finviz-vs-tradingview-vs-stocksbrew", label: "Market brief tools" },
];

const DEFAULT_COMPARES: SeoLink[] = [
  { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
  { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
  { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
];

export function getCompareRelated(slug: string): { blogs: SeoLink[]; compares: SeoLink[] } {
  const entry = COMPARE_RELATED[slug];
  const candidateBlogs = entry?.blogs ?? DEFAULT_BLOGS;
  const blogs = candidateBlogs.filter((link) => {
    const blogSlug = link.href.match(/^\/blog\/([^/?#]+)/)?.[1];
    return !blogSlug || isIndexableBlogPost(blogSlug);
  });
  return {
    blogs: blogs.length > 0 ? blogs : DEFAULT_BLOGS,
    compares: (entry?.compares ?? DEFAULT_COMPARES).filter((c) => !c.href.includes(slug)),
  };
}

/** Blog slug → related compare pages (for blog footers). */
export const BLOG_COMPARE_LINKS: Record<string, SeoLink[]> = {
  "buy-hold-sell-signals-explained": [
    { href: "/compare/stocksbrew-vs-tipranks", label: "vs TipRanks" },
    { href: "/compare/stocksbrew-vs-prospero", label: "vs Prospero" },
  ],
  "watchlist-vs-portfolio-tracker": [
    { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
    { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
  ],
  "free-stock-market-analysis-tools": [
    { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
    { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
  ],
  "best-stock-portfolio-tracker-free-2026": [
    { href: "/compare/stocksbrew-vs-yahoo-finance", label: "vs Yahoo Finance" },
  ],
  "ai-stock-analysis-comparison": [
    { href: "/compare/stocksbrew-vs-danelfin", label: "vs Danelfin" },
    { href: "/compare/stocksbrew-vs-prospero", label: "vs Prospero" },
  ],
  "stocksbrew-vs-finviz": [
    { href: "/compare/stocksbrew-vs-finviz", label: "Full compare page" },
    { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
  ],
};

export function getBlogCompareLinks(slug: string): SeoLink[] {
  return BLOG_COMPARE_LINKS[slug] ?? [
    { href: "/compare/stocksbrew-vs-finviz", label: "vs Finviz" },
    { href: "/compare/stocksbrew-vs-tradingview", label: "vs TradingView" },
  ];
}

export const ALL_COMPARE_LINKS: SeoLink[] = [
  { href: "/compare/stocksbrew-vs-finviz", label: "stocksbrew vs Finviz" },
  { href: "/compare/stocksbrew-vs-tradingview", label: "stocksbrew vs TradingView" },
  { href: "/compare/stocksbrew-vs-yahoo-finance", label: "stocksbrew vs Yahoo Finance" },
  { href: "/compare/stocksbrew-vs-tickertape", label: "stocksbrew vs Tickertape" },
  { href: "/compare/stocksbrew-vs-seeking-alpha", label: "stocksbrew vs Seeking Alpha" },
  { href: "/compare/stocksbrew-vs-prospero", label: "stocksbrew vs Prospero" },
  { href: "/compare/stocksbrew-vs-tipranks", label: "stocksbrew vs TipRanks" },
  { href: "/compare/stocksbrew-vs-danelfin", label: "stocksbrew vs Danelfin" },
  { href: "/compare/stocksbrew-vs-morningstar", label: "stocksbrew vs Morningstar" },
  { href: "/compare/stocksbrew-vs-motley-fool", label: "stocksbrew vs Motley Fool" },
  { href: "/compare/stocksbrew-vs-zacks", label: "stocksbrew vs Zacks" },
  { href: "/compare/stocksbrew-vs-stockanalysis", label: "stocksbrew vs Stock Analysis" },
];
