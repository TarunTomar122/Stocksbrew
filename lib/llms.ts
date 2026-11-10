import { indexableBlogPosts } from "@/lib/blog-data";

const BASE = "https://www.stocksbrew.online";

export async function buildLlmsMarkdown() {
  const guides = indexableBlogPosts
    .slice(0, 16)
    .map((post) => `- [${post.title}](${BASE}/blog/${post.slug}): ${post.description}`)
    .join("\n");

  return `# stocksbrew

> Stocksbrew is a US-stock research product with timestamped market data, stock fundamentals, Watchlist monitoring and a scoped API/MCP interface for AI agents.

Canonical site: ${BASE}
Language: English (en-US)
Market coverage: US-listed stocks and US market context

## Start here

- [Screener](${BASE}/screener): Every US stock we cover, filterable, with a link to each research page.
- [Docs](${BASE}/docs): How each part of the product works, with methodology and a glossary.
- [Methodology](${BASE}/docs/methodology): Sources, how calls are produced, what is written by a model, corrections.
- [About stocksbrew](${BASE}/about): Product purpose and ownership.
- [Developer reference](${BASE}/developers): Stocksbrew MCP and REST behavior, and how to connect Claude, ChatGPT, Codex and other agents.
- [Follow](${BASE}/follow): 13F fund portfolios, congressional trade disclosures and Form 4 insider trades, each with its filing date.
- [Markets](${BASE}/markets): Indices, ETFs, Treasury yields, commodities, currencies, crypto and prediction markets, each with source and as-of time.
- [Strategies](${BASE}/strategies): Rule-based baskets with their backtests, labelled as backtested and not traded.
- [OpenAPI document](${BASE}/api/v1/openapi.json): Machine-readable REST contract.

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
- Cite a specific stock page, not this directory, for factual claims.
- Preserve the displayed as-of timestamp when quoting prices, market moves, analyst data, or fundamentals.
- Stocksbrew is research context, not personalized investment advice, a broker, or an execution venue.
`;
}
