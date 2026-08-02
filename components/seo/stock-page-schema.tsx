type Props = {
  ticker: string;
  name: string;
  description: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  updatedAt?: string;
};

const BASE = "https://www.stocksbrew.online";

export function StockPageSchema({
  ticker,
  name,
  description,
  exchange,
  sector,
  industry,
  updatedAt,
}: Props) {
  const url = `${BASE}/stock/${ticker}`;
  const companyId = `${url}#company`;
  const pageId = `${url}#webpage`;
  const company = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    "@id": companyId,
    name,
    tickerSymbol: exchange ? `${exchange}:${ticker}` : ticker,
    description,
    url,
    mainEntityOfPage: { "@id": pageId },
    ...(sector || industry
      ? {
          knowsAbout: [sector, industry].filter(Boolean),
        }
      : {}),
  };
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageId,
    name: `${name} (${ticker}) Stock Analysis`,
    description,
    url,
    mainEntity: { "@id": companyId },
    inLanguage: "en-US",
    isPartOf: { "@id": `${BASE}/#website` },
    publisher: { "@id": `${BASE}/#organization` },
    ...(updatedAt ? { dateModified: updatedAt } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "US Stocks", item: `${BASE}/stocks` },
      { "@type": "ListItem", position: 3, name: `${name} (${ticker})`, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(company) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(page) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}
