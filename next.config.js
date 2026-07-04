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
      { source: "/reddit-buzz", destination: "/pulse", permanent: true },
      // Blog consolidation — alerts cluster
      {
        source: "/blog/ai-stock-alerts-vs-price-alerts",
        destination: "/blog/best-free-stock-alert-tools-2026",
        permanent: true,
      },
      {
        source: "/blog/how-to-use-stock-alerts-effectively",
        destination: "/blog/best-free-stock-alert-tools-2026",
        permanent: true,
      },
      // Blog consolidation — market intelligence cluster
      {
        source: "/blog/what-is-ai-market-brief",
        destination: "/blog/best-market-intelligence-tools-2026",
        permanent: true,
      },
      {
        source: "/blog/daily-market-intelligence-guide",
        destination: "/blog/best-market-intelligence-tools-2026",
        permanent: true,
      },
      {
        source: "/blog/free-market-intelligence-tools",
        destination: "/blog/best-market-intelligence-tools-2026",
        permanent: true,
      },
      {
        source: "/blog/ai-stock-analysis-what-works",
        destination: "/blog/best-market-intelligence-tools-2026",
        permanent: true,
      },
      {
        source: "/blog/ai-stock-analysis-comparison",
        destination: "/blog/best-market-intelligence-tools-2026",
        permanent: true,
      },
      // Blog consolidation — heatmap cluster
      {
        source: "/blog/stock-market-heatmap-tools",
        destination: "/blog/how-to-read-stock-heat-map",
        permanent: true,
      },
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
