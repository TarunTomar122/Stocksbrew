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
