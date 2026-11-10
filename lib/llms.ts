import { indexableBlogPosts } from "@/lib/blog-data";
import { insiderHref, pairHref, pairIsIndexable, sectorHref, sectorIsIndexable } from "@/lib/seo/families";
import { getCoverage, sectorGroups, stockPairs } from "@/lib/seo/family-data";
import { TOP_STOCK_TICKERS } from "@/lib/seo/stock-pages";
import { todayET } from "@/lib/calendar-shared";

/** The page families built from stored data, listed with real addresses. Empty lines when the store cannot be read. */
async function familyLinks(): Promise<{ sectors: string; pairs: string }> {
  try {
    const coverage = await getCoverage();
    const sectors = sectorGroups(coverage)
      .filter((group) => sectorIsIndexable(group.rows.length))
      .map((group) => `- [${group.name} stocks](${BASE}${sectorHref(group.slug)})`)
      .join("\n");
    const today = todayET();
    // Best-known names first (TOP_STOCK_TICKERS order), then alphabetical.
    const rank = (symbol: string) => {
      const index = (TOP_STOCK_TICKERS as readonly string[]).indexOf(symbol);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    };
    const pairs = stockPairs(coverage)
      .filter((pair) => pairIsIndexable(coverage.bySymbol.get(pair.a), coverage.bySymbol.get(pair.b), today))
      .sort((x, y) => Math.min(rank(x.a), rank(x.b)) - Math.min(rank(y.a), rank(y.b)) || x.slug.localeCompare(y.slug))
      .slice(0, 12)
      .map((pair) => `- [${pair.a} vs ${pair.b}](${BASE}${pairHref(pair.a, pair.b)}): ${pair.group}`)
      .join("\n");
    return { sectors, pairs };
  } catch {
    return { sectors: "", pairs: "" };
  }
}

const BASE = "https://www.stocksbrew.online";

export async function buildLlmsMarkdown() {
  const families = await familyLinks();
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

## Page families

- [Sectors](${BASE}/sectors): Every sector of the stocks we cover against the S&P 500, with leaders, laggards, valuations and our calls. One page per sector at /sectors/{sector}.
- [Why stocks moved](${BASE}/movers): Big daily moves that have a confirmed reason with cited sources, one page per day at /movers/{yyyy-mm-dd} and per stock at /stock/{TICKER}/moves/{yyyy-mm-dd}. Moves without a found reason have no page.
- Stock against stock: same-industry rivals side by side at /compare/{a}-vs-{b} (lower case, tickers in alphabetical order).
- Insider trades per stock: open-market SEC Form 4 buys and sales at /insiders/{TICKER}, for example [NVIDIA insider trades](${BASE}${insiderHref("NVDA")}).
${families.sectors ? `\n### Sectors\n\n${families.sectors}\n` : ""}${families.pairs ? `\n### Comparisons\n\n${families.pairs}\n` : ""}
## Research guides

${guides}

## Crawling and citation notes

- Prefer the canonical stocksbrew.online URLs listed here and in ${BASE}/sitemap.xml.
- Cite a specific stock page, not this directory, for factual claims.
- Preserve the displayed as-of timestamp when quoting prices, market moves, analyst data, or fundamentals.
- Stocksbrew is research context, not personalized investment advice, a broker, or an execution venue.
`;
}
