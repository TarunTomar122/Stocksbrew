import type { SeoStockPage } from "@/lib/seo/stock-pages";

const BASE = "https://www.stocksbrew.online";

export function StockDirectorySchema({ stocks }: { stocks: SeoStockPage[] }) {
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "US Stocks: Analysis and Research",
    description:
      "Browse company-specific stock analysis pages for 100 widely followed US stocks.",
    url: `${BASE}/stocks`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: stocks.length,
      itemListElement: stocks.map((stock, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${stock.name} (${stock.ticker})`,
        url: `${BASE}/stock/${stock.ticker}`,
      })),
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "US Stocks", item: `${BASE}/stocks` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collection) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}
