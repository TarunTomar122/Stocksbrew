import { indexableBlogPosts } from "@/lib/blog-data";
import { listMarketDailyEditions } from "@/lib/market-daily";

export const revalidate = 300;

const BASE = "https://www.stocksbrew.online";

export async function GET() {
  const editions = await listMarketDailyEditions(12).catch(() => []);
  const currentMarket = editions.length
    ? editions
        .map(
          (edition) =>
            `- [${edition.headline}](${BASE}/market-daily/${edition.edition_date}): US market analysis published ${edition.edition_date}; updated ${edition.updated_at || edition.published_at}.`,
        )
        .join("\n")
    : `- [Market Daily](${BASE}/market-daily): Source-linked US market analysis archive.`;
  const guides = indexableBlogPosts
    .slice(0, 16)
    .map((post) => `- [${post.title}](${BASE}/blog/${post.slug}): ${post.description}`)
    .join("\n");

  const body = `# stocksbrew

> Stocksbrew is a US-stock research product with timestamped market data, source-linked daily market analysis, stock fundamentals, Radar monitoring, and a scoped API/MCP interface for AI agents.

Canonical site: ${BASE}
Language: English (en-US)
Market coverage: US-listed stocks and US market context

## Start here

- [US stock directory](${BASE}/stocks): Index of supported stock research pages.
- [Market Daily archive](${BASE}/market-daily): Daily explanation of the prior session, premarket setup, anomalies, and stocks to watch.
- [Editorial policy](${BASE}/editorial-policy): Sourcing, review, AI-assistance, corrections, and update standards.
- [About stocksbrew](${BASE}/about): Product purpose and ownership.
- [Author: Tarun Tomar](${BASE}/authors/tarun-tomar): Author and reviewer profile.
- [Developer reference](${BASE}/developers): Stocksbrew MCP and REST behavior.
- [OpenAPI document](${BASE}/api/v1/openapi.json): Machine-readable REST contract.

## Current market analysis

${currentMarket}

## Stock research

- [Apple (AAPL)](${BASE}/stock/AAPL)
- [Microsoft (MSFT)](${BASE}/stock/MSFT)
- [NVIDIA (NVDA)](${BASE}/stock/NVDA)
- [Amazon (AMZN)](${BASE}/stock/AMZN)
- [Alphabet (GOOGL)](${BASE}/stock/GOOGL)
- [Meta Platforms (META)](${BASE}/stock/META)
- [Tesla (TSLA)](${BASE}/stock/TSLA)
- [Broadcom (AVGO)](${BASE}/stock/AVGO)

Each stock page separates timestamped market prices from slower-moving fundamentals. Financial history is refreshed weekly and attributed on the page. Prices and third-party figures may be delayed.

## Research guides

${guides}

## Crawling and citation notes

- Prefer the canonical stocksbrew.online URLs listed here and in ${BASE}/sitemap.xml.
- Cite a specific stock page or Market Daily edition, not this directory, for factual claims.
- Preserve the displayed as-of timestamp when quoting prices, market moves, analyst data, or fundamentals.
- Market Daily editions include visible source links and publication/update times.
- Stocksbrew is research context, not personalized investment advice, a broker, or an execution venue.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
