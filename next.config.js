/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // ── The 2026-11 rebuild: old routes land on the surface that replaced them.
      { source: "/pulse", destination: "/briefing", permanent: true },
      { source: "/pulse/:path*", destination: "/briefing", permanent: true },
      { source: "/premarket", destination: "/briefing", permanent: true },
      { source: "/premarket/:path*", destination: "/briefing", permanent: true },
      { source: "/market-daily/:path*", destination: "/briefing", permanent: true },
      // /watchlist is signed-in, noindex and robots-disallowed, so the old public
      // Radar landing page goes to the home page, which carries the same pitch.
      { source: "/radar", destination: "/", permanent: true },
      { source: "/earnings", destination: "/calendar", permanent: true },
      { source: "/earnings-intel", destination: "/calendar", permanent: true },
      { source: "/earnings-intel/:ticker", destination: "/calendar/earnings/:ticker", permanent: true },
      { source: "/ipos", destination: "/calendar?type=ipo", permanent: true },
      { source: "/events", destination: "/calendar", permanent: true },
      { source: "/events/:path*", destination: "/calendar", permanent: true },
      { source: "/upcoming-events", destination: "/calendar", permanent: true },
      { source: "/reddit-buzz", destination: "/signals?tab=reddit", permanent: true },
      { source: "/reddit-buzz/:path*", destination: "/signals?tab=reddit", permanent: true },
      { source: "/trump-logic", destination: "/signals?tab=policy", permanent: true },
      { source: "/trump-logic/:path*", destination: "/signals?tab=policy", permanent: true },
      { source: "/social", destination: "/signals", permanent: true },
      { source: "/stocks", destination: "/screener", permanent: true },
      { source: "/screens", destination: "/screener", permanent: true },
      // The old screen ids are not screener presets, so they all land on the screener itself.
      { source: "/screens/:slug", destination: "/screener", permanent: true },
      { source: "/sectors", destination: "/screener?tab=sectors", permanent: true },
      // Each old sector page goes to the page that covers the same group of
      // stocks. The specific rules must stay above the catch-all.
      { source: "/sector/semiconductors", destination: "/blog/semiconductor-stocks-analysis-guide", permanent: true },
      { source: "/sector/ai-infrastructure", destination: "/themes/ai-capex", permanent: true },
      { source: "/sector/big-tech", destination: "/screener?sector=technology", permanent: true },
      { source: "/sector/financials", destination: "/themes/financials", permanent: true },
      { source: "/sector/healthcare", destination: "/themes/healthcare", permanent: true },
      { source: "/sector/energy", destination: "/themes/energy", permanent: true },
      { source: "/sector/industrials", destination: "/screener?sector=industrials", permanent: true },
      { source: "/sector/consumer", destination: "/screener?sector=consumer-discretionary", permanent: true },
      // Older sector ids that Search Console lists as indexed or crawled.
      { source: "/sector/health-care", destination: "/screener?sector=health-care", permanent: true },
      { source: "/sector/technology", destination: "/screener?sector=technology", permanent: true },
      { source: "/sector/information-technology", destination: "/screener?sector=technology", permanent: true },
      { source: "/sector/it", destination: "/screener?sector=technology", permanent: true },
      { source: "/sector/communication-services", destination: "/screener?sector=communication-services", permanent: true },
      { source: "/sector/financial-services", destination: "/screener?sector=financials", permanent: true },
      { source: "/sector/consumer-cyclical", destination: "/screener?sector=consumer-discretionary", permanent: true },
      { source: "/sector/auto", destination: "/screener?sector=consumer-discretionary", permanent: true },
      { source: "/sector/consumer-defensive", destination: "/screener?sector=consumer-staples", permanent: true },
      { source: "/sector/:slug", destination: "/screener?tab=sectors", permanent: true },
      { source: "/heat", destination: "/screener?tab=sectors", permanent: true },
      { source: "/heat/:path*", destination: "/screener?tab=sectors", permanent: true },
      // Only the product comparisons moved. Other /compare/<slug> addresses stay
      // free for stock-against-stock pages.
      { source: "/compare/stocksbrew-vs-:tool", destination: "/docs/compare/stocksbrew-vs-:tool", permanent: true },
      { source: "/compare-stocks", destination: "/compare", permanent: true },
      { source: "/compare-stocks/:path*", destination: "/compare", permanent: true },
      { source: "/should-i-buy", destination: "/screener", permanent: true },
      { source: "/should-i-buy/:ticker", destination: "/stock/:ticker", permanent: true },
      { source: "/power-trades", destination: "/follow?tab=congress", permanent: true },
      { source: "/power-trades/:path*", destination: "/follow?tab=congress", permanent: true },
      { source: "/mcp", destination: "/developers", permanent: true },
      { source: "/agents/jobs", destination: "/agents", permanent: true },
      { source: "/subscribe", destination: "/pricing", permanent: false },
      // The old investing guides were articles, so they go to the blog, not to
      // the product docs.
      { source: "/learn", destination: "/blog", permanent: true },
      // Old /learn articles with a close match in the blog, docs or markets
      // pages go there; the rest fall through to the blog index.
      { source: "/learn/how-to-analyze-earnings-reports", destination: "/blog/how-to-analyze-earnings-report", permanent: true },
      { source: "/learn/understanding-balance-sheets", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
      { source: "/learn/how-to-read-income-statement", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
      { source: "/learn/how-to-build-a-watchlist", destination: "/blog/watchlist-vs-portfolio-tracker", permanent: true },
      { source: "/learn/institutional-ownership", destination: "/docs/follow/what-a-13f-is", permanent: true },
      { source: "/learn/what-are-etfs", destination: "/markets/etfs", permanent: true },
      { source: "/learn/:path*", destination: "/blog", permanent: true },
      // Never a real post, but Search Console shows impressions for it.
      { source: "/blog/best-stock-news-2026", destination: "/blog/best-stock-news-apps-2026", permanent: true },
      { source: "/guides", destination: "/blog", permanent: true },
      { source: "/resources", destination: "/blog", permanent: true },
      { source: "/use-cases", destination: "/blog", permanent: true },
      { source: "/use-cases/earnings-season", destination: "/blog/earnings-season-watchlist-playbook", permanent: true },
      { source: "/use-cases/dividend-investing", destination: "/strategies", permanent: true },
      { source: "/use-cases/retirement-planning", destination: "/strategies", permanent: true },
      { source: "/use-cases/long-term-investing", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
      { source: "/use-cases/swing-trading", destination: "/screener", permanent: true },
      { source: "/use-cases/day-trading", destination: "/signals?tab=movers", permanent: true },
      { source: "/use-cases/:path*", destination: "/blog", permanent: true },
      { source: "/free-tools", destination: "/docs/tools", permanent: true },
      { source: "/editorial-policy", destination: "/docs/methodology", permanent: true },
      { source: "/authors", destination: "/docs/methodology/who-writes-this", permanent: true },
      { source: "/authors/:path*", destination: "/docs/methodology/who-writes-this", permanent: true },
      { source: "/position-size-calculator", destination: "/docs/tools/position-size", permanent: true },
      { source: "/hackathon", destination: "/ask", permanent: true },
      {
        source: "/blog/stock-research-guide-hub",
        destination: "/blog",
        permanent: true,
      },
      {
        source: "/blog/stocksbrew-vs-tickertape",
        destination: "/docs/compare/stocksbrew-vs-tickertape",
        permanent: true,
      },
      {
        source: "/blog/stocksbrew-vs-finviz",
        destination: "/docs/compare/stocksbrew-vs-finviz",
        permanent: true,
      },
      {
        source: "/blog/how-to-analyze-a-stock-before-buying",
        destination: "/blog/stock-research-checklist-evidence-first",
        permanent: true,
      },
      {
        source: "/blog/stock-research-use-cases",
        destination: "/blog",
        permanent: true,
      },
      {
        source: "/blog/free-should-i-buy-stock-checker",
        destination: "/screener",
        permanent: true,
      },
      { source: "/anomalies", destination: "/signals?tab=movers", permanent: true },
      // Blog consolidation — alerts cluster
      {
        source: "/blog/ai-stock-alerts-vs-price-alerts",
        destination: "/blog/best-stock-watchlist-apps-2026",
        permanent: true,
      },
      // Blog consolidation — market intelligence cluster
      {
        source: "/blog/what-is-ai-market-brief",
        destination: "/blog/us-stock-market-analysis-daily-workflow-2026",
        permanent: true,
      },
      {
        source: "/blog/daily-market-intelligence-guide",
        destination: "/blog/us-stock-market-analysis-daily-workflow-2026",
        permanent: true,
      },
      {
        source: "/blog/free-market-intelligence-tools",
        destination: "/blog/free-stock-market-analysis-tools",
        permanent: true,
      },
      {
        source: "/blog/ai-stock-analysis-what-works",
        destination: "/blog/ai-stock-analysis-comparison",
        permanent: true,
      },
      // Editorial consolidation — thin or overlapping articles now resolve to
      // the strongest reviewed guide for that search intent.
      { source: "/blog/stock-market-heatmap-tools", destination: "/screener?tab=sectors", permanent: true },
      { source: "/blog/how-to-use-stock-alerts-effectively", destination: "/blog/best-stock-watchlist-apps-2026", permanent: true },
      { source: "/blog/buy-hold-sell-signals-explained", destination: "/blog/stock-analysis-app-checklist", permanent: true },
      { source: "/blog/stock-market-information-overload", destination: "/blog/us-stock-market-analysis-daily-workflow-2026", permanent: true },
      { source: "/blog/portfolio-health-check-guide", destination: "/portfolio", permanent: true },
      { source: "/blog/ai-stock-watchlist-vs-traditional", destination: "/blog/best-stock-watchlist-apps-2026", permanent: true },
      { source: "/blog/best-market-intelligence-tools-2026", destination: "/blog/best-stock-research-websites-2026", permanent: true },
      { source: "/blog/earnings-calendar-for-my-watchlist", destination: "/blog/earnings-season-watchlist-playbook", permanent: true },
      { source: "/blog/stay-updated-on-stocks-without-checking-daily", destination: "/blog/track-stock-news-for-your-portfolio", permanent: true },
      { source: "/blog/best-free-stock-alert-tools-2026", destination: "/blog/best-stock-watchlist-apps-2026", permanent: true },
      { source: "/blog/stock-research-busy-professionals", destination: "/blog/us-stock-market-analysis-daily-workflow-2026", permanent: true },
      { source: "/blog/daily-stock-market-analysis-routine", destination: "/blog/us-stock-market-analysis-daily-workflow-2026", permanent: true },
      { source: "/blog/stock-picks-vs-stock-screeners", destination: "/blog/best-stock-research-websites-2026", permanent: true },
      { source: "/blog/sector-rotation-tracking-tools", destination: "/screener?tab=sectors", permanent: true },
      { source: "/blog/earnings-predictions-ai-vs-analyst", destination: "/blog/analyst-ratings-price-targets-explained", permanent: true },
      { source: "/blog/ai-stock-sentiment-analysis-tools", destination: "/signals", permanent: true },
      { source: "/blog/track-insider-trading-free", destination: "/blog/stock-news-catalyst-analysis", permanent: true },
      { source: "/blog/stock-market-daily-newsletter-free", destination: "/briefing", permanent: true },
      { source: "/blog/market-breadth-analysis-guide", destination: "/briefing", permanent: true },
      { source: "/blog/how-to-read-stock-heat-map", destination: "/screener?tab=sectors", permanent: true },
      { source: "/blog/stock-analysis-beginners-technical-vs-fundamental", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
      { source: "/blog/free-stock-screeners-indian-investors", destination: "/screener", permanent: true },
      { source: "/blog/how-to-build-stock-watchlist", destination: "/blog/watchlist-vs-portfolio-tracker", permanent: true },
      { source: "/blog/portfolio-rebalancing-guide-retail-investors", destination: "/portfolio", permanent: true },
      { source: "/blog/best-stock-portfolio-tracker-free-2026", destination: "/portfolio", permanent: true },
      { source: "/blog/how-to-read-stock-charts-beginners", destination: "/blog/stock-analysis-app-checklist", permanent: true },
      { source: "/blog/stock-market-for-beginners-2026", destination: "/blog", permanent: true },
      { source: "/blog/how-to-build-a-stock-portfolio-from-scratch", destination: "/portfolio", permanent: true },
      { source: "/blog/when-to-sell-a-stock", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
    ];
  },
  experimental: {
    serverActions: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://rankinpublic.xyz" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
