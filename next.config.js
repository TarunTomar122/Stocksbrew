/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/blog/stock-research-guide-hub",
        destination: "/guides",
        permanent: true,
      },
      {
        source: "/blog/stocksbrew-vs-tickertape",
        destination: "/compare/stocksbrew-vs-tickertape",
        permanent: true,
      },
      {
        source: "/blog/stocksbrew-vs-finviz",
        destination: "/compare/stocksbrew-vs-finviz",
        permanent: true,
      },
      {
        source: "/blog/how-to-analyze-a-stock-before-buying",
        destination: "/blog/stock-research-checklist-evidence-first",
        permanent: true,
      },
      {
        source: "/blog/stock-research-use-cases",
        destination: "/use-cases",
        permanent: true,
      },
      {
        source: "/blog/free-should-i-buy-stock-checker",
        destination: "/should-i-buy",
        permanent: true,
      },
      { source: "/anomalies", destination: "/pulse", permanent: true },
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
      { source: "/blog/stock-market-heatmap-tools", destination: "/heat", permanent: true },
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
      { source: "/blog/sector-rotation-tracking-tools", destination: "/sectors", permanent: true },
      { source: "/blog/earnings-predictions-ai-vs-analyst", destination: "/blog/analyst-ratings-price-targets-explained", permanent: true },
      { source: "/blog/ai-stock-sentiment-analysis-tools", destination: "/social", permanent: true },
      { source: "/blog/track-insider-trading-free", destination: "/blog/stock-news-catalyst-analysis", permanent: true },
      { source: "/blog/stock-market-daily-newsletter-free", destination: "/market-daily", permanent: true },
      { source: "/blog/market-breadth-analysis-guide", destination: "/pulse", permanent: true },
      { source: "/blog/how-to-read-stock-heat-map", destination: "/heat", permanent: true },
      { source: "/blog/stock-analysis-beginners-technical-vs-fundamental", destination: "/blog/fundamental-stock-analysis-framework", permanent: true },
      { source: "/blog/free-stock-screeners-indian-investors", destination: "/screens", permanent: true },
      { source: "/blog/how-to-build-stock-watchlist", destination: "/blog/watchlist-vs-portfolio-tracker", permanent: true },
      { source: "/blog/portfolio-rebalancing-guide-retail-investors", destination: "/portfolio", permanent: true },
      { source: "/blog/best-stock-portfolio-tracker-free-2026", destination: "/portfolio", permanent: true },
      { source: "/blog/how-to-read-stock-charts-beginners", destination: "/blog/stock-analysis-app-checklist", permanent: true },
      { source: "/blog/stock-market-for-beginners-2026", destination: "/learn", permanent: true },
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
