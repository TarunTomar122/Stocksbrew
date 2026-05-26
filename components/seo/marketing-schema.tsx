type FaqItem = { question: string; answer: string };

type Props = {
  path: string;
  name: string;
  description: string;
  faqs?: FaqItem[];
  breadcrumbLabel: string;
  parent?: { name: string; path: string };
};

const BASE = "https://www.stocksbrew.online";

export function MarketingSchema({ path, name, description, faqs = [], breadcrumbLabel, parent }: Props) {
  const url = `${BASE}${path}`;

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url,
    isPartOf: { "@type": "WebSite", name: "stocksbrew", url: BASE },
  };

  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
  ];
  if (parent) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: parent.name,
      item: `${BASE}${parent.path}`,
    });
    breadcrumbItems.push({ "@type": "ListItem", position: 3, name: breadcrumbLabel, item: url });
  } else {
    breadcrumbItems.push({ "@type": "ListItem", position: 2, name: breadcrumbLabel, item: url });
  }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  const faqPage =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {faqPage && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      )}
    </>
  );
}
